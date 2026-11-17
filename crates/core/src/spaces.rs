use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use matrix_sdk::{
    ruma::{events::StateEventType, room::RoomType, OwnedRoomId, RoomId},
    Room, RoomState,
};
use matrix_sdk_ui::spaces::SpaceService;
use serde::Serialize;

use crate::rooms::room_display_name;
use crate::{Error, ListDiff, MudrixClient, Result};

/// A space the user has joined, for the space rail
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceSummary {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub children_count: u64,
    pub member_count: u64,
    pub topic: Option<String>,
}

/// A room or subspace inside a space, joined or not
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceChild {
    pub id: String,
    pub name: String,
    pub topic: Option<String>,
    pub avatar_url: Option<String>,
    pub canonical_alias: Option<String>,
    pub member_count: u64,
    pub is_space: bool,
    pub joined: bool,
    pub invited: bool,
    /// Asked to join and waiting for an answer
    pub knocked: bool,
    /// Servers to join through
    pub via: Vec<String>,
    pub suggested: bool,
    /// `public`, `invite`, `knock`, `restricted`, ...
    pub join_rule: Option<String>,
    pub world_readable: bool,
    pub children_count: u64,
}

/// A space's rooms from the server, as far as they could be loaded
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceHierarchy {
    /// The space itself, as the server describes it
    pub space: Option<SpaceChild>,
    /// Its direct children (rooms and subspaces)
    pub children: Vec<SpaceChild>,
    /// False when a page failed and the list is partial
    pub complete: bool,
}

const HIERARCHY_PAGE_LIMIT: u32 = 100;
const HIERARCHY_MAX_PAGES: usize = 50;
/// How long a fetched hierarchy is reused before the server is asked again
const HIERARCHY_CACHE_MS: u64 = 5 * 60 * 1000;

/// A space hierarchy fetched this session, with the local links it was built from
pub(crate) struct CachedHierarchy {
    /// The space's own `m.space.child` links when it was fetched; any change invalidates it
    links: String,
    at: u64,
    hierarchy: SpaceHierarchy,
}

/// What this device knows about a space's children from the space's own state, without asking
/// the server: names, pictures and member counts of the rooms that are joined (or invited).
fn known_child(room: &Room, link: &SpaceLink, name: Option<String>, children: u64) -> SpaceChild {
    let state = room.state();
    SpaceChild {
        id: room.room_id().to_string(),
        name: name.unwrap_or_default(),
        topic: room.topic(),
        avatar_url: room.avatar_url().map(|u| u.to_string()),
        canonical_alias: room.canonical_alias().map(|a| a.to_string()),
        member_count: room.joined_members_count(),
        is_space: room.is_space(),
        joined: state == RoomState::Joined,
        invited: state == RoomState::Invited,
        knocked: state == RoomState::Knocked,
        via: link.via.clone(),
        suggested: link.suggested,
        join_rule: room.join_rule().map(|rule| rule.as_str().to_owned()),
        world_readable: room.history_visibility()
            == Some(
                matrix_sdk::ruma::events::room::history_visibility::HistoryVisibility::WorldReadable,
            ),
        children_count: children,
    }
}

/// A space's own description from local state (the server's copy fills in what's missing)
fn own_child(room: &Room, children: u64) -> SpaceChild {
    known_child(
        room,
        &SpaceLink {
            room_id: room.room_id().to_string(),
            order: None,
            suggested: false,
            timestamp: 0,
            via: Vec::new(),
        },
        None,
        children,
    )
}

