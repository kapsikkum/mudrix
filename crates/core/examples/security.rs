//! End-to-end check of sign-in discovery, recovery, device verification and sessions,
//! using two devices of the same account:
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example security

#![recursion_limit = "256"]

#[path = "common/mod.rs"]
mod common;

use std::{sync::Arc, time::Duration};

use tokio::sync::mpsc;
use wizardchat_core::{
    StoreConfig, UiaAuth, UiaOutcome, VerificationFlow, VerificationStatus, WizardClient,
};

use common::BoxError;

fn store(device: &str) -> StoreConfig {
    common::store("security", device)
}

async fn wait_for(what: &str, mut check: impl AsyncFnMut() -> bool) -> Result<(), BoxError> {
    for _ in 0..60 {
        if check().await {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(format!("timed out waiting for {what}").into())
}

/// Drives one side of an emoji verification and returns the emojis it was shown
async fn drive(flow: Arc<VerificationFlow>, side: &'static str) -> Result<Vec<String>, BoxError> {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let watcher = {
        let flow = flow.clone();
        tokio::spawn(async move { flow.watch(|status| drop(tx.send(status))).await })
    };
    let mut emojis = Vec::new();
    while let Some(status) = tokio::time::timeout(Duration::from_secs(30), rx.recv()).await? {
        match status {
            VerificationStatus::Incoming { .. } => flow.accept().await?,
            VerificationStatus::Ready if side == "A" => flow.start_sas().await?,
            VerificationStatus::SasIncoming => flow.accept_sas().await?,
            VerificationStatus::Emojis { emojis: shown, .. } => {
                emojis = shown.into_iter().map(|e| e.symbol).collect();
                flow.confirm().await?;
            }
            VerificationStatus::Done => break,
            VerificationStatus::Cancelled { reason, .. } => {
                return Err(format!("{side} cancelled: {reason}").into())
            }
            _ => {}
        }
    }
    watcher.abort();
    Ok(emojis)
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    if std::env::var("RUST_LOG").is_ok() {
        tracing_subscriber::fmt()
            .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
            .init();
    }
    // A fresh account each run, so leftovers from earlier runs can't interfere
    let server = common::server();
    let user = format!("wzsec{}", std::process::id());
    let password = format!("pw-{}-{}", std::process::id(), user.len() * 7919);
    WizardClient::register(
        &server,
        &user,
        &password,
        "security test setup",
        None,
        store("setup"),
    )
    .await?
    .0
    .logout()
    .await?;

    let info = WizardClient::discover(&server).await?;
    println!(
        "discovered {}: password {}, oauth {}, sso {}",
        info.homeserver_url,
        info.password,
        info.oauth,
        info.sso.len()
    );

    let (a, _) =
        WizardClient::login_password(&server, &user, &password, "security test A", store("a"))
            .await?;
    a.start_sync().await?;
    wait_for("device A to set up cross-signing", async || {
        a.encryption_status().await.device_verified
    })
    .await?;
    let status = a.encryption_status().await;
    let key = if status.recovery == "enabled" {
        a.reset_recovery_key().await?
    } else {
        a.enable_recovery().await?
    };
    let key = if a.encryption_status().await.recovery == "incomplete" {
        println!("  incomplete after enabling; resetting the key");
        a.reset_recovery_key().await?
    } else {
        key
    };
    println!("recovery key set up on device A (was {})", status.recovery);

    let (b, session_b) =
        WizardClient::login_password(&server, &user, &password, "security test B", store("b"))
            .await?;
    b.start_sync().await?;
    let own =
        |devices: Vec<wizardchat_core::DeviceInfo>| devices.into_iter().find(|d| d.is_current);
    assert!(
        !own(b.devices().await?).is_some_and(|d| d.is_verified),
        "a fresh device must not be listed as verified"
    );
    b.recover(&key).await?;
    println!("  A after enable: {:?}", a.encryption_status().await);
    println!("  B after recover: {:?}", b.encryption_status().await);
    wait_for("device B to be verified via the recovery key", async || {
        b.encryption_status().await.device_verified
    })
    .await?;
    assert!(
        own(b.devices().await?).is_some_and(|d| d.is_verified),
        "the sessions list shows device B verified"
    );
    println!("device B unlocked with the recovery key and is verified (unverified before)");

    // Fresh device C, verified by emoji comparison with A
    let (c, session_c) =
        WizardClient::login_password(&server, &user, &password, "security test C", store("c"))
            .await?;
    c.start_sync().await?;
    let device_c = session_c.device_id.clone();
    wait_for("device A to see device C", async || {
        a.devices()
            .await
            .map(|d| d.iter().any(|d| d.device_id == device_c))
            .unwrap_or(false)
    })
    .await?;
    tokio::time::sleep(Duration::from_secs(2)).await;

    let (flow_tx, mut flow_rx) = mpsc::unbounded_channel();
    let c = Arc::new(c);
    let incoming = {
        let c = c.clone();
        tokio::spawn(async move {
            c.watch_verification_requests(|flow| drop(flow_tx.send(flow)))
                .await
        })
    };
    let flow_c_request = Arc::new(c.request_self_verification().await?);
    let flow_a = tokio::time::timeout(Duration::from_secs(30), async {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let a_incoming = tokio::spawn({
            let a = Arc::new(a);
            async move {
                a.watch_verification_requests(|flow| drop(tx.send(flow)))
                    .await;
            }
        });
        let flow = rx.recv().await;
        a_incoming.abort();
        flow
    })
    .await?
    .ok_or("device A got no verification request")?;
    incoming.abort();
    while flow_rx.try_recv().is_ok() {}

    // C asked; A answers. Here C is the initiator ("A" role in `drive` starts SAS).
    let (emojis_c, emojis_a) = tokio::try_join!(
        async {
            drive(flow_c_request.clone(), "A")
                .await
                .map_err(|e| e.to_string())
        },
        async {
            drive(Arc::new(flow_a), "B")
                .await
                .map_err(|e| e.to_string())
        },
    )?;
    assert_eq!(emojis_c, emojis_a, "both devices must show the same emojis");
    assert_eq!(emojis_c.len(), 7);
    println!(
        "emoji verification between devices A and C: {}",
        emojis_c.join(" ")
    );
    wait_for("device C to be verified", async || {
        c.encryption_status().await.device_verified
    })
    .await?;
    println!("device C is now verified");

    let devices = b.devices().await?;
    assert!(devices
        .iter()
        .any(|d| d.device_id == session_c.device_id && d.is_verified));
    b.rename_device(&session_c.device_id, "renamed by the security test")
        .await?;
    let devices_to_remove = vec![session_c.device_id.clone()];
    let UiaOutcome::AuthRequired { session, .. } =
        b.delete_devices_with_auth(&devices_to_remove, None).await?
    else {
        return Err("removing a device should ask for confirmation".into());
    };
    let auth = UiaAuth::Password {
        password: password.clone(),
        session,
    };
    assert!(matches!(
        b.delete_devices_with_auth(&devices_to_remove, Some(auth))
            .await?,
        UiaOutcome::Done
    ));
    assert!(!b
        .devices()
        .await?
        .iter()
        .any(|d| d.device_id == session_c.device_id));
    println!("listed, renamed and (after the password step) signed out device C");

    // Everything lost: B resets the identity, sets up recovery again, and a new device uses it
    b.reset_identity(Some(&password), |_| {}).await?;
    wait_for("B's new identity and backup", async || {
        let status = b.encryption_status().await;
        status.device_verified && status.backup_enabled && status.cross_signing_complete
    })
    .await?;
    println!("  B after reset: {:?}", b.encryption_status().await);
    let new_key = b.enable_recovery().await?;
    println!(
        "  B after reset and new recovery: {:?}",
        b.encryption_status().await
    );
    let (d, _) =
        WizardClient::login_password(&server, &user, &password, "security test D", store("d"))
            .await?;
    d.start_sync().await?;
    d.recover(&new_key).await?;
    wait_for(
        "device D to be verified with the new recovery key",
        async || d.encryption_status().await.device_verified,
    )
    .await?;
    println!("identity reset, new recovery key works on a new device");
    d.logout().await.ok();
    let _ = session_b;
    b.deactivate_account(Some(&password), true).await.ok();
    std::process::exit(0)
}
