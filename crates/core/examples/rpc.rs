//! End-to-end check of the RPC layer the apps use: a throwaway account, sync, the room list and
//! its filter, a timeline, binary upload and download, handles and errors.
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example rpc

#![recursion_limit = "256"]

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tokio::sync::mpsc;
use wizardchat_core::rpc::Rpc;

type BoxError = Box<dyn std::error::Error>;

struct Harness {
    rpc: Rpc,
    events: mpsc::UnboundedReceiver<(u64, String)>,
}

impl Harness {
    async fn call_with(
        &self,
        method: &str,
        this: Option<u64>,
        args: Value,
        blobs: Vec<Vec<u8>>,
    ) -> Result<(Value, Vec<Vec<u8>>), Value> {
        let Value::Array(args) = args else {
            panic!("args must be an array")
        };
        match self.rpc.call(method, this, args, blobs).await {
            Ok(reply) => Ok((serde_json::from_str(&reply.json).unwrap(), reply.blobs)),
            Err(error) => Err(serde_json::from_str(&error.to_json()).unwrap()),
        }
    }

    async fn call(&self, method: &str, this: Option<u64>, args: Value) -> Result<Value, BoxError> {
        self.call_with(method, this, args, Vec::new())
            .await
            .map(|(value, _)| value)
            .map_err(|e| format!("{method} failed: {e}").into())
    }

    /// The next event for `listener` that satisfies `matches`
    async fn event(
        &mut self,
        listener: u64,
        matches: impl Fn(&Value) -> bool,
    ) -> Result<Value, BoxError> {
        tokio::time::timeout(Duration::from_secs(60), async {
            while let Some((id, json)) = self.events.recv().await {
                let value: Value = serde_json::from_str(&json).unwrap();
                if id == listener && matches(&value) {
                    return Ok(value);
                }
            }
            Err("event stream ended".into())
        })
        .await
        .map_err(|_| format!("no matching event for listener {listener}"))?
    }
}

fn handle(value: &Value) -> u64 {
    value["$handle"].as_u64().expect("a handle")
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let server = std::env::var("WZ_SERVER").unwrap_or_else(|_| "http://localhost:8008".into());
    let (sender, events) = mpsc::unbounded_channel();
    let rpc = Rpc::new(move |listener, json| {
        let _ = sender.send((listener, json));
    });
    let mut h = Harness { rpc, events };
    let started = std::time::Instant::now();

    let error = h
        .call_with("WizardClient.nope", None, json!([]), vec![])
        .await
        .unwrap_err();
    assert_eq!(error["code"], "sdk");
    println!("unknown methods are rejected");

    let stamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let username = format!("rpc{stamp}");
    let password = format!("pw-{stamp:x}-{}", std::process::id());
    let dir = std::env::temp_dir().join(format!("wizardchat-rpc-{stamp}"));
    let store = json!({ "location": dir.to_string_lossy(), "passphrase": null });
    let client = h
        .call(
            "WizardClient.register",
            None,
            json!([server, username, password, "RPC test", null, store]),
        )
        .await?;
    let user_id = client["props"]["userId"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    assert!(
        user_id.starts_with(&format!("@{username}:")),
        "props carry the user id"
    );
    let client = handle(&client);
    println!("registered {user_id} (handle {client})");

    h.call("WizardClient.startSync", Some(client), json!([]))
        .await?;
    h.call("WizardClient.watchSyncState", Some(client), json!([1]))
        .await?;
    h.event(1, |state| state == "running").await?;
    println!("sync running, reported through a listener");

    let room_id = h
        .call(
            "WizardClient.createRoom",
            Some(client),
            json!([{ "name": "RPC room" }]),
        )
        .await?
        .as_str()
        .unwrap()
        .to_owned();
    h.call("WizardClient.watchRooms", Some(client), json!([50, 2]))
        .await?;
    h.event(2, |diffs| diffs.to_string().contains(&room_id))
        .await?;
    h.call(
        "RoomListSubscription.setFilter",
        None,
        json!([2, { "query": "no such room" }]),
    )
    .await?;
    h.event(2, |diffs| !diffs.to_string().contains(&room_id))
        .await?;
    println!("room list shows the new room, and the filter applies");

    let timeline = handle(
        &h.call("WizardClient.timeline", Some(client), json!([room_id]))
            .await?,
    );
    h.call("RoomTimeline.watch", Some(timeline), json!([3]))
        .await?;
    h.call(
        "RoomTimeline.sendMessage",
        Some(timeline),
        json!(["text", "hello over rpc", null, null, null]),
    )
    .await?;
    h.event(3, |diffs| diffs.to_string().contains("hello over rpc"))
        .await?;
    println!("timeline handle: sent a message and saw it arrive");

    let data: Vec<u8> = (0..=255).cycle().take(70_000).collect();
    let (url, _) = h
        .call_with(
            "WizardClient.uploadMedia",
            Some(client),
            json!([{ "$bytes": 0 }, "application/octet-stream"]),
            vec![data.clone()],
        )
        .await
        .map_err(|e| format!("upload failed: {e}"))?;
    let (reply, blobs) = h
        .call_with(
            "WizardClient.media",
            Some(client),
            json!([{ "url": url }, null, null]),
            vec![],
        )
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    assert_eq!(reply, json!({ "$bytes": 0 }));
    assert_eq!(blobs.first(), Some(&data), "downloaded bytes match");
    println!("{} bytes uploaded and downloaded as blobs", data.len());

    h.rpc.cancel(2);
    h.rpc.release(timeline);
    let error = h
        .call_with(
            "RoomTimeline.paginateBack",
            Some(timeline),
            json!([10]),
            vec![],
        )
        .await
        .unwrap_err();
    assert!(error["message"]
        .as_str()
        .unwrap_or_default()
        .contains("released"));
    println!("released handles are rejected");

    h.call("WizardClient.logout", Some(client), json!([]))
        .await?;
    // Let the stores close before the runtime and their directory go away
    h.rpc.reset();
    tokio::time::sleep(Duration::from_millis(500)).await;
    let _ = std::fs::remove_dir_all(dir);
    println!("signed out\ntook {}s", started.elapsed().as_secs());
    Ok(())
}
