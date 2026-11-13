use std::collections::{HashMap, HashSet};

use eyeball_im::VectorDiff;
use futures_util::{pin_mut, stream, Stream, StreamExt};
use matrix_sdk::{
    deserialized_responses::TimelineEventKind,
    latest_events::{LatestEventValue, LatestEvents, LocalLatestEventValue},
    ruma::RoomVersionId,
    ruma::{
        api::client::room::{
            create_room::v3::{CreationContent, Request as CreateRoomRequest, RoomPreset},
            Visibility,
        },
        events::{
            room::encryption::RoomEncryptionEventContent,
            space::{child::SpaceChildEventContent, parent::SpaceParentEventContent},
            InitialStateEvent,
        },
        room::RoomType,
        serde::Raw,
        OwnedRoomId, OwnedServerName, RoomId, RoomOrAliasId, UserId,
    },
    Room, RoomState,
};
use matrix_sdk_ui::room_list_service::{
    filters::{
        new_filter_all, new_filter_category, new_filter_deduplicate_versions, new_filter_favourite,
        new_filter_identifiers, new_filter_invite, new_filter_non_left,
        new_filter_normalized_match_room_name, new_filter_read_receipts, BoxedFilterFn,
        ReadReceiptsCategory, RoomCategory,
    },
    RoomListItem,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{Error, ListDiff, Result, WizardClient};
use matrix_sdk::notification_settings::RoomNotificationMode;

/// What a room list row needs, without touching the SDK.
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomSummary {
    pub id: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_direct: bool,
    pub is_invite: bool,
    pub is_favourite: bool,
    pub unread_messages: u64,
    pub unread_mentions: u64,
    pub unread_notifications: u64,
    pub marked_unread: bool,
    pub is_voice: bool,
    pub is_low_priority: bool,
    /// Replaced by a newer room (upgraded)
    pub is_tombstoned: bool,
    pub is_encrypted: bool,
    /// The other person in a direct chat
    pub dm_user_id: Option<String>,
    pub topic: Option<String>,
    pub canonical_alias: Option<String>,
    pub member_count: u64,
    /// The room's own notification setting, if it has one: `all`, `mentions` or `mute`
    pub notification_mode: Option<crate::NotificationMode>,
    /// Users in the room's call, oldest first, once each
    pub call_participants: Vec<String>,
    /// This device is in the room's call
    pub in_call: bool,
    /// The user is in the room's call on another device, not on this one
    pub in_call_elsewhere: bool,
    /// Milliseconds since the Unix epoch of the latest event of any kind, for sorting and
    /// "5 min ago"
    pub last_activity: Option<u64>,
    pub is_space: bool,
    /// Asked to join ("knocked") and waiting for an answer; not a member yet
    pub is_knocked: bool,
    /// The other person's name in a direct chat (or the inviter's for a DM invite)
    pub dm_user_name: Option<String>,
    pub dm_user_avatar: Option<String>,
    /// The latest message, for a one-line preview in the room list; `null` for a room with
    /// nothing to show yet (an invite, or a latest event that isn't a message)
    pub last_message: Option<LastMessage>,
}

/// What the latest message of a room is, so the app can show a localized label when [`body`] is
/// empty.
///
/// [`body`]: LastMessage::body
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum LastMessageKind {
    /// A text message (or a notice, or an emote); the only kind with a body
    Text,
    Image,
    Video,
    Audio,
    File,
    Sticker,
    Poll,
    /// A call invite or a call notification
    Call,
    /// Something else, or an event that must not be shown (not yet decrypted)
    Other,
}

/// The one-line preview of a room's latest message
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct LastMessage {
    /// Plain text of at most 140 characters: the reply fallback stripped, whitespace collapsed.
    /// Empty for every non-text kind, and for an event that can't be shown.
    pub body: String,
    pub sender_id: String,
    /// The sender's display name, omitted when it's the user's own message
    pub sender_name: Option<String>,
    /// Sent by the user, from this or another of their devices
    pub is_own: bool,
    /// Milliseconds since the Unix epoch of the message
    pub timestamp: u64,
    pub kind: LastMessageKind,
}

/// A DM without its own picture shows the other person's, from the room's heroes
fn dm_avatar(room: &Room) -> Option<matrix_sdk::ruma::OwnedMxcUri> {
    let target = room.direct_targets().into_iter().next()?;
    let info = room.clone_info();
    let heroes = info.heroes();
    heroes
        .iter()
        .find(|hero| target.as_user_id() == Some(hero.user_id.as_ref()))
        .or_else(|| heroes.first())
        .and_then(|hero| hero.avatar_url.clone())
}

/// What a room list row needs beyond the room's cached info, read from the store and the event
/// cache (see [`room_extras`])
#[derive(Clone, Debug, Default)]
pub(crate) struct RoomExtras {
    dm_user_id: Option<String>,
    dm_user_name: Option<String>,
    dm_user_avatar: Option<String>,
    unread: Option<UnreadCounts>,
    last_activity: Option<u64>,
    last_message: Option<LastMessage>,
    call: crate::calls::RoomCallState,
}

#[derive(Clone, Copy, Debug, Default)]
struct UnreadCounts {
    notifications: u64,
    mentions: u64,
}

impl RoomSummary {
    fn with_extras(room: &Room, extras: Option<&RoomExtras>) -> Self {
        let dm_user_id = extras.and_then(|e| e.dm_user_id.clone()).or_else(|| {
            room.direct_targets()
                .into_iter()
                .next()
                .map(|t| t.to_string())
        });
        let is_direct = dm_user_id.is_some();
        let unread = extras.and_then(|e| e.unread);
        Self {
            id: room.room_id().to_string(),
            name: room.cached_display_name().map(|name| name.to_string()),
            avatar_url: room
                .avatar_url()
                .or_else(|| dm_avatar(room))
                .map(|url| url.to_string()),
            is_direct,
            is_invite: room.state() == RoomState::Invited,
            is_favourite: room.is_favourite(),
            unread_messages: room.num_unread_messages(),
            unread_mentions: unread.map_or(room.num_unread_mentions(), |u| u.mentions),
            unread_notifications: unread
                .map_or(room.num_unread_notifications(), |u| u.notifications),
            marked_unread: room.is_marked_unread(),
            is_low_priority: room.is_low_priority(),
            is_tombstoned: room.is_tombstoned(),
            is_encrypted: room.encryption_state().is_encrypted(),
            dm_user_id,
            topic: room.topic(),
            canonical_alias: room.canonical_alias().map(|a| a.to_string()),
            member_count: room.joined_members_count(),
            notification_mode: room.cached_user_defined_notification_mode().map(Into::into),
            is_voice: room
                .room_type()
                .is_some_and(|t| t.to_string() == crate::calls::VOICE_ROOM_TYPE),
            call_participants: extras
                .map(|e| e.call.participants.clone())
                .unwrap_or_default(),
            in_call: extras.is_some_and(|e| e.call.joined),
            in_call_elsewhere: extras.is_some_and(|e| e.call.joined_elsewhere),
            last_activity: extras
                .and_then(|e| e.last_activity)
                .or_else(|| room.latest_event_timestamp().map(|ts| u64::from(ts.0))),
            is_space: room.is_space(),
            is_knocked: room.state() == RoomState::Knocked,
            dm_user_name: extras.and_then(|e| e.dm_user_name.clone()),
            dm_user_avatar: extras.and_then(|e| e.dm_user_avatar.clone()),
            last_message: extras.and_then(|e| e.last_message.clone()),
        }
    }
}

/// Which rooms the list shows
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum RoomKind {
    #[default]
    All,
    People,
    Groups,
    Unread,
    Favourites,
    Invites,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", default)]
pub struct RoomFilter {
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub kind: RoomKind,
    /// Only rooms inside this joined space (at any depth)
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub space_id: Option<String>,
    /// Fuzzy room-name search
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub query: Option<String>,
}

/// Options for a new room or space
#[derive(Clone, Debug, Default, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", default)]
pub struct CreateRoomOptions {
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub name: String,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub topic: Option<String>,
    /// Listed in the room directory and joinable by anyone
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub is_public: bool,
    /// `#alias:server` local part for public rooms
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub alias: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub is_space: bool,
    /// A room that is a call: joining it joins the call (MSC3417)
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub is_voice: bool,
    /// Adds the new room to this space
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub parent_space_id: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub invite: Vec<String>,
    /// End-to-end encryption for private rooms (on unless false)
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub encrypted: Option<bool>,
    /// Other homeservers may join (on unless false)
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub federate: Option<bool>,
    /// `knock` (ask to join) or `restricted` (members of the parent space may join); private
    /// rooms are invite-only otherwise
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub access: Option<String>,
    /// Extra room creators (room version 12)
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub founders: Vec<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub room_version: Option<String>,
    /// Sent as the power level override (the server replaces each top-level key it contains);
    /// voice rooms get call-friendly levels when this is empty
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub power_levels: Option<serde_json::Value>,
    /// Extra state at creation: `{ type, state_key, content }`
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub initial_state: Vec<serde_json::Value>,
}

/// Who invited the user to a room
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct InviteInfo {
    pub inviter_id: String,
    pub inviter_name: Option<String>,
    pub inviter_avatar: Option<String>,
    /// When the invite was sent, or else the room's latest event
    pub timestamp: Option<u64>,
}

const VOICE_ROOM_CALL_STATE: &str = "org.matrix.msc3401.call";

/// The power levels a new voice room gets unless the app passes its own. The server applies an
/// override key by key, so `events` is the whole map: anything left out would fall back to
/// `state_default`.
fn voice_room_power_levels(is_public: bool) -> Value {
    let mut events = serde_json::json!({
        "m.room.name": 50,
        "m.room.avatar": 50,
        "m.room.canonical_alias": 50,
        "m.room.history_visibility": 100,
        "m.room.power_levels": 100,
        "m.room.encryption": 100,
        "m.room.server_acl": 100,
        "m.room.tombstone": 100,
        crate::calls::CALL_MEMBER_EVENT: 0,
    });
    if is_public {
        events["m.call.invite"] = serde_json::json!(50);
    }
    serde_json::json!({ "events": events })
}

pub(crate) fn parse_room_id(id: &str) -> Result<&RoomId> {
    <&RoomId>::try_from(id).map_err(|e| Error::InvalidId(e.to_string()))
}

pub(crate) fn parse_user_id(id: &str) -> Result<&UserId> {
    <&UserId>::try_from(id).map_err(|e| Error::InvalidId(e.to_string()))
}

impl WizardClient {
    pub(crate) fn room(&self, room_id: &str) -> Result<Room> {
        let id = parse_room_id(room_id)?;
        self.sdk()
            .get_room(id)
            .ok_or_else(|| Error::UnknownRoom(room_id.to_owned()))
    }

    async fn build_filter(&self, filter: &RoomFilter) -> BoxedFilterFn {
        let mut filters: Vec<BoxedFilterFn> = vec![
            Box::new(new_filter_non_left()),
            Box::new(new_filter_deduplicate_versions()),
            Box::new(|room: &RoomListItem| !room.is_space() || room.state() == RoomState::Invited),
        ];
        match filter.kind {
            RoomKind::All => {}
            RoomKind::People => filters.push(Box::new(new_filter_category(RoomCategory::People))),
            RoomKind::Groups => filters.push(Box::new(new_filter_category(RoomCategory::Group))),
            RoomKind::Unread => filters.push(Box::new(new_filter_read_receipts(
                ReadReceiptsCategory::Notifications,
            ))),
            RoomKind::Favourites => filters.push(Box::new(new_filter_favourite())),
            RoomKind::Invites => filters.push(Box::new(new_filter_invite())),
        }
        if let Some(space_id) = &filter.space_id {
            filters.push(Box::new(new_filter_identifiers(
                self.space_descendants(space_id).await,
            )));
        }
        if let Some(query) = filter
            .query
            .as_deref()
            .map(str::trim)
            .filter(|q| !q.is_empty())
        {
            filters.push(Box::new(new_filter_normalized_match_room_name(query)));
        }
        Box::new(new_filter_all(filters))
    }

    /// Streams the room list (newest first; spaces only while invited, knocked rooms flagged) as
    /// diffs, starting with the current list. Every item of `filters` replaces the filter; runs until sync stops.
    pub async fn watch_rooms(
        &self,
        page_size: usize,
        filters: impl Stream<Item = RoomFilter>,
        mut on_update: impl FnMut(Vec<ListDiff<RoomSummary>>),
    ) -> Result<()> {
        let service = self.sync_service()?.room_list_service();
        let list = service.all_rooms().await?;
        let (entries, controller) = list.entries_with_dynamic_adapters(page_size);
        let mut current = RoomFilter::default();
        controller.set_filter(self.build_filter(&current).await);
        // A space's rooms change as children are added or synced, so its filter is rebuilt then
        let (_, space_changes) = self
            .space_service()
            .await
            .subscribe_to_space_filters()
            .await;

        enum Update {
            Diffs(Vec<eyeball_im::VectorDiff<RoomListItem>>),
            Filter(RoomFilter),
            SpacesChanged,
            Tick,
            PushRules,
            /// A room's latest event changed, so its last-message preview may have too
            LatestEvent(OwnedRoomId),
        }
        // The SDK updates a room's notification mode without telling the room list, so a change
        // from another device would only show after the room's next event
        let settings = self.notification_settings().await;
        let rule_changes = stream::unfold(settings.subscribe_to_changes(), |mut changes| async {
            loop {
                match changes.recv().await {
                    Ok(()) => return Some((Update::PushRules, changes)),
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => return None,
                }
            }
        });
        // Call memberships also run out without a new event, so rooms in a call are checked
        // again now and then
        let ticks = stream::unfold((), |_| async {
            matrix_sdk::sleep::sleep(std::time::Duration::from_secs(30)).await;
            Some((Update::Tick, ()))
        });
        // A newer message doesn't always move its room in the list, so each room's latest event
        // is watched on its own; the SDK computes it from the event cache (see
        // `watch_latest_event`)
        let latest_events = self.sdk().latest_events().await.clone();
        let (latest_sender, latest_receiver) = futures_channel::mpsc::unbounded::<OwnedRoomId>();
        let updates = stream::select(
            stream::select(entries.map(Update::Diffs), filters.map(Update::Filter)),
            stream::select(
                stream::select(
                    space_changes.map(|_| Update::SpacesChanged),
                    stream::select(ticks, rule_changes),
                ),
                latest_receiver.map(Update::LatestEvent),
            ),
        );
        pin_mut!(updates);
        let mut shown: eyeball_im::Vector<RoomListItem> = eyeball_im::Vector::new();
        let mut in_call: HashMap<OwnedRoomId, crate::calls::RoomCallState> = HashMap::new();
        // One latest-event watcher per room in the list, dropped (which stops it) when the room
        // leaves the list
        let mut latest_watchers: HashMap<OwnedRoomId, matrix_sdk::executor::AbortOnDrop<()>> =
            HashMap::new();
        // The notification mode each room was last sent with. The SDK updates its cached mode
        // before the change reaches us, so that cache can't tell what the app still shows.
        let mut sent_modes: HashMap<OwnedRoomId, Option<RoomNotificationMode>> = HashMap::new();
        while let Some(update) = updates.next().await {
            match update {
                Update::PushRules => {
                    let mut changed = Vec::new();
                    for (index, item) in shown.iter().enumerate() {
                        let mode = settings
                            .get_user_defined_room_notification_mode(item.room_id())
                            .await;
                        if sent_modes.get(item.room_id()) == Some(&mode) {
                            continue;
                        }
                        match mode {
                            Some(mode) => item.update_cached_user_defined_notification_mode(mode),
                            None => item.clear_user_defined_notification_mode(),
                        }
                        sent_modes.insert(item.room_id().to_owned(), mode);
                        let extras = room_extras(item).await;
                        changed.push(ListDiff::Set {
                            index,
                            value: RoomSummary::with_extras(item, Some(&extras)),
                        });
                    }
                    if !changed.is_empty() {
                        on_update(changed);
                    }
                }
                Update::Tick => {
                    let mut changed = Vec::new();
                    for (index, item) in shown.iter().enumerate() {
                        let Some(before) = in_call.get(item.room_id()) else {
                            continue;
                        };
                        if crate::calls::room_call_state(item).await != *before {
                            let extras = room_extras(item).await;
                            in_call.insert(item.room_id().to_owned(), extras.call.clone());
                            changed.push(ListDiff::Set {
                                index,
                                value: RoomSummary::with_extras(item, Some(&extras)),
                            });
                        }
                    }
                    in_call.retain(|_, call| !call.participants.is_empty());
                    if !changed.is_empty() {
                        on_update(changed);
                    }
                }
                Update::Diffs(diffs) => {
                    for diff in &diffs {
                        diff.clone().apply(&mut shown);
                    }
                    let rooms: Vec<Room> = diffs
                        .iter()
                        .flat_map(|diff| match diff {
                            VectorDiff::Append { values } | VectorDiff::Reset { values } => {
                                values.iter().map(|item| (**item).clone()).collect()
                            }
                            VectorDiff::PushFront { value }
                            | VectorDiff::PushBack { value }
                            | VectorDiff::Insert { value, .. }
                            | VectorDiff::Set { value, .. } => vec![(**value).clone()],
                            _ => Vec::new(),
                        })
                        .collect();
                    for room in &rooms {
                        sent_modes.insert(
                            room.room_id().to_owned(),
                            room.cached_user_defined_notification_mode(),
                        );
                    }
                    let extras: HashMap<OwnedRoomId, RoomExtras> =
                        stream::iter(rooms)
                            .map(|room| async move {
                                (room.room_id().to_owned(), room_extras(&room).await)
                            })
                            .buffer_unordered(16)
                            .collect()
                            .await;
                    for (room_id, extras) in &extras {
                        if extras.call.participants.is_empty() {
                            in_call.remove(room_id);
                        } else {
                            in_call.insert(room_id.clone(), extras.call.clone());
                        }
                    }
                    on_update(
                        diffs
                            .into_iter()
                            .map(|diff| {
                                ListDiff::map(diff, |item: &RoomListItem| {
                                    RoomSummary::with_extras(item, extras.get(item.room_id()))
                                })
                            })
                            .collect(),
                    )
                }
                Update::LatestEvent(room_id) => {
                    let Some(index) = shown
                        .iter()
                        .position(|item| item.room_id().as_str() == room_id.as_str())
                    else {
                        continue;
                    };
                    let extras = room_extras(&shown[index]).await;
                    if extras.call.participants.is_empty() {
                        in_call.remove(&room_id);
                    } else {
                        in_call.insert(room_id.clone(), extras.call.clone());
                    }
                    on_update(vec![ListDiff::Set {
                        index,
                        value: RoomSummary::with_extras(&shown[index], Some(&extras)),
                    }]);
                }
                Update::Filter(filter) => {
                    current = filter;
                    controller.set_filter(self.build_filter(&current).await);
                }
                Update::SpacesChanged if current.space_id.is_some() => {
                    controller.set_filter(self.build_filter(&current).await);
                }
                Update::SpacesChanged => {}
            }
            let listed: HashSet<OwnedRoomId> =
                shown.iter().map(|item| item.room_id().to_owned()).collect();
            let gone: Vec<OwnedRoomId> = latest_watchers
                .keys()
                .filter(|room_id| !listed.contains(*room_id))
                .cloned()
                .collect();
            for room_id in gone {
                // Dropping the watcher stops it; the SDK keeps the last value it computed
                latest_watchers.remove(&room_id);
                latest_events.forget_room(&room_id).await;
            }
            for room_id in listed {
                if latest_watchers.contains_key(&room_id) {
                    continue;
                }
                latest_watchers.insert(
                    room_id.clone(),
                    watch_latest_event(latest_events.clone(), room_id, latest_sender.clone()),
                );
            }
        }
        // The list is gone with this call: stop watching its rooms
        for room_id in latest_watchers.into_keys() {
            latest_events.forget_room(&room_id).await;
        }
        Ok(())
    }

    /// Joins a room by ID or `#alias:server`, optionally through specific servers.
    pub async fn join(&self, id_or_alias: &str, via: &[String]) -> Result<String> {
        let target =
            <&RoomOrAliasId>::try_from(id_or_alias).map_err(|e| Error::InvalidId(e.to_string()))?;
        let servers: Vec<OwnedServerName> = via
            .iter()
            .filter_map(|s| s.as_str().try_into().ok())
            .collect();
        let room = self
            .sdk()
            .join_room_by_id_or_alias(target, &servers)
            .await?;
        Ok(room.room_id().to_string())
    }

    pub async fn leave(&self, room_id: &str) -> Result<()> {
        Ok(self.room(room_id)?.leave().await?)
    }

    pub async fn accept_invite(&self, room_id: &str) -> Result<()> {
        Ok(self.room(room_id)?.join().await?)
    }

    pub async fn decline_invite(&self, room_id: &str) -> Result<()> {
        Ok(self.room(room_id)?.leave().await?)
    }

    pub async fn invite_info(&self, room_id: &str) -> Result<InviteInfo> {
        let room = self.room(room_id)?;
        let invite = room.invite_details().await?;
        let inviter = invite.inviter;
        let mut timestamp = own_invite(&room)
            .await
            .and_then(|e| e.get("origin_server_ts").and_then(Value::as_u64));
        if timestamp.is_none() {
            if let Ok((cache, _handles)) = room.event_cache().await {
                timestamp = cache
                    .rfind_map_event_in_memory_by(|event| event.timestamp())
                    .await
                    .ok()
                    .flatten()
                    .map(|ts| u64::from(ts.0));
            }
        }
        Ok(InviteInfo {
            inviter_id: invite.inviter_id.to_string(),
            inviter_name: inviter
                .as_ref()
                .and_then(|m| m.display_name().map(ToOwned::to_owned)),
            inviter_avatar: inviter
                .as_ref()
                .and_then(|m| m.avatar_url().map(ToString::to_string)),
            timestamp,
        })
    }

    /// Creates a room or space; private rooms are end-to-end encrypted.
    pub async fn create_room_with(&self, options: CreateRoomOptions) -> Result<String> {
        let mut request = CreateRoomRequest::new();
        request.name = Some(options.name.clone()).filter(|n| !n.trim().is_empty());
        request.topic = options.topic.clone().filter(|t| !t.trim().is_empty());
        request.invite = options
            .invite
            .iter()
            .map(|id| parse_user_id(id).map(ToOwned::to_owned))
            .collect::<Result<_>>()?;
        if options.is_public {
            request.visibility = Visibility::Public;
            request.preset = Some(RoomPreset::PublicChat);
            request.room_alias_name = options.alias.clone().filter(|a| !a.trim().is_empty());
        } else {
            request.preset = Some(RoomPreset::PrivateChat);
            if !options.is_space && options.encrypted != Some(false) {
                request.initial_state = vec![InitialStateEvent::with_empty_state_key(
                    RoomEncryptionEventContent::with_recommended_defaults(),
                )
                .to_raw_any()];
            }
            let join_rule = match options.access.as_deref() {
                Some("knock") => Some(serde_json::json!({ "join_rule": "knock" })),
                Some("restricted") => options.parent_space_id.as_ref().map(|space| {
                    serde_json::json!({
                        "join_rule": "restricted",
                        "allow": [{ "type": "m.room_membership", "room_id": space }],
                    })
                }),
                _ => None,
            };
            if let Some(content) = join_rule {
                let event = serde_json::json!({ "type": "m.room.join_rules", "state_key": "", "content": content });
                request.initial_state.push(
                    Raw::new(&event)
                        .map_err(|e| Error::Sdk(e.to_string()))?
                        .cast_unchecked(),
                );
            }
        }
        if let Some(version) = options
            .room_version
            .as_deref()
            .or((!options.founders.is_empty()).then_some("12"))
        {
            request.room_version = Some(
                RoomVersionId::try_from(version).map_err(|e| Error::InvalidId(e.to_string()))?,
            );
        }
        // Link to the parent space from the start; the space's own child event follows below
        let parent = options
            .parent_space_id
            .as_deref()
            .map(parse_room_id)
            .transpose()?
            .map(ToOwned::to_owned);
        let via: Vec<OwnedServerName> = self
            .sdk()
            .user_id()
            .map(|u| u.server_name().to_owned())
            .into_iter()
            .collect();
        if let Some(parent) = &parent {
            let mut link = SpaceParentEventContent::new(via.clone());
            link.canonical = true;
            request
                .initial_state
                .push(InitialStateEvent::new(parent.clone(), link).to_raw_any());
        }
        if options.is_space
            || options.is_voice
            || options.federate == Some(false)
            || !options.founders.is_empty()
        {
            let mut creation = CreationContent::new();
            creation.federate = options.federate != Some(false);
            if !options.founders.is_empty() {
                creation.additional_creators = options
                    .founders
                    .iter()
                    .map(|id| parse_user_id(id).map(ToOwned::to_owned))
                    .collect::<Result<_>>()?;
            }
            if options.is_space || options.is_voice {
                creation.room_type = Some(if options.is_space {
                    RoomType::Space
                } else {
                    RoomType::from(crate::calls::VOICE_ROOM_TYPE)
                });
            }
            request.creation_content =
                Some(Raw::new(&creation).map_err(|e| Error::Sdk(e.to_string()))?);
        }
        let has_call_state = options
            .initial_state
            .iter()
            .any(|e| e.get("type").and_then(Value::as_str) == Some(VOICE_ROOM_CALL_STATE));
        if options.is_voice && !has_call_state {
            let event = serde_json::json!({ "type": VOICE_ROOM_CALL_STATE, "state_key": "", "content": {} });
            request.initial_state.push(
                Raw::new(&event)
                    .map_err(|e| Error::Sdk(e.to_string()))?
                    .cast_unchecked(),
            );
        }
        for event in &options.initial_state {
            request.initial_state.push(
                Raw::new(event)
                    .map_err(|e| Error::Sdk(e.to_string()))?
                    .cast_unchecked(),
            );
        }
        let power_levels = options.power_levels.clone().or_else(|| {
            options
                .is_voice
                .then(|| voice_room_power_levels(options.is_public))
        });
        if let Some(power_levels) = power_levels {
            request.power_level_content_override = Some(
                Raw::new(&power_levels)
                    .map_err(|e| Error::Sdk(e.to_string()))?
                    .cast_unchecked(),
            );
        }
        let room = self.sdk().create_room(request).await?;
        let room_id = room.room_id().to_owned();
        if let Some(parent) = parent {
            let space = self
                .sdk()
                .get_room(&parent)
                .ok_or_else(|| Error::UnknownRoom(parent.to_string()))?;
            space
                .send_state_event_for_key(&room_id, SpaceChildEventContent::new(via))
                .await?;
        }
        Ok(room_id.to_string())
    }

    /// Creates a private, encrypted room with just a name.
    pub async fn create_room(&self, name: &str) -> Result<String> {
        self.create_room_with(CreateRoomOptions {
            name: name.to_owned(),
            ..Default::default()
        })
        .await
    }

    /// Opens the existing direct chat with a user, or starts a new encrypted one.
    pub async fn start_dm(&self, user_id: &str) -> Result<String> {
        let user_id = parse_user_id(user_id)?;
        if let Some(room) = self.sdk().get_dm_room(user_id) {
            return Ok(room.room_id().to_string());
        }
        Ok(self.sdk().create_dm(user_id).await?.room_id().to_string())
    }

    pub async fn invite(&self, room_id: &str, user_id: &str) -> Result<()> {
        Ok(self
            .room(room_id)?
            .invite_user_by_id(parse_user_id(user_id)?)
            .await?)
    }

    pub async fn set_favourite(&self, room_id: &str, favourite: bool) -> Result<()> {
        Ok(self
            .room(room_id)?
            .set_is_favourite(favourite, None)
            .await?)
    }

    /// Tags or untags a room as low priority (favourite and low priority exclude each other)
    pub async fn set_low_priority(&self, room_id: &str, low_priority: bool) -> Result<()> {
        Ok(self
            .room(room_id)?
            .set_is_low_priority(low_priority, None)
            .await?)
    }

    pub async fn set_marked_unread(&self, room_id: &str, unread: bool) -> Result<()> {
        Ok(self.room(room_id)?.set_unread_flag(unread).await?)
    }
}

/// Events the unread count includes (when the push rules say they notify)
const NOTIFYING_TYPES: [&str; 5] = [
    "m.room.message",
    "m.sticker",
    "m.room.encrypted",
    "m.poll.start",
    "org.matrix.msc3381.poll.start",
];
const MAX_SCANNED_EVENTS: usize = 200;

/// A message that mentions the user and hasn't been read yet
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UnreadMention {
    pub event_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    pub timestamp: u64,
}

struct UnreadScan {
    count: u64,
    mentions: Vec<(Value, u64)>,
    boundary_found: bool,
}

fn str_at<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}

/// Walks the loaded events after the user's read receipts (or their own latest message), newest
/// first, counting notifying messages and collecting the ones that mention the user: a highlight
/// from the push rules, an intentional mention or a reply to one of their messages.
async fn scan_unread(room: &Room, mention_limit: usize) -> Option<UnreadScan> {
    use matrix_sdk::ruma::events::receipt::{ReceiptThread, ReceiptType};
    let own = room.own_user_id().to_owned();
    let (cache, _handles) = room.event_cache().await.ok()?;
    let events: Vec<(Value, Option<Vec<matrix_sdk::ruma::push::Action>>)> = cache
        .events()
        .await
        .ok()?
        .into_iter()
        .filter_map(|event| {
            let actions = event.push_actions().map(<[_]>::to_vec);
            Some((
                event.raw().deserialize_as_unchecked::<Value>().ok()?,
                actions,
            ))
        })
        .collect();
    let ts_of = |event: &Value| event.get("origin_server_ts").and_then(Value::as_u64);

    let mut receipt_ids = std::collections::HashSet::new();
    let mut receipt_ts = 0;
    for receipt_type in [ReceiptType::Read, ReceiptType::ReadPrivate] {
        for thread in [ReceiptThread::Unthreaded, ReceiptThread::Main] {
            let Ok(Some((event_id, receipt))) = room
                .load_user_receipt(receipt_type.clone(), &thread, &own)
                .await
            else {
                continue;
            };
            let target = events
                .iter()
                .find(|(e, _)| str_at(e, "/event_id") == Some(event_id.as_str()))
                .and_then(|(e, _)| ts_of(e));
            receipt_ts = receipt_ts.max(
                target
                    .or_else(|| receipt.ts.map(|ts| u64::from(ts.0)))
                    .unwrap_or(0),
            );
            receipt_ids.insert(event_id.to_string());
        }
    }
    let boundary = events.iter().rposition(|(e, _)| {
        str_at(e, "/event_id").is_some_and(|id| receipt_ids.contains(id))
            || str_at(e, "/sender") == Some(own.as_str())
    });

    let own_event = |id: &str| {
        events.iter().any(|(e, _)| {
            str_at(e, "/event_id") == Some(id) && str_at(e, "/sender") == Some(own.as_str())
        })
    };
    let mut scan = UnreadScan {
        count: 0,
        mentions: Vec::new(),
        boundary_found: boundary.is_some(),
    };
    for (index, (event, actions)) in events.iter().enumerate().rev().take(MAX_SCANNED_EVENTS) {
        let read = match boundary {
            Some(boundary) => index <= boundary,
            None => ts_of(event).unwrap_or(0) <= receipt_ts,
        };
        if read {
            break;
        }
        if str_at(event, "/sender") == Some(own.as_str()) {
            continue;
        }
        let rel_type = str_at(event, "/content/m.relates_to/rel_type");
        if rel_type == Some("m.thread") || event.pointer("/unsigned/redacted_because").is_some() {
            continue;
        }
        let actions = match actions {
            Some(actions) => actions.clone(),
            None => {
                let raw = Raw::<Value>::new(event).ok()?;
                room.event_push_actions(&raw)
                    .await
                    .ok()
                    .flatten()
                    .unwrap_or_default()
            }
        };
        let event_type = str_at(event, "/type").unwrap_or_default();
        if event_type == "m.room.message"
            && rel_type != Some("m.replace")
            && scan.mentions.len() < mention_limit
        {
            let mentioned = actions.iter().any(|a| a.is_highlight())
                || event
                    .pointer("/content/m.mentions/user_ids")
                    .and_then(Value::as_array)
                    .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(own.as_str())))
                || (event
                    .pointer("/content/m.relates_to/is_falling_back")
                    .and_then(Value::as_bool)
                    != Some(true)
                    && str_at(event, "/content/m.relates_to/m.in_reply_to/event_id")
                        .is_some_and(own_event));
            if mentioned {
                scan.mentions
                    .push((event.clone(), ts_of(event).unwrap_or_default()));
            }
        }
        if NOTIFYING_TYPES.contains(&event_type) && actions.iter().any(|a| a.should_notify()) {
            scan.count += 1;
        }
    }
    Some(scan)
}

