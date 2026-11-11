//! Mudrix's own room and space state (list style, banner, roles, voice channels, soundboard).
//! Sliding sync only carries the state types its room list asks for, so a second, light
//! connection asks for these in every joined room and the events reach the client like any
//! other state, without polling. Apps read them with `stateEventsWithSender` and hear changes
//! with `watchStateEvents`.

use std::collections::HashSet;

use futures_util::{pin_mut, StreamExt};
use matrix_sdk::{
    deserialized_responses::RawAnySyncOrStrippedState,
    executor::spawn,
    ruma::{
        api::client::{state::get_state_events, sync::sync_events::v5 as http},
        assign,
        events::{AnySyncStateEvent, StateEventType},
        serde::Raw,
    },
    sleep::sleep,
    sliding_sync::{SlidingSyncList, SlidingSyncMode},
    Client, Room, RoomState,
};
use serde::Serialize;
use serde_json::Value;

use crate::{rooms::parse_room_id, Result, WizardClient};

/// The namespaces of Mudrix's types: the current one, then the one earlier versions wrote
const NAMESPACES: [&str; 2] = ["io.github.kapsikkum.mudrix", "chat.mudrix"];

/// State types Mudrix keeps in rooms and spaces, without the namespace
const NAMES: [&str; 8] = [
    "space_list_style",
    "space_banner",
    "space_auto_join",
    "space_roles",
    "space_member_roles",
    "voice_channel",
    "soundboard",
    "soundboard.settings",
];

/// State the room list's own sync delivers
const LIST_TYPES: [&str; 3] = ["m.space.parent", "m.space.child", "m.room.power_levels"];

const CONNECTION_ID: &str = "mudrix-state";

/// Every state type Mudrix keeps in rooms, under each of its namespaces
pub fn mudrix_state_types() -> Vec<String> {
    NAMESPACES
        .iter()
        .flat_map(|ns| NAMES.iter().map(move |name| format!("{ns}.{name}")))
        .collect()
}

/// What the state connection asks for in every room: all state keys of Mudrix's types
fn required_state() -> Vec<(StateEventType, String)> {
    mudrix_state_types()
        .into_iter()
        .map(|t| (StateEventType::from(t), "*".to_owned()))
        .collect()
}

/// Whether the client already has every one of these types from sync
fn synced_locally(event_types: &[String]) -> bool {
    let ours = mudrix_state_types();
    event_types
        .iter()
        .all(|t| ours.contains(t) || LIST_TYPES.contains(&t.as_str()))
}

/// A state event with who sent it and when
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct StateEventView {
    pub room_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub state_key: String,
    /// The user ID of whoever set it; permission checks need this
    pub sender: String,
    pub content: Value,
    pub event_id: Option<String>,
    /// When the sender's server saw it, in milliseconds; `0` when missing
    pub origin_server_ts: u64,
}

/// The event as a view when it is one of `types`. State that was removed (empty content) isn't.
fn view_of(room_id: &str, event: &Value, types: &HashSet<&str>) -> Option<StateEventView> {
    let event_type = event.get("type")?.as_str()?;
    if !types.contains(event_type) {
        return None;
    }
    let content = event.get("content")?;
    content.as_object().filter(|o| !o.is_empty())?;
    let text = |key: &str| {
        event
            .get(key)
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
    };
    Some(StateEventView {
        room_id: room_id.to_owned(),
        event_type: event_type.to_owned(),
        state_key: text("state_key").unwrap_or_default(),
        sender: text("sender")?,
        content: content.clone(),
        event_id: text("event_id"),
        origin_server_ts: event
            .get("origin_server_ts")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    })
}

async fn local_views(room: &Room, event_types: &[String]) -> Vec<StateEventView> {
    let wanted: HashSet<&str> = event_types.iter().map(String::as_str).collect();
    let room_id = room.room_id().as_str();
    let mut views = Vec::new();
    for event_type in event_types {
        let events = room
            .get_state_events(StateEventType::from(event_type.as_str()))
            .await
            .unwrap_or_default();
        views.extend(events.into_iter().filter_map(|raw| {
            match raw {
                RawAnySyncOrStrippedState::Sync(raw) => raw
                    .deserialize_as_unchecked::<Value>()
                    .ok()
                    .and_then(|e| view_of(room_id, &e, &wanted)),
                RawAnySyncOrStrippedState::Stripped(_) => None,
            }
        }));
    }
    views
}

impl WizardClient {
    /// Every state event of the given types in a room with its sender and time. Types sync
    /// delivers (Mudrix's own, space children) are read from this device; if there are none
    /// there, or for other types, the server is asked once.
    pub async fn state_events_with_sender(
        &self,
        room_id: &str,
        event_types: &[String],
    ) -> Result<Vec<StateEventView>> {
        let room_id = parse_room_id(room_id)?;
        let joined = self
            .sdk()
            .get_room(room_id)
            .filter(|room| room.state() == RoomState::Joined);
        if let Some(room) = joined {
            if synced_locally(event_types) {
                let local = local_views(&room, event_types).await;
                if !local.is_empty() {
                    return Ok(local);
                }
            }
        }
        let wanted: HashSet<&str> = event_types.iter().map(String::as_str).collect();
        let request = get_state_events::v3::Request::new(room_id.to_owned());
        Ok(self
            .sdk()
            .send(request)
            .await?
            .room_state
            .iter()
            .filter_map(|raw| raw.deserialize_as_unchecked::<Value>().ok())
            .filter_map(|e| view_of(room_id.as_str(), &e, &wanted))
            .collect())
    }

