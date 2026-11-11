//! Room widgets: web apps pinned to a room (`m.room.widget` state, plus `m.widget` and Element's
//! older type).

use matrix_sdk::ruma::{
    api::client::state::{get_state_event_for_key, get_state_events},
    events::{AnySyncStateEvent, StateEventType},
    serde::Raw,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use url::Url;

use crate::{Error, Result, WizardClient};

/// What the original app reads and writes
pub(crate) const WIDGET_EVENT: &str = "m.room.widget";
const WIDGET_EVENT_ELEMENT: &str = "im.vector.modular.widgets";
const WIDGET_EVENT_STABLE: &str = "m.widget";
const WIDGET_EVENTS: [&str; 3] = [WIDGET_EVENT, WIDGET_EVENT_ELEMENT, WIDGET_EVENT_STABLE];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Widget {
    pub id: String,
    /// `m.custom`, `m.jitsi`, `m.etherpad`, ...
    pub kind: String,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub name: Option<String>,
    /// The URL as stored, with `$placeholders`
    pub url: String,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub creator: Option<String>,
    pub data: Value,
}

fn parse_widget(event: &Value) -> Option<Widget> {
    let content = event.get("content")?;
    // A widget without a type isn't one
    let kind = content
        .get("type")
        .and_then(Value::as_str)
        .filter(|k| !k.is_empty())?;
    let url = content.get("url")?.as_str()?;
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return None;
    }
    Some(Widget {
        id: event.get("state_key")?.as_str()?.to_owned(),
        kind: kind.to_owned(),
        name: content
            .get("name")
            .and_then(Value::as_str)
            .filter(|n| !n.is_empty())
            .map(ToOwned::to_owned),
        url: url.to_owned(),
        creator: content
            .get("creatorUserId")
            .and_then(Value::as_str)
            .or_else(|| event.get("sender")?.as_str())
            .map(ToOwned::to_owned),
        data: content.get("data").cloned().unwrap_or_else(|| json!({})),
    })
}

/// Fills in the widget URL's `$placeholders` (from the spec and from the widget's data).
pub(crate) fn fill_url(widget: &Widget, values: &[(&str, &str)]) -> String {
    let mut url = widget.url.clone();
    let mut pairs: Vec<(String, String)> = values
        .iter()
        .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
        .collect();
    if let Some(data) = widget.data.as_object() {
        for (key, value) in data {
            if let Some(value) = value.as_str() {
                pairs.push((key.clone(), value.to_owned()));
            }
        }
    }
    // Longest first, so `$matrix_room_id` isn't eaten by a shorter key
    pairs.sort_by_key(|(k, _)| std::cmp::Reverse(k.len()));
    for (key, value) in pairs {
        let encoded: String = url::form_urlencoded::byte_serialize(value.as_bytes()).collect();
        url = url.replace(&format!("${key}"), &encoded);
    }
    url
}

impl WizardClient {
    /// Read from the server: sliding sync doesn't send widget state.
    pub async fn widgets(&self, room_id: &str) -> Result<Vec<Widget>> {
        let room = self.room(room_id)?;
        let response = self
            .sdk()
            .send(get_state_events::v3::Request::new(
                room.room_id().to_owned(),
            ))
            .await?;
        let mut events: Vec<(usize, Value)> = response
            .room_state
            .into_iter()
            .filter_map(|raw| raw.deserialize_as_unchecked::<Value>().ok())
            .filter_map(|event| {
                let kind = event.get("type").and_then(Value::as_str)?;
                let rank = WIDGET_EVENTS.iter().position(|t| *t == kind)?;
                Some((rank, event))
            })
            .collect();
        events.sort_by_key(|(rank, _)| *rank);
        let mut widgets: Vec<Widget> = Vec::new();
        for (_, event) in events {
            if let Some(widget) = parse_widget(&event) {
                if !widgets.iter().any(|w| w.id == widget.id) {
                    widgets.push(widget);
                }
            }
        }
        widgets.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
        Ok(widgets)
    }

