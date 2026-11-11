//! Looking into a room's past: the event nearest a date (jump to date) and the versions of an
//! edited message

use matrix_sdk::ruma::{
    api::{
        client::{relations::get_relating_events_with_rel_type, room::get_event_by_timestamp},
        error::ErrorKind,
        Direction,
    },
    events::relation::RelationType,
    uint, MilliSecondsSinceUnixEpoch, UInt,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    rooms::parse_room_id, timeline::parse_event_id, Error, EventSource, Result, WizardClient,
};

/// How many edits are read at most
const MAX_EDITS: usize = 200;

/// Which way `timestampToEvent` looks from the date
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum SearchDirection {
    /// The first event at or after the date
    Forward,
    /// The last event at or before the date
    Backward,
}

/// The event `timestampToEvent` found
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct TimestampEvent {
    pub event_id: String,
    /// When the sender's server saw it, in milliseconds
    pub timestamp: u64,
}

/// One version of a message: the original or an edit
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct EventVersion {
    /// The original event's or the edit's ID
    pub event_id: String,
    pub sender: String,
    /// Milliseconds since the Unix epoch
    pub timestamp: u64,
    pub is_original: bool,
    pub msgtype: Option<String>,
    pub body: String,
    /// Set with `formattedBody` when the version has HTML
    pub format: Option<String>,
    pub formatted_body: Option<String>,
}

/// A version from an event as JSON (decrypted when it was encrypted); `None` when it has no
/// text (redacted, or still encrypted)
fn version_of(event: &Value, is_original: bool) -> Option<EventVersion> {
    let text = |value: &Value, key: &str| {
        value
            .get(key)
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
    };
    let content = event.get("content")?;
    let new_content = content
        .get("m.new_content")
        .filter(|c| !is_original && c.is_object());
    let source = new_content.unwrap_or(content);
    let mut body = text(source, "body")?;
    if new_content.is_none() && !is_original {
        // The fallback body of an edit starts with "* "
        if let Some(stripped) = body.strip_prefix("* ") {
            body = stripped.to_owned();
        }
    }
    Some(EventVersion {
        event_id: text(event, "event_id")?,
        sender: text(event, "sender")?,
        timestamp: event
            .get("origin_server_ts")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        is_original,
        msgtype: text(source, "msgtype"),
        body,
        format: text(source, "format"),
        formatted_body: text(source, "formatted_body"),
    })
}

/// The original and the valid edits (by the original's sender, not redacted), oldest first.
/// The original comes first even when it has no text of its own.
fn versions(original: &Value, edits: &[Value]) -> Vec<EventVersion> {
    let sender = original.get("sender").and_then(Value::as_str);
    let mut edits: Vec<EventVersion> = edits
        .iter()
        .filter_map(|e| version_of(e, false))
        .filter(|e| Some(e.sender.as_str()) == sender)
        .collect();
    edits.sort_by_key(|e| e.timestamp);
    version_of(original, true)
        .into_iter()
        .chain(edits)
        .collect()
}

impl WizardClient {
    /// The ID of the event closest to `timestamp` (milliseconds) in the room, looking
    /// `direction` from it; `None` when the room has no event that way. Fails with
    /// `unsupportedByServer` when the homeserver can't look up dates.
    pub async fn timestamp_to_event(
        &self,
        room_id: &str,
        timestamp: u64,
        direction: SearchDirection,
    ) -> Result<Option<TimestampEvent>> {
        let ts = UInt::new(timestamp).ok_or_else(|| Error::InvalidId("timestamp".into()))?;
        let request = get_event_by_timestamp::v1::Request::new(
            parse_room_id(room_id)?.to_owned(),
            MilliSecondsSinceUnixEpoch(ts),
            match direction {
                SearchDirection::Forward => Direction::Forward,
                SearchDirection::Backward => Direction::Backward,
            },
        );
        match self.sdk().send(request).await {
            Ok(found) => Ok(Some(TimestampEvent {
                event_id: found.event_id.to_string(),
                timestamp: u64::from(found.origin_server_ts.0),
            })),
            Err(e) => match e.client_api_error_kind() {
                Some(ErrorKind::NotFound) => Ok(None),
                Some(ErrorKind::Unrecognized) => {
                    Err(Error::UnsupportedByServer("jumping to a date".into()))
                }
                _ => Err(e.into()),
            },
        }
    }