fn is_muted(room: &Room) -> bool {
    matches!(
        room.cached_user_defined_notification_mode(),
        Some(matrix_sdk::notification_settings::RoomNotificationMode::Mute)
    )
}

/// Unread counts the way the room list shows them: notifying messages after the read marker,
/// nothing for muted rooms. The server can't read encrypted messages, so its count is only a
/// floor there; when the marker isn't loaded, the SDK's own count stands in.
async fn unread_counts(room: &Room) -> Option<UnreadCounts> {
    if room.state() != RoomState::Joined {
        return None;
    }
    if is_muted(room) {
        return Some(UnreadCounts::default());
    }
    let server = room.unread_notification_counts().notification_count;
    let encrypted = room.encryption_state().is_encrypted();
    let fallback = if encrypted {
        server.max(room.num_unread_notifications())
    } else {
        server
    };
    if room.num_unread_messages() == 0 && room.read_receipts().latest_active.is_some() {
        return Some(UnreadCounts {
            notifications: if encrypted { fallback } else { 0 },
            mentions: 0,
        });
    }
    let scan = scan_unread(room, MAX_SCANNED_EVENTS).await?;
    Some(UnreadCounts {
        notifications: match (scan.boundary_found, encrypted) {
            (true, false) => scan.count,
            (true, true) => scan.count.max(fallback),
            (false, _) => fallback,
        },
        mentions: scan.mentions.len() as u64,
    })
}

