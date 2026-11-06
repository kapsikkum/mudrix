//! Signing in: `WizardClient`'s static methods, `PendingLogin` and `QrLoginControl`

use super::{Handle, Listener, Obj, PendingLoginCell};
use crate::{
    AppInfo, LoginIdentifier, QrLoginControl, QrLoginStatus, RegistrationInfo, ServerInfo, Session,
    StoreConfig, WizardClient,
};

rpc_methods! {
    WizardClient(this: WizardClient) {
        /// Signs in with a password. `server` may be a server name or a homeserver URL;
        /// `identifier` is a username (or full Matrix ID), or an email address or phone number
        /// bound to the account.
        bare fn loginPassword(
            server: String,
            identifier: LoginIdentifier,
            password: String,
            device_name: String,
            store: StoreConfig,
        ) -> Handle<WizardClient> {
            let (client, _) = WizardClient::login_with_identifier(
                &server,
                &identifier,
                &password,
                &device_name,
                store,
            )
            .await?;
            Ok(Handle::new(client))
        }

        /// Whether and how the server lets people register.
        bare fn registrationInfo(server: String) -> RegistrationInfo {
            WizardClient::sign_up_info(&server).await
        }

        bare fn usernameAvailable(server: String, username: String) -> bool {
            WizardClient::username_available(&server, &username).await
        }

        /// Creates an account and signs in.
        bare fn register(
            server: String,
            username: String,
            password: String,
            device_name: String,
            token: Option<String>,
            store: StoreConfig,
        ) -> Handle<WizardClient> {
            let (client, _) = WizardClient::create_account(
                &server,
                &username,
                &password,
                &device_name,
                token.as_deref(),
                store,
            )
            .await?;
            Ok(Handle::new(client))
        }

        /// Emails a reset link; returns the session id for `resetPassword`.
        bare fn requestPasswordReset(server: String, email: String, secret: String, attempt: u32) -> String {
            WizardClient::request_password_reset(&server, &email, &secret, attempt).await
        }

        bare fn resetPassword(
            server: String,
            new_password: String,
            secret: String,
            sid: String,
            logout_devices: bool,
        ) -> () {
            WizardClient::reset_password(&server, &new_password, &secret, &sid, logout_devices).await
        }

        /// Signs this new device in through an existing one (QR code). Pass the other device's
        /// code bytes to join it, or nothing to show a code of our own.
        bare fn loginWithQr(
            server: String,
            store: StoreConfig,
            app: AppInfo,
            scanned: Option<super::Bytes>,
            control: Obj<QrLoginControl>,
            listener: Listener<QrLoginStatus>,
        ) -> Handle<WizardClient> {
            let (client, _) = WizardClient::login_with_qr(
                &server,
                store,
                app,
                scanned.map(Into::into),
                (*control).clone(),
                |status| listener.emit(&status),
            )
            .await?;
            Ok(Handle::new(client))
        }

        /// Which sign-in methods a server offers, and what it runs. Fails with code `notMatrix` when
        /// the address answers but is not a Matrix server, and `homeserver` when it can't be reached.
        bare fn discover(server: String) -> ServerInfo {
            WizardClient::discover(&server).await
        }

        bare fn startOAuthLogin(
            server: String,
            store: StoreConfig,
            redirect_uri: String,
            app: AppInfo,
            create_account: Option<bool>,
            known_clients: Option<std::collections::HashMap<String, String>>,
        ) -> Handle<PendingLoginCell> {
            let login = WizardClient::start_oauth_login(
                &server,
                store,
                &redirect_uri,
                app,
                create_account.unwrap_or(false),
                known_clients.unwrap_or_default(),
            )
            .await?;
            Ok(Handle::new(PendingLoginCell::new(login)))
        }

        bare fn startSsoLogin(
            server: String,
            store: StoreConfig,
            redirect_uri: String,
            idp_id: Option<String>,
        ) -> Handle<PendingLoginCell> {
            let login =
                WizardClient::start_sso_login(&server, store, &redirect_uri, idp_id.as_deref()).await?;
            Ok(Handle::new(PendingLoginCell::new(login)))
        }

        /// Ends a stored session on the server without restoring it (when restoring failed).
        bare fn logoutSession(session: Session) -> () {
            WizardClient::logout_session(session).await
        }

        /// Restores a session previously returned by `session()`.
        bare fn restore(session: Session, store: StoreConfig) -> Handle<WizardClient> {
            Ok(Handle::new(WizardClient::restore(session, store).await?))
        }
    }
}

pub(super) mod pending {
    use super::*;

    rpc_methods! {
        PendingLogin(this: PendingLoginCell) {
            /// Where to send the user (the server's sign-in page)
            prop fn url() -> String {
                Ok(this.url().to_owned())
            }

            /// Completes the sign-in with the URL the server redirected back to.
            call fn finish(callback_url: String, device_name: String) -> Handle<WizardClient> {
                let (client, _) = this.take()?.finish(&callback_url, &device_name).await?;
                Ok(Handle::new(client))
            }

            call fn abort() -> () {
                if let Ok(login) = this.take() {
                    login.abort().await;
                }
                Ok(())
            }
        }
    }
}

pub(super) mod qr {
    use super::*;

    rpc_methods! {
        QrLoginControl(this: QrLoginControl) {
            bare fn new() -> Handle<QrLoginControl> {
                Ok(Handle::new(QrLoginControl::default()))
            }

            call fn sendCheckCode(code: u8) -> () {
                this.send_check_code(code).await
            }

            /// The new device was approved in the browser.
            call fn confirm() -> () {
                this.confirm().await
            }

            call fn cancel() -> () {
                this.cancel().await
            }
        }
    }
}
