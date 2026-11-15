use matrix_sdk::ruma::{
    api::client::presence::get_presence::v3::Request as GetPresenceRequest,
    presence::PresenceState,
    profile::{ProfileFieldName, ProfileFieldValue},
    Int, MilliSecondsSinceUnixEpoch, OwnedMxcUri,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::{rooms::parse_user_id, Error, Result, WizardClient};

/// The custom status, stored as an extended profile field (MSC4133)
pub const STATUS_FIELD: &str = "io.github.kapsikkum.mudrix.status";
/// Where earlier Mudrix versions and the upstream base kept it: still read, never written
const LEGACY_STATUS_FIELDS: [&str; 2] = ["chat.mudrix.status", "org.wizardchat.status"];
/// Where the expiry lives: `expires` is what the web and Android clients write (milliseconds
/// since the Unix epoch); `expires_at` is what earlier core versions wrote and is still read,
/// so statuses already stored that way expire too.
const STATUS_EXPIRY_KEYS: [&str; 2] = ["expires", "expires_at"];
const STATUS_EXPIRES_KEY: &str = "expires";
/// A presence override (`dnd` or `idle`) that the web and Android clients keep in the same
/// object as the text and emoji
const STATUS_MODE_KEY: &str = "mode";
const STATUS_MODES: [&str; 2] = ["dnd", "idle"];
pub const MAX_STATUS_LENGTH: usize = 128;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CustomStatus {
    pub text: String,
    /// Milliseconds since the Unix epoch; `None` keeps it until cleared
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub expires_at: Option<u64>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum Presence {
    Online,
    Unavailable,
    Offline,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PresenceInfo {
    pub state: Presence,
    pub currently_active: bool,
    pub last_active_ago_ms: Option<u64>,
    pub status_msg: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub custom_status: Option<CustomStatus>,
    /// `None` when the server doesn't share presence
    pub presence: Option<PresenceInfo>,
    pub is_ignored: bool,
}

fn now_ms() -> u64 {
    u64::from(MilliSecondsSinceUnixEpoch::now().0)
}

/// When a status expires, from whichever expiry key it was stored under
fn status_expiry(value: &Value) -> Option<u64> {
    STATUS_EXPIRY_KEYS.iter().find_map(|key| {
        let at = value.get(*key)?;
        at.as_u64()
            .or_else(|| at.as_f64().filter(|at| *at > 0.0).map(|at| at as u64))
    })
}

/// Reads the stored status, dropping empty and expired ones
pub(crate) fn parse_status(value: Option<&Value>) -> Option<CustomStatus> {
    let value = value?;
    let text = value.get("text")?.as_str()?.trim();
    if text.is_empty() {
        return None;
    }
    let expires_at = status_expiry(value);
    if expires_at.is_some_and(|at| at <= now_ms()) {
        return None;
    }
    Some(CustomStatus {
        text: text.chars().take(MAX_STATUS_LENGTH).collect(),
        expires_at,
    })
}

/// The stored status as an object, so the keys other clients keep in it (`mode`, `emoji`, ...)
/// survive a write
fn status_object(value: Option<&Value>) -> Map<String, Value> {
    value
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

/// The field value for a status: replaces the text and the expiry, keeps every other key
fn status_value(existing: Option<&Value>, text: &str, expires_at: Option<u64>) -> Value {
    let mut value = status_object(existing);
    value.insert("text".to_owned(), Value::String(text.to_owned()));
    for key in STATUS_EXPIRY_KEYS {
        value.remove(key);
    }
    if let Some(at) = expires_at {
        value.insert(STATUS_EXPIRES_KEY.to_owned(), json!(at));
    }
    Value::Object(value)
}

/// Clearing the status drops its text, emoji and expiry but keeps a stored presence mode: `dnd`
/// overrides the presence dot rather than being part of the status text, and the web and Android
/// clients keep it when the text is cleared. `None` means nothing would be left, so the field is
/// deleted instead of left behind empty.
fn cleared_status_value(existing: Option<&Value>) -> Option<Value> {
    let mode = existing?
        .as_object()?
        .get(STATUS_MODE_KEY)
        .and_then(Value::as_str)
        .filter(|mode| STATUS_MODES.contains(mode))?;
    let mut value = Map::new();
    value.insert(STATUS_MODE_KEY.to_owned(), Value::String(mode.to_owned()));
    Some(Value::Object(value))
}

/// The status in a profile: the Mudrix field first, then the older names
fn status_of_profile<'a>(field: impl Fn(&str) -> Option<&'a Value>) -> Option<CustomStatus> {
    std::iter::once(STATUS_FIELD)
        .chain(LEGACY_STATUS_FIELDS)
        .find_map(|name| parse_status(field(name)))
}

fn presence_of(state: &PresenceState) -> Presence {
    match state {
        PresenceState::Online => Presence::Online,
        PresenceState::Unavailable => Presence::Unavailable,
        _ => Presence::Offline,
    }
}

impl WizardClient {
    pub async fn presence(&self, user_id: &str) -> Option<PresenceInfo> {
        let user_id = parse_user_id(user_id).ok()?.to_owned();
        let response = self
            .sdk()
            .send(GetPresenceRequest::new(user_id))
            .await
            .ok()?;
        Some(PresenceInfo {
            state: presence_of(&response.presence),
            currently_active: response.currently_active.unwrap_or(false),
            last_active_ago_ms: response.last_active_ago.map(|d| d.as_millis() as u64),
            status_msg: response.status_msg.filter(|m| !m.is_empty()),
        })
    }

    /// Someone's profile, custom status and presence, fetched from their server.
    pub async fn user_profile(&self, user_id: &str) -> Result<UserProfile> {
        let id = parse_user_id(user_id)?.to_owned();
        let profile = self.sdk().account().fetch_user_profile_of(&id).await?.data;
        let is_ignored = self.sdk().is_user_ignored(&id).await;
        Ok(UserProfile {
            user_id: id.to_string(),
            display_name: profile
                .get("displayname")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            avatar_url: profile
                .get("avatar_url")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            custom_status: status_of_profile(|name| profile.get(name)),
            presence: self.presence(user_id).await,
            is_ignored,
        })
    }

    pub async fn own_profile(&self) -> Result<UserProfile> {
        let user_id = self.user_id().ok_or(Error::NotSignedIn)?;
        self.user_profile(&user_id).await
    }

    pub async fn set_display_name(&self, name: &str) -> Result<()> {
        let name = name.trim();
        Ok(self
            .sdk()
            .account()
            .set_display_name(Some(name).filter(|n| !n.is_empty()))
            .await?)
    }

    /// Uploads a new avatar and sets it; resolves to its `mxc://` URI.
    pub async fn set_avatar(&self, bytes: Vec<u8>, mimetype: &str) -> Result<String> {
        let mimetype: mime::Mime = mimetype.parse().unwrap_or(mime::IMAGE_PNG);
        let uri: OwnedMxcUri = self.sdk().account().upload_avatar(&mimetype, bytes).await?;
        Ok(uri.to_string())
    }

    pub async fn remove_avatar(&self) -> Result<()> {
        Ok(self.sdk().account().set_avatar_url(None).await?)
    }

    /// The raw status field as stored now, so a write can keep the keys other clients put in it
    async fn stored_status(&self) -> Option<Value> {
        let user_id = self.user_id()?;
        self.profile_field(&user_id, STATUS_FIELD)
            .await
            .ok()
            .flatten()
    }

    /// Sets the custom status, also as presence message for clients without profile fields.
    ///
    /// The field is rewritten from the one already stored, so the keys the other clients keep
    /// there (`mode`, `emoji`, ...) are preserved: only the text and the expiry are replaced. The
    /// expiry is written as `expires` in milliseconds since the Unix epoch, the key the web and
    /// Android clients read and write.
    pub async fn set_custom_status(
        &self,
        text: &str,
        expires_at: Option<u64>,
        presence: Presence,
    ) -> Result<()> {
        let text: String = text.trim().chars().take(MAX_STATUS_LENGTH).collect();
        if text.is_empty() {
            return self.clear_custom_status(presence).await;
        }
        let existing = self.stored_status().await;
        let value = status_value(existing.as_ref(), &text, expires_at);
        let field =
            ProfileFieldValue::new(STATUS_FIELD, value).map_err(|e| Error::Sdk(e.to_string()))?;
        let stored = self.sdk().account().set_profile_field(field).await;
        self.set_presence(presence, Some(&text)).await?;
        stored.map_err(Error::from)
    }

    /// Clears the custom status.
    ///
    /// A stored presence mode (`dnd`, `idle`) is kept: it overrides the presence dot rather than
    /// being part of the status text, and the web and Android clients keep it when the text is
    /// cleared. Without one the field is deleted.
    pub async fn clear_custom_status(&self, presence: Presence) -> Result<()> {
        let existing = self.stored_status().await;
        let removed = match cleared_status_value(existing.as_ref()) {
            Some(kept) => {
                let field = ProfileFieldValue::new(STATUS_FIELD, kept)
                    .map_err(|e| Error::Sdk(e.to_string()))?;
                self.sdk().account().set_profile_field(field).await
            }
            None => {
                self.sdk()
                    .account()
                    .delete_profile_field(ProfileFieldName::from(STATUS_FIELD))
                    .await
            }
        };
        // An older copy would show again once the current one is gone
        for legacy in LEGACY_STATUS_FIELDS {
            let _ = self
                .sdk()
                .account()
                .delete_profile_field(ProfileFieldName::from(legacy))
                .await;
        }
        self.set_presence(presence, None).await?;
        removed.map_err(Error::from)
    }

    pub async fn set_presence(&self, presence: Presence, status_msg: Option<&str>) -> Result<()> {
        let state = match presence {
            Presence::Online => PresenceState::Online,
            Presence::Unavailable => PresenceState::Unavailable,
            Presence::Offline => PresenceState::Offline,
        };
        Ok(self
            .sdk()
            .set_presence(state, status_msg.map(ToOwned::to_owned), true)
            .await?)
    }

    /// Whether the server shares presence: going online must show up when read back.
    pub async fn presence_supported(&self) -> bool {
        let Some(user_id) = self.user_id() else {
            return false;
        };
        if self.set_presence(Presence::Online, None).await.is_err() {
            return false;
        }
        self.presence(&user_id)
            .await
            .is_some_and(|p| p.state == Presence::Online)
    }

    pub async fn ignore_user(&self, user_id: &str) -> Result<()> {
        Ok(self
            .sdk()
            .account()
            .ignore_user(parse_user_id(user_id)?)
            .await?)
    }

    pub async fn unignore_user(&self, user_id: &str) -> Result<()> {
        Ok(self
            .sdk()
            .account()
            .unignore_user(parse_user_id(user_id)?)
            .await?)
    }

    /// Changes someone's power level in a room (0 member, 50 moderator, 100 admin).
    pub async fn set_power_level(&self, room_id: &str, user_id: &str, level: i64) -> Result<()> {
        let user = parse_user_id(user_id)?.to_owned();
        let level =
            Int::new(level).ok_or_else(|| Error::InvalidId("power level out of range".into()))?;
        self.room(room_id)?
            .update_power_levels(vec![(&user, level)])
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_mudrix_status_wins_over_older_names() {
        let profile = json!({
            "org.wizardchat.status": { "text": "old" },
            "chat.mudrix.status": { "text": "mid" },
        });
        let get = |name: &str| profile.get(name);
        assert_eq!(status_of_profile(get).unwrap().text, "mid");
        let both = json!({
            "org.wizardchat.status": { "text": "old" },
            "io.github.kapsikkum.mudrix.status": { "text": "new" },
        });
        assert_eq!(status_of_profile(|n| both.get(n)).unwrap().text, "new");
        let expired = json!({
            "io.github.kapsikkum.mudrix.status": { "text": "x", "expires_at": 1 },
            "org.wizardchat.status": { "text": "legacy" },
        });
        assert_eq!(
            status_of_profile(|n| expired.get(n)).unwrap().text,
            "legacy"
        );
        assert_eq!(status_of_profile(|_| None), None);
    }

    #[test]
    fn status_parsing_drops_empty_and_expired() {
        assert_eq!(parse_status(Some(&json!({ "text": "  " }))), None);
        assert_eq!(
            parse_status(Some(&json!({ "text": "hi", "expires_at": 1 }))),
            None
        );
        assert_eq!(
            parse_status(Some(&json!({ "text": "hi", "expires": 1 }))),
            None
        );
        let future = now_ms() + 60_000;
        assert_eq!(
            parse_status(Some(&json!({ "text": " lunch ", "expires_at": future }))),
            Some(CustomStatus {
                text: "lunch".into(),
                expires_at: Some(future)
            })
        );
        let long = "x".repeat(400);
        assert_eq!(
            parse_status(Some(&json!({ "text": long })))
                .unwrap()
                .text
                .len(),
            MAX_STATUS_LENGTH
        );
    }

    #[test]
    fn both_status_expiry_keys_are_read() {
        let future = now_ms() + 60_000;
        // `expires` is what the web and Android clients write
        assert_eq!(
            parse_status(Some(&json!({ "text": "lunch", "expires": future }))),
            Some(CustomStatus {
                text: "lunch".into(),
                expires_at: Some(future)
            })
        );
        // `expires_at` is what earlier core versions wrote
        assert_eq!(
            parse_status(Some(&json!({ "text": "lunch", "expires_at": future }))),
            Some(CustomStatus {
                text: "lunch".into(),
                expires_at: Some(future)
            })
        );
        // already-expired statuses are dropped under either key
        assert_eq!(
            parse_status(Some(&json!({ "text": "lunch", "expires": 1 }))),
            None
        );
        assert_eq!(
            parse_status(Some(&json!({ "text": "lunch", "expires_at": 1 }))),
            None
        );
    }

    #[test]
    fn setting_the_text_keeps_the_other_clients_keys() {
        let existing = json!({
            "text": "old",
            "emoji": "🍜",
            "mode": "dnd",
            "expires": 1,
            "expires_at": 2,
        });
        let value = status_value(Some(&existing), "new", None);
        assert_eq!(value["text"], "new");
        assert_eq!(value["emoji"], "🍜");
        assert_eq!(value["mode"], "dnd");
        // no expiry means neither key is left behind
        assert!(value.get("expires").is_none());
        assert!(value.get("expires_at").is_none());
    }

    #[test]
    fn setting_the_text_writes_expires_in_milliseconds() {
        let at = now_ms() + 60_000;
        let value = status_value(None, "lunch", Some(at));
        assert_eq!(value["expires"], json!(at));
        assert!(value.get("expires_at").is_none());
        assert_eq!(
            parse_status(Some(&value)).unwrap(),
            CustomStatus {
                text: "lunch".into(),
                expires_at: Some(at)
            }
        );
        // an expiry stored under the old core key is rewritten, not duplicated
        let old = json!({ "text": "old", "expires_at": at + 1 });
        let value = status_value(Some(&old), "new", Some(at));
        assert_eq!(value["expires"], json!(at));
        assert!(value.get("expires_at").is_none());
    }

    #[test]
    fn clearing_keeps_a_presence_mode_but_drops_the_text() {
        let kept = cleared_status_value(Some(&json!({
            "text": "busy",
            "emoji": "🍜",
            "mode": "dnd",
            "expires": 1,
        })))
        .unwrap();
        assert_eq!(kept, json!({ "mode": "dnd" }));
        assert_eq!(
            cleared_status_value(Some(&json!({ "text": "busy", "mode": "idle" }))),
            Some(json!({ "mode": "idle" }))
        );
        // nothing worth keeping: the field gets deleted
        assert_eq!(cleared_status_value(Some(&json!({ "text": "busy" }))), None);
        assert_eq!(
            cleared_status_value(Some(&json!({ "text": "busy", "mode": "unknown" }))),
            None
        );
        assert_eq!(cleared_status_value(None), None);
    }
}