fn member_name(member: &matrix_sdk::room::RoomMember) -> String {
    let name = member.name();
    if member.name_ambiguous() {
        format!("{name} ({})", member.user_id())
    } else {
        name.to_owned()
    }
}

/// The user's own membership event in an invited room: who sent it, whether it's a DM invite and
/// when (stripped state often has no timestamp)
async fn own_invite(room: &Room) -> Option<Value> {
    use matrix_sdk::deserialized_responses::RawAnySyncOrStrippedState;
    let raw = room
        .get_state_event(
            matrix_sdk::ruma::events::StateEventType::RoomMember,
            room.own_user_id().as_str(),
        )
        .await
        .ok()??;
    match raw {
        RawAnySyncOrStrippedState::Sync(raw) => raw.deserialize_as_unchecked().ok(),
        RawAnySyncOrStrippedState::Stripped(raw) => raw.deserialize_as_unchecked().ok(),
    }
}

/// The most characters of a message a room list row shows
const MAX_PREVIEW_CHARS: usize = 140;

/// A reply's text without its fallback: the `>`-quoted lines at the start of the body that
/// clients put in front of the real text, and the empty line after them.
///
/// Only call this for an event that actually replies to something (its content has an
/// `m.in_reply_to`): a message that merely starts with `>` is quoting by hand and keeps it.
fn strip_reply_fallback(body: &str) -> &str {
    if !body.starts_with('>') {
        return body;
    }
    let mut rest = body;
    loop {
        let (line, after) = match rest.find('\n') {
            Some(end) => (&rest[..end], Some(&rest[end + 1..])),
            None => (rest, None),
        };
        let Some(after) = after else {
            // The body ends inside the fallback: nothing was written after it
            return if line.starts_with('>') { "" } else { rest };
        };
        if line.starts_with('>') {
            rest = after;
            continue;
        }
        if line.trim().is_empty() {
            rest = after;
        }
        return rest;
    }
}

