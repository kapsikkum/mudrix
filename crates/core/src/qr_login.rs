//! Signing in with a QR code (MSC4108): a new device logs in through an existing one, or this
//! device lets a new one in. Needs an OAuth (MAS) homeserver.

use std::sync::{Arc, Mutex};

use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{future, pin_mut, StreamExt};
use matrix_sdk::authentication::oauth::{
    qrcode::{
        CheckCodeSender, GeneratedQrProgress, GrantLoginProgress, LoginProgress, QrCodeData,
        QrProgress,
    },
    registration::{ApplicationType, OAuthGrantType},
};
use serde::Serialize;

use crate::{auth::registration_data, AppInfo, Error, Result, Session, StoreConfig, WizardClient};

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum QrLoginStatus {
    Starting,
    /// Show this QR code (base64 of its bytes) to the other device
    ShowQr {
        data: String,
    },
    /// The other device scanned it: ask for the two digits it shows
    EnterCheckCode,
    /// Show these two digits so they can be typed on the other device
    ShowCheckCode {
        code: u8,
    },
    /// The other device has to approve; it may ask for this code
    WaitingForApproval {
        user_code: Option<String>,
    },
    /// Open this page to approve the new device, then call `confirm`
    ApproveInBrowser {
        url: String,
    },
    SyncingSecrets,
    Done,
}

/// Answers for a running QR login: the check code, and approval
#[derive(Clone, Default)]
pub struct QrLoginControl {
    check_code: Arc<Mutex<Option<CheckCodeSender>>>,
    continuation:
        Arc<Mutex<Option<matrix_sdk::authentication::oauth::qrcode::ContinuationMessageSender>>>,
}

impl QrLoginControl {
    pub async fn send_check_code(&self, code: u8) -> Result<()> {
        let sender = self
            .check_code
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| Error::Sdk("not waiting for a check code".into()))?;
        sender
            .send(code)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))
    }

    /// The new device was approved in the browser.
    pub async fn confirm(&self) -> Result<()> {
        let sender = self
            .continuation
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| Error::Sdk("not waiting for approval".into()))?;
        sender
            .confirm()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))
    }

    pub async fn cancel(&self) -> Result<()> {
        let sender = self.continuation.lock().unwrap().clone();
        if let Some(sender) = sender {
            sender
                .cancel()
                .await
                .map_err(|e| Error::Sdk(e.to_string()))?;
        }
        Ok(())
    }
}

fn parse_qr(bytes: &[u8]) -> Result<QrCodeData> {
    QrCodeData::from_bytes(bytes).map_err(|e| Error::InvalidId(e.to_string()))
}

impl QrLoginControl {
    fn generated(&self, progress: GeneratedQrProgress) -> QrLoginStatus {
        match progress {
            GeneratedQrProgress::QrReady(data) => QrLoginStatus::ShowQr {
                data: STANDARD.encode(data.to_bytes()),
            },
            GeneratedQrProgress::QrScanned(sender) => {
                *self.check_code.lock().unwrap() = Some(sender);
                QrLoginStatus::EnterCheckCode
            }
        }
    }

    fn login_status<Q>(
        &self,
        progress: LoginProgress<Q>,
        map: impl Fn(Q) -> QrLoginStatus,
    ) -> QrLoginStatus {
        match progress {
            LoginProgress::Starting => QrLoginStatus::Starting,
            LoginProgress::EstablishingSecureChannel(q) => map(q),
            LoginProgress::WaitingForToken { user_code } => QrLoginStatus::WaitingForApproval {
                user_code: Some(user_code),
            },
            LoginProgress::SyncingSecrets => QrLoginStatus::SyncingSecrets,
            LoginProgress::Done => QrLoginStatus::Done,
        }
    }

