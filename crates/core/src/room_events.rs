//! Live events of chosen types, for apps that carry their own events in rooms (a soundboard
//! play, a voice move) and want to hear them as they arrive

use std::collections::HashSet;

use matrix_sdk::ruma::{events::AnySyncMessageLikeEvent, serde::Raw};
use serde::Serialize;
use serde_json::Value;

use crate::WizardClient;

/// A message-like event that arrived through sync (decrypted when the room is encrypted)
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomEvent {
    pub room_id: String,
    pub sender: String,
    pub event_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub content: Value,
    /// When the sender's server saw the event, in milliseconds; `0` when missing. Sync also
    /// delivers recent history, so an app that only wants live events compares this to the clock.
    pub origin_server_ts: u64,
}

/// The event as a [`RoomEvent`] when it is a message-like event of one of `types`.
fn room_event(room_id: &str, event: &Value, types: &HashSet<String>) -> Option<RoomEvent> {
    let event_type = event.get("type")?.as_str()?;
    if !types.contains(event_type) || event.get("state_key").is_some() {
        return None;
    }
    let text = |key: &str| {
        event
            .get(key)
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
    };
    Some(RoomEvent {
        room_id: room_id.to_owned(),
        sender: text("sender")?,
        event_id: text("event_id")?,
        event_type: event_type.to_owned(),
        content: event.get("content").cloned().unwrap_or(Value::Null),
        origin_server_ts: event
            .get("origin_server_ts")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    })
}

impl WizardClient {
    /// Hands every message-like event of one of `types` that arrives in a joined room to
    /// `on_event`, own events included. Returns when the stream ends.
    pub async fn watch_room_events(&self, types: Vec<String>, mut on_event: impl FnMut(RoomEvent)) {
        use futures_util::StreamExt;
        let types: HashSet<String> = types.into_iter().collect();
        let (sender, mut receiver) = futures_channel::mpsc::unbounded::<RoomEvent>();
        let handle = self.sdk().add_event_handler(
            move |raw: Raw<AnySyncMessageLikeEvent>, room: matrix_sdk::Room| {
                let sender = sender.clone();
                let types = types.clone();
                async move {
                    let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                        return;
                    };
                    if let Some(event) = room_event(room.room_id().as_str(), &event, &types) {
                        let _ = sender.unbounded_send(event);
                    }
                }
            },
        );
        let _guard = self.sdk().event_handler_drop_guard(handle);
        while let Some(event) = receiver.next().await {
            on_event(event);
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn types(list: &[&str]) -> HashSet<String> {
        list.iter().map(|t| (*t).to_owned()).collect()
    }

    #[test]
    fn keeps_events_of_a_wanted_type() {
        let event = json!({
            "type": "io.example.play", "sender": "@a:x", "event_id": "$e",
            "origin_server_ts": 1234, "content": { "clip": "boom" },
        });
        let got = room_event("!r:x", &event, &types(&["io.example.play"])).unwrap();
        assert_eq!(got.room_id, "!r:x");
        assert_eq!(got.sender, "@a:x");
        assert_eq!(got.event_id, "$e");
        assert_eq!(got.event_type, "io.example.play");
        assert_eq!(got.content, json!({ "clip": "boom" }));
        assert_eq!(got.origin_server_ts, 1234);
    }

    #[test]
    fn drops_other_types_and_state_events() {
        let other = json!({ "type": "m.room.message", "sender": "@a:x", "event_id": "$e" });
        assert!(room_event("!r:x", &other, &types(&["io.example.play"])).is_none());
        let state = json!({
            "type": "io.example.play", "state_key": "", "sender": "@a:x", "event_id": "$e",
        });
        assert!(room_event("!r:x", &state, &types(&["io.example.play"])).is_none());
    }

    #[test]
    fn needs_a_sender_and_an_id() {
        let event = json!({ "type": "io.example.play", "sender": "@a:x" });
        assert!(room_event("!r:x", &event, &types(&["io.example.play"])).is_none());
    }

    #[test]
    fn missing_content_and_time_are_defaulted() {
        let event = json!({ "type": "t", "sender": "@a:x", "event_id": "$e" });
        let got = room_event("!r:x", &event, &types(&["t"])).unwrap();
        assert_eq!(got.content, Value::Null);
        assert_eq!(got.origin_server_ts, 0);
    }
}
