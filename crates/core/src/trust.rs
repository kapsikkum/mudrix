//! Trust in other people and devices: verifying them, identity changes in rooms, and
//! resetting the own identity.

use futures_util::{future, pin_mut, stream, StreamExt};
use matrix_sdk::encryption::{recovery::RecoveryError, CrossSigningResetAuthType};
use matrix_sdk_crypto::IdentityState;
use serde::Serialize;

use crate::{
    encryption::VerificationFlow, rooms::parse_user_id, Error, Result, UiaAuth, UiaOutcome,
    WizardClient,
};

/// What is known about someone's cryptographic identity
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UserTrust {
    pub has_identity: bool,
    pub verified: bool,
    /// Their identity changed after it was verified (serious)
    pub verification_violation: bool,
}

/// Someone in a room whose identity changed
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct IdentityChange {
    pub user_id: String,
    /// `verified`, `pinned`, `pinViolation` or `verificationViolation`
    pub state: String,
}

impl WizardClient {
    pub async fn user_trust(&self, user_id: &str) -> Result<UserTrust> {
        let user = parse_user_id(user_id)?;
        let identity = self
            .sdk()
            .encryption()
            .request_user_identity(user)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        Ok(match identity {
            Some(identity) => UserTrust {
                has_identity: true,
                verified: identity.is_verified(),
                verification_violation: identity.has_verification_violation(),
            },
            None => UserTrust {
                has_identity: false,
                verified: false,
                verification_violation: false,
            },
        })
    }

    /// Starts emoji verification with another person.
    pub async fn request_user_verification(&self, user_id: &str) -> Result<VerificationFlow> {
        let user = parse_user_id(user_id)?;
        let identity = self
            .sdk()
            .encryption()
            .request_user_identity(user)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
            .ok_or_else(|| Error::Sdk("they haven't set up cross-signing".into()))?;
        let request = identity
            .request_verification()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        Ok(VerificationFlow::from_request(request))
    }

    /// Starts emoji verification with one of the own other devices.
    pub async fn request_device_verification(&self, device_id: &str) -> Result<VerificationFlow> {
        let user = self.sdk().user_id().ok_or(Error::NotSignedIn)?.to_owned();
        let device = self
            .sdk()
            .encryption()
            .get_device(&user, device_id.into())
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
            .ok_or_else(|| Error::InvalidId("unknown device".into()))?;
        let request = device
            .request_verification()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        Ok(VerificationFlow::from_request(request))
    }

    /// Accepts someone's new identity (after it changed), or stops trusting a verified one
    /// that changed, so messages can be sent again.
    pub async fn acknowledge_identity(&self, user_id: &str) -> Result<()> {
        let user = parse_user_id(user_id)?;
        let identity = self
            .sdk()
            .encryption()
            .get_user_identity(user)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
            .ok_or_else(|| Error::Sdk("unknown identity".into()))?;
        if identity.has_verification_violation() {
            identity
                .withdraw_verification()
                .await
                .map_err(|e| Error::Sdk(e.to_string()))?;
        } else {
            identity
                .pin()
                .await
                .map_err(|e| Error::Sdk(e.to_string()))?;
        }
        Ok(())
    }

    /// Reports the users whose devices or cryptographic identity changed, including trust
    /// changes made on other devices.
    pub async fn watch_trust_changes(&self, mut on_change: impl FnMut(Vec<String>)) -> Result<()> {
        let encryption = self.sdk().encryption();
        let devices = encryption
            .devices_stream()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
            .map(|u| {
                u.new
                    .into_keys()
                    .chain(u.changed.into_keys())
                    .collect::<Vec<_>>()
            });
        let identities = encryption
            .user_identities_stream()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
            .map(|u| {
                u.new
                    .into_keys()
                    .chain(u.changed.into_keys())
                    .collect::<Vec<_>>()
            });
        let changes = stream::select(devices, identities);
        pin_mut!(changes);
        while let Some(mut users) = changes.next().await {
            users.dedup();
            if !users.is_empty() {
                on_change(users.into_iter().map(|u| u.to_string()).collect());
            }
        }
        Ok(())
    }