    /// Every version of a message, oldest first: the original and its edits (up to 200),
    /// decrypted in encrypted rooms. Edits by anyone but the sender don't count.
    pub async fn event_edit_history(
        &self,
        room_id: &str,
        event_id: &str,
    ) -> Result<Vec<EventVersion>> {
        let room = self.room(room_id)?;
        let parent = parse_event_id(event_id)?;
        let EventSource {
            original,
            decrypted,
            ..
        } = self.event_source(room_id, event_id).await?;
        let original = decrypted.unwrap_or(original);

        let mut edits = Vec::new();
        let mut from = None;
        loop {
            let mut request = get_relating_events_with_rel_type::v1::Request::new(
                room.room_id().to_owned(),
                parent.clone(),
                RelationType::Replacement,
            );
            request.from = from;
            request.limit = Some(uint!(50));
            let page = self.sdk().send(request).await?;
            for raw in page.chunk {
                let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                    continue;
                };
                if event.get("type").and_then(Value::as_str) == Some("m.room.encrypted") {
                    let decrypted = room
                        .decrypt_event(&raw.clone().cast_unchecked(), None)
                        .await;
                    if let Some(event) = decrypted
                        .ok()
                        .and_then(|e| e.raw().deserialize_as_unchecked::<Value>().ok())
                    {
                        edits.push(event);
                    }
                } else {
                    edits.push(event);
                }
            }
            from = page.next_batch;
            if from.is_none() || edits.len() >= MAX_EDITS {
                break;
            }
        }
        Ok(versions(&original, &edits))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn original() -> Value {
        json!({
            "event_id": "$o", "sender": "@a:x", "origin_server_ts": 100,
            "type": "m.room.message",
            "content": { "msgtype": "m.text", "body": "hello" },
        })
    }

    fn edit(id: &str, sender: &str, ts: u64, body: &str) -> Value {
        json!({
            "event_id": id, "sender": sender, "origin_server_ts": ts, "type": "m.room.message",
            "content": {
                "msgtype": "m.text", "body": format!("* {body}"),
                "m.new_content": {
                    "msgtype": "m.text", "body": body,
                    "format": "org.matrix.custom.html", "formatted_body": format!("<b>{body}</b>"),
                },
                "m.relates_to": { "rel_type": "m.replace", "event_id": "$o" },
            },
        })
    }

    #[test]
    fn lists_the_original_then_edits_oldest_first() {
        let edits = [
            edit("$e2", "@a:x", 300, "third"),
            edit("$e1", "@a:x", 200, "second"),
        ];
        let got = versions(&original(), &edits);
        let bodies: Vec<&str> = got.iter().map(|v| v.body.as_str()).collect();
        assert_eq!(bodies, ["hello", "second", "third"]);
        assert!(got[0].is_original && !got[1].is_original);
        assert_eq!(got[1].event_id, "$e1");
        assert_eq!(got[1].timestamp, 200);
        assert_eq!(got[1].format.as_deref(), Some("org.matrix.custom.html"));
        assert_eq!(got[1].formatted_body.as_deref(), Some("<b>second</b>"));
        assert_eq!(got[0].formatted_body, None);
    }

    #[test]
    fn ignores_edits_by_other_people_and_redacted_ones() {
        let redacted = json!({
            "event_id": "$r", "sender": "@a:x", "origin_server_ts": 250, "content": {},
        });
        let edits = [edit("$bad", "@b:x", 200, "forged"), redacted];
        assert_eq!(versions(&original(), &edits).len(), 1);
    }

    #[test]
    fn an_edit_without_new_content_loses_the_star() {
        let event = json!({
            "event_id": "$e", "sender": "@a:x", "content": { "body": "* fixed" },
        });
        assert_eq!(version_of(&event, false).unwrap().body, "fixed");
        assert_eq!(version_of(&event, true).unwrap().body, "* fixed");
    }

    #[test]
    fn the_original_may_have_no_text() {
        let encrypted = json!({
            "event_id": "$o", "sender": "@a:x", "content": { "algorithm": "m.megolm.v1.aes-sha2" },
        });
        let edits = [edit("$e1", "@a:x", 200, "second")];
        let got = versions(&encrypted, &edits);
        assert_eq!(got.len(), 1);
        assert!(!got[0].is_original);
    }
}
