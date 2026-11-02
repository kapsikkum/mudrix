use std::sync::Mutex;

use futures_util::{pin_mut, stream, StreamExt};
use matrix_sdk::{
    encryption::{
        recovery::RecoveryState,
        verification::{
            SasState, SasVerification, Verification, VerificationRequest, VerificationRequestState,
        },
        VerificationState,
    },
    ruma::{
        events::{
            key::verification::request::ToDeviceKeyVerificationRequestEvent,
            room::message::{MessageType, OriginalSyncRoomMessageEvent},
        },
        OwnedDeviceId,
    },
    Client,
};
use serde::Serialize;

use crate::{Error, Result, WizardClient};

/// The account's end-to-end encryption setup, as far as the UI needs it
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct EncryptionStatus {
    /// `enabled` once a recovery key protects the keys; `incomplete` if it needs repairing
    pub recovery: String,
    /// Whether this device is verified (trusted by the account's other devices)
    pub device_verified: bool,
    pub backup_enabled: bool,
    /// This device holds all three cross-signing private keys
    pub cross_signing_complete: bool,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub device_id: String,
    pub display_name: Option<String>,
    pub last_seen_ip: Option<String>,
    pub last_seen_ts: Option<u64>,
    pub is_current: bool,
    pub is_verified: bool,
    /// Signed by the account's cross-signing identity (trusted by the owner)
    pub cross_signed_by_owner: bool,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct VerificationEmoji {
    pub symbol: String,
    pub description: String,
}

/// Where a verification stands, flattened from the request and SAS state machines
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum VerificationStatus {
    /// Waiting for the other side to accept the request
    Requested,
    /// The other side asked to verify; call `accept()`
    #[serde(rename_all = "camelCase")]
    Incoming {
        other_user: String,
        is_self: bool,
    },
    /// Both sides are ready; the initiator calls `startSas()`
    Ready,
    /// The other side started comparing emojis; call `acceptSas()`
    SasIncoming,
    /// Comparing is being set up
    SasStarted,
    /// Compare these with the other device, then `confirm()` or `mismatch()`
    Emojis {
        emojis: Vec<VerificationEmoji>,
        decimals: [u16; 3],
    },
    /// Confirmed here, waiting for the other device
    Confirmed,
    Done,
    #[serde(rename_all = "camelCase")]
    Cancelled {
        reason: String,
        by_us: bool,
    },
}

fn recovery_name(state: RecoveryState) -> &'static str {
    match state {
        RecoveryState::Enabled => "enabled",
        RecoveryState::Disabled => "disabled",
        RecoveryState::Incomplete => "incomplete",
        _ => "unknown",
    }
}

async fn status_of(client: &Client) -> EncryptionStatus {
    let encryption = client.encryption();
    EncryptionStatus {
        recovery: recovery_name(encryption.recovery().state()).to_owned(),
        device_verified: matches!(
            encryption.verification_state().get(),
            VerificationState::Verified
        ),
        backup_enabled: encryption.backups().are_enabled().await,
        cross_signing_complete: encryption
            .cross_signing_status()
            .await
            .is_some_and(|s| s.is_complete()),
    }
}

/// One verification (of this device, or another device/user), driven by the UI
pub struct VerificationFlow {
    request: VerificationRequest,
    sas: Mutex<Option<SasVerification>>,
}

