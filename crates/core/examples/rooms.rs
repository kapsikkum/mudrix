//! End-to-end check of the room list, spaces and inbox data with two accounts: unread counts and
//! mentions, DM and space invites, knocking, top-level spaces, the space hierarchy, power levels
//! of new rooms, room account data and removing a user's recent messages.
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example rooms

#![recursion_limit = "256"]

#[path = "common/mod.rs"]
mod common;

use std::time::Duration;

use futures_channel::oneshot;
use serde_json::{json, Value};
use wizardchat_core::{CreateRoomOptions, RoomSummary, SpaceSummary, WizardClient};

use common::BoxError;

async fn eventually<T>(
    what: &str,
    mut check: impl AsyncFnMut() -> Option<T>,
) -> Result<T, BoxError> {
    for _ in 0..40 {
        if let Some(value) = check().await {
            return Ok(value);
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(format!("timed out waiting for {what}").into())
}

/// Watches the room list until `done` holds for it
async fn room_list_until(
    client: &WizardClient,
    what: &str,
    done: impl Fn(&[RoomSummary]) -> bool,
) -> Result<Vec<RoomSummary>, BoxError> {
    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut rooms: Vec<RoomSummary> = Vec::new();
    let watch = client.watch_rooms(500, futures_util::stream::pending(), |diffs| {
        for diff in diffs {
            diff.apply(&mut rooms);
        }
        if done(&rooms) {
            if let Some(tx) = tx.take() {
                let _ = tx.send(rooms.clone());
            }
        }
    });
    tokio::select! {
        rooms = rx => Ok(rooms?),
        _ = watch => Err(format!("room list ended before {what}").into()),
        _ = tokio::time::sleep(Duration::from_secs(20)) => Err(format!("timed out waiting for {what}").into()),
    }
}

async fn spaces_until(
    client: &WizardClient,
    what: &str,
    done: impl Fn(&[SpaceSummary]) -> bool,
) -> Result<Vec<SpaceSummary>, BoxError> {
    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut spaces: Vec<SpaceSummary> = Vec::new();
    let watch = client.watch_spaces(|diffs| {
        for diff in diffs {
            diff.apply(&mut spaces);
        }
        if done(&spaces) {
            if let Some(tx) = tx.take() {
                let _ = tx.send(spaces.clone());
            }
        }
    });
    tokio::select! {
        spaces = rx => Ok(spaces?),
        _ = watch => Err(format!("space list ended before {what}").into()),
        _ = tokio::time::sleep(Duration::from_secs(20)) => Err(format!("timed out waiting for {what}").into()),
    }
}

fn find<'a>(rooms: &'a [RoomSummary], id: &str) -> Option<&'a RoomSummary> {
    rooms.iter().find(|r| r.id == id)
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let started = std::time::Instant::now();
    let (me, _, me_account) = common::register("rooms", "me").await?;
    let other = common::register("rooms", "other").await?.0;
    me.start_sync().await?;
    other.start_sync().await?;
    let me_id = me.user_id().unwrap();
    let other_id = other.user_id().unwrap();
    println!("two accounts signed in");

    let plain = me
        .create_room_with(CreateRoomOptions {
            name: "Plain".into(),
            encrypted: Some(false),
            ..Default::default()
        })
        .await?;
    let levels = me
        .state_event(&plain, "m.room.power_levels", "")
        .await?
        .unwrap();
    assert_eq!(levels["events"]["m.room.power_levels"], json!(100));
    assert_eq!(levels["events"]["m.room.encryption"], json!(100));
    assert!(levels["events"]
        .get("org.matrix.msc3401.call.member")
        .is_none());
    let voice = me
        .create_room_with(CreateRoomOptions {
            name: "Voice".into(),
            is_voice: true,
            ..Default::default()
        })
        .await?;
    let levels = me
        .state_event(&voice, "m.room.power_levels", "")
        .await?
        .unwrap();
    for (event, level) in [
        ("m.room.power_levels", 100),
        ("m.room.history_visibility", 100),
        ("m.room.encryption", 100),
        ("m.room.server_acl", 100),
        ("m.room.tombstone", 100),
        ("m.room.name", 50),
        ("org.matrix.msc3401.call.member", 0),
    ] {
        assert_eq!(levels["events"][event], json!(level), "{event} in {levels}");
    }
    println!("power levels: defaults for rooms, the full call map for voice rooms");

    let room = me
        .create_room_with(CreateRoomOptions {
            name: "Unread".into(),
            encrypted: Some(false),
            invite: vec![other_id.clone()],
            ..Default::default()
        })
        .await?;
    eventually("the invite", async || other.accept_invite(&room).await.ok()).await?;
    let mine = me
        .send_event(
            &room,
            "m.room.message",
            json!({ "msgtype": "m.text", "body": "my message" }),
        )
        .await?;
    eventually("my message on the other side", async || {
        other.event_source(&room, &mine).await.ok()
    })
    .await?;
    let plain_msg = other
        .send_event(
            &room,
            "m.room.message",
            json!({ "msgtype": "m.text", "body": "hello" }),
        )
        .await?;
    let reply = other
        .send_event(
            &room,
            "m.room.message",
            json!({
                "msgtype": "m.text",
                "body": "a reply without mentions",
                "m.relates_to": { "m.in_reply_to": { "event_id": mine } },
            }),
        )
        .await?;
    let keyword = other
        .send_event(
            &room,
            "m.room.message",
            json!({ "msgtype": "m.text", "body": format!("hey {}", me_account.username) }),
        )
        .await?;
    other
        .send_event(
            &room,
            "m.room.message",
            json!({
                "msgtype": "m.text",
                "body": "in a thread",
                "m.relates_to": { "rel_type": "m.thread", "event_id": plain_msg },
            }),
        )
        .await?;
    let rooms = room_list_until(&me, "unread counts", |rooms| {
        find(rooms, &room).is_some_and(|r| r.unread_notifications == 3 && r.unread_mentions == 2)
    })
    .await?;
    let summary = find(&rooms, &room).unwrap();
    println!(
        "unread: {} notifying, {} mentions (thread reply left out, reply and keyword count)",
        summary.unread_notifications, summary.unread_mentions
    );
    let mentions = me.unread_mentions(&room, 15).await?;
    let ids: Vec<&str> = mentions.iter().map(|m| m.event_id.as_str()).collect();
    assert_eq!(ids, vec![keyword.as_str(), reply.as_str()], "{mentions:?}");
    assert!(mentions.iter().all(|m| m.sender == other_id));
    println!("inbox mentions: the keyword highlight and the reply, newest first");

    let secret = me
        .create_room_with(CreateRoomOptions {
            name: "Encrypted unread".into(),
            encrypted: Some(true),
            invite: vec![other_id.clone()],
            ..Default::default()
        })
        .await?;
    eventually("the encrypted invite", async || {
        other.accept_invite(&secret).await.ok()
    })
    .await?;
    for body in ["one", "two"] {
        other
            .send_event(
                &secret,
                "m.room.message",
                json!({ "msgtype": "m.text", "body": body }),
            )
            .await?;
    }
    room_list_until(&me, "encrypted unread counts", |rooms| {
        find(rooms, &secret).is_some_and(|r| r.unread_notifications == 2)
    })
    .await?;
    println!("unread: encrypted messages count though the server can't read them");

    let recent = me.recent_user_messages(&room, &other_id).await?;
    assert!(recent.len() >= 3, "{recent:?}");
    me.redact_events(&room, &recent, None).await?;
    eventually("the redactions", async || {
        me.recent_user_messages(&room, &other_id)
            .await
            .ok()
            .filter(Vec::is_empty)
    })
    .await?;
    println!("removed {} recent messages of the other user", recent.len());

    let dm = other.start_dm(&me_id).await?;
    let rooms = room_list_until(&me, "the DM invite", |rooms| {
        find(rooms, &dm).is_some_and(|r| r.is_invite && r.is_direct)
    })
    .await?;
    let invite = find(&rooms, &dm).unwrap();
    assert_eq!(invite.dm_user_id.as_deref(), Some(other_id.as_str()));
    let info = me.invite_info(&dm).await?;
    println!(
        "DM invite is a DM from {:?} ({:?}), invited at {:?}",
        invite.dm_user_id, invite.dm_user_name, info.timestamp
    );

    let space = other
        .create_room_with(CreateRoomOptions {
            name: "Invited space".into(),
            is_space: true,
            invite: vec![me_id.clone()],
            ..Default::default()
        })
        .await?;
    room_list_until(&me, "the space invite", |rooms| {
        find(rooms, &space).is_some_and(|r| r.is_invite && r.is_space)
    })
    .await?;
    println!("space invite in the room list");

    let knock_room = other
        .create_room_with(CreateRoomOptions {
            name: "Knock".into(),
            access: Some("knock".into()),
            encrypted: Some(false),
            ..Default::default()
        })
        .await?;
    let server = other_id.split_once(':').unwrap().1.to_owned();
    me.knock(&knock_room, None, &[server]).await?;
    room_list_until(&me, "the knocked room", |rooms| {
        find(rooms, &knock_room).is_some_and(|r| r.is_knocked && !r.is_invite)
    })
    .await?;
    println!("knocked room flagged as knocked");

    let top = me
        .create_room_with(CreateRoomOptions {
            name: "Top".into(),
            is_space: true,
            ..Default::default()
        })
        .await?;
    let sub = me
        .create_room_with(CreateRoomOptions {
            name: "Sub".into(),
            is_space: true,
            parent_space_id: Some(top.clone()),
            ..Default::default()
        })
        .await?;
    let nested = me
        .create_room_with(CreateRoomOptions {
            name: "Nested room".into(),
            parent_space_id: Some(sub.clone()),
            ..Default::default()
        })
        .await?;
    let claims_parent = me
        .create_room_with(CreateRoomOptions {
            name: "Claims a parent".into(),
            is_space: true,
            ..Default::default()
        })
        .await?;
    me.set_state_event(
        &claims_parent,
        "m.space.parent",
        &top,
        json!({ "via": ["localhost"], "canonical": true }),
    )
    .await?;
    let spaces = spaces_until(&me, "top-level spaces", |spaces| {
        spaces.iter().any(|s| s.id == top)
            && spaces.iter().any(|s| s.id == claims_parent)
            && !spaces.iter().any(|s| s.id == sub)
    })
    .await?;
    println!(
        "top-level spaces follow m.space.child only ({} listed)",
        spaces.len()
    );
    let graph = me.space_graph().await?;
    let sub_node = graph.iter().find(|n| n.space_id == sub).unwrap();
    assert_eq!(sub_node.canonical_parent.as_deref(), Some(top.as_str()));
    assert!(sub_node
        .children
        .iter()
        .any(|c| c.room_id == nested && !c.via.is_empty()));
    let hierarchy = me.space_hierarchy(&top).await?;
    assert_eq!(
        hierarchy.space.as_ref().map(|s| s.name.as_str()),
        Some("Top")
    );
    assert!(hierarchy.complete);
    assert!(hierarchy
        .children
        .iter()
        .any(|c| c.id == sub && c.is_space && !c.via.is_empty()));
    println!("space graph has via and canonical parents; hierarchy includes the space itself");

    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let target = plain.clone();
    let watch = me.watch_room_account_data("m.tag", |pairs: Vec<(String, Value)>| {
        let order = pairs
            .iter()
            .find(|(id, _)| *id == target)
            .and_then(|(_, c)| c.pointer("/tags/m.favourite/order").cloned());
        if order == Some(json!(0.25)) {
            if let Some(tx) = tx.take() {
                let _ = tx.send(());
            }
        }
    });
    let set = async {
        tokio::time::sleep(Duration::from_millis(300)).await;
        me.set_favourite_order(&plain, Some(0.25)).await
    };
    tokio::select! {
        _ = rx => {},
        _ = watch => return Err("account data watch ended".into()),
        _ = tokio::time::sleep(Duration::from_secs(20)) => return Err("timed out waiting for m.tag".into()),
        result = async { set.await?; std::future::pending::<Result<(), wizardchat_core::Error>>().await } => { result?; }
    }
    println!("favourite order arrives through the room account data watch");

    let local = me.local_room_settings(&plain).await?;
    assert!(local.power_levels.get("users").is_some());
    println!(
        "local settings: join rule {}, profile status writable: {}",
        local.join_rule,
        me.can_set_profile_field("org.wizardchat.status").await?
    );

    println!("All room checks passed in {:.1?}", started.elapsed());
    Ok(())
}
