use matrix_sdk::ruma::{
    api::client::push::{PusherIds, PusherInit, PusherKind},
    events::AnySyncTimelineEvent,
    push::{HttpPusherData, PushFormat},
    serde::Raw,
    UserId,
};
use matrix_sdk_ui::notification_client::{
    NotificationClient, NotificationProcessSetup, NotificationStatus, RawNotificationEvent,
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    features::notification_for, rooms::parse_room_id, timeline::parse_event_id, Error,
    Notification, Result, WizardClient,
};

#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PusherConfig {
    pub app_id: String,
    pub pushkey: String,
    pub gateway_url: String,
    pub app_name: String,
    pub device_name: String,
    pub lang: String,
    /// Extra fields for every notification, as the Matrix API's `default_payload`: gateways
    /// (Sygnal and the like) merge them into what they send, so the app can give iOS an
    /// `aps.alert` to show even though it only ever gets the event's ids.
    pub default_payload: Option<serde_json::Value>,
}

impl WizardClient {
    pub async fn set_pusher(&self, config: PusherConfig) -> Result<()> {
        let user_id = self.user_id().ok_or(Error::NotSignedIn)?;
        let mut data = HttpPusherData::new(config.gateway_url);
        data.format = Some(PushFormat::EventIdOnly);
        data.data.insert(
            "default_payload".into(),
            pusher_default_payload(&user_id, config.default_payload),
        );
        let pusher = PusherInit {
            ids: PusherIds::new(config.pushkey, config.app_id),
            kind: PusherKind::Http(data),
            app_display_name: config.app_name,
            device_display_name: config.device_name,
            profile_tag: None,
            lang: config.lang,
        };
        self.sdk().pusher().set(pusher.into(), false).await?;
        Ok(())
    }

    pub async fn remove_pusher(&self, app_id: String, pushkey: String) -> Result<()> {
        self.sdk()
            .pusher()
            .delete(PusherIds::new(pushkey, app_id))
            .await?;
        Ok(())
    }

    /// The notification for a push, in the process that runs the app's sync.
    pub async fn pushed_notification(
        &self,
        room_id: &str,
        event_id: &str,
    ) -> Result<Option<Notification>> {
        let setup = NotificationProcessSetup::SingleProcess {
            sync_service: self.built_sync_service().await?,
        };
        self.notification_for_push(setup, room_id, event_id).await
    }

    /// The notification for a push, in a second process that restored the same account and store
    /// (the iOS `NotificationService` extension).
    ///
    /// Restore the client with [`crate::WizardClient::restore`] over the app's store path and
    /// session first, with a [`crate::StoreConfig::process_name`] of its own, then call this. It
    /// never creates or starts the background sync: it makes one short sliding-sync request for
    /// the notified event (with a `/context` fallback), and, if the event is still encrypted,
    /// asks for its room key for a few seconds.
    ///
    /// It is safe to call while the app is running: the store writes both processes do are
    /// coordinated by the SDK's cross-process locks, which only work when each process has its
    /// own lock holder name (that is what `process_name` sets). No sync service is created: the
    /// notification client it builds lives only for the call.
    ///
    /// What it cannot do: decrypt an event whose room key this device hasn't received. When the
    /// app process holds the crypto store lock, the encryption sync for the notification doesn't
    /// run at all, and the event comes back undecrypted (`encrypted: true`, empty body), so the
    /// app has to show a placeholder. The room must also be in the restored store already.
    pub async fn pushed_notification_from_extension(
        &self,
        room_id: &str,
        event_id: &str,
    ) -> Result<Option<Notification>> {
        self.notification_for_push(
            NotificationProcessSetup::MultipleProcesses,
            room_id,
            event_id,
        )
        .await
    }

    async fn notification_for_push(
        &self,
        setup: NotificationProcessSetup,
        room_id: &str,
        event_id: &str,
    ) -> Result<Option<Notification>> {
        let room_id = parse_room_id(room_id)?;
        let event_id = parse_event_id(event_id)?;
        let own_user = self.sdk().user_id().ok_or(Error::NotSignedIn)?.to_owned();
        let client = NotificationClient::new(self.sdk().clone(), setup)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        let item = match client
            .get_notification(room_id, &event_id)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
        {
            NotificationStatus::Event(item) => item,
            _ => return Ok(None),
        };
        let RawNotificationEvent::Timeline(raw) = &item.raw_event else {
            return Ok(None);
        };
        let Some(room) = self
            .sdk()
            .get_room(room_id)
            .or_else(|| client.get_room(room_id))
        else {
            return Ok(None);
        };
        let undecrypted =
            raw.get_field::<String>("type").ok().flatten().as_deref() == Some("m.room.encrypted");
        let notification = if undecrypted {
            undecrypted_notification(room_id.as_str(), raw, &own_user)
        } else {
            notification_for(&room, raw, item.actions.clone(), &own_user, 0).await
        };
        Ok(notification.map(|n| Notification {
            room_name: Some(item.room_computed_display_name.clone()),
            room_avatar_url: item.room_avatar_url.clone(),
            is_direct: item.is_direct_message_room,
            sender_name: item.sender_display_name.clone().or(n.sender_name),
            ..n
        }))
    }
}

fn undecrypted_notification(
    room_id: &str,
    raw: &Raw<AnySyncTimelineEvent>,
    own_user: &UserId,
) -> Option<Notification> {
    let sender: String = raw.get_field("sender").ok().flatten()?;
    if sender == own_user.as_str() {
        return None;
    }
    Some(Notification {
        room_id: room_id.to_owned(),
        room_name: None,
        room_avatar_url: None,
        event_id: raw.get_field("event_id").ok().flatten()?,
        sender,
        sender_name: None,
        body: String::new(),
        spoiler: false,
        encrypted: true,
        highlight: false,
        sound: true,
        is_direct: false,
    })
}

/// What the gateway gets as `default_payload`: the pusher's extra fields (the app sends an
/// `aps.alert` there, since a push gateway knows nothing about the message) and, always last,
/// the account the notification is for.
fn pusher_default_payload(user_id: &str, extra: Option<serde_json::Value>) -> serde_json::Value {
    let mut payload = match extra {
        Some(serde_json::Value::Object(fields)) => fields,
        _ => serde_json::Map::new(),
    };
    payload.insert("user_id".into(), json!(user_id));
    serde_json::Value::Object(payload)
}

#[cfg(test)]
mod tests {
    use super::pusher_default_payload;

    #[test]
    fn the_alert_reaches_the_gateway() {
        let payload = pusher_default_payload(
            "@me:x",
            Some(serde_json::json!({
                "aps": { "alert": { "title": "Mudrix", "body": "New message" }, "mutable-content": 1 }
            })),
        );
        assert_eq!(payload["aps"]["alert"]["body"], "New message");
        assert_eq!(payload["aps"]["mutable-content"], 1);
        assert_eq!(payload["user_id"], "@me:x");
    }

    #[test]
    fn the_account_always_wins() {
        let payload = pusher_default_payload(
            "@me:x",
            Some(serde_json::json!({ "user_id": "@someone-else:x" })),
        );
        assert_eq!(payload["user_id"], "@me:x");
    }

    #[test]
    fn a_missing_or_odd_payload_still_carries_the_account() {
        assert_eq!(pusher_default_payload("@me:x", None)["user_id"], "@me:x");
        assert_eq!(
            pusher_default_payload("@me:x", Some(serde_json::json!("nonsense")))["user_id"],
            "@me:x"
        );
    }
}
