//! Delayed events (MSC4140): events the homeserver sends later, for "send later". The server
//! has to send the plain event itself, so they can't go to encrypted rooms.

use std::time::Duration;

use matrix_sdk::{
    config::RequestConfig,
    ruma::{
        api::{
            client::delayed_events::{
                delayed_message_event, delayed_state_event, get_all_delayed_events,
                update_delayed_event::{unstable_v1 as update_delayed, UpdateAction},
                DelayParameters, DelayedEventData, DelayedEventStatus,
            },
            error::ErrorKind,
        },
        events::{MessageLikeEventType, StateEventType},
        serde::Raw,
        TransactionId,
    },
    HttpError,
};
use serde::Serialize;
use serde_json::Value;

use crate::{rooms::parse_room_id, Error, Result, WizardClient};

const FEATURE: &str = "org.matrix.msc4140";
const UNSUPPORTED: &str = "delayed events";

/// A delayed event the homeserver holds for the user
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct DelayedEvent {
    /// What `cancelDelayedEvent` and `sendDelayedEventNow` take
    pub delay_id: String,
    pub room_id: String,
    pub event_type: String,
    /// Set when the delayed event is a state event
    pub state_key: Option<String>,
    /// The content to send
    pub content: Value,
    /// How long the server waits, in milliseconds
    pub delay_ms: u64,
    /// When the wait started (or was last restarted), milliseconds since the Unix epoch; the
    /// event goes out at `runningSince + delayMs`
    pub running_since: u64,
}

pub(crate) fn delayed_events_supported(unstable_features: &[&str]) -> bool {
    unstable_features.contains(&FEATURE)
}

/// Servers that don't have the endpoint answer M_UNRECOGNIZED
fn is_missing_endpoint(kind: Option<&ErrorKind>) -> bool {
    matches!(kind, Some(ErrorKind::Unrecognized))
}

fn server_error(error: HttpError) -> Error {
    if is_missing_endpoint(error.client_api_error_kind()) {
        Error::UnsupportedByServer(UNSUPPORTED.into())
    } else {
        error.into()
    }
}

fn view(data: DelayedEventData) -> Option<DelayedEvent> {
    if data.status() != DelayedEventStatus::Scheduled {
        return None;
    }
    Some(DelayedEvent {
        content: data
            .content
            .deserialize_as_unchecked()
            .unwrap_or(Value::Null),
        delay_id: data.delay_id,
        room_id: data.room_id.to_string(),
        event_type: data.event_type.to_string(),
        state_key: data.state_key,
        delay_ms: data.delay.as_millis() as u64,
        running_since: u64::from(data.running_since.0),
    })
}

/// Only the scheduled ones, soonest first
fn scheduled(events: Vec<DelayedEventData>, room_id: Option<&str>) -> Vec<DelayedEvent> {
    let mut events: Vec<DelayedEvent> = events
        .into_iter()
        .filter_map(view)
        .filter(|e| room_id.is_none_or(|room| e.room_id == room))
        .collect();
    events.sort_by_key(|e| e.running_since.saturating_add(e.delay_ms));
    events
}

impl WizardClient {
    async fn require_delayed_events(&self) -> Result<()> {
        let features = self.sdk().unstable_features().await?;
        let features: Vec<&str> = features.iter().map(|f| f.as_ref()).collect();
        if delayed_events_supported(&features) {
            Ok(())
        } else {
            Err(Error::UnsupportedByServer(UNSUPPORTED.into()))
        }
    }

    /// Asks the homeserver to send an event after `delay_ms`; returns the delay id. Fails with
    /// `unsupportedByServer` when it hasn't switched delayed events on and with `unsupported`
    /// in an encrypted room.
    pub async fn send_delayed_event(
        &self,
        room_id: &str,
        event_type: &str,
        content: Value,
        delay_ms: u64,
        state_key: Option<String>,
    ) -> Result<String> {
        let room = self.room(room_id)?;
        if room.latest_encryption_state().await?.is_encrypted() {
            return Err(Error::Unsupported(
                "delayed events can't be sent to an encrypted room".into(),
            ));
        }
        // Without the feature a server ignores the delay and sends the event at once
        self.require_delayed_events().await?;
        let delay = DelayParameters::Timeout {
            timeout: Duration::from_millis(delay_ms),
        };
        let raw = || Raw::new(&content).map_err(|e| Error::Sdk(e.to_string()));
        let room_id = parse_room_id(room_id)?.to_owned();
        let sdk = self.sdk();
        let once = || RequestConfig::new().disable_retry();
        let delay_id = match state_key {
            Some(state_key) => {
                let request = delayed_state_event::unstable::Request::new_raw(
                    room_id,
                    state_key,
                    StateEventType::from(event_type),
                    delay,
                    raw()?.cast_unchecked(),
                );
                sdk.send(request)
                    .with_request_config(once())
                    .await
                    .map_err(server_error)?
                    .delay_id
            }
            None => {
                let request = delayed_message_event::unstable::Request::new_raw(
                    room_id,
                    TransactionId::new(),
                    MessageLikeEventType::from(event_type),
                    delay,
                    raw()?.cast_unchecked(),
                );
                sdk.send(request)
                    .with_request_config(once())
                    .await
                    .map_err(server_error)?
                    .delay_id
            }
        };
        Ok(delay_id)
    }