/// `body` as a one-line preview: whitespace collapsed, control characters dropped, at most
/// [`MAX_PREVIEW_CHARS`] characters (the last one is `…` when the text was cut).
fn preview_text(body: &str, is_reply: bool) -> String {
    let body = if is_reply {
        strip_reply_fallback(body)
    } else {
        body
    };
    let mut collapsed = String::with_capacity(body.len().min(MAX_PREVIEW_CHARS * 2));
    for c in body.chars() {
        if c.is_whitespace() {
            if !collapsed.is_empty() && !collapsed.ends_with(' ') {
                collapsed.push(' ');
            }
        } else if !c.is_control() {
            collapsed.push(c);
        }
    }
    let collapsed = collapsed.trim_end();
    if collapsed.chars().count() <= MAX_PREVIEW_CHARS {
        return collapsed.to_owned();
    }
    let mut text: String = collapsed.chars().take(MAX_PREVIEW_CHARS - 1).collect();
    text.push('…');
    text
}

/// What an event's type and content say for a room list row: its kind and the text to show,
/// which is empty for every kind but a text message.
fn preview_of_content(event_type: &str, content: &Value) -> Option<(LastMessageKind, String)> {
    let text = || {
        let is_reply = content
            .pointer("/m.relates_to/m.in_reply_to/event_id")
            .is_some();
        preview_text(
            content
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            is_reply,
        )
    };
    Some(match event_type {
        "m.room.message" => match content
            .get("msgtype")
            .and_then(Value::as_str)
            .unwrap_or_default()
        {
            "m.text" | "m.notice" | "m.emote" => (LastMessageKind::Text, text()),
            "m.image" => (LastMessageKind::Image, String::new()),
            "m.video" => (LastMessageKind::Video, String::new()),
            "m.audio" => (LastMessageKind::Audio, String::new()),
            "m.file" => (LastMessageKind::File, String::new()),
            // A location, a verification request, ...: nothing the row can say
            _ => (LastMessageKind::Other, String::new()),
        },
        "m.sticker" => (LastMessageKind::Sticker, String::new()),
        "m.poll.start" | "org.matrix.msc3381.poll.start" => (LastMessageKind::Poll, String::new()),
        "m.call.invite"
        | "m.call.answer"
        | "m.call.reject"
        | "m.call.select_answer"
        | "m.call.negotiate"
        | "m.call.candidates"
        | "m.call.hangup"
        | "m.rtc.notification" => (LastMessageKind::Call, String::new()),
        _ => return None,
    })
}