    /// Calls `on_widgets` with the room's widgets now and whenever they change.
    pub async fn watch_widgets(
        &self,
        room_id: &str,
        mut on_widgets: impl FnMut(Vec<Widget>),
    ) -> Result<()> {
        let room = self.room(room_id)?;
        let (sender, mut receiver) = futures_channel::mpsc::unbounded::<()>();
        let handle = self.sdk().add_room_event_handler(
            room.room_id(),
            move |raw: Raw<AnySyncStateEvent>| {
                let sender = sender.clone();
                async move {
                    let kind = raw
                        .get_field::<String>("type")
                        .ok()
                        .flatten()
                        .unwrap_or_default();
                    if WIDGET_EVENTS.contains(&kind.as_str()) {
                        let _ = sender.unbounded_send(());
                    }
                }
            },
        );
        let _guard = self.sdk().event_handler_drop_guard(handle);
        loop {
            on_widgets(self.widgets(room_id).await?);
            if futures_util::StreamExt::next(&mut receiver).await.is_none() {
                return Ok(());
            }
        }
    }

    /// Adds a widget showing a web page, or replaces the one with this id.
    pub async fn set_widget(
        &self,
        room_id: &str,
        id: Option<&str>,
        name: &str,
        url: &str,
    ) -> Result<String> {
        let parsed = Url::parse(url.trim()).map_err(|e| Error::InvalidId(e.to_string()))?;
        if parsed.scheme() != "https" && parsed.scheme() != "http" {
            return Err(Error::InvalidId("widgets must be web pages".into()));
        }
        let id = id
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("mudrix_{}", matrix_sdk::ruma::TransactionId::new()));
        let content = json!({
            "type": "m.custom",
            "url": parsed.as_str(),
            "name": name.trim(),
            "data": {},
            "creatorUserId": self.sdk().user_id().map(ToString::to_string),
            "id": id,
        });
        self.room(room_id)?
            .send_state_event_raw(WIDGET_EVENT, &id, content)
            .await?;
        Ok(id)
    }

    pub async fn remove_widget(&self, room_id: &str, id: &str) -> Result<()> {
        let room = self.room(room_id)?;
        for event_type in WIDGET_EVENTS {
            let request = get_state_event_for_key::v3::Request::new(
                room.room_id().to_owned(),
                StateEventType::from(event_type),
                id.to_owned(),
            );
            let exists = self
                .sdk()
                .send(request)
                .await
                .ok()
                .and_then(|r| serde_json::from_str::<Value>(r.event_or_content.get()).ok())
                .is_some_and(|c| c.as_object().is_some_and(|o| !o.is_empty()));
            if exists {
                room.send_state_event_raw(event_type, id, json!({})).await?;
            }
        }
        Ok(())
    }

    /// The URL to load for a widget, with this user's and room's details filled in.
    pub async fn widget_url(
        &self,
        room_id: &str,
        widget: &Widget,
        theme: &str,
        language: &str,
    ) -> Result<String> {
        let user_id = self
            .sdk()
            .user_id()
            .map(ToString::to_string)
            .unwrap_or_default();
        let profile = self.own_profile().await.ok();
        let display_name = profile
            .as_ref()
            .and_then(|p| p.display_name.clone())
            .unwrap_or_default();
        let avatar_url = profile.and_then(|p| p.avatar_url).unwrap_or_default();
        Ok(fill_url(
            widget,
            &[
                ("matrix_user_id", &user_id),
                ("matrix_room_id", room_id),
                ("matrix_display_name", &display_name),
                ("matrix_avatar_url", &avatar_url),
                ("matrix_widget_id", &widget.id),
                ("org.matrix.msc2873.client_id", "io.github.kapsikkum.mudrix"),
                ("org.matrix.msc2873.client_theme", theme),
                ("org.matrix.msc2873.client_language", language),
            ],
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_fills_widgets() {
        let event = json!({
            "state_key": "w1", "sender": "@a:x",
            "content": { "type": "m.custom", "url": "https://w.example/?room=$matrix_room_id&u=$matrix_user_id&pad=$padName", "name": "Pad", "data": { "padName": "notes 1" } },
        });
        let widget = parse_widget(&event).unwrap();
        assert_eq!(widget.creator.as_deref(), Some("@a:x"));
        assert_eq!(
            fill_url(
                &widget,
                &[("matrix_room_id", "!r:x"), ("matrix_user_id", "@a:x")]
            ),
            "https://w.example/?room=%21r%3Ax&u=%40a%3Ax&pad=notes+1"
        );
        let script = json!({ "state_key": "w2", "content": { "url": "javascript:alert(1)" } });
        assert!(parse_widget(&script).is_none());
        assert!(parse_widget(&json!({ "state_key": "w3", "content": {} })).is_none());
        let untyped = json!({ "state_key": "w4", "content": { "url": "https://w.example/" } });
        assert!(parse_widget(&untyped).is_none());
    }
}
