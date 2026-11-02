//! Carries the web app's core calls and events over Tauri IPC

use std::sync::{Arc, Mutex};

use serde::Deserialize;
use tauri::ipc::{Channel, InvokeBody, Request, Response};
use wizardchat_core::rpc::Rpc;

pub struct Core {
    rpc: Rpc,
    events: Arc<Mutex<Option<Channel<String>>>>,
}

impl Core {
    pub fn new() -> Self {
        let events: Arc<Mutex<Option<Channel<String>>>> = Arc::default();
        let sink = events.clone();
        let rpc = Rpc::new(move |listener, json| {
            if let Some(channel) = sink.lock().unwrap().as_ref() {
                let _ = channel.send(format!("{listener}:{json}"));
            }
        });
        Core { rpc, events }
    }
}

/// The web app (re)loaded: it gets events from now on, and nothing from before survives
// Async so it runs on the Tokio runtime: `reset` stops the old clients' sync in the background
#[tauri::command]
pub async fn rpc_connect(
    core: tauri::State<'_, Core>,
    events: Channel<String>,
) -> Result<(), String> {
    core.rpc.reset();
    *core.events.lock().unwrap() = Some(events);
    Ok(())
}

#[derive(Deserialize)]
struct Header {
    method: String,
    #[serde(rename = "self")]
    this: Option<u64>,
    args: String,
    blobs: Vec<usize>,
}

fn read_u32(bytes: &[u8], at: usize) -> Option<usize> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?) as usize)
}

/// Body: header length, header JSON, blobs. Reply: JSON length, JSON, blob count, blobs with lengths.
#[tauri::command]
pub async fn rpc_call(
    core: tauri::State<'_, Core>,
    request: Request<'_>,
) -> Result<Response, String> {
    let InvokeBody::Raw(body) = request.body() else {
        return Err(r#"{"code":"sdk","message":"expected a binary body"}"#.into());
    };
    let malformed = || r#"{"code":"sdk","message":"malformed call"}"#.to_string();
    let length = read_u32(body, 0).ok_or_else(malformed)?;
    let header: Header = serde_json::from_slice(body.get(4..4 + length).ok_or_else(malformed)?)
        .map_err(|_| malformed())?;
    let args = serde_json::from_str(&header.args).map_err(|_| malformed())?;
    let mut offset = 4 + length;
    let mut blobs = Vec::with_capacity(header.blobs.len());
    for size in header.blobs {
        blobs.push(
            body.get(offset..offset + size)
                .ok_or_else(malformed)?
                .to_vec(),
        );
        offset += size;
    }
    let rpc = core.rpc.clone();
    let reply = rpc
        .call(&header.method, header.this, args, blobs)
        .await
        .map_err(|e| e.to_json())?;
    let mut out = Vec::with_capacity(
        8 + reply.json.len() + reply.blobs.iter().map(|b| b.len() + 4).sum::<usize>(),
    );
    out.extend((reply.json.len() as u32).to_le_bytes());
    out.extend(reply.json.as_bytes());
    out.extend((reply.blobs.len() as u32).to_le_bytes());
    for blob in reply.blobs {
        out.extend((blob.len() as u32).to_le_bytes());
        out.extend(blob);
    }
    Ok(Response::new(out))
}

#[tauri::command]
pub fn rpc_release(core: tauri::State<'_, Core>, handle: u64) {
    core.rpc.release(handle);
}

#[tauri::command]
pub fn rpc_cancel(core: tauri::State<'_, Core>, listener: u64) {
    core.rpc.cancel(listener);
}
