//! Calls in a timeline: the call membership and ring events of one call become a single tile
//! on the first of them; the rest are hidden.

use std::collections::HashMap;

use matrix_sdk_ui::timeline::{
    EventTimelineItem, TimelineDetails, TimelineItem, TimelineItemContent,
};
use serde::Serialize;
use serde_json::Value;

use crate::calls::CALL_MEMBER_EVENT;

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum CallOutcome {
    Ongoing,
    Ended,
    /// Someone rang the user, who didn't answer
    Missed,
    /// The ring was declined (by the user, or by the person the user rang)
    Declined,
    /// The user rang and nobody answered
    Unanswered,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CallParticipantView {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CallHistoryView {
    pub outcome: CallOutcome,
    /// Milliseconds since the Unix epoch
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub started_by: String,
    /// Everyone who joined, in the order they joined
    pub participants: Vec<CallParticipantView>,
    pub video: bool,
    /// The call rang (a DM or small room)
    pub rang: bool,
    pub declined_by: Vec<String>,
    /// The call started before the loaded part of the timeline
    pub partial: bool,
}

#[derive(Clone, Debug)]
enum Kind {
    Member {
        state_key: String,
        joined: bool,
        /// A join that renews an earlier one
        renewal: bool,
        /// When the membership runs out (joins only)
        expires_at: u64,
        video: bool,
    },
    Ring {
        ring: bool,
        video: bool,
        declined_by: Vec<String>,
    },
}

#[derive(Clone, Debug)]
pub(crate) struct CallItem {
    kind: Kind,
    ts: u64,
    sender: String,
    name: Option<String>,
    avatar: Option<String>,
}

pub(crate) fn is_call_item(content: &TimelineItemContent, event_type: Option<&str>) -> bool {
    match content {
        TimelineItemContent::RtcNotification { .. } => true,
        TimelineItemContent::OtherState(_) => event_type == Some(CALL_MEMBER_EVENT),
        _ => false,
    }
}

fn classify(event: &EventTimelineItem) -> Option<CallItem> {
    let is_ring = matches!(event.content(), TimelineItemContent::RtcNotification { .. });
    if !is_ring && !matches!(event.content(), TimelineItemContent::OtherState(_)) {
        return None;
    }
    let raw: Value = event
        .latest_json()
        .or_else(|| event.original_json())?
        .deserialize_as_unchecked()
        .ok()?;
    let ts = u64::from(event.timestamp().0);
    let content = raw.get("content").cloned().unwrap_or_default();
    let video = content.get("m.call.intent").and_then(Value::as_str) == Some("video");
    let kind = match event.content() {
        TimelineItemContent::RtcNotification { declined_by, .. } => Kind::Ring {
            ring: content.get("notification_type").and_then(Value::as_str) == Some("ring"),
            video,
            declined_by: declined_by.iter().map(ToString::to_string).collect(),
        },
        _ if raw.get("type").and_then(Value::as_str) == Some(CALL_MEMBER_EVENT) => {
            let joined = content.get("application").is_some();
            let created = content
                .get("created_ts")
                .and_then(Value::as_u64)
                .unwrap_or(ts);
            let expires = content
                .get("expires")
                .and_then(Value::as_u64)
                .unwrap_or(4 * 60 * 60 * 1000);
            Kind::Member {
                state_key: raw.get("state_key")?.as_str()?.to_owned(),
                joined,
                renewal: raw.pointer("/unsigned/prev_content/application").is_some(),
                expires_at: created + expires,
                video,
            }
        }
        _ => return None,
    };
    let (name, avatar) = match event.sender_profile() {
        TimelineDetails::Ready(profile) => (
            profile.display_name.clone(),
            profile.avatar_url.as_ref().map(ToString::to_string),
        ),
        _ => (None, None),
    };
    Some(CallItem {
        kind,
        ts,
        sender: event.sender().to_string(),
        name,
        avatar,
    })
}

/// The call items of a timeline, with their items' unique IDs, oldest first
pub(crate) fn call_items<'a>(
    items: impl Iterator<Item = &'a std::sync::Arc<TimelineItem>>,
) -> Vec<(String, CallItem)> {
    items
        .filter_map(|item| Some((item.unique_id().0.clone(), classify(item.as_event()?)?)))
        .collect()
}

struct Building {
    head: String,
    view: CallHistoryView,
    ring_sender: Option<String>,
    saw_join: bool,
    last_ts: u64,
}

impl Building {
    fn new(head: &str, item: &CallItem, partial: bool) -> Self {
        Self {
            head: head.to_owned(),
            view: CallHistoryView {
                outcome: CallOutcome::Ongoing,
                started_at: item.ts,
                ended_at: None,
                started_by: item.sender.clone(),
                participants: Vec::new(),
                video: false,
                rang: false,
                declined_by: Vec::new(),
                partial,
            },
            ring_sender: None,
            saw_join: false,
            last_ts: item.ts,
        }
    }

    fn add_participant(&mut self, item: &CallItem) {
        if !self
            .view
            .participants
            .iter()
            .any(|p| p.user_id == item.sender)
        {
            self.view.participants.push(CallParticipantView {
                user_id: item.sender.clone(),
                display_name: item.name.clone(),
                avatar_url: item.avatar.clone(),
            });
        }
    }

    fn ended(&self) -> bool {
        self.view.ended_at.is_some()
    }
}

/// Groups call items into calls: one starts when someone joins while nobody is in the call and
/// ends when the last device leaves (or its membership runs out). `live` says whether the room
/// has a call right now, which decides whether the last one is still going. Returns each call's
/// tile keyed by the item that shows it.
pub(crate) fn call_tiles(
    items: &[(String, CallItem)],
    live: bool,
    own_user: &str,
) -> HashMap<String, CallHistoryView> {
    let mut calls: Vec<Building> = Vec::new();
    let mut current: Option<Building> = None;
    // Devices in the call (membership state keys) and when their membership runs out
    let mut open: HashMap<String, u64> = HashMap::new();
    for (id, item) in items {
        open.retain(|_, expires_at| *expires_at > item.ts);
        if let Some(call) = current.as_mut() {
            if open.is_empty() && call.saw_join && !call.ended() {
                call.view.ended_at = Some(call.last_ts);
            }
        }
        match &item.kind {
            Kind::Member {
                state_key,
                joined: true,
                renewal,
                expires_at,
                video,
            } => {
                let new_device = !open.contains_key(state_key);
                if new_device && current.as_ref().is_none_or(Building::ended) {
                    calls.extend(current.take());
                    current = Some(Building::new(id, item, *renewal));
                }
                open.insert(state_key.clone(), *expires_at);
                let call = current.as_mut().expect("a call was started");
                call.saw_join = true;
                call.add_participant(item);
                call.view.video |= video;
                call.last_ts = item.ts;
            }
            Kind::Member { state_key, .. } => {
                let call = current.get_or_insert_with(|| Building::new(id, item, true));
                call.add_participant(item);
                let was_open = open.remove(state_key).is_some();
                if open.is_empty() && (was_open || call.view.partial) {
                    call.view.ended_at = Some(item.ts);
                }
                call.last_ts = item.ts;
            }
            Kind::Ring {
                ring,
                video,
                declined_by,
            } => {
                if current.as_ref().is_none_or(Building::ended) {
                    calls.extend(current.take());
                    current = Some(Building::new(id, item, false));
                }
                let call = current.as_mut().expect("a call was started");
                if *ring {
                    call.view.rang = true;
                    call.ring_sender.get_or_insert_with(|| item.sender.clone());
                }
                for user in declined_by {
                    if !call.view.declined_by.contains(user) {
                        call.view.declined_by.push(user.clone());
                    }
                }
                call.view.video |= video;
                call.last_ts = call.last_ts.max(item.ts);
            }
        }
    }
    let still_open = !open.is_empty();
    calls.extend(current);
    let count = calls.len();
    calls
        .into_iter()
        .enumerate()
        .map(|(index, mut call)| {
            let last = index + 1 == count;
            if !call.ended() && !(last && still_open && live) {
                call.view.ended_at = Some(call.last_ts);
            }
            call.view.outcome = outcome(&call, own_user);
            (call.head, call.view)
        })
        .collect()
}

fn outcome(call: &Building, own_user: &str) -> CallOutcome {
    let view = &call.view;
    if !call.ended() {
        return CallOutcome::Ongoing;
    }
    let Some(caller) = call.ring_sender.as_deref() else {
        return CallOutcome::Ended;
    };
    let joined = |user: &str| view.participants.iter().any(|p| p.user_id == user);
    if caller != own_user {
        if joined(own_user) {
            CallOutcome::Ended
        } else if view.declined_by.iter().any(|u| u == own_user) {
            CallOutcome::Declined
        } else {
            CallOutcome::Missed
        }
    } else if view.participants.iter().any(|p| p.user_id != own_user) {
        CallOutcome::Ended
    } else if !view.declined_by.is_empty() {
        CallOutcome::Declined
    } else {
        CallOutcome::Unanswered
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn join(sender: &str, device: &str, ts: u64) -> (String, CallItem) {
        (
            format!("{sender}{device}{ts}"),
            CallItem {
                kind: Kind::Member {
                    state_key: format!("_{sender}_{device}_m.call"),
                    joined: true,
                    renewal: false,
                    expires_at: ts + 4 * 60 * 60 * 1000,
                    video: false,
                },
                ts,
                sender: sender.into(),
                name: None,
                avatar: None,
            },
        )
    }

    fn leave(sender: &str, device: &str, ts: u64) -> (String, CallItem) {
        let (id, mut item) = join(sender, device, ts);
        item.kind = Kind::Member {
            state_key: format!("_{sender}_{device}_m.call"),
            joined: false,
            renewal: false,
            expires_at: 0,
            video: false,
        };
        (id, item)
    }

    fn ring(sender: &str, ts: u64, declined_by: &[&str]) -> (String, CallItem) {
        (
            format!("ring{ts}"),
            CallItem {
                kind: Kind::Ring {
                    ring: true,
                    video: false,
                    declined_by: declined_by.iter().map(|u| u.to_string()).collect(),
                },
                ts,
                sender: sender.into(),
                name: None,
                avatar: None,
            },
        )
    }

    #[test]
    fn a_call_ends_when_every_device_left() {
        let items = vec![
            join("@a", "A1", 0),
            ring("@a", 1, &[]),
            join("@b", "B1", 2),
            join("@a", "A2", 3),
            leave("@a", "A1", 4),
            leave("@b", "B1", 5),
        ];
        let tiles = call_tiles(&items, true, "@a");
        assert_eq!(tiles.len(), 1);
        let call = &tiles[&items[0].0];
        assert_eq!(call.outcome, CallOutcome::Ongoing, "A2 is still in it");
        let mut items = items;
        items.push(leave("@a", "A2", 6));
        let call = &call_tiles(&items, false, "@a")[&items[0].0];
        assert_eq!(call.outcome, CallOutcome::Ended);
        assert_eq!(call.ended_at, Some(6));
        assert_eq!(call.participants.len(), 2);
    }

    #[test]
    fn missed_declined_and_unanswered() {
        let missed = vec![
            join("@a", "A1", 0),
            ring("@a", 1, &[]),
            leave("@a", "A1", 30),
        ];
        assert_eq!(
            call_tiles(&missed, false, "@b")[&missed[0].0].outcome,
            CallOutcome::Missed
        );
        assert_eq!(
            call_tiles(&missed, false, "@a")[&missed[0].0].outcome,
            CallOutcome::Unanswered
        );
        let declined = vec![
            join("@a", "A1", 0),
            ring("@a", 1, &["@b"]),
            leave("@a", "A1", 9),
        ];
        assert_eq!(
            call_tiles(&declined, false, "@b")[&declined[0].0].outcome,
            CallOutcome::Declined
        );
        assert_eq!(
            call_tiles(&declined, false, "@a")[&declined[0].0].outcome,
            CallOutcome::Declined
        );
    }

    #[test]
    fn a_new_call_starts_after_the_last_one_ended() {
        let items = vec![
            join("@a", "A1", 0),
            leave("@a", "A1", 5),
            join("@b", "B1", 100),
        ];
        let tiles = call_tiles(&items, true, "@a");
        assert_eq!(tiles.len(), 2);
        assert_eq!(tiles[&items[0].0].outcome, CallOutcome::Ended);
        assert_eq!(tiles[&items[2].0].outcome, CallOutcome::Ongoing);
    }

    #[test]
    fn a_call_without_a_live_membership_has_ended() {
        let items = vec![join("@a", "A1", 0), join("@b", "B1", 10)];
        let call = &call_tiles(&items, false, "@a")[&items[0].0];
        assert_eq!(call.outcome, CallOutcome::Ended);
        assert_eq!(call.ended_at, Some(10));
    }

    #[test]
    fn leaves_without_their_joins_make_a_partial_call() {
        let items = vec![leave("@a", "A1", 0), leave("@b", "B1", 3)];
        let tiles = call_tiles(&items, false, "@a");
        assert_eq!(tiles.len(), 1);
        let call = &tiles[&items[0].0];
        assert!(call.partial);
        assert_eq!(call.participants.len(), 2);
    }
}
