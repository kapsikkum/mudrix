//! End-to-end check of the session lifecycle: discovery, registration, loading states, cached
//! data, server error texts, in-room verification requests, trust changes, identity reset with
//! user-interactive auth, avatar thumbnails and signing out a stored session:
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example session

#![recursion_limit = "256"]

#[path = "common/mod.rs"]
mod common;

use std::{sync::Arc, time::Duration};

use base64::Engine;
use tokio::sync::mpsc;
use wizardchat_core::{
    sniff_mime_type, Error, LoadState, UiaAuth, UiaOutcome, VerificationStatus, WizardClient,
};

use common::BoxError;

const EXAMPLE: &str = "session";
const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/// Collects load states until `Synced` (or a timeout)
async fn load_states(client: Arc<WizardClient>) -> Result<Vec<LoadState>, BoxError> {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let watcher = tokio::spawn(async move {
        let _ = client
            .watch_load_state(|state| {
                let _ = tx.send(state);
            })
            .await;
    });
    let mut states = Vec::new();
    while let Ok(Some(state)) = tokio::time::timeout(Duration::from_secs(30), rx.recv()).await {
        states.push(state);
        if state == LoadState::Synced {
            break;
        }
    }
    watcher.abort();
    Ok(states)
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    if std::env::var("RUST_LOG").is_ok() {
        tracing_subscriber::fmt()
            .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
            .init();
    }
    let server = common::server();

    let info = WizardClient::discover(&server).await?;
    assert!(info.password, "the test server offers password sign-in");
    match WizardClient::discover("http://127.0.0.1:9").await {
        Err(Error::Homeserver(_)) => println!("an unreachable server is reported as such"),
        other => return Err(format!("unexpected discovery result: {other:?}").into()),
    }
    let signup = WizardClient::sign_up_info(&server).await?;
    println!(
        "registration open: {}, flows {:?}",
        signup.enabled, signup.flows
    );

    let stamp = std::process::id();
    let (username, password) = (format!("wzsess{stamp}"), format!("pw-{stamp}-session"));
    let (created, session) = WizardClient::create_account(
        &server,
        &username,
        &password,
        "session test A",
        None,
        common::store(EXAMPLE, "a"),
    )
    .await?;
    println!(
        "account created; refresh token requested: {}",
        session.refresh_token.is_some()
    );
    drop(created);

    // A fresh sign-in has nothing stored: loading until the server answers
    let a = Arc::new(WizardClient::restore(session.clone(), common::store(EXAMPLE, "a")).await?);
    a.start_sync().await?;
    let states = load_states(a.clone()).await?;
    assert_eq!(states.first(), Some(&LoadState::Loading), "{states:?}");
    assert_eq!(states.last(), Some(&LoadState::Synced), "{states:?}");
    println!("first start: {states:?}");
    assert!(a.cached_account_data("m.push_rules").await?.is_some());
    println!("push rules read from the store without a request");
    a.stop_sync().await;
    drop(a);

    // Restoring the same store shows the stored data right away
    let a = Arc::new(WizardClient::restore(session.clone(), common::store(EXAMPLE, "a")).await?);
    a.start_sync().await?;
    let states = load_states(a.clone()).await?;
    assert_eq!(states.first(), Some(&LoadState::Cached), "{states:?}");
    println!("restart: {states:?}");

    match a.join("#nowhere-to-be-found:localhost", &[]).await {
        Err(Error::Matrix { errcode, message }) => {
            assert!(
                !message.contains("the server returned an error"),
                "{message}"
            );
            println!("server error text: [{errcode}] {message}");
        }
        other => return Err(format!("expected a Matrix error, got {other:?}").into()),
    }

    let mxc = a
        .set_avatar(
            base64::engine::general_purpose::STANDARD.decode(PNG)?,
            "image/png",
        )
        .await?;
    let thumb = a.thumbnail(&mxc, 32, 32, true).await?;
    println!(
        "cropped avatar thumbnail: {} bytes, {:?}",
        thumb.len(),
        sniff_mime_type(&thumb)
    );

    // Another person verifies A in their direct chat: A sees the request
    let (b, _, _) = common::register(EXAMPLE, "b").await?;
    let b = Arc::new(b);
    b.start_sync().await?;
    let a_id = a.user_id().unwrap();
    let b_id = b.user_id().unwrap();
    let (trust_tx, mut trust_rx) = mpsc::unbounded_channel();
    let trust_watch = tokio::spawn({
        let a = a.clone();
        async move {
            let _ = a
                .watch_trust_changes(|users| drop(trust_tx.send(users)))
                .await;
        }
    });
    let (request_tx, mut request_rx) = mpsc::unbounded_channel();
    let requests = tokio::spawn({
        let a = a.clone();
        async move {
            a.watch_verification_requests(|flow| drop(request_tx.send(flow)))
                .await
        }
    });
    let dm = b.start_dm(&a_id).await?;
    for _ in 0..60 {
        if a.accept_invite(&dm).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    tokio::time::sleep(Duration::from_secs(2)).await;
    let outgoing = b.request_user_verification(&a_id).await?;
    let flow = tokio::time::timeout(Duration::from_secs(30), request_rx.recv())
        .await?
        .ok_or("no verification request")?;
    assert_eq!(flow.other_user_id(), b_id);
    let (status_tx, mut status_rx) = mpsc::unbounded_channel();
    let flow = Arc::new(flow);
    let watch = tokio::spawn({
        let flow = flow.clone();
        async move { flow.watch(|s| drop(status_tx.send(s))).await }
    });
    let first = tokio::time::timeout(Duration::from_secs(10), status_rx.recv()).await?;
    assert!(
        matches!(
            first,
            Some(VerificationStatus::Incoming { is_self: false, .. })
        ),
        "{first:?}"
    );
    println!("in-room verification request from {b_id} arrived");
    watch.abort();
    requests.abort();
    outgoing.cancel().await?;
    let mut seen = Vec::new();
    while let Ok(Some(users)) = tokio::time::timeout(Duration::from_secs(5), trust_rx.recv()).await
    {
        seen.extend(users);
        if seen.contains(&b_id) {
            break;
        }
    }
    trust_watch.abort();
    assert!(seen.contains(&b_id), "trust changes: {seen:?}");
    println!("trust changes reported for {b_id}");

    // Identity reset: the server asks to confirm, then the password does
    match a.reset_identity_with_auth(None, |_| {}).await? {
        UiaOutcome::AuthRequired { flows, .. } => println!("identity reset asks for {flows:?}"),
        UiaOutcome::Done => println!("  identity reset needed no confirmation"),
    }
    let wrong = UiaAuth::Password {
        password: "wrong".into(),
        session: None,
    };
    assert!(matches!(
        a.reset_identity_with_auth(Some(wrong), |_| {}).await,
        Err(Error::InvalidCredentials)
    ));
    // Like a person typing the password again
    tokio::time::sleep(Duration::from_secs(3)).await;
    let right = UiaAuth::Password {
        password: password.clone(),
        session: None,
    };
    assert!(matches!(
        a.reset_identity_with_auth(Some(right), |_| {}).await?,
        UiaOutcome::Done
    ));
    println!("identity reset with the password (a wrong one is rejected)");
    a.cancel_identity_reset();

    // A stored session that can't be restored is still signed out on the server
    let (other, other_session) = WizardClient::login_password(
        &server,
        &username,
        &password,
        "session test C",
        common::store(EXAMPLE, "c"),
    )
    .await?;
    drop(other);
    WizardClient::logout_session(other_session.clone()).await?;
    let devices = a.devices().await?;
    assert!(
        !devices
            .iter()
            .any(|d| d.device_id == other_session.device_id),
        "the signed-out device is gone"
    );
    println!("stored session signed out on the server");

    a.logout().await?;
    b.logout().await?;
    println!("all session checks passed");
    Ok(())
}
