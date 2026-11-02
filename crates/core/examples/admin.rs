//! End-to-end check of room administration with two accounts: settings, addresses, power
//! levels, knocking, bans, reports, view source, forwarding, media and upgrades.
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example admin

#![recursion_limit = "256"]

#[path = "common/mod.rs"]
mod common;

use std::time::Duration;

use serde_json::json;
use wizardchat_core::CreateRoomOptions;

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

const PIXEL: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0,
    1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0, 0, 0, 0x0d, 0x49, 0x44, 0x41, 0x54,
    0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0, 0x1f, 0, 0x05, 0, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let started = std::time::Instant::now();
    let me = common::register("admin", "me").await?.0;
    let other = common::register("admin", "other").await?.0;
    me.start_sync().await?;
    other.start_sync().await?;
    let other_id = other.user_id().unwrap();
    println!("two accounts signed in");

    let caps = me.server_capabilities().await?;
    println!(
        "capabilities: default room v{}, {} versions, upload limit {:?}",
        caps.default_room_version,
        caps.room_versions.len(),
        caps.upload_size
    );

    let room = me
        .create_room_with(CreateRoomOptions {
            name: "Admin test".into(),
            encrypted: Some(false),
            federate: Some(false),
            access: Some("knock".into()),
            ..Default::default()
        })
        .await?;
    let settings = me.room_settings(&room).await?;
    assert_eq!(settings.join_rule, "knock");
    assert!(!settings.federate && !settings.encrypted);
    println!(
        "created an unencrypted, unfederated knock room (v{})",
        settings.room_version
    );

    me.set_history_visibility(&room, "joined").await?;
    me.set_guest_access(&room, true).await?;
    let local = format!("#wz-admin-{}:localhost", std::process::id());
    me.add_room_alias(&room, &local).await?;
    me.set_canonical_alias(&room, Some(&local), &[]).await?;
    // Many servers only let admins publish to the directory
    let published = me.set_published(&room, true).await.is_ok();
    me.set_room_avatar(&room, PIXEL.to_vec(), "image/png")
        .await?;
    let mut levels = me.room_settings(&room).await?.power_levels;
    levels["events"]["m.room.name"] = json!(75);
    me.set_power_levels(&room, levels).await?;
    let settings = me.room_settings(&room).await?;
    assert_eq!(settings.history_visibility, "joined");
    assert!(
        settings.guest_access && settings.published == published && settings.avatar_url.is_some()
    );
    assert_eq!(settings.canonical_alias.as_deref(), Some(local.as_str()));
    assert!(settings.local_aliases.contains(&local));
    assert_eq!(settings.power_levels["events"]["m.room.name"], json!(75));
    println!("history, guests, address, directory, avatar and power levels set and read back");

    other.knock(&room, Some("let me in"), &[]).await?;
    eventually("the knock", async || {
        me.members_in_state(&room, "knock")
            .await
            .ok()?
            .into_iter()
            .find(|m| m.user_id == other_id && m.reason.as_deref() == Some("let me in"))
    })
    .await?;
    me.accept_knock(&room, &other_id).await?;
    eventually("the invite", async || other.accept_invite(&room).await.ok()).await?;
    println!("knock seen with its reason, accepted, and joined");

    me.ban(&room, &other_id, Some("testing")).await?;
    eventually("the ban list", async || {
        me.members_in_state(&room, "ban")
            .await
            .ok()?
            .into_iter()
            .find(|m| m.user_id == other_id)
    })
    .await?;
    me.unban(&room, &other_id, None).await?;
    eventually("the unban", async || {
        me.members_in_state(&room, "ban")
            .await
            .ok()?
            .iter()
            .all(|m| m.user_id != other_id)
            .then_some(())
    })
    .await?;
    println!("banned, listed, unbanned");

    let event_id = me
        .send_event(
            &room,
            "m.room.message",
            json!({ "msgtype": "m.text", "body": "source me" }),
        )
        .await?;
    let source = me.event_source(&room, &event_id).await?;
    assert_eq!(source.original["content"]["body"], json!("source me"));
    me.report_event(&room, &event_id, Some("test report"))
        .await?;
    let target = me.create_room("Forward target").await?;
    me.forward_event(&room, &event_id, &target).await?;
    println!("view source, report, forward");

    let mxc = me.upload_media(PIXEL.to_vec(), "image/png").await?;
    me.set_state_event(
        &room,
        "im.ponies.room_emotes",
        "test",
        json!({ "images": { "dot": { "url": mxc } }, "pack": { "display_name": "Test" } }),
    )
    .await?;
    let packs = me
        .state_events_of_type(&room, "im.ponies.room_emotes")
        .await?;
    assert_eq!(packs.len(), 1);
    assert!(me.state_event(&room, "m.room.topic", "").await?.is_none());
    println!("media upload and generic state events");

    let newer = caps
        .room_versions
        .iter()
        .rev()
        .find(|(v, s)| s == "stable" && *v != settings.room_version)
        .map(|(v, _)| v.clone());
    if let Some(version) = newer {
        let new_room = me.upgrade_room(&room, &version).await?;
        let old = me.room_settings(&room).await?;
        assert_eq!(
            old.tombstone.map(|t| t.replacement_room),
            Some(new_room.clone())
        );
        println!("upgraded to v{version} ({new_room})");
        me.leave(&new_room).await.ok();
    }

    for id in [&room, &target] {
        me.leave(id).await.ok();
    }
    other.leave(&room).await.ok();
    me.logout().await.ok();
    other.logout().await.ok();
    println!("took {}s", started.elapsed().as_secs());
    std::process::exit(0);
}