fn sas_status(_sas: &SasVerification, state: SasState) -> VerificationStatus {
    match state {
        // The other side proposed the comparison and it's ours to accept. This doesn't follow
        // who sent the request: when both sides start (Element does), theirs can replace ours
        SasState::Started { .. } => VerificationStatus::SasIncoming,
        SasState::Created { .. } | SasState::Accepted { .. } => VerificationStatus::SasStarted,
        SasState::KeysExchanged { emojis, decimals } => VerificationStatus::Emojis {
            emojis: emojis
                .map(|e| {
                    e.emojis
                        .iter()
                        .map(|emoji| VerificationEmoji {
                            symbol: emoji.symbol.to_owned(),
                            description: emoji.description.to_owned(),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            decimals: [decimals.0, decimals.1, decimals.2],
        },
        SasState::Confirmed => VerificationStatus::Confirmed,
        SasState::Done { .. } => VerificationStatus::Done,
        SasState::Cancelled(info) => VerificationStatus::Cancelled {
            reason: info.reason().to_owned(),
            by_us: info.cancelled_by_us(),
        },
    }
}

impl VerificationFlow {
    pub(crate) fn from_request(request: VerificationRequest) -> Self {
        Self::new(request)
    }

    fn new(request: VerificationRequest) -> Self {
        Self {
            request,
            sas: Mutex::new(None),
        }
    }

    pub fn other_user_id(&self) -> String {
        self.request.other_user_id().to_string()
    }

    pub fn is_self_verification(&self) -> bool {
        self.request.is_self_verification()
    }

    /// Reports every step until the verification is done or cancelled.
    pub async fn watch(&self, mut on_change: impl FnMut(VerificationStatus)) {
        let changes = self.request.changes();
        pin_mut!(changes);
        let mut current = self.request.state();
        loop {
            match current {
                VerificationRequestState::Created { .. } => {
                    on_change(VerificationStatus::Requested)
                }
                VerificationRequestState::Requested { .. } => {
                    on_change(VerificationStatus::Incoming {
                        other_user: self.request.other_user_id().to_string(),
                        is_self: self.request.is_self_verification(),
                    })
                }
                VerificationRequestState::Ready { .. } => on_change(VerificationStatus::Ready),
                VerificationRequestState::Transitioned { verification } => {
                    let Verification::SasV1(mut sas) = verification else {
                        return;
                    };
                    // When both sides start comparing emojis at once, the crypto layer keeps one
                    // side's verification and replaces the other, so follow the request too
                    enum Step {
                        Sas(SasState),
                        Request(VerificationRequestState),
                    }
                    loop {
                        *self.sas.lock().unwrap() = Some(sas.clone());
                        on_change(sas_status(&sas, sas.state()));
                        let replaced = {
                            let steps = stream::select(
                                sas.changes().map(Step::Sas),
                                changes.as_mut().map(Step::Request),
                            );
                            pin_mut!(steps);
                            loop {
                                match steps.next().await {
                                    Some(Step::Sas(state)) => {
                                        let done = matches!(
                                            state,
                                            SasState::Done { .. } | SasState::Cancelled(_)
                                        );
                                        on_change(sas_status(&sas, state));
                                        if done {
                                            return;
                                        }
                                    }
                                    Some(Step::Request(
                                        VerificationRequestState::Transitioned {
                                            verification: Verification::SasV1(next),
                                        },
                                    )) => break next,
                                    Some(Step::Request(VerificationRequestState::Cancelled(
                                        info,
                                    ))) => {
                                        on_change(VerificationStatus::Cancelled {
                                            reason: info.reason().to_owned(),
                                            by_us: info.cancelled_by_us(),
                                        });
                                        return;
                                    }
                                    Some(Step::Request(_)) => {}
                                    None => return,
                                }
                            }
                        };
                        sas = replaced;
                    }
                }
                VerificationRequestState::Done => {
                    on_change(VerificationStatus::Done);
                    return;
                }
                VerificationRequestState::Cancelled(info) => {
                    on_change(VerificationStatus::Cancelled {
                        reason: info.reason().to_owned(),
                        by_us: info.cancelled_by_us(),
                    });
                    return;
                }
            }
            match changes.next().await {
                Some(state) => current = state,
                None => return,
            }
        }
    }

    pub async fn accept(&self) -> Result<()> {
        Ok(self.request.accept().await?)
    }

    /// Starts comparing emojis (by the side that sent the request, once it's ready).
    pub async fn start_sas(&self) -> Result<()> {
        self.request
            .start_sas()
            .await?
            .ok_or_else(|| Error::Sdk("emoji verification unavailable".into()))?;
        Ok(())
    }

    /// The emoji verification in progress. The request is asked first: when both sides start,
    /// the other side's can replace ours while our start is still being sent
    fn sas(&self) -> Result<SasVerification> {
        if let VerificationRequestState::Transitioned {
            verification: Verification::SasV1(sas),
        } = self.request.state()
        {
            return Ok(sas);
        }
        self.sas
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| Error::Sdk("no emoji verification in progress".into()))
    }

    pub async fn accept_sas(&self) -> Result<()> {
        Ok(self.sas()?.accept().await?)
    }

    /// The emojis match.
    pub async fn confirm(&self) -> Result<()> {
        Ok(self.sas()?.confirm().await?)
    }

    /// The emojis don't match: cancels, as someone may be intercepting.
    pub async fn mismatch(&self) -> Result<()> {
        Ok(self.sas()?.mismatch().await?)
    }

    pub async fn cancel(&self) -> Result<()> {
        if let Ok(sas) = self.sas() {
            return Ok(sas.cancel().await?);
        }
        Ok(self.request.cancel().await?)
    }
}

impl WizardClient {
    pub async fn encryption_status(&self) -> EncryptionStatus {
        status_of(self.sdk()).await
    }

    /// Reports the encryption status now and whenever recovery or verification changes.
    pub async fn watch_encryption_status(&self, mut on_change: impl FnMut(EncryptionStatus)) {
        let client = self.sdk().clone();
        let encryption = client.encryption();
        let changes = stream::select(
            encryption.recovery().state_stream().map(|_| ()),
            encryption.verification_state().map(|_| ()),
        );
        pin_mut!(changes);
        let mut last = status_of(&client).await;
        on_change(last.clone());
        while changes.next().await.is_some() {
            let status = status_of(&client).await;
            if status != last {
                last = status.clone();
                on_change(status);
            }
        }
    }

    /// Protects the encryption keys with a new recovery key, which is returned to show once.
    pub async fn enable_recovery(&self) -> Result<String> {
        Ok(self
            .sdk()
            .encryption()
            .recovery()
            .enable()
            .wait_for_backups_to_upload()
            .await?)
    }

    /// Replaces the recovery key (when the old one is lost but this device still has the keys).
    pub async fn reset_recovery_key(&self) -> Result<String> {
        Ok(self.sdk().encryption().recovery().reset_key().await?)
    }

    /// Unlocks the account's keys on this device with the recovery key, which also verifies it.
    pub async fn recover(&self, recovery_key: &str) -> Result<()> {
        Ok(self
            .sdk()
            .encryption()
            .recovery()
            .recover(recovery_key.trim())
            .await?)
    }

    /// Asks the account's other devices to verify this one.
    pub async fn request_self_verification(&self) -> Result<VerificationFlow> {
        let user_id = self.sdk().user_id().ok_or(Error::NotSignedIn)?.to_owned();
        let identity = self
            .sdk()
            .encryption()
            .get_user_identity(&user_id)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
            .ok_or_else(|| Error::Sdk("this account has no cross-signing identity yet".into()))?;
        Ok(VerificationFlow::new(
            identity
                .request_verification()
                .await
                .map_err(|e| Error::Sdk(e.to_string()))?,
        ))
    }

    /// Hands every verification request that arrives (from other devices or users, sent to
    /// this device or in a room) to `on_request`.
    pub async fn watch_verification_requests(&self, mut on_request: impl FnMut(VerificationFlow)) {
        let (sender, mut receiver) = futures_channel::mpsc::unbounded();
        let to_device = sender.clone();
        let handle = self.sdk().add_event_handler(
            move |event: ToDeviceKeyVerificationRequestEvent, client: Client| {
                let sender = to_device.clone();
                async move {
                    let request = client
                        .encryption()
                        .get_verification_request(&event.sender, &event.content.transaction_id)
                        .await;
                    if let Some(request) = request {
                        let _ = sender.unbounded_send(request);
                    }
                }
            },
        );
        let _guard = self.sdk().event_handler_drop_guard(handle);
        // Verifying another person happens in a room (usually the DM); the crypto layer only
        // keeps requests that are recent enough to answer
        let in_room = self.sdk().add_event_handler(
            move |event: OriginalSyncRoomMessageEvent, client: Client| {
                let sender = sender.clone();
                async move {
                    let MessageType::VerificationRequest(content) = &event.content.msgtype else {
                        return;
                    };
                    let own = client.user_id();
                    if own != Some(content.to.as_ref()) || own == Some(event.sender.as_ref()) {
                        return;
                    }
                    let request = client
                        .encryption()
                        .get_verification_request(&event.sender, &event.event_id)
                        .await;
                    if let Some(request) = request {
                        let _ = sender.unbounded_send(request);
                    }
                }
            },
        );
        let _in_room_guard = self.sdk().event_handler_drop_guard(in_room);
        while let Some(request) = receiver.next().await {
            on_request(VerificationFlow::new(request));
        }
    }

    /// The account's signed-in devices, this one first.
    pub async fn devices(&self) -> Result<Vec<DeviceInfo>> {
        let client = self.sdk();
        let own_user = client.user_id().ok_or(Error::NotSignedIn)?.to_owned();
        let own_device = client.device_id().map(ToOwned::to_owned);
        // The SDK always trusts its own device locally, so this device counts as verified only
        // once the account's cross-signing identity vouches for it
        let this_verified = matches!(
            client.encryption().verification_state().get(),
            VerificationState::Verified
        );
        let mut devices = Vec::new();
        for device in client.devices().await?.devices {
            let crypto = client
                .encryption()
                .get_device(&own_user, &device.device_id)
                .await
                .ok()
                .flatten();
            let is_current = Some(&device.device_id) == own_device.as_ref();
            devices.push(DeviceInfo {
                is_current,
                is_verified: if is_current {
                    this_verified
                } else {
                    crypto
                        .as_ref()
                        .is_some_and(|d| d.is_locally_trusted() || d.is_cross_signed_by_owner())
                },
                cross_signed_by_owner: crypto.is_some_and(|d| d.is_cross_signed_by_owner()),
                device_id: device.device_id.to_string(),
                display_name: device.display_name,
                last_seen_ip: device.last_seen_ip,
                last_seen_ts: device.last_seen_ts.map(|ts| u64::from(ts.0)),
            });
        }
        devices.sort_by_key(|d| (!d.is_current, std::cmp::Reverse(d.last_seen_ts)));
        Ok(devices)
    }

    pub async fn rename_device(&self, device_id: &str, name: &str) -> Result<()> {
        let device_id: OwnedDeviceId = device_id.into();
        self.sdk().rename_device(&device_id, name).await?;
        Ok(())
    }
}