/// The preview of a local message (this device is sending it, or it failed to send): its content
/// wasn't encrypted, so it can always be read.
fn local_message(value: &LocalLatestEventValue, own: &UserId) -> Option<LastMessage> {
    let (raw, event_type) = value.content.raw();
    let content: Value = raw.deserialize_as_unchecked().ok()?;
    let (kind, body) = preview_of_content(event_type, &content)?;
    Some(LastMessage {
        body,
        sender_id: own.to_string(),
        sender_name: None,
        is_own: true,
        timestamp: u64::from(value.timestamp.0),
        kind,
    })
}

/// The room's one-line preview, from the SDK's latest event of the room.
///
/// That value is the last displayable event of the room, already decrypted when the room is
/// encrypted, and recomputed from the event cache and the send queue (never with a request of
/// its own): the SDK drops redactions, reactions, edits and still-encrypted events when it picks
/// it. A latest event that can't be shown at all (an invite, a membership change, a redacted
/// message) has no preview.
async fn last_message(room: &Room) -> Option<LastMessage> {
    let own = room.own_user_id();
    match room.latest_event() {
        LatestEventValue::Remote(event) => {
            let timestamp = event.timestamp().map_or(0, |ts| u64::from(ts.0));
            let sender_id = event.sender()?.to_string();
            let is_own = sender_id == own.as_str();
            if matches!(event.kind, TimelineEventKind::UnableToDecrypt { .. }) {
                // Its keys haven't arrived: show nothing rather than the ciphertext. The app
                // shows a generic label for `Other` with an empty body.
                return Some(LastMessage {
                    body: String::new(),
                    sender_id,
                    sender_name: None,
                    is_own,
                    timestamp,
                    kind: LastMessageKind::Other,
                });
            }
            let value: Value = event.raw().deserialize_as_unchecked().ok()?;
            // State events (a join, a knock, a beacon) and redacted messages aren't messages
            if value.get("state_key").is_some()
                || value.pointer("/unsigned/redacted_because").is_some()
            {
                return None;
            }
            let (kind, body) =
                preview_of_content(value.get("type")?.as_str()?, value.get("content")?)?;
            let sender_name = if is_own {
                None
            } else {
                match parse_user_id(&sender_id) {
                    Ok(id) => room
                        .get_member_no_sync(id)
                        .await
                        .ok()
                        .flatten()
                        .map(|m| member_name(&m)),
                    Err(_) => None,
                }
            };
            Some(LastMessage {
                body,
                sender_id,
                sender_name,
                is_own,
                timestamp,
                kind,
            })
        }
        LatestEventValue::LocalIsSending(value)
        | LatestEventValue::LocalHasBeenSent { value, .. }
        | LatestEventValue::LocalCannotBeSent(value) => local_message(&value, own),
        LatestEventValue::None | LatestEventValue::RemoteInvite { .. } => None,
    }
}

