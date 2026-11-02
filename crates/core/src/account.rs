//! The account itself: registering, passwords, email addresses, deactivation and
//! extended profile fields.

use matrix_sdk::{
    ruma::{
        api::client::{
            account::{
                change_password, get_username_availability, register,
                request_password_change_token_via_email,
            },
            discovery::discover_homeserver,
            uiaa::{AuthData, FallbackAcknowledgement, UiaaInfo},
        },
        thirdparty::Medium,
        ClientSecret, OwnedClientSecret, OwnedDeviceId, OwnedSessionId, UInt,
    },
    Client,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{Error, Result, Session, StoreConfig, WizardClient};

/// An email address on the account
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ThirdPartyId {
    pub medium: String,
    pub address: String,
    pub validated_at: u64,
}

/// What the server asks for when registering
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RegistrationInfo {
    pub enabled: bool,
    /// Each flow is a list of steps such as `m.login.dummy`, `m.login.terms`,
    /// `m.login.email.identity`, `m.login.recaptcha` or `m.login.registration_token`
    pub flows: Vec<Vec<String>>,
    /// Terms to accept: (name, url)
    pub terms: Vec<(String, String)>,
}

/// How the user confirms an operation the server protects with user-interactive auth
#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UiaAuth {
    /// The account password, for the `session` the server started
    Password {
        password: String,
        session: Option<String>,
    },
    /// The user finished a stage on the server's own page (`ssoUrl`) for this session
    Fallback { session: String },
}

/// The result of an operation protected by user-interactive auth
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum UiaOutcome {
    Done,
    /// The server wants the user to confirm: retry with a [`UiaAuth`]
    #[serde(rename_all = "camelCase")]
    AuthRequired {
        session: Option<String>,
        /// Each flow is a list of stages, like `m.login.password` or `m.login.sso`
        flows: Vec<Vec<String>>,
        /// The server's page for the single sign-on stage, when a flow offers it; once the
        /// user is done there, retry with a `fallback` auth
        sso_url: Option<String>,
    },
}

const BANNER_FIELD: &str = "m.banner_url";
const BANNER_FIELD_UNSTABLE: &str = "chat.commet.profile_banner";

fn auth(value: Value) -> Result<AuthData> {
    serde_json::from_value(value).map_err(|e| Error::Sdk(e.to_string()))
}

fn client_secret(secret: &str) -> Result<OwnedClientSecret> {
    <&ClientSecret>::try_from(secret)
        .map(ToOwned::to_owned)
        .map_err(|e| Error::InvalidId(e.to_string()))
}

async fn plain_client(server: &str) -> Result<Client> {
    Client::builder()
        .server_name_or_homeserver_url(server)
        .build()
        .await
        .map_err(|e| Error::Homeserver(e.to_string()))
}

fn uiaa_of(error: &matrix_sdk::HttpError) -> Option<&UiaaInfo> {
    error.as_uiaa_response()
}

impl WizardClient {
    /// Whether a username can be registered on the server.
    pub async fn username_available(server: &str, username: &str) -> Result<bool> {
        let client = plain_client(server).await?;
        match client
            .send(get_username_availability::v3::Request::new(
                username.to_owned(),
            ))
            .await
        {
            Ok(response) => Ok(response.available),
            // M_USER_IN_USE means taken; M_INVALID_USERNAME and M_EXCLUSIVE come back as errors
            Err(e)
                if matches!(
                    e.client_api_error_kind(),
                    Some(matrix_sdk::ruma::api::error::ErrorKind::UserInUse)
                ) =>
            {
                Ok(false)
            }
            Err(e) => Err(e.into()),
        }
    }