    /// Reports room members whose identity changed (to warn above the composer).
    pub async fn watch_identity_changes(
        &self,
        room_id: &str,
        mut on_change: impl FnMut(Vec<IdentityChange>),
    ) -> Result<()> {
        let room = self.room(room_id)?;
        let stream = room
            .subscribe_to_identity_status_changes()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        futures_util::pin_mut!(stream);
        while let Some(changes) = stream.next().await {
            on_change(
                changes
                    .into_iter()
                    .map(|c| IdentityChange {
                        user_id: c.user_id.to_string(),
                        state: match c.changed_to {
                            IdentityState::Verified => "verified",
                            IdentityState::Pinned => "pinned",
                            IdentityState::PinViolation => "pinViolation",
                            IdentityState::VerificationViolation => "verificationViolation",
                        }
                        .to_owned(),
                    })
                    .collect(),
            );
        }
        Ok(())
    }

    /// Starts over with a new identity and key backup when every device and the recovery key
    /// are lost. Needs the password, or approval at `on_approval_url` on OAuth servers. Old
    /// encrypted messages stay unreadable.
    pub async fn reset_identity(
        &self,
        password: Option<&str>,
        on_approval_url: impl FnMut(String),
    ) -> Result<()> {
        let auth = password.map(|password| UiaAuth::Password {
            password: password.to_owned(),
            session: None,
        });
        match self.reset_identity_with_auth(auth, on_approval_url).await? {
            UiaOutcome::Done => Ok(()),
            UiaOutcome::AuthRequired { .. } => Err(Error::PasswordRequired),
        }
    }

    /// Like [`Self::reset_identity`], but reports what the server asks for to confirm (the
    /// password, or single sign-on on its page) instead of failing. On OAuth servers it waits
    /// for approval at `on_approval_url` until done or [`Self::cancel_identity_reset`].
    pub async fn reset_identity_with_auth(
        &self,
        auth: Option<UiaAuth>,
        mut on_approval_url: impl FnMut(String),
    ) -> Result<UiaOutcome> {
        let (cancel, cancelled) = futures_channel::oneshot::channel::<()>();
        *self.identity_reset_cancel.lock().unwrap() = Some(cancel);
        // A key query racing the reset can bring back the old identity and make the device
        // drop its new private keys; keep sync quiet until the new keys are on the server. Only
        // asking what the server wants (no auth yet, no OAuth approval to wait for) uploads nothing
        let uploads = auth.is_some() || self.sdk().oauth().client_id().is_some();
        let resume_sync = uploads && self.is_syncing();
        if uploads {
            self.stop_sync().await;
        }
        let reset = self.reset_identity_inner(auth, &mut on_approval_url);
        pin_mut!(reset);
        let result = match future::select(reset, cancelled).await {
            future::Either::Left((result, _)) => result,
            future::Either::Right((Ok(()), _)) => {
                Err(Error::Sdk("identity reset cancelled".into()))
            }
            future::Either::Right((Err(_), reset)) => reset.await,
        };
        self.identity_reset_cancel.lock().unwrap().take();
        if resume_sync {
            self.start_sync().await?;
        }
        result
    }

    /// Stops a running identity reset (the user closed the approval or sign-on step).
    pub fn cancel_identity_reset(&self) {
        if let Some(cancel) = self.identity_reset_cancel.lock().unwrap().take() {
            let _ = cancel.send(());
        }
    }

    async fn reset_identity_inner(
        &self,
        auth: Option<UiaAuth>,
        on_approval_url: &mut impl FnMut(String),
    ) -> Result<UiaOutcome> {
        let recovery = self.sdk().encryption().recovery();
        let Some(handle) = recovery.reset_identity().await? else {
            return Ok(UiaOutcome::Done);
        };
        let auth = match handle.auth_type() {
            CrossSigningResetAuthType::Uiaa(info) => {
                let Some(auth) = auth else {
                    return Ok(self.uia_challenge(info));
                };
                let auth = match auth {
                    UiaAuth::Password { password, session } => UiaAuth::Password {
                        password,
                        session: session.or_else(|| info.session.clone()),
                    },
                    fallback => fallback,
                };
                Some(self.uia_auth_data(auth)?)
            }
            CrossSigningResetAuthType::OAuth(info) => {
                on_approval_url(info.approval_url.to_string());
                None
            }
        };
        let password = matches!(
            &auth,
            Some(matrix_sdk::ruma::api::client::uiaa::AuthData::Password(_))
        );
        match handle.reset(auth).await {
            Ok(()) => Ok(UiaOutcome::Done),
            Err(RecoveryError::Sdk(error)) => match error.as_uiaa_response() {
                Some(_) if password => Err(Error::InvalidCredentials),
                Some(info) => Ok(self.uia_challenge(info)),
                None => Err(error.into()),
            },
            Err(other) => Err(other.into()),
        }
    }
}