/// Forwards every change of a room's latest event to `sender`, until dropped. This is what keeps
/// a preview live when a message arrives in a room that doesn't move in the list.
fn watch_latest_event(
    latest_events: LatestEvents,
    room_id: OwnedRoomId,
    sender: futures_channel::mpsc::UnboundedSender<OwnedRoomId>,
) -> matrix_sdk::executor::AbortOnDrop<()> {
    matrix_sdk::executor::AbortOnDrop::new(matrix_sdk::executor::spawn(async move {
        let Ok(Some(mut subscriber)) = latest_events.listen_and_subscribe_to_room(&room_id).await
        else {
            return;
        };
        // The value it has now is the one the summary was just built from
        let _ = subscriber.next_now().await;
        while subscriber.next().await.is_some() {
            if sender.unbounded_send(room_id.clone()).is_err() {
                return;
            }
        }
    }))
}

/// Reads what [`RoomSummary`] can't get synchronously: the DM partner (an invite with
/// `is_direct` counts as a DM from its inviter), their name and picture, the unread counts, the
/// time of the latest loaded event of any kind and the latest message.
pub(crate) async fn room_extras(room: &Room) -> RoomExtras {
    let mut extras = RoomExtras::default();
    let partner = if room.state() == RoomState::Invited {
        own_invite(room).await.and_then(|invite| {
            (invite
                .pointer("/content/is_direct")
                .and_then(Value::as_bool)
                == Some(true))
            .then(|| str_at(&invite, "/sender").map(ToOwned::to_owned))
            .flatten()
        })
    } else {
        room.direct_targets()
            .into_iter()
            .next()
            .map(|t| t.to_string())
    };
    if let Some(partner) = &partner {
        let member = match parse_user_id(partner) {
            Ok(id) => room.get_member_no_sync(id).await.ok().flatten(),
            Err(_) => None,
        };
        if let Some(member) = member {
            extras.dm_user_name = Some(member_name(&member));
            extras.dm_user_avatar = member.avatar_url().map(ToString::to_string);
        } else {
            let info = room.clone_info();
            if let Some(hero) = info.heroes().iter().find(|h| h.user_id.as_str() == partner) {
                extras.dm_user_name = hero.display_name.clone();
                extras.dm_user_avatar = hero.avatar_url.as_ref().map(ToString::to_string);
            }
        }
    }
    extras.dm_user_id = partner;
    extras.unread = unread_counts(room).await;
    extras.last_message = last_message(room).await;
    extras.call = crate::calls::room_call_state(room).await;
    if let Ok((cache, _handles)) = room.event_cache().await {
        extras.last_activity = cache
            .rfind_map_event_in_memory_by(|event| event.timestamp())
            .await
            .ok()
            .flatten()
            .map(|ts| u64::from(ts.0));
    }
    extras
}