fn link_fingerprint(links: &[SpaceLink]) -> String {
    links
        .iter()
        .map(|link| {
            format!(
                "{}|{}|{}|{}|{}",
                link.room_id,
                link.order.as_deref().unwrap_or_default(),
                link.timestamp,
                link.suggested,
                link.via.join(",")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn now_ms() -> u64 {
    u64::from(matrix_sdk::ruma::MilliSecondsSinceUnixEpoch::now().0)
}

/// Fills what the local room didn't know (and the server does) without losing the space's own
/// link data, which is what says where the child is.
fn merge_child(local: &mut SpaceChild, server: &SpaceChild) {
    if local.name.is_empty() {
        local.name = server.name.clone();
    }
    if local.topic.is_none() {
        local.topic = server.topic.clone();
    }
    if local.avatar_url.is_none() {
        local.avatar_url = server.avatar_url.clone();
    }
    if local.canonical_alias.is_none() {
        local.canonical_alias = server.canonical_alias.clone();
    }
    if local.member_count == 0 {
        local.member_count = server.member_count;
    }
    if local.join_rule.is_none() {
        local.join_rule = server.join_rule.clone();
    }
    if local.via.is_empty() {
        local.via = server.via.clone();
    }
    if local.children_count == 0 {
        local.children_count = server.children_count;
    }
    local.world_readable |= server.world_readable;
    local.is_space |= server.is_space;
}

/// Adds the server's view to the local one: known children keep the space's own link data and get
/// what they were missing filled in, children this device isn't in are appended after them.
fn merge_server(hierarchy: &mut SpaceHierarchy, own: Option<SpaceChild>, server: Vec<SpaceChild>) {
    let order: Vec<String> = server.iter().map(|child| child.id.clone()).collect();
    let mut server: HashMap<String, SpaceChild> = server
        .into_iter()
        .map(|child| (child.id.clone(), child))
        .collect();
    for child in &mut hierarchy.children {
        if let Some(server_child) = server.remove(&child.id) {
            merge_child(child, &server_child);
        }
    }
    match &mut hierarchy.space {
        Some(local) => {
            if let Some(own) = own {
                merge_child(local, &own);
            }
        }
        None => hierarchy.space = own,
    }
    for id in order {
        if let Some(child) = server.remove(&id) {
            hierarchy.children.push(child);
        }
    }
}

impl MudrixClient {
    pub(crate) async fn space_service(&self) -> Arc<SpaceService> {
        if let Some(service) = self.spaces.lock().unwrap().clone() {
            return service;
        }
        let service = Arc::new(SpaceService::new(self.sdk().clone()).await);
        self.spaces.lock().unwrap().get_or_insert(service).clone()
    }

    /// Room IDs that belong to a joined space, at any depth
    pub(crate) async fn space_descendants(&self, space_id: &str) -> Vec<OwnedRoomId> {
        self.space_service()
            .await
            .space_filters()
            .await
            .into_iter()
            .find(|filter| filter.space_room.room_id == space_id)
            .map(|filter| filter.descendants)
            .unwrap_or_default()
    }

    /// Every joined space with the rooms it lists as children (`m.space.child` with servers)
    async fn joined_spaces(&self) -> Vec<(Room, Vec<String>)> {
        let mut spaces = Vec::new();
        for room in self.sdk().joined_space_rooms() {
            let children = child_links(&room)
                .await
                .into_iter()
                .map(|link| link.room_id)
                .collect();
            spaces.push((room, children));
        }
        spaces
    }

    /// Joined spaces as the space rail shows them; with `top_level_only`, those that no other
    /// joined space lists as a child.
    async fn space_summaries(&self, top_level_only: bool) -> Vec<SpaceSummary> {
        let spaces = self.joined_spaces().await;
        let joined: HashSet<String> = spaces
            .iter()
            .map(|(r, _)| r.room_id().to_string())
            .collect();
        let nested: HashSet<String> = spaces
            .iter()
            .flat_map(|(_, children)| children.iter())
            .filter(|id| joined.contains(*id))
            .cloned()
            .collect();
        let mut summaries = Vec::with_capacity(spaces.len());
        for (room, children) in spaces {
            if top_level_only && nested.contains(&room.room_id().to_string()) {
                continue;
            }
            summaries.push(SpaceSummary {
                id: room.room_id().to_string(),
                name: room_display_name(&room)
                    .await
                    .unwrap_or_else(|| room.room_id().to_string()),
                avatar_url: room.avatar_url().map(|u| u.to_string()),
                children_count: children.len() as u64,
                member_count: room.joined_members_count(),
                topic: room.topic(),
            });
        }
        summaries
    }

    async fn watch_space_summaries(
        &self,
        top_level_only: bool,
        mut on_update: impl FnMut(Vec<ListDiff<SpaceSummary>>),
    ) {
        let mut updates = self.sdk().subscribe_to_all_room_updates();
        let mut current = self.space_summaries(top_level_only).await;
        on_update(vec![ListDiff::Reset {
            values: current.clone(),
        }]);
        loop {
            match updates.recv().await {
                Ok(update) => {
                    let touches_space = update
                        .iter_all_room_ids()
                        .any(|id| self.sdk().get_room(id).is_none_or(|room| room.is_space()));
                    if !touches_space {
                        continue;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
            let next = self.space_summaries(top_level_only).await;
            if next != current {
                current = next;
                on_update(vec![ListDiff::Reset {
                    values: current.clone(),
                }]);
            }
        }
    }

    /// Streams the top-level joined spaces (those no other joined space lists as a child) as
    /// diffs, starting with the current list.
    pub async fn watch_spaces(&self, on_update: impl FnMut(Vec<ListDiff<SpaceSummary>>)) {
        self.watch_space_summaries(true, on_update).await;
    }

    /// Streams every joined space, subspaces included, as diffs.
    pub async fn watch_all_spaces(&self, on_update: impl FnMut(Vec<ListDiff<SpaceSummary>>)) {
        self.watch_space_summaries(false, on_update).await;
    }

    /// The rooms and subspaces in a space (from the server's hierarchy), joined or not.
    pub async fn space_children(&self, space_id: &str) -> Result<Vec<SpaceChild>> {
        Ok(self.space_hierarchy(space_id).await?.children)
    }

    /// One level of a space's hierarchy: what this device knows about the space's children (so
    /// names are there at once) plus what the server adds, page by page. The answer is reused for
    /// the session until the space's own `m.space.child` state changes.
    pub async fn space_hierarchy(&self, space_id: &str) -> Result<SpaceHierarchy> {
        let space = self.room(space_id)?;
        let links = child_links(&space).await;
        let fingerprint = link_fingerprint(&links);
        if let Some(hierarchy) = self.cached_hierarchy(space_id, &fingerprint) {
            return Ok(hierarchy);
        }
        // Everything the space links to that this device has, in the space's order
        let mut children = Vec::with_capacity(links.len());
        for link in &links {
            let Ok(id) = RoomId::parse(&link.room_id) else {
                continue;
            };
            let Some(child) = self.sdk().get_room(&id) else {
                continue;
            };
            let count = if child.is_space() {
                child_links(&child).await.len() as u64
            } else {
                0
            };
            let name = room_display_name(&child).await;
            children.push(known_child(&child, link, name, count));
        }
        let own_children = children.len() as u64;
        let mut hierarchy = SpaceHierarchy {
            space: Some(own_child(&space, own_children)),
            children,
            complete: true,
        };
        // The server also knows the children this device isn't in; a failure only means the
        // local answer stays as it is (a server without /hierarchy is one tuwunel reason for it)
        match self.server_hierarchy(&space).await {
            Ok((server_space, server_children)) => {
                merge_server(&mut hierarchy, server_space, server_children);
            }
            Err(error) => {
                tracing::debug!(space = %space_id, %error, "space hierarchy is local only");
            }
        }
        self.remember_hierarchy(space_id, fingerprint, &hierarchy);
        Ok(hierarchy)
    }

    /// The server's hierarchy for a space, one level deep
    async fn server_hierarchy(
        &self,
        space: &Room,
    ) -> Result<(Option<SpaceChild>, Vec<SpaceChild>)> {
        use matrix_sdk::ruma::{api::client::space::get_hierarchy, UInt};
        let space_id = space.room_id();
        let mut chunks = Vec::new();
        let mut from = None;
        for _ in 0..HIERARCHY_MAX_PAGES {
            let mut request = get_hierarchy::v1::Request::new(space_id.to_owned());
            request.limit = Some(UInt::from(HIERARCHY_PAGE_LIMIT));
            request.max_depth = Some(UInt::from(1u32));
            request.from = from.take();
            match self.sdk().send(request).await {
                Ok(response) => {
                    chunks.extend(response.rooms);
                    match response.next_batch {
                        Some(next) => from = Some(next),
                        None => break,
                    }
                }
                Err(error) if chunks.is_empty() => return Err(error.into()),
                Err(error) => {
                    tracing::warn!("space hierarchy truncated: {error}");
                    break;
                }
            }
        }
        let mut links: HashMap<String, (Vec<String>, bool)> = HashMap::new();
        for chunk in &chunks {
            for raw in &chunk.children_state {
                let Ok(event) = raw.deserialize_as_unchecked::<serde_json::Value>() else {
                    continue;
                };
                let Some(child) = event.get("state_key").and_then(serde_json::Value::as_str) else {
                    continue;
                };
                let via: Vec<String> = event
                    .pointer("/content/via")
                    .and_then(serde_json::Value::as_array)
                    .map(|v| {
                        v.iter()
                            .filter_map(|s| s.as_str().map(ToOwned::to_owned))
                            .collect()
                    })
                    .unwrap_or_default();
                let suggested = event
                    .pointer("/content/suggested")
                    .and_then(serde_json::Value::as_bool)
                    == Some(true);
                let entry = links.entry(child.to_owned()).or_default();
                if !via.is_empty() {
                    entry.0 = via;
                }
                entry.1 |= suggested;
            }
        }
        let mut own = None;
        let mut children = Vec::new();
        let mut seen = HashSet::new();
        for chunk in chunks {
            let summary = chunk.summary;
            if !seen.insert(summary.room_id.clone()) {
                continue;
            }
            let local = self.sdk().get_room(&summary.room_id);
            let state = local.as_ref().map(|r| r.state());
            let (via, suggested) = links
                .get(summary.room_id.as_str())
                .cloned()
                .unwrap_or_default();
            let child = SpaceChild {
                id: summary.room_id.to_string(),
                name: summary
                    .name
                    .clone()
                    .filter(|n| !n.is_empty())
                    .unwrap_or_default(),
                topic: summary.topic.clone(),
                avatar_url: summary.avatar_url.as_ref().map(ToString::to_string),
                canonical_alias: summary.canonical_alias.as_ref().map(ToString::to_string),
                member_count: summary.num_joined_members.into(),
                is_space: summary.room_type == Some(RoomType::Space),
                joined: state == Some(RoomState::Joined),
                invited: state == Some(RoomState::Invited),
                knocked: state == Some(RoomState::Knocked),
                via,
                suggested,
                join_rule: Some(summary.join_rule.as_str().to_owned()),
                world_readable: summary.world_readable,
                children_count: chunk.children_state.len() as u64,
            };
            if summary.room_id == *space_id {
                own = Some(child);
            } else {
                children.push(child);
            }
        }
        Ok((own, children))
    }

    fn cached_hierarchy(&self, space_id: &str, links: &str) -> Option<SpaceHierarchy> {
        let hierarchies = self.hierarchies.lock().unwrap();
        let cached = hierarchies.get(space_id)?;
        (cached.links == links && now_ms().saturating_sub(cached.at) < HIERARCHY_CACHE_MS)
            .then(|| cached.hierarchy.clone())
    }

    fn remember_hierarchy(&self, space_id: &str, links: String, hierarchy: &SpaceHierarchy) {
        let mut hierarchies = self.hierarchies.lock().unwrap();
        // Spaces come and go; keep the session's cache small
        if hierarchies.len() > 200 {
            hierarchies.clear();
        }
        hierarchies.insert(
            space_id.to_owned(),
            CachedHierarchy {
                links,
                at: now_ms(),
                hierarchy: hierarchy.clone(),
            },
        );
    }
}

impl MudrixClient {
    /// Adds a room or sub-space to a space (and links it back as its parent when allowed).
    pub async fn add_to_space(
        &self,
        space_id: &str,
        child_id: &str,
        suggested: bool,
    ) -> Result<()> {
        let server = self
            .sdk()
            .user_id()
            .map(|u| u.server_name().to_string())
            .unwrap_or_default();
        let mut content = serde_json::json!({ "via": [server.clone()] });
        if suggested {
            content["suggested"] = serde_json::json!(true);
        }
        self.set_state_event(space_id, "m.space.child", child_id, content)
            .await?;
        // Linking back needs permission in the child; the space link alone is enough to show it
        let _ = self
            .set_state_event(
                child_id,
                "m.space.parent",
                space_id,
                serde_json::json!({ "via": [server], "canonical": true }),
            )
            .await;
        Ok(())
    }

    pub async fn remove_from_space(&self, space_id: &str, child_id: &str) -> Result<()> {
        self.set_state_event(space_id, "m.space.child", child_id, serde_json::json!({}))
            .await?;
        let _ = self
            .set_state_event(child_id, "m.space.parent", space_id, serde_json::json!({}))
            .await;
        Ok(())
    }

    /// Changes a child's `suggested` flag or `order` (a short string sorted lexically), keeping
    /// the rest of its link.
    pub async fn update_space_child(
        &self,
        space_id: &str,
        child_id: &str,
        suggested: Option<bool>,
        order: Option<Option<String>>,
    ) -> Result<()> {
        let mut content = self
            .state_event(space_id, "m.space.child", child_id)
            .await?
            .ok_or_else(|| Error::InvalidId("not a child of this space".into()))?;
        if let Some(suggested) = suggested {
            content["suggested"] = serde_json::json!(suggested);
        }
        match order {
            Some(Some(order)) => content["order"] = serde_json::json!(order),
            Some(None) => {
                if let Some(obj) = content.as_object_mut() {
                    obj.remove("order");
                }
            }
            None => {}
        }
        self.set_state_event(space_id, "m.space.child", child_id, content)
            .await
    }
}

/// A joined space and the rooms and spaces it links to (from local state)
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceNode {
    pub space_id: String,
    pub children: Vec<SpaceLink>,
    /// The first parent this space names as canonical (`m.space.parent`)
    pub canonical_parent: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceLink {
    pub room_id: String,
    pub order: Option<String>,
    pub suggested: bool,
    /// When the link was made, to keep equal `order`s stable
    pub timestamp: u64,
    /// Servers to join through
    pub via: Vec<String>,
}

async fn state_events_json(room: &Room, event_type: StateEventType) -> Vec<serde_json::Value> {
    use matrix_sdk::deserialized_responses::RawAnySyncOrStrippedState;
    room.get_state_events(event_type)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter_map(|raw| match raw {
            RawAnySyncOrStrippedState::Sync(raw) => raw.deserialize_as_unchecked().ok(),
            RawAnySyncOrStrippedState::Stripped(_) => None,
        })
        .collect()
}

/// A space's `m.space.child` links that name servers (an empty one removes the child), in the
/// space's order
async fn child_links(room: &Room) -> Vec<SpaceLink> {
    let mut children: Vec<SpaceLink> = state_events_json(room, StateEventType::SpaceChild)
        .await
        .into_iter()
        .filter_map(|event| {
            let content = event.get("content")?;
            let via: Vec<String> = content
                .get("via")?
                .as_array()
                .filter(|v| !v.is_empty())?
                .iter()
                .filter_map(|s| s.as_str().map(ToOwned::to_owned))
                .collect();
            Some(SpaceLink {
                room_id: event.get("state_key")?.as_str()?.to_owned(),
                order: content
                    .get("order")
                    .and_then(serde_json::Value::as_str)
                    .map(ToOwned::to_owned),
                timestamp: event
                    .get("origin_server_ts")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or_default(),
                suggested: content
                    .get("suggested")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                via,
            })
        })
        .collect();
    children.sort_by(|a, b| match (&a.order, &b.order) {
        (Some(x), Some(y)) => x.cmp(y).then(a.timestamp.cmp(&b.timestamp)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        _ => a
            .timestamp
            .cmp(&b.timestamp)
            .then(a.room_id.cmp(&b.room_id)),
    });
    children
}

impl MudrixClient {
    /// Every joined space with its children, read from local state (cheap; call on changes).
    pub async fn space_graph(&self) -> Result<Vec<SpaceNode>> {
        let mut nodes = Vec::new();
        for room in self.sdk().joined_space_rooms() {
            let canonical_parent = state_events_json(&room, StateEventType::SpaceParent)
                .await
                .into_iter()
                .find(|event| {
                    event
                        .pointer("/content/canonical")
                        .and_then(serde_json::Value::as_bool)
                        == Some(true)
                })
                .and_then(|event| event.get("state_key")?.as_str().map(ToOwned::to_owned));
            nodes.push(SpaceNode {
                space_id: room.room_id().to_string(),
                children: child_links(&room).await,
                canonical_parent,
            });
        }
        Ok(nodes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn child(id: &str, name: &str, via: &[&str], suggested: bool) -> SpaceChild {
        SpaceChild {
            id: id.into(),
            name: name.into(),
            topic: None,
            avatar_url: None,
            canonical_alias: None,
            member_count: 0,
            is_space: false,
            joined: true,
            invited: false,
            knocked: false,
            via: via.iter().map(|s| (*s).to_owned()).collect(),
            suggested,
            join_rule: None,
            world_readable: false,
            children_count: 0,
        }
    }

    fn link(id: &str, order: Option<&str>, ts: u64) -> SpaceLink {
        SpaceLink {
            room_id: id.into(),
            order: order.map(ToOwned::to_owned),
            suggested: false,
            timestamp: ts,
            via: vec!["mudrix.test".into()],
        }
    }

    #[test]
    fn the_local_answer_keeps_its_own_order_and_link_data() {
        let mut local = child("!a:x", "", &["a.test"], false);
        local.member_count = 2;
        let server = child("!a:x", "Named", &["server.test"], true);
        merge_child(&mut local, &server);
        assert_eq!(local.name, "Named");
        assert_eq!(
            local.via,
            vec!["a.test"],
            "the space's own link says where the room is"
        );
        assert_eq!(local.member_count, 2, "the local room knows its members");
    }

    #[test]
    fn children_only_the_server_knows_are_appended_in_its_order() {
        let mut hierarchy = SpaceHierarchy {
            space: Some(child("!space:x", "Space", &[], false)),
            children: vec![child("!a:x", "A", &[], false)],
            complete: true,
        };
        merge_server(
            &mut hierarchy,
            Some(child("!space:x", "Server Space", &[], false)),
            vec![
                child("!c:x", "C", &["x.test"], false),
                child("!a:x", "Shared", &[], false),
                child("!b:x", "B", &["x.test"], false),
            ],
        );
        let ids: Vec<&str> = hierarchy.children.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, vec!["!a:x", "!c:x", "!b:x"]);
        // The room's own state wins; the server's name only fills an empty one
        assert_eq!(hierarchy.children[0].name, "A");
        assert_eq!(hierarchy.children[1].name, "C");
    }

    #[test]
    fn a_changed_space_child_link_changes_the_fingerprint() {
        let before = vec![link("!a:x", Some("01"), 10)];
        let same = vec![link("!a:x", Some("01"), 10)];
        assert_eq!(
            link_fingerprint(&before),
            link_fingerprint(&same),
            "an unchanged space keeps its cached hierarchy"
        );
        for changed in [
            vec![link("!a:x", Some("02"), 10)],
            vec![link("!a:x", Some("01"), 11)],
            vec![link("!a:x", Some("01"), 10), link("!b:x", None, 10)],
        ] {
            assert_ne!(link_fingerprint(&before), link_fingerprint(&changed));
        }
    }
}
