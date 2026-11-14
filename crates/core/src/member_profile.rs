//! A person's profile inside one room or space: the `displayname` and `avatar_url` of their
//! `m.room.member` event, which can differ from their account profile (a per-room nickname)

use matrix_sdk::{
    deserialized_responses::RawAnySyncOrStrippedState, ruma::events::StateEventType, Room,
};
use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::{rooms::parse_user_id, Error, Result, WizardClient};

/// What a room's member event says about a person
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomMemberProfile {
    /// `join`, `invite`, `leave`, `ban` or `knock`; null when the room has no member event
    pub membership: Option<String>,
    pub displayname: Option<String>,
    /// `mxc://` URI
    pub avatar_url: Option<String>,
}

fn text(content: &Value, key: &str) -> Option<String> {
    content
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

fn profile_of(content: &Value) -> RoomMemberProfile {
    RoomMemberProfile {
        membership: text(content, "membership"),
        displayname: text(content, "displayname"),
        avatar_url: text(content, "avatar_url"),
    }
}

/// The content of a member event with the profile fields replaced; every other key (`reason`,
/// `is_direct`, other apps' fields) stays. `None` removes a field.
fn with_profile(
    current: &Value,
    displayname: Option<&str>,
    avatar_url: Option<&str>,
    touch_displayname: bool,
    touch_avatar: bool,
) -> Value {
    let mut content: Map<String, Value> = current.as_object().cloned().unwrap_or_default();
    content.remove("reason");
    for (touch, key, value) in [
        (touch_displayname, "displayname", displayname),
        (touch_avatar, "avatar_url", avatar_url),
    ] {
        if touch {
            match value {
                Some(value) => content.insert(key.to_owned(), json!(value)),
                None => content.remove(key),
            };
        }
    }
    Value::Object(content)
}

/// The member event's content as this device has it, or from the server
async fn member_content(client: &WizardClient, room: &Room, user_id: &str) -> Result<Value> {
    let local = room
        .get_state_event(StateEventType::RoomMember, user_id)
        .await
        .ok()
        .flatten();
    if let Some(RawAnySyncOrStrippedState::Sync(raw)) = local {
        if let Some(content) = raw
            .deserialize_as_unchecked::<Value>()
            .ok()
            .and_then(|e| e.get("content").cloned())
        {
            return Ok(content);
        }
    }
    Ok(client
        .state_event(room.room_id().as_str(), "m.room.member", user_id)
        .await?
        .unwrap_or(Value::Null))
}

impl WizardClient {
    /// A person's name and picture in one room (the room's member event). Local state first, the
    /// server for people not loaded yet.
    pub async fn room_member_profile(
        &self,
        room_id: &str,
        user_id: &str,
    ) -> Result<RoomMemberProfile> {
        parse_user_id(user_id)?;
        let room = self.room(room_id)?;
        Ok(profile_of(&member_content(self, &room, user_id).await?))
    }

    async fn own_member_content(&self, room: &Room) -> Result<(String, Value)> {
        let own = self.user_id().ok_or(Error::NotSignedIn)?;
        let content = member_content(self, room, &own).await?;
        if content.get("membership").and_then(Value::as_str) != Some("join") {
            return Err(Error::Unsupported(
                "a name or picture for one room needs a joined room".into(),
            ));
        }
        Ok((own, content))
    }

    /// Sets the own name in one room only; `None` goes back to the account's display name.
    pub async fn set_room_nickname(
        &self,
        room_id: &str,
        displayname: Option<String>,
    ) -> Result<()> {
        let room = self.room(room_id)?;
        let (own, current) = self.own_member_content(&room).await?;
        let name = match displayname.map(|n| n.trim().to_owned()) {
            Some(name) if !name.is_empty() => Some(name),
            _ => self.account_profile_field("displayname").await?,
        };
        let content = with_profile(&current, name.as_deref(), None, true, false);
        self.set_state_event(room_id, "m.room.member", &own, content)
            .await
    }

    /// Sets the own picture in one room only from an image; `None` goes back to the account's.
    pub async fn set_room_member_avatar(
        &self,
        room_id: &str,
        image: Option<(Vec<u8>, String)>,
    ) -> Result<()> {
        let room = self.room(room_id)?;
        let (own, current) = self.own_member_content(&room).await?;
        let avatar = match image {
            Some((data, mimetype)) => Some(self.upload_media(data, &mimetype).await?),
            None => self.account_profile_field("avatar_url").await?,
        };
        let content = with_profile(&current, None, avatar.as_deref(), false, true);
        self.set_state_event(room_id, "m.room.member", &own, content)
            .await
    }

    async fn account_profile_field(&self, field: &str) -> Result<Option<String>> {
        let own = self.user_id().ok_or(Error::NotSignedIn)?;
        Ok(self
            .profile_fields(&own)
            .await?
            .get(field)
            .and_then(Value::as_str)
            .map(ToOwned::to_owned))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_profile_of_a_member_event() {
        let content = json!({
            "membership": "join", "displayname": "Wiz", "avatar_url": "mxc://x/abc",
        });
        assert_eq!(
            profile_of(&content),
            RoomMemberProfile {
                membership: Some("join".into()),
                displayname: Some("Wiz".into()),
                avatar_url: Some("mxc://x/abc".into()),
            }
        );
        assert_eq!(profile_of(&Value::Null), RoomMemberProfile::default());
        assert_eq!(
            profile_of(&json!({ "membership": "leave", "displayname": "" })).displayname,
            None
        );
    }

    #[test]
    fn changing_the_name_keeps_everything_else() {
        let current = json!({
            "membership": "join", "displayname": "Old", "avatar_url": "mxc://x/a",
            "is_direct": true, "reason": "stale", "xyz.custom": 1,
        });
        let updated = with_profile(&current, Some("New"), None, true, false);
        assert_eq!(
            updated,
            json!({
                "membership": "join", "displayname": "New", "avatar_url": "mxc://x/a",
                "is_direct": true, "xyz.custom": 1,
            })
        );
    }

    #[test]
    fn a_missing_value_removes_the_field() {
        let current = json!({ "membership": "join", "displayname": "Old" });
        let updated = with_profile(&current, None, None, true, false);
        assert_eq!(updated, json!({ "membership": "join" }));
        let untouched = with_profile(&current, None, None, false, false);
        assert_eq!(untouched, current);
    }

    #[test]
    fn setting_the_avatar_leaves_the_name() {
        let current = json!({ "membership": "join", "displayname": "Keep" });
        let updated = with_profile(&current, None, Some("mxc://x/new"), false, true);
        assert_eq!(
            updated,
            json!({ "membership": "join", "displayname": "Keep", "avatar_url": "mxc://x/new" })
        );
    }
}