impl WizardClient {
    /// The unread messages in a room that mention the user, newest first (from the loaded
    /// events; nothing for muted rooms).
    pub async fn unread_mentions(&self, room_id: &str, limit: u32) -> Result<Vec<UnreadMention>> {
        let room = self.room(room_id)?;
        if is_muted(&room) {
            return Ok(Vec::new());
        }
        let Some(scan) = scan_unread(&room, limit as usize).await else {
            return Ok(Vec::new());
        };
        let mut mentions = Vec::with_capacity(scan.mentions.len());
        for (event, timestamp) in scan.mentions {
            let sender = str_at(&event, "/sender").unwrap_or_default().to_owned();
            let sender_name = match parse_user_id(&sender) {
                Ok(id) => room
                    .get_member_no_sync(id)
                    .await
                    .ok()
                    .flatten()
                    .map(|m| member_name(&m)),
                Err(_) => None,
            };
            mentions.push(UnreadMention {
                event_id: str_at(&event, "/event_id").unwrap_or_default().to_owned(),
                sender,
                sender_name,
                timestamp,
            });
        }
        Ok(mentions)
    }
}

impl WizardClient {
    /// Calls `on_update` with every room's account data of one type (`[roomId, content]`
    /// pairs) now and whenever one of them changes, e.g. the favourite tag orders in `m.tag`.
    pub async fn watch_room_account_data(
        &self,
        event_type: &str,
        mut on_update: impl FnMut(Vec<(String, Value)>),
    ) {
        use matrix_sdk::ruma::events::{AnyRoomAccountDataEvent, RoomAccountDataEventType};
        let (sender, mut receiver) = futures_channel::mpsc::unbounded::<(String, Value)>();
        let wanted = event_type.to_owned();
        let handle =
            self.sdk()
                .add_event_handler(move |raw: Raw<AnyRoomAccountDataEvent>, room: Room| {
                    let sender = sender.clone();
                    let wanted = wanted.clone();
                    async move {
                        let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                            return;
                        };
                        if str_at(&event, "/type") != Some(wanted.as_str()) {
                            return;
                        }
                        let content = event.get("content").cloned().unwrap_or(Value::Null);
                        let _ = sender.unbounded_send((room.room_id().to_string(), content));
                    }
                });
        let _guard = self.sdk().event_handler_drop_guard(handle);
        let kind = RoomAccountDataEventType::from(event_type);
        let mut contents = std::collections::BTreeMap::new();
        for room in self.sdk().rooms() {
            let Ok(Some(raw)) = room.account_data(kind.clone()).await else {
                continue;
            };
            if let Some(content) = raw
                .deserialize_as_unchecked::<Value>()
                .ok()
                .and_then(|event| event.get("content").cloned())
            {
                contents.insert(room.room_id().to_string(), content);
            }
        }
        on_update(contents.clone().into_iter().collect());
        while let Some(first) = receiver.next().await {
            let mut changed = vec![first];
            while let Ok(next) = receiver.try_recv() {
                changed.push(next);
            }
            for (room_id, content) in changed {
                contents.insert(room_id, content);
            }
            on_update(contents.clone().into_iter().collect());
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{preview_of_content, preview_text, strip_reply_fallback, LastMessageKind};

    #[test]
    fn a_preview_is_one_line_of_collapsed_text() {
        assert_eq!(preview_text("hello\n\n  world\t!", false), "hello world !");
        assert_eq!(preview_text("  padded  ", false), "padded");
        assert_eq!(preview_text("", false), "");
        assert_eq!(preview_text("a\u{0}b", false), "ab");
    }

    #[test]
    fn a_reply_shows_what_was_said_not_the_quote() {
        let reply = "> <@alice:example.org> the original\n> message\n\nmy answer";
        assert_eq!(strip_reply_fallback(reply), "my answer");
        assert_eq!(preview_text(reply, true), "my answer");
        // Not a reply relation: the quote is the message
        assert_eq!(
            preview_text(reply, false),
            "> <@alice:example.org> the original > message my answer"
        );
        // The same body once the fallback is stripped by hand
        assert_eq!(preview_text("my answer", true), "my answer");
    }

    #[test]
    fn a_reply_without_text_has_no_body() {
        assert_eq!(preview_text("> <@alice:example.org> quoted only", true), "");
        assert_eq!(preview_text("> quoted\n\n", true), "");
    }

    #[test]
    fn a_long_body_is_cut_with_an_ellipsis() {
        let long = "a".repeat(300);
        let preview = preview_text(&long, false);
        assert_eq!(preview.chars().count(), 140);
        assert!(preview.ends_with('…'));
        assert_eq!(preview.trim_end_matches('…'), "a".repeat(139));
        // Exactly at the limit: nothing is cut
        let exact = "b".repeat(140);
        assert_eq!(preview_text(&exact, false), exact);
    }

    #[test]
    fn message_kinds_come_from_the_msgtype() {
        let kind = |msgtype: &str| {
            preview_of_content(
                "m.room.message",
                &json!({ "msgtype": msgtype, "body": "x" }),
            )
            .map(|(kind, _)| kind)
        };
        assert_eq!(kind("m.text"), Some(LastMessageKind::Text));
        assert_eq!(kind("m.notice"), Some(LastMessageKind::Text));
        assert_eq!(kind("m.emote"), Some(LastMessageKind::Text));
        assert_eq!(kind("m.image"), Some(LastMessageKind::Image));
        assert_eq!(kind("m.video"), Some(LastMessageKind::Video));
        assert_eq!(kind("m.audio"), Some(LastMessageKind::Audio));
        assert_eq!(kind("m.file"), Some(LastMessageKind::File));
        assert_eq!(kind("m.location"), Some(LastMessageKind::Other));
        assert_eq!(
            preview_of_content("m.sticker", &json!({ "body": "a cat" })),
            Some((LastMessageKind::Sticker, String::new()))
        );
        assert_eq!(
            preview_of_content("org.matrix.msc3381.poll.start", &json!({})),
            Some((LastMessageKind::Poll, String::new()))
        );
        assert_eq!(
            preview_of_content("m.call.invite", &json!({})),
            Some((LastMessageKind::Call, String::new()))
        );
        // A reaction or a redaction never becomes a preview
        assert_eq!(preview_of_content("m.reaction", &json!({})), None);
    }

    #[test]
    fn only_text_messages_have_a_body() {
        assert_eq!(
            preview_of_content(
                "m.room.message",
                &json!({ "msgtype": "m.image", "body": "photo.jpg" })
            ),
            Some((LastMessageKind::Image, String::new()))
        );
        assert_eq!(
            preview_of_content(
                "m.room.message",
                &json!({ "msgtype": "m.text", "body": "hi there" })
            ),
            Some((LastMessageKind::Text, "hi there".to_owned()))
        );
        // A text reply is previewed through its fallback rule
        assert_eq!(
            preview_of_content(
                "m.room.message",
                &json!({
                    "msgtype": "m.text",
                    "body": "> <@a:x> old\n\nnew",
                    "m.relates_to": { "m.in_reply_to": { "event_id": "$old" } },
                })
            ),
            Some((LastMessageKind::Text, "new".to_owned()))
        );
    }
}