    /// Hands every state event of one of `types` that arrives in a joined room to `on_event`,
    /// with its content, sender and time: the first sync's included, and your own changes.
    /// Returns when the stream ends.
    pub async fn watch_state_events(
        &self,
        types: Vec<String>,
        mut on_event: impl FnMut(StateEventView),
    ) {
        let (sender, mut receiver) = futures_channel::mpsc::unbounded::<StateEventView>();
        let wanted: HashSet<String> = types.into_iter().collect();
        let handle = self.sdk().add_event_handler(
            move |raw: Raw<AnySyncStateEvent>, room: matrix_sdk::Room| {
                let sender = sender.clone();
                let wanted = wanted.clone();
                async move {
                    let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                        return;
                    };
                    let types: HashSet<&str> = wanted.iter().map(String::as_str).collect();
                    if let Some(view) = view_of(room.room_id().as_str(), &event, &types) {
                        let _ = sender.unbounded_send(view);
                    }
                }
            },
        );
        let _guard = self.sdk().event_handler_drop_guard(handle);
        while let Some(view) = receiver.next().await {
            on_event(view);
        }
    }

    /// Starts the connection that brings Mudrix's room state; it runs until `stop_state_sync`
    /// and starts over after errors. Does nothing when it already runs.
    pub(crate) fn start_state_sync(&self) {
        let mut task = self.state_sync.lock().unwrap();
        if task.as_ref().is_some_and(|t| !t.is_finished()) {
            return;
        }
        *task = Some(spawn(run_state_sync(self.sdk().clone())));
    }

    pub(crate) fn stop_state_sync(&self) {
        if let Some(task) = self.state_sync.lock().unwrap().take() {
            task.abort();
        }
    }
}

async fn run_state_sync(client: Client) {
    use std::time::Duration;
    let mut failures = 0u32;
    loop {
        match state_sync_once(&client).await {
            // The stream only ends when the connection is stopped or broke; either way look again
            Ok(()) => failures = 0,
            Err(error) => {
                failures = failures.saturating_add(1);
                tracing::warn!("mudrix state sync failed: {error}");
            }
        }
        sleep(Duration::from_secs(
            2u64.saturating_pow(failures.min(5)).min(60),
        ))
        .await;
    }
}

async fn state_sync_once(client: &Client) -> std::result::Result<(), matrix_sdk::Error> {
    let list = SlidingSyncList::builder("mudrix_state")
        .sync_mode(SlidingSyncMode::new_growing(100))
        .no_timeline_limit()
        .required_state(required_state())
        .filters(Some(assign!(http::request::ListFilters::default(), {
            is_invite: Some(false),
        })));
    let sync = client
        .sliding_sync(CONNECTION_ID)?
        .add_list(list)
        .build()
        .await?;
    let stream = sync.sync();
    pin_mut!(stream);
    while let Some(update) = stream.next().await {
        update?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn types<'a>(list: &[&'a str]) -> HashSet<&'a str> {
        list.iter().copied().collect()
    }

    #[test]
    fn mudrix_types_come_under_both_namespaces() {
        let all = mudrix_state_types();
        assert_eq!(all.len(), NAMES.len() * 2);
        assert!(all.contains(&"io.github.kapsikkum.mudrix.space_roles".to_owned()));
        assert!(all.contains(&"chat.mudrix.soundboard.settings".to_owned()));
    }

    #[test]
    fn every_state_key_of_each_type_is_requested() {
        let required = required_state();
        assert_eq!(required.len(), mudrix_state_types().len());
        assert!(required.iter().all(|(_, key)| key == "*"));
        assert!(required
            .iter()
            .any(|(t, _)| t.to_string() == "io.github.kapsikkum.mudrix.voice_channel"));
    }

    #[test]
    fn only_types_sync_delivers_are_read_locally() {
        let own = vec!["io.github.kapsikkum.mudrix.space_banner".to_owned()];
        assert!(synced_locally(&own));
        assert!(synced_locally(&["m.space.child".to_owned()]));
        assert!(!synced_locally(&["m.room.topic".to_owned()]));
        assert!(!synced_locally(&[
            "m.space.child".to_owned(),
            "xyz.other".to_owned()
        ]));
    }

    #[test]
    fn views_carry_sender_and_time() {
        let event = json!({
            "type": "chat.mudrix.space_roles", "state_key": "", "sender": "@a:x",
            "event_id": "$e", "origin_server_ts": 55, "content": { "roles": [] },
        });
        let wanted = types(&["chat.mudrix.space_roles"]);
        let view = view_of("!r:x", &event, &wanted).unwrap();
        assert_eq!(view.sender, "@a:x");
        assert_eq!(view.origin_server_ts, 55);
        assert_eq!(view.event_id.as_deref(), Some("$e"));
        assert_eq!(view.room_id, "!r:x");
        assert_eq!(view.content, json!({ "roles": [] }));
        assert!(view_of("!r:x", &event, &types(&["other"])).is_none());
    }

    #[test]
    fn removed_or_senderless_state_is_dropped() {
        let wanted = types(&["t"]);
        let removed = json!({ "type": "t", "sender": "@a:x", "content": {} });
        assert!(view_of("!r:x", &removed, &wanted).is_none());
        let anonymous = json!({ "type": "t", "content": { "a": 1 } });
        assert!(view_of("!r:x", &anonymous, &wanted).is_none());
    }
}