    /// The user's scheduled delayed events, soonest first; only one room's with `room_id`.
    pub async fn list_delayed_events(&self, room_id: Option<&str>) -> Result<Vec<DelayedEvent>> {
        self.require_delayed_events().await?;
        let response = self
            .sdk()
            .send(get_all_delayed_events::unstable::Request::new())
            .await
            .map_err(server_error)?;
        Ok(scheduled(response.delayed_events, room_id))
    }

    async fn update_delayed_event(&self, delay_id: &str, action: UpdateAction) -> Result<()> {
        self.sdk()
            .send(update_delayed::Request::new(delay_id.to_owned(), action))
            .await
            .map_err(server_error)?;
        Ok(())
    }

    /// Calls a delayed event off.
    pub async fn cancel_delayed_event(&self, delay_id: &str) -> Result<()> {
        self.update_delayed_event(delay_id, UpdateAction::Cancel)
            .await
    }

    /// Has the server send a delayed event now instead of when it is due.
    pub async fn send_delayed_event_now(&self, delay_id: &str) -> Result<()> {
        self.update_delayed_event(delay_id, UpdateAction::Send)
            .await
    }
}

#[cfg(test)]
mod tests {
    use matrix_sdk::ruma::{owned_event_id, MilliSecondsSinceUnixEpoch, UInt};
    use serde_json::json;

    use super::*;

    fn data(id: &str, room: &str, running_since: u64, delay_ms: u64) -> DelayedEventData {
        DelayedEventData::new(
            id.to_owned(),
            matrix_sdk::ruma::RoomId::parse(room).unwrap(),
            "m.room.message".into(),
            None,
            Raw::new(&json!({ "msgtype": "m.text", "body": id }))
                .unwrap()
                .cast_unchecked(),
            Duration::from_millis(delay_ms),
            MilliSecondsSinceUnixEpoch(UInt::new(running_since).unwrap()),
        )
    }

    #[test]
    fn needs_the_msc4140_flag() {
        assert!(delayed_events_supported(&["org.matrix.msc4140"]));
        assert!(!delayed_events_supported(&["org.matrix.msc4380"]));
        assert!(!delayed_events_supported(&[]));
    }

    #[test]
    fn only_an_unrecognized_endpoint_means_unsupported() {
        assert!(is_missing_endpoint(Some(&ErrorKind::Unrecognized)));
        assert!(!is_missing_endpoint(Some(&ErrorKind::Forbidden)));
        assert!(!is_missing_endpoint(None));
    }

    #[test]
    fn lists_scheduled_events_soonest_first() {
        let events = vec![
            data("$late", "!a:x", 1_000, 5_000),
            data("$soon", "!a:x", 1_000, 1_000),
            data("$other", "!b:x", 0, 10),
        ];
        let all = scheduled(events.clone(), None);
        let ids: Vec<&str> = all.iter().map(|e| e.delay_id.as_str()).collect();
        assert_eq!(ids, ["$other", "$soon", "$late"]);

        let room = scheduled(events, Some("!a:x"));
        assert_eq!(room.len(), 2);
        assert_eq!(room[0].delay_id, "$soon");
        assert_eq!(room[0].content["body"], "$soon");
        assert_eq!(room[0].delay_ms, 1_000);
        assert_eq!(room[0].running_since, 1_000);
        assert_eq!(room[0].event_type, "m.room.message");
    }

    #[test]
    fn finished_events_are_left_out() {
        let mut sent = data("$sent", "!a:x", 0, 10);
        sent.event_id = Some(owned_event_id!("$e:x"));
        sent.finalized_ts = Some(MilliSecondsSinceUnixEpoch(UInt::new(10).unwrap()));
        let mut cancelled = data("$cancelled", "!a:x", 0, 10);
        cancelled.finalized_ts = Some(MilliSecondsSinceUnixEpoch(UInt::new(5).unwrap()));
        assert!(scheduled(vec![sent, cancelled], None).is_empty());
    }
}
