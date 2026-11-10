use std::time::Duration;

use matrix_sdk::{
    notification_settings::{IsEncrypted, IsOneToOne, NotificationSettings, RoomNotificationMode},
    ruma::{
        api::client::push::{
            delete_pushrule, get_pushrules_all, set_pushrule, set_pushrule_actions,
            set_pushrule_enabled,
        },
        events::{AnyGlobalAccountDataEvent, GlobalAccountDataEventType},
        push::{
            Action, EventMatchConditionData, EventPropertyContainsConditionData,
            EventPropertyIsConditionData, HighlightTweakValue, NewConditionalPushRule,
            NewPatternedPushRule, NewPushRule, PredefinedOverrideRuleId, PushCondition, RuleKind,
            Ruleset, ScalarJsonValue, Tweak,
        },
        serde::Raw,
    },
    sleep::sleep,
    StateChanges,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{rooms::parse_room_id, Error, Result, WizardClient};

/// How much a room notifies
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum NotificationMode {
    All,
    Mentions,
    Mute,
}

impl From<RoomNotificationMode> for NotificationMode {
    fn from(mode: RoomNotificationMode) -> Self {
        match mode {
            RoomNotificationMode::AllMessages => NotificationMode::All,
            RoomNotificationMode::MentionsAndKeywordsOnly => NotificationMode::Mentions,
            RoomNotificationMode::Mute => NotificationMode::Mute,
        }
    }
}

impl From<NotificationMode> for RoomNotificationMode {
    fn from(mode: NotificationMode) -> Self {
        match mode {
            NotificationMode::All => RoomNotificationMode::AllMessages,
            NotificationMode::Mentions => RoomNotificationMode::MentionsAndKeywordsOnly,
            NotificationMode::Mute => RoomNotificationMode::Mute,
        }
    }
}

/// The account's notification settings (stored on the server as push rules)
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct NotificationPrefs {
    pub direct_chats: NotificationMode,
    pub group_chats: NotificationMode,
    pub user_mentions: bool,
    pub room_mentions: bool,
    pub keywords: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum MentionRule {
    /// Someone mentions the user
    User,
    /// Someone mentions the whole room (@room)
    Room,
}

fn notification_error(error: impl std::fmt::Display) -> Error {
    Error::Sdk(error.to_string())
}

impl WizardClient {
    /// One shared instance, so changes made here are visible before the next sync
    pub(crate) async fn notification_settings(&self) -> NotificationSettings {
        if let Some(settings) = self.notifications.lock().unwrap().clone() {
            return settings;
        }
        let settings = self.sdk().notification_settings().await;
        self.notifications
            .lock()
            .unwrap()
            .get_or_insert(settings)
            .clone()
    }

    /// Reloads the push rules from the server into the store and the shared settings, so
    /// changes count for notifications and settings right away instead of after the next sync.
    async fn refresh_push_rules(&self) -> Result<()> {
        let ruleset = self
            .sdk()
            .send(get_pushrules_all::v3::Request::new())
            .await?
            .global;
        let event = Raw::new(&json!({ "type": "m.push_rules", "content": { "global": ruleset } }))?
            .cast_unchecked::<AnyGlobalAccountDataEvent>();
        let mut changes = StateChanges::default();
        changes
            .account_data
            .insert(GlobalAccountDataEventType::PushRules, event);
        self.sdk()
            .state_store()
            .save_changes(&changes)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        let settings = self.sdk().notification_settings().await;
        *self.notifications.lock().unwrap() = Some(settings);
        Ok(())
    }

    pub async fn notification_prefs(&self) -> NotificationPrefs {
        let settings = self.notification_settings().await;
        let direct_chats = settings
            .get_default_room_notification_mode(IsEncrypted::Yes, IsOneToOne::Yes)
            .await
            .into();
        let group_chats = settings
            .get_default_room_notification_mode(IsEncrypted::Yes, IsOneToOne::No)
            .await
            .into();
        let user_mentions = settings
            .is_push_rule_enabled(
                RuleKind::Override,
                PredefinedOverrideRuleId::IsUserMention.as_str(),
            )
            .await
            .unwrap_or(true);
        let room_mentions = settings
            .is_push_rule_enabled(
                RuleKind::Override,
                PredefinedOverrideRuleId::IsRoomMention.as_str(),
            )
            .await
            .unwrap_or(true);
        NotificationPrefs {
            direct_chats,
            group_chats,
            user_mentions,
            room_mentions,
            keywords: settings.enabled_keywords().await.into_iter().collect(),
        }
    }

    /// Sets the default for direct or group chats, encrypted or not.
    pub async fn set_default_notification_mode(
        &self,
        direct: bool,
        mode: NotificationMode,
    ) -> Result<()> {
        let settings = self.notification_settings().await;
        for encrypted in [true, false] {
            settings
                .set_default_room_notification_mode(
                    IsEncrypted::from(encrypted),
                    IsOneToOne::from(direct),
                    mode.into(),
                )
                .await
                .map_err(notification_error)?;
        }
        self.refresh_push_rules().await
    }

    pub async fn set_mention_rule(&self, rule: MentionRule, enabled: bool) -> Result<()> {
        let id = match rule {
            MentionRule::User => PredefinedOverrideRuleId::IsUserMention,
            MentionRule::Room => PredefinedOverrideRuleId::IsRoomMention,
        };
        self.notification_settings()
            .await
            .set_push_rule_enabled(RuleKind::Override, id.as_str(), enabled)
            .await
            .map_err(notification_error)?;
        self.refresh_push_rules().await
    }

    /// Notifies and highlights messages containing the keyword (enables it if it exists).
    pub async fn add_notification_keyword(&self, keyword: &str) -> Result<()> {
        let keyword = keyword.trim();
        let ruleset = self.notification_settings().await.ruleset().await;
        if ruleset.get(RuleKind::Content, keyword).is_some() {
            self.sdk()
                .send(set_pushrule_enabled::v3::Request::new(
                    RuleKind::Content,
                    keyword.to_owned(),
                    true,
                ))
                .await?;
        } else {
            let rule = NewPatternedPushRule::new(
                keyword.to_owned(),
                keyword.to_owned(),
                vec![
                    Action::Notify,
                    Action::SetTweak(Tweak::Highlight(HighlightTweakValue::Yes)),
                ],
            );
            self.sdk()
                .send(set_pushrule::v3::Request::new(NewPushRule::Content(rule)))
                .await?;
        }
        self.refresh_push_rules().await
    }

    pub async fn remove_notification_keyword(&self, keyword: &str) -> Result<()> {
        let settings = self.notification_settings().await;
        if settings
            .ruleset()
            .await
            .get(RuleKind::Content, keyword)
            .is_some()
        {
            self.sdk()
                .send(delete_pushrule::v3::Request::new(
                    RuleKind::Content,
                    keyword.to_owned(),
                ))
                .await?;
        } else {
            settings
                .remove_keyword(keyword)
                .await
                .map_err(notification_error)?;
        }
        self.refresh_push_rules().await
    }

    /// The room's own mode, or `None` when it follows the default.
    pub async fn room_notification_mode(&self, room_id: &str) -> Result<Option<NotificationMode>> {
        let room_id = parse_room_id(room_id)?;
        let settings = self.notification_settings().await;
        Ok(settings
            .get_user_defined_room_notification_mode(room_id)
            .await
            .map(Into::into))
    }

    /// Sets the room's own mode; `None` goes back to the default. "Mentions" also adds rules
    /// for this room that notify on mentions, so it works even with the account's mention
    /// rules switched off.
    pub async fn set_room_notification_mode(
        &self,
        room_id: &str,
        mode: Option<NotificationMode>,
    ) -> Result<()> {
        let room_id = parse_room_id(room_id)?;
        let settings = self.notification_settings().await;
        match mode {
            Some(mode) => {
                settings
                    .set_room_notification_mode(room_id, mode.into())
                    .await
            }
            None => settings.delete_user_defined_room_rules(room_id).await,
        }
        .map_err(notification_error)?;
        if mode == Some(NotificationMode::Mentions) {
            let own_user = self.sdk().user_id().ok_or(Error::NotSignedIn)?.to_string();
            let in_room = || {
                PushCondition::EventMatch(EventMatchConditionData::new(
                    "room_id".into(),
                    room_id.to_string(),
                ))
            };
            #[allow(deprecated)] // for clients that don't send m.mentions
            let rules = [
                ("displayname", PushCondition::ContainsDisplayName),
                (
                    "user_ids",
                    PushCondition::EventPropertyContains(EventPropertyContainsConditionData::new(
                        r"content.m\.mentions.user_ids".into(),
                        ScalarJsonValue::String(own_user),
                    )),
                ),
                (
                    "at_room",
                    PushCondition::EventPropertyIs(EventPropertyIsConditionData::new(
                        r"content.m\.mentions.room".into(),
                        ScalarJsonValue::Bool(true),
                    )),
                ),
            ];
            for (suffix, condition) in rules {
                let rule = NewConditionalPushRule::new(
                    format!("{room_id}.mentions.{suffix}"),
                    vec![in_room(), condition],
                    vec![
                        Action::Notify,
                        Action::SetTweak(Tweak::Highlight(HighlightTweakValue::Yes)),
                    ],
                );
                self.sdk()
                    .send(set_pushrule::v3::Request::new(NewPushRule::Override(rule)))
                    .await?;
            }
        }
        self.refresh_push_rules().await
    }

    /// Reads one of the account's settings documents (synced across devices).
    pub async fn account_data(&self, event_type: &str) -> Result<Option<Value>> {
        let raw = self
            .sdk()
            .account()
            .fetch_account_data(GlobalAccountDataEventType::from(event_type))
            .await?;
        raw.map(|raw| {
            raw.deserialize_as::<Value>()
                .map_err(|e| Error::Sdk(e.to_string()))
        })
        .transpose()
    }

    pub async fn set_account_data(&self, event_type: &str, content: Value) -> Result<()> {
        let raw = Raw::new(&content)
            .map_err(|e| Error::Sdk(e.to_string()))?
            .cast_unchecked();
        self.sdk()
            .account()
            .set_account_data_raw(GlobalAccountDataEventType::from(event_type), raw)
            .await?;
        Ok(())
    }
}

impl WizardClient {
    /// The whole push rule set as JSON (`override`, `content`, `room`, `sender`, `underride`).
    pub async fn push_rules(&self) -> Result<Value> {
        let ruleset = self.notification_settings().await.ruleset().await;
        serde_json::to_value(ruleset).map_err(|e| Error::Sdk(e.to_string()))
    }

    /// Sets how a push rule notifies: `off` (no actions), `silent`, `loud` (with sound),
    /// `highlight` (with sound) or `highlightSilent`. The rule's other tweaks (a custom sound,
    /// its highlight) are kept, and rules that highlight by default highlight again when
    /// switched back on.
    pub async fn set_push_rule_level(&self, kind: &str, rule_id: &str, level: &str) -> Result<()> {
        let kind = RuleKind::from(kind);
        let ruleset = self.notification_settings().await.ruleset().await;
        let rule = ruleset.get(kind.clone(), rule_id);
        if !rule.is_none_or(|r| r.enabled()) {
            self.sdk()
                .send(set_pushrule_enabled::v3::Request::new(
                    kind.clone(),
                    rule_id.to_owned(),
                    true,
                ))
                .await?;
        }
        let actions = if level == "off" {
            Vec::new()
        } else {
            let is_sound = |a: &Action| matches!(a, Action::SetTweak(Tweak::Sound(_)));
            let is_highlight = |a: &Action| {
                matches!(
                    a,
                    Action::SetTweak(Tweak::Highlight(HighlightTweakValue::Yes))
                )
            };
            let mut tweaks: Vec<Action> = rule
                .map(|r| r.actions().to_vec())
                .unwrap_or_default()
                .into_iter()
                .filter(|a| matches!(a, Action::SetTweak(_)))
                .collect();
            let sound = matches!(level, "loud" | "highlight");
            if !sound {
                tweaks.retain(|a| !is_sound(a));
            } else if !tweaks.iter().any(is_sound) {
                tweaks.push(Action::SetTweak(Tweak::Sound("default".into())));
            }
            let highlights_by_default = self.sdk().user_id().is_some_and(|user| {
                Ruleset::server_default(user)
                    .get(kind.clone(), rule_id)
                    .is_some_and(|r| r.actions().iter().any(is_highlight))
            });
            let highlight = level.starts_with("highlight") || highlights_by_default;
            if highlight && !tweaks.iter().any(is_highlight) {
                tweaks.retain(|a| !matches!(a, Action::SetTweak(Tweak::Highlight(_))));
                tweaks.push(Action::SetTweak(Tweak::Highlight(HighlightTweakValue::Yes)));
            }
            std::iter::once(Action::Notify).chain(tweaks).collect()
        };
        self.sdk()
            .send(set_pushrule_actions::v3::Request::new(
                kind,
                rule_id.to_owned(),
                actions,
            ))
            .await?;
        self.refresh_push_rules().await
    }
}

impl WizardClient {
    /// Calls `on_change` with an account data event's content now and whenever it changes.
    pub async fn watch_account_data(
        &self,
        event_type: &str,
        mut on_change: impl FnMut(Option<Value>),
    ) -> Result<()> {
        use futures_util::{FutureExt, StreamExt};
        let (sender, mut receiver) = futures_channel::mpsc::unbounded::<Option<Value>>();
        let wanted = event_type.to_owned();
        let handle = self
            .sdk()
            .add_event_handler(move |raw: Raw<AnyGlobalAccountDataEvent>| {
                let sender = sender.clone();
                let wanted = wanted.clone();
                async move {
                    let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                        return;
                    };
                    if event.get("type").and_then(Value::as_str) == Some(wanted.as_str()) {
                        let _ = sender.unbounded_send(event.get("content").cloned());
                    }
                }
            });
        let _guard = self.sdk().event_handler_drop_guard(handle);
        let initial = async {
            let mut delay = 1;
            loop {
                match self.account_data(event_type).await {
                    Ok(content) => return content,
                    Err(error) => {
                        tracing::warn!("couldn't read account data {event_type}: {error}");
                        sleep(Duration::from_secs(delay)).await;
                        delay = (delay * 2).min(60);
                    }
                }
            }
        }
        .fuse();
        let mut initial = std::pin::pin!(initial);
        // A change from sync is newer than a fetch still in flight
        let mut known = false;
        loop {
            futures_util::select! {
                content = initial => if !known {
                    known = true;
                    on_change(content);
                },
                content = receiver.next() => match content {
                    Some(content) => {
                        known = true;
                        on_change(content);
                    }
                    None => break,
                },
            }
        }
        Ok(())
    }
}