    /// Whether and how the server lets people register.
    pub async fn registration_info(server: &str) -> Result<RegistrationInfo> {
        let client = plain_client(server).await?;
        match client.send(register::v3::Request::new()).await {
            Ok(_) => Ok(RegistrationInfo {
                enabled: true,
                flows: Vec::new(),
                terms: Vec::new(),
            }),
            Err(error) => match uiaa_of(&error) {
                Some(info) => {
                    let params: Value =
                        serde_json::from_str(info.params.as_ref().map(|p| p.get()).unwrap_or("{}"))
                            .unwrap_or_default();
                    let terms = params
                        .pointer("/m.login.terms/policies")
                        .and_then(Value::as_object)
                        .map(|policies| {
                            policies
                                .values()
                                .filter_map(|p| {
                                    let en = p.get("en").or_else(|| {
                                        p.as_object()?.values().find(|v| v.is_object())
                                    })?;
                                    Some((
                                        en.get("name")?.as_str()?.to_owned(),
                                        en.get("url")?.as_str()?.to_owned(),
                                    ))
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    Ok(RegistrationInfo {
                        enabled: true,
                        flows: info
                            .flows
                            .iter()
                            .map(|f| f.stages.iter().map(|s| s.as_str().to_owned()).collect())
                            .collect(),
                        terms,
                    })
                }
                None => Ok(RegistrationInfo {
                    enabled: !matches!(
                        error.client_api_error_kind(),
                        Some(matrix_sdk::ruma::api::error::ErrorKind::Forbidden)
                    ),
                    flows: Vec::new(),
                    terms: Vec::new(),
                }),
            },
        }
    }

    /// Creates an account and signs in. Handles the dummy and terms steps; `token` answers a
    /// registration-token step.
    pub async fn register(
        server: &str,
        username: &str,
        password: &str,
        device_name: &str,
        token: Option<&str>,
        store: StoreConfig,
    ) -> Result<(Self, Session)> {
        let client = Self::build_client(server, &store).await?;
        let request = |auth: Option<AuthData>| {
            let mut request = register::v3::Request::new();
            request.username = Some(username.to_owned());
            request.password = Some(password.to_owned());
            request.initial_device_display_name = Some(device_name.to_owned());
            request.auth = auth;
            request
        };
        let mut attempt = client.matrix_auth().register(request(None)).await;
        for _ in 0..4 {
            let Err(error) = &attempt else { break };
            let Some(info) = error.as_uiaa_response() else {
                break;
            };
            let flow = info
                .flows
                .iter()
                .find(|f| {
                    f.stages.iter().all(|s| {
                        matches!(s.as_str(), "m.login.dummy" | "m.login.terms")
                            || (s.as_str() == "m.login.registration_token" && token.is_some())
                    })
                })
                .ok_or_else(|| Error::Sdk("this server needs a step WizardChat can't do here (like a captcha or email); register on the server's website".into()))?;
            let next = flow
                .stages
                .iter()
                .find(|s| !info.completed.contains(s))
                .ok_or_else(|| Error::Sdk("registration stuck".into()))?;
            let mut data = json!({ "type": next.as_str(), "session": info.session });
            if next.as_str() == "m.login.registration_token" {
                data["token"] = json!(token);
            }
            attempt = client
                .matrix_auth()
                .register(request(Some(auth(data)?)))
                .await;
        }
        attempt?;
        let this = Self::from_sdk(client);
        let session = this.session()?;
        Ok((this, session))
    }

    /// Emails a password reset link; returns the session id for `reset_password`.
    pub async fn request_password_reset(
        server: &str,
        email: &str,
        secret: &str,
        attempt: u32,
    ) -> Result<String> {
        let client = plain_client(server).await?;
        let request = request_password_change_token_via_email::v3::Request::new(
            client_secret(secret)?,
            email.to_owned(),
            UInt::from(attempt),
        );
        Ok(client.send(request).await?.sid.to_string())
    }

    /// Sets a new password after the email link was opened.
    pub async fn reset_password(
        server: &str,
        new_password: &str,
        secret: &str,
        sid: &str,
        logout_devices: bool,
    ) -> Result<()> {
        let client = plain_client(server).await?;
        let mut request = change_password::v3::Request::new(new_password.to_owned());
        request.logout_devices = logout_devices;
        request.auth = Some(auth(json!({
            "type": "m.login.email.identity",
            "threepid_creds": { "sid": sid, "client_secret": secret },
        }))?);
        client.send(request).await?;
        Ok(())
    }

    /// Runs a request that may need the account password confirmed.
    async fn with_password<T, F, Fut>(&self, password: Option<&str>, run: F) -> Result<T>
    where
        F: Fn(Option<AuthData>) -> Fut,
        Fut: std::future::Future<Output = matrix_sdk::Result<T>>,
    {
        let first = run(None).await;
        let Err(error) = first else {
            return Ok(first.unwrap());
        };
        let Some(info) = error.as_uiaa_response() else {
            return Err(error.into());
        };
        let Some(password) = password else {
            return Err(Error::PasswordRequired);
        };
        let user = self.sdk().user_id().ok_or(Error::NotSignedIn)?.to_string();
        let data = auth(json!({
            "type": "m.login.password",
            "identifier": { "type": "m.id.user", "user": user },
            "password": password,
            "session": info.session,
        }))?;
        run(Some(data)).await.map_err(|e| {
            if e.as_uiaa_response().is_some() {
                Error::InvalidCredentials
            } else {
                e.into()
            }
        })
    }

    pub(crate) fn uia_auth_data(&self, auth: UiaAuth) -> Result<AuthData> {
        Ok(match auth {
            UiaAuth::Password { password, session } => {
                let user = self.sdk().user_id().ok_or(Error::NotSignedIn)?.to_string();
                self::auth(json!({
                    "type": "m.login.password",
                    "identifier": { "type": "m.id.user", "user": user },
                    "password": password,
                    "session": session,
                }))?
            }
            UiaAuth::Fallback { session } => {
                AuthData::FallbackAcknowledgement(FallbackAcknowledgement::new(session))
            }
        })
    }

    /// What to ask the user for, from the server's auth response
    pub(crate) fn uia_challenge(&self, info: &UiaaInfo) -> UiaOutcome {
        let flows: Vec<Vec<String>> = info
            .flows
            .iter()
            .map(|f| f.stages.iter().map(|s| s.as_str().to_owned()).collect())
            .collect();
        let sso_stage = flows
            .iter()
            .flatten()
            .find(|s| matches!(s.as_str(), "m.login.sso" | "org.matrix.login.sso"));
        let sso_url = sso_stage
            .zip(info.session.as_ref())
            .and_then(|(stage, session)| {
                let mut url = self
                    .sdk()
                    .homeserver()
                    .join(&format!("_matrix/client/v3/auth/{stage}/fallback/web"))
                    .ok()?;
                url.query_pairs_mut().append_pair("session", session);
                Some(url.to_string())
            });
        UiaOutcome::AuthRequired {
            session: info.session.clone(),
            flows,
            sso_url,
        }
    }

    /// Runs a request the server may protect with user-interactive auth: first as given (no
    /// auth tries without), then reports what the server asks for instead of failing.
    pub(crate) async fn with_uia<T, F, Fut>(
        &self,
        auth: Option<UiaAuth>,
        run: F,
    ) -> Result<UiaOutcome>
    where
        F: FnOnce(Option<AuthData>) -> Fut,
        Fut: std::future::Future<Output = matrix_sdk::Result<T>>,
    {
        let with_password = matches!(auth, Some(UiaAuth::Password { .. }));
        let data = auth.map(|a| self.uia_auth_data(a)).transpose()?;
        let Err(error) = run(data).await else {
            return Ok(UiaOutcome::Done);
        };
        let Some(info) = error.as_uiaa_response() else {
            return Err(error.into());
        };
        let password_done = info
            .completed
            .iter()
            .any(|s| s.as_str() == "m.login.password");
        if with_password && !password_done {
            return Err(Error::InvalidCredentials);
        }
        Ok(self.uia_challenge(info))
    }

    /// Changes the password; with no `auth` it first tries without confirmation.
    pub async fn change_password_with_auth(
        &self,
        new_password: &str,
        auth: Option<UiaAuth>,
    ) -> Result<UiaOutcome> {
        let account = self.sdk().account();
        self.with_uia(auth, |auth| account.change_password(new_password, auth))
            .await
    }

    pub async fn deactivate_account_with_auth(
        &self,
        erase: bool,
        auth: Option<UiaAuth>,
    ) -> Result<UiaOutcome> {
        let account = self.sdk().account();
        self.with_uia(auth, |auth| account.deactivate(None, auth, erase))
            .await
    }

    pub async fn delete_devices_with_auth(
        &self,
        device_ids: &[String],
        auth: Option<UiaAuth>,
    ) -> Result<UiaOutcome> {
        let ids: Vec<OwnedDeviceId> = device_ids.iter().map(|id| id.as_str().into()).collect();
        let client = self.sdk();
        self.with_uia(auth, |auth| async move {
            client
                .delete_devices(&ids, auth)
                .await
                .map_err(matrix_sdk::Error::from)
        })
        .await
    }

    /// Adds the email once it's confirmed. With `token` (the code from the email) and no
    /// `auth`, the first attempt sends the code along.
    pub async fn add_email_with_auth(
        &self,
        secret: &str,
        sid: &str,
        token: Option<&str>,
        auth: Option<UiaAuth>,
    ) -> Result<UiaOutcome> {
        let secret = client_secret(secret)?;
        let sid = OwnedSessionId::try_from(sid).map_err(|e| Error::InvalidId(e.to_string()))?;
        let account = self.sdk().account();
        if let (Some(token), None) = (token.filter(|t| !t.trim().is_empty()), &auth) {
            let data = self::auth(json!({ "type": "m.email.identity", "token": token.trim() }))?;
            match account.add_3pid(&secret, &sid, Some(data)).await {
                Ok(_) => return Ok(UiaOutcome::Done),
                Err(error) => {
                    if let Some(info) = error.as_uiaa_response() {
                        return Ok(self.uia_challenge(info));
                    }
                }
            }
        }
        self.with_uia(auth, |auth| account.add_3pid(&secret, &sid, auth))
            .await
    }

    /// The server's account page for removing a device, on servers with next-generation auth
    pub async fn device_management_url(&self, device_id: &str) -> Option<String> {
        const ACTIONS: [&str; 4] = [
            "org.matrix.device_delete",
            "org.matrix.device_view",
            "org.matrix.session_view",
            "session_view",
        ];
        let metadata = self.sdk().oauth().server_metadata().await.ok()?;
        let mut url = metadata.account_management_uri?;
        let supported: Vec<&str> = metadata
            .account_management_actions_supported
            .iter()
            .map(|a| a.as_str())
            .collect();
        let action = ACTIONS
            .into_iter()
            .find(|a| supported.is_empty() || supported.contains(a))
            .unwrap_or(ACTIONS[0]);
        url.query_pairs_mut()
            .append_pair("action", action)
            .append_pair("device_id", device_id);
        Some(url.to_string())
    }

    /// The homeserver URL the server name's `.well-known` file points to, if it has one
    pub async fn well_known_homeserver_url(&self) -> Option<String> {
        let server = self.sdk().user_id()?.server_name().to_owned();
        let client = Client::builder()
            .homeserver_url(format!("https://{server}"))
            .build()
            .await
            .ok()?;
        let response = client
            .send(discover_homeserver::Request::new())
            .await
            .ok()?;
        Some(response.homeserver.base_url)
    }

    pub async fn change_password(&self, current: &str, new_password: &str) -> Result<()> {
        let account = self.sdk().account();
        self.with_password(Some(current), |auth| {
            account.change_password(new_password, auth)
        })
        .await?;
        Ok(())
    }

    /// Deactivates the account for good; `erase` also asks the server to forget its messages.
    pub async fn deactivate_account(&self, password: Option<&str>, erase: bool) -> Result<()> {
        let account = self.sdk().account();
        self.with_password(password, |auth| account.deactivate(None, auth, erase))
            .await?;
        Ok(())
    }

    pub async fn email_addresses(&self) -> Result<Vec<ThirdPartyId>> {
        Ok(self
            .sdk()
            .account()
            .get_3pids()
            .await?
            .threepids
            .into_iter()
            .map(|t| ThirdPartyId {
                medium: t.medium.as_str().to_owned(),
                address: t.address,
                validated_at: t.validated_at.0.into(),
            })
            .collect())
    }

    /// Sends a verification email; returns the session id for `add_email`.
    pub async fn request_email_token(
        &self,
        email: &str,
        secret: &str,
        attempt: u32,
    ) -> Result<String> {
        let response = self
            .sdk()
            .account()
            .request_3pid_email_token(&client_secret(secret)?, email, UInt::from(attempt))
            .await?;
        Ok(response.sid.to_string())
    }

    pub async fn remove_email(&self, address: &str) -> Result<()> {
        self.sdk()
            .account()
            .delete_3pid(address, Medium::Email, None)
            .await?;
        Ok(())
    }

    /// Any extended profile field of a user (MSC4133), like `m.banner_url`.
    pub async fn profile_field(&self, user_id: &str, field: &str) -> Result<Option<Value>> {
        let id = crate::rooms::parse_user_id(user_id)?.to_owned();
        let profile = self.sdk().account().fetch_user_profile_of(&id).await?.data;
        Ok(profile.get(field).cloned())
    }

    pub async fn set_profile_field(&self, field: &str, value: Value) -> Result<()> {
        use matrix_sdk::ruma::profile::ProfileFieldValue;
        let value = ProfileFieldValue::new(field, value).map_err(|e| Error::Sdk(e.to_string()))?;
        self.sdk().account().set_profile_field(value).await?;
        Ok(())
    }

    pub async fn delete_profile_field(&self, field: &str) -> Result<()> {
        use matrix_sdk::ruma::profile::ProfileFieldName;
        self.sdk()
            .account()
            .delete_profile_field(ProfileFieldName::from(field))
            .await?;
        Ok(())
    }

    /// A user's profile banner (`mxc://`), from the stable or older field.
    pub async fn banner(&self, user_id: &str) -> Result<Option<String>> {
        let id = crate::rooms::parse_user_id(user_id)?.to_owned();
        let profile = self.sdk().account().fetch_user_profile_of(&id).await?.data;
        Ok([BANNER_FIELD, BANNER_FIELD_UNSTABLE]
            .iter()
            .find_map(|f| profile.get(f)?.as_str().map(ToOwned::to_owned)))
    }

    /// Uploads and sets a banner; `None` removes it.
    pub async fn set_banner(&self, image: Option<(Vec<u8>, String)>) -> Result<()> {
        match image {
            Some((data, mimetype)) => {
                let mxc = self.upload_media(data, &mimetype).await?;
                self.set_profile_field(BANNER_FIELD, json!(mxc)).await
            }
            None => {
                let removed = self.delete_profile_field(BANNER_FIELD).await;
                let _ = self.delete_profile_field(BANNER_FIELD_UNSTABLE).await;
                removed
            }
        }
    }
}

/// What the homeserver says it supports
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ServerFeatures {
    pub versions: Vec<String>,
    /// Unstable features it has switched on, like `org.matrix.msc4380`
    pub unstable_features: Vec<String>,
}

impl WizardClient {
    pub async fn server_features(&self) -> Result<ServerFeatures> {
        let versions = self.sdk().server_versions().await?;
        let unstable = self.sdk().unstable_features().await?;
        Ok(ServerFeatures {
            versions: versions
                .iter()
                .filter_map(|v| v.as_str().map(ToOwned::to_owned))
                .collect(),
            unstable_features: unstable.iter().map(|f| f.as_ref().to_owned()).collect(),
        })
    }
}
