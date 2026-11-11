use matrix_sdk::ruma::{
    api::client::presence::get_presence::v3::Request as GetPresenceRequest,
    presence::PresenceState,
    profile::{ProfileFieldName, ProfileFieldValue},
    Int, MilliSecondsSinceUnixEpoch, OwnedMxcUri,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{rooms::parse_user_id, Error, Result, WizardClient};

/// The custom status, stored as an extended profile field (MSC4133)
pub const STATUS_FIELD: &str = "io.github.kapsikkum.mudrix.status";
/// Where earlier Mudrix versions and WizardChat kept it: still read, never written
const LEGACY_STATUS_FIELDS: [&str; 2] = ["chat.mudrix.status", "org.wizardchat.status"];
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

/// Reads the stored status, dropping empty and expired ones
pub(crate) fn parse_status(value: Option<&Value>) -> Option<CustomStatus> {
    let value = value?;
    let text = value.get("text")?.as_str()?.trim();
    if text.is_empty() {
        return None;
    }
    let expires_at = value.get("expires_at").and_then(Value::as_u64);
    if expires_at.is_some_and(|at| at <= now_ms()) {
        return None;
    }
    Some(CustomStatus {
        text: text.chars().take(MAX_STATUS_LENGTH).collect(),
        expires_at,
    })
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

    /// Sets the custom status, also as presence message for clients without profile fields.
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
        let mut value = json!({ "text": text });
        if let Some(at) = expires_at {
            value["expires_at"] = json!(at);
        }
        let field =
            ProfileFieldValue::new(STATUS_FIELD, value).map_err(|e| Error::Sdk(e.to_string()))?;
        let stored = self.sdk().account().set_profile_field(field).await;
        self.set_presence(presence, Some(&text)).await?;
        stored.map_err(Error::from)
    }

    pub async fn clear_custom_status(&self, presence: Presence) -> Result<()> {
        let removed = self
            .sdk()
            .account()
            .delete_profile_field(ProfileFieldName::from(STATUS_FIELD))
            .await;
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
}