    fn grant_status<Q>(
        &self,
        progress: GrantLoginProgress<Q>,
        map: impl Fn(Q) -> QrLoginStatus,
    ) -> QrLoginStatus {
        match progress {
            GrantLoginProgress::Starting => QrLoginStatus::Starting,
            GrantLoginProgress::EstablishingSecureChannel(q) => map(q),
            GrantLoginProgress::WaitingForAuth {
                verification_uri,
                continuation_sender,
            } => {
                *self.continuation.lock().unwrap() = Some(continuation_sender);
                QrLoginStatus::ApproveInBrowser {
                    url: verification_uri.to_string(),
                }
            }
            GrantLoginProgress::SyncingSecrets => QrLoginStatus::SyncingSecrets,
            GrantLoginProgress::Done => QrLoginStatus::Done,
        }
    }
}

fn scanned(progress: QrProgress) -> QrLoginStatus {
    QrLoginStatus::ShowCheckCode {
        code: progress.check_code,
    }
}

impl WizardClient {
    /// Signs this new device in through an existing one. With `scanned` (the other device's QR
    /// code bytes) it joins that code; otherwise it shows its own code to be scanned.
    pub async fn login_with_qr(
        server: &str,
        store: StoreConfig,
        app: AppInfo,
        scanned_code: Option<Vec<u8>>,
        control: QrLoginControl,
        mut on_status: impl FnMut(QrLoginStatus),
    ) -> Result<(Self, Session)> {
        let client = Self::build_client(server, &store).await?;
        let registration =
            registration_data(&app, ApplicationType::Web, vec![OAuthGrantType::DeviceCode])?;
        let oauth = client.oauth();
        let builder = oauth.login_with_qr_code(Some(&registration));
        let result = match scanned_code {
            Some(bytes) => {
                let data = parse_qr(&bytes)?;
                let login = builder.scan(&data);
                let progress = login.subscribe_to_progress();
                let report = progress.for_each(|p| {
                    on_status(control.login_status(p, scanned));
                    future::ready(())
                });
                let login = std::future::IntoFuture::into_future(login);
                pin_mut!(report, login);
                match future::select(login, report).await {
                    future::Either::Left((result, _)) => result,
                    future::Either::Right(((), login)) => login.await,
                }
            }
            None => {
                let login = builder.generate();
                let progress = login.subscribe_to_progress();
                let report = progress.for_each(|p| {
                    on_status(control.login_status(p, |q| control.generated(q)));
                    future::ready(())
                });
                let login = std::future::IntoFuture::into_future(login);
                pin_mut!(report, login);
                match future::select(login, report).await {
                    future::Either::Left((result, _)) => result,
                    future::Either::Right(((), login)) => login.await,
                }
            }
        };
        result.map_err(|e| Error::Sdk(e.to_string()))?;
        on_status(QrLoginStatus::Done);
        let this = Self::from_sdk(client);
        let session = this.session()?;
        Ok((this, session))
    }

    /// Lets a new device sign in to this account through this one.
    pub async fn grant_login_with_qr(
        &self,
        scanned_code: Option<Vec<u8>>,
        control: QrLoginControl,
        mut on_status: impl FnMut(QrLoginStatus),
    ) -> Result<()> {
        let oauth = self.sdk().oauth();
        let builder = oauth.grant_login_with_qr_code();
        let result = match scanned_code {
            Some(bytes) => {
                let data = parse_qr(&bytes)?;
                let grant = builder.scan(&data);
                let progress = grant.subscribe_to_progress();
                let report = progress.for_each(|p| {
                    on_status(control.grant_status(p, scanned));
                    future::ready(())
                });
                let grant = std::future::IntoFuture::into_future(grant);
                pin_mut!(report, grant);
                match future::select(grant, report).await {
                    future::Either::Left((result, _)) => result,
                    future::Either::Right(((), grant)) => grant.await,
                }
            }
            None => {
                let grant = builder.generate();
                let progress = grant.subscribe_to_progress();
                let report = progress.for_each(|p| {
                    on_status(control.grant_status(p, |q| control.generated(q)));
                    future::ready(())
                });
                let grant = std::future::IntoFuture::into_future(grant);
                pin_mut!(report, grant);
                match future::select(grant, report).await {
                    future::Either::Left((result, _)) => result,
                    future::Either::Right(((), grant)) => grant.await,
                }
            }
        };
        result.map_err(|e| Error::Sdk(e.to_string()))?;
        on_status(QrLoginStatus::Done);
        Ok(())
    }
}
