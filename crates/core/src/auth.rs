use std::collections::HashMap;

use matrix_sdk::{
    authentication::oauth::{
        registration::{ApplicationType, ClientMetadata, Localized, OAuthGrantType},
        ClientId, ClientRegistrationData, CsrfToken,
    },
    ruma::{
        api::{
            client::{
                account::register, discovery::get_authorization_server_metadata::v1::GrantType,
                session::get_login_types::v3::LoginType, uiaa::AuthData,
            },
            error::FromHttpResponseError,
            FeatureFlag,
        },
        serde::Raw,
        OwnedDeviceId,
    },
    utils::UrlOrQuery,
    Client, SessionChange,
};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{Error, RegistrationInfo, Result, Session, StoreConfig, WizardClient};

/// How a homeserver lets people sign in
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub homeserver_url: String,
    /// Next-generation auth (MSC3861): sign-in happens on the server's own page
    pub oauth: bool,
    pub password: bool,
    pub sso: Vec<IdentityProvider>,
    /// Signing in by scanning a QR code with another device (MSC4108) works with this server
    pub qr_login: bool,
    /// The server name that was asked about (as typed, without scheme or path)
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub server_name: Option<String>,
    /// What the server says it runs, asked over federation. Missing when it can't be asked
    /// (a browser can only ask servers that allow cross-site requests) or hides it.
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub software: Option<crate::HomeserverSoftware>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct IdentityProvider {
    /// `None` for the server's generic SSO without a provider list
    pub id: Option<String>,
    pub name: String,
    pub icon: Option<String>,
}

/// Who is signing in with a password: a username (or full Matrix ID), or an email address or
/// phone number bound to the account
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LoginIdentifier {
    /// `name` or `@name:server`
    User {
        user: String,
    },
    Email {
        address: String,
    },
    /// With the country code, in any format (`+49 151 234567`): only the digits count
    Phone {
        number: String,
    },
}

impl LoginIdentifier {
    pub(crate) fn to_user_identifier(
        &self,
    ) -> Result<matrix_sdk::ruma::api::client::uiaa::UserIdentifier> {
        use matrix_sdk::ruma::api::client::uiaa::{
            EmailUserIdentifier, MatrixUserIdentifier, MsisdnUserIdentifier, UserIdentifier,
        };
        let empty = |what: &str| Error::InvalidId(format!("empty {what}"));
        Ok(match self {
            Self::User { user } => {
                let user = user.trim();
                if user.is_empty() {
                    return Err(empty("username"));
                }
                UserIdentifier::Matrix(MatrixUserIdentifier::new(user.to_owned()))
            }
            Self::Email { address } => {
                let address = address.trim();
                if address.is_empty() {
                    return Err(empty("email address"));
                }
                UserIdentifier::Email(EmailUserIdentifier::new(address.to_owned()))
            }
            Self::Phone { number } => {
                let digits: String = number.chars().filter(char::is_ascii_digit).collect();
                if digits.is_empty() {
                    return Err(empty("phone number"));
                }
                UserIdentifier::Msisdn(MsisdnUserIdentifier::new(digits))
            }
        })
    }
}

/// How the app presents itself on the server's sign-in page
#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub client_uri: String,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub logo_uri: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub policy_uri: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub tos_uri: Option<String>,
}

/// Something that changed about the signed-in session
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionEvent {
    /// Tokens were refreshed: store the new session
    Refreshed { session: Session },
    /// The server no longer accepts the session (signed out elsewhere)
    #[serde(rename_all = "camelCase")]
    Invalid { soft_logout: bool },
}

/// Whether a site that answered the .well-known request with this error status, and has no
/// Matrix server at its root either, isn't Matrix: a client error says so, a gateway error or a
/// busy server may be a Matrix server that is down.
fn is_not_matrix_status(status: u16) -> bool {
    matches!(status, 400..=499) && !matches!(status, 408 | 429)
}

/// Whether the server's /_matrix/client/versions answers like a Matrix server.
async fn answers_versions(server: &str) -> bool {
    let server = server.trim().trim_end_matches('/');
    let base = if server.contains("://") {
        server.to_owned()
    } else {
        format!("https://{server}")
    };
    crate::homeserver::fetch_json(&format!("{base}/_matrix/client/versions"))
        .await
        .is_some_and(|body| {
            body.get("versions")
                .is_some_and(serde_json::Value::is_array)
        })
}

fn parse_url(url: &str) -> Result<Url> {
    Url::parse(url).map_err(|e| Error::InvalidId(format!("url: {e}")))
}

/// A sign-in that continues in the browser (OAuth or SSO) and finishes with the redirect URL
pub struct PendingLogin {
    client: Client,
    url: String,
    kind: PendingKind,
}

enum PendingKind {
    OAuth { state: CsrfToken },
    Sso,
}

impl WizardClient {
    /// Finds out which sign-in methods a server offers and what it runs (without signing in).
    /// Fails with `wellKnownInvalid` when the server's `.well-known` points nowhere usable,
    /// `notMatrix` when the address answers but isn't a Matrix server, and `homeserver` when
    /// it can't be reached.
    pub async fn discover(server: &str) -> Result<ServerInfo> {
        let server_name = crate::homeserver::server_name_of(server);
        let software = async {
            match &server_name {
                Some(name) => crate::homeserver::lookup_quickly(name).await,
                None => None,
            }
        };
        let (info, software) =
            futures_util::future::join(Self::discover_sign_in(server), software).await;
        let mut info = info?;
        info.server_name = server_name;
        info.software = software;
        Ok(info)
    }

    async fn discover_sign_in(server: &str) -> Result<ServerInfo> {
        let client = match Client::builder()
            .server_name_or_homeserver_url(server)
            .build()
            .await
        {
            Ok(client) => client,
            Err(error) => return Err(Self::discovery_failure(server, error).await),
        };
        let metadata = client.oauth().server_metadata().await.ok();
        let oauth = metadata.is_some();
        // Needs the device authorization grant and the MSC4108 rendezvous
        let qr_login = match &metadata {
            Some(m) if m.grant_types_supported.contains(&GrantType::DeviceCode) => client
                .unstable_features()
                .await
                .is_ok_and(|f| f.contains(&FeatureFlag::from("org.matrix.msc4108"))),
            _ => false,
        };
        let login_types = match client.matrix_auth().get_login_types().await {
            Ok(response) => response.flows,
            Err(_) if oauth => Vec::new(),
            // Found through the .well-known, but the homeserver it names doesn't answer
            Err(_) if client.server().is_some() => return Err(Error::WellKnownInvalid),
            Err(error) => return Err(Error::Homeserver(error.to_string())),
        };
        let token_login = login_types.iter().any(|t| matches!(t, LoginType::Token(_)));
        let mut password = false;
        let mut sso = Vec::new();
        for login_type in login_types {
            match login_type {
                LoginType::Password(_) => password = true,
                // CAS servers redirect through the same SSO endpoints
                other if other.login_type() == "m.login.cas" => {
                    if sso.is_empty() {
                        sso.push(IdentityProvider {
                            id: None,
                            name: String::new(),
                            icon: None,
                        });
                    }
                }
                LoginType::Sso(sso_type) => {
                    if sso_type.identity_providers.is_empty() {
                        sso.push(IdentityProvider {
                            id: None,
                            name: String::new(),
                            icon: None,
                        });
                    }
                    sso.extend(sso_type.identity_providers.into_iter().map(|idp| {
                        IdentityProvider {
                            id: Some(idp.id),
                            name: idp.name,
                            icon: idp.icon.map(|icon| icon.to_string()),
                        }
                    }));
                }
                _ => {}
            }
        }
        Ok(ServerInfo {
            homeserver_url: client.homeserver().to_string(),
            // With next-generation auth the legacy flows only exist for compatibility
            password: password && !oauth,
            // SSO ends with a login token, so it needs token login too
            sso: if oauth || !token_login {
                Vec::new()
            } else {
                sso
            },
            oauth,
            qr_login,
            server_name: None,
            software: None,
        })
    }

    /// Why building a client for the server failed: no answer at all, a site that isn't
    /// Matrix, or a Matrix server whose .well-known is broken.
    async fn discovery_failure(server: &str, error: matrix_sdk::ClientBuildError) -> Error {
        use matrix_sdk::RumaApiError;
        let verdict = match &error {
            matrix_sdk::ClientBuildError::AutoDiscovery(failure) => match failure.as_ref() {
                // The site answered the .well-known request with something that isn't one. A
                // Matrix server with a broken file still answers /versions, other sites don't.
                FromHttpResponseError::Deserialization(_) => {
                    Some(if answers_versions(server).await {
                        Error::WellKnownInvalid
                    } else {
                        Error::NotMatrix
                    })
                }
                FromHttpResponseError::Server(RumaApiError::MatrixError(e)) => {
                    is_not_matrix_status(e.status_code.as_u16()).then_some(Error::NotMatrix)
                }
                _ => None,
            },
            _ => None,
        };
        verdict.unwrap_or_else(|| error.into())
    }

    /// Whether and how the server lets people register. Fails when the server can't tell (only
    /// a refusal means registration is closed), like when it's rate limited.
    pub async fn sign_up_info(server: &str) -> Result<RegistrationInfo> {
        let client = Client::builder()
            .server_name_or_homeserver_url(server)
            .build()
            .await
            .map_err(|e| Error::Homeserver(e.to_string()))?;
        match client.send(register::v3::Request::new()).await {
            Ok(_) => Ok(RegistrationInfo {
                enabled: true,
                flows: Vec::new(),
                terms: Vec::new(),
            }),
            Err(error) if error.as_uiaa_response().is_some() => {
                Self::registration_info(client.homeserver().as_str()).await
            }
            Err(error)
                if matches!(
                    error.client_api_error_kind(),
                    Some(matrix_sdk::ruma::api::error::ErrorKind::Forbidden)
                ) =>
            {
                Ok(RegistrationInfo {
                    enabled: false,
                    flows: Vec::new(),
                    terms: Vec::new(),
                })
            }
            Err(error) => Err(error.into()),
        }
    }

    /// Creates an account and signs in. Completes the dummy step, and a registration-token
    /// step with `token`; steps the user has to do (terms, captcha, email) make it fail.
    pub async fn create_account(
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
            request.refresh_token = true;
            request.auth = auth;
            request
        };
        let mut attempt = client.matrix_auth().register(request(None)).await;
        for _ in 0..3 {
            let Err(error) = &attempt else { break };
            let Some(info) = error.as_uiaa_response() else {
                break;
            };
            let flow = info
                .flows
                .iter()
                .find(|f| {
                    f.stages.iter().all(|s| {
                        s.as_str() == "m.login.dummy"
                            || (s.as_str() == "m.login.registration_token" && token.is_some())
                    })
                })
                .ok_or_else(|| {
                    Error::Sdk(
                        info.flows
                            .iter()
                            .map(|f| {
                                f.stages
                                    .iter()
                                    .map(|s| s.as_str())
                                    .collect::<Vec<_>>()
                                    .join(" -> ")
                            })
                            .collect::<Vec<_>>()
                            .join(", "),
                    )
                })?;
            let next = flow
                .stages
                .iter()
                .find(|s| !info.completed.contains(s))
                .ok_or_else(|| Error::Sdk("registration stuck".into()))?;
            let mut data = serde_json::json!({ "type": next.as_str(), "session": info.session });
            if next.as_str() == "m.login.registration_token" {
                data["token"] = serde_json::json!(token);
            }
            let auth = serde_json::from_value(data).map_err(|e| Error::Sdk(e.to_string()))?;
            attempt = client.matrix_auth().register(request(Some(auth))).await;
        }
        attempt?;
        // Servers that withhold the session on registration (`inhibit_login`) need a sign-in
        if client.matrix_auth().session().is_none() {
            client
                .matrix_auth()
                .login_username(username, password)
                .initial_device_display_name(device_name)
                .request_refresh_token()
                .await
                .map_err(Error::from_login)?;
        }
        let this = Self::from_sdk(client);
        let session = this.session()?;
        Ok((this, session))
    }

    /// Starts an OAuth sign-in: open `url()` (in a popup) and pass the redirect to `finish`.
    /// `known_clients` maps homeserver URLs to client IDs this app registered there before
    /// (from earlier sessions' `oauthClientId`), so it isn't registered again every time.
    pub async fn start_oauth_login(
        server: &str,
        store: StoreConfig,
        redirect_uri: &str,
        app: AppInfo,
        create_account: bool,
        known_clients: HashMap<String, String>,
    ) -> Result<PendingLogin> {
        let client = Self::build_client(server, &store).await?;
        let redirect = parse_url(redirect_uri)?;
        // Native apps receive the redirect on a loopback port that changes every time; servers
        // match such redirects to the registered URI ignoring the port (RFC 8252)
        let loopback = redirect.scheme() == "http"
            && matches!(
                redirect.host_str(),
                Some("127.0.0.1" | "[::1]" | "localhost")
            );
        let mut registered = redirect.clone();
        if loopback {
            let _ = registered.set_port(None);
        }
        // Mobile apps get the redirect on their own private-use scheme (`org.example:/callback`),
        // which is also a native redirect; only https redirects belong to web clients
        let application_type = if loopback || !matches!(redirect.scheme(), "http" | "https") {
            ApplicationType::Native
        } else {
            ApplicationType::Web
        };
        let mut registration = registration_data(
            &app,
            application_type,
            vec![OAuthGrantType::AuthorizationCode {
                redirect_uris: vec![registered],
            }],
        )?;
        let known: HashMap<Url, ClientId> = known_clients
            .into_iter()
            .filter_map(|(server, id)| Some((Url::parse(&server).ok()?, ClientId::new(id))))
            .collect();
        if !known.is_empty() {
            registration.static_registrations = Some(known);
        }
        use matrix_sdk::ruma::api::client::discovery::get_authorization_server_metadata::v1::Prompt;
        let oauth = client.oauth();
        let mut builder = oauth.login(redirect, None::<OwnedDeviceId>, Some(registration), None);
        if create_account {
            builder = builder.prompt(vec![Prompt::Create]);
        }
        let data = builder
            .build()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        Ok(PendingLogin {
            client,
            url: data.url.to_string(),
            kind: PendingKind::OAuth { state: data.state },
        })
    }

    /// Starts a legacy SSO sign-in with an optional identity provider.
    pub async fn start_sso_login(
        server: &str,
        store: StoreConfig,
        redirect_uri: &str,
        idp_id: Option<&str>,
    ) -> Result<PendingLogin> {
        let client = Self::build_client(server, &store).await?;
        let url = client
            .matrix_auth()
            .get_sso_login_url(redirect_uri, idp_id)
            .await?;
        Ok(PendingLogin {
            client,
            url,
            kind: PendingKind::Sso,
        })
    }

    pub(crate) fn session_of(client: &Client) -> Result<Session> {
        if let Some(session) = client.oauth().full_session() {
            return Ok(Session {
                homeserver_url: client.homeserver().to_string(),
                user_id: session.user.meta.user_id.to_string(),
                device_id: session.user.meta.device_id.to_string(),
                access_token: session.user.tokens.access_token,
                refresh_token: session.user.tokens.refresh_token,
                oauth_client_id: Some(session.client_id.as_str().to_owned()),
            });
        }
        let session = client.matrix_auth().session().ok_or(Error::NotSignedIn)?;
        Ok(Session {
            homeserver_url: client.homeserver().to_string(),
            user_id: session.meta.user_id.to_string(),
            device_id: session.meta.device_id.to_string(),
            access_token: session.tokens.access_token,
            refresh_token: session.tokens.refresh_token,
            oauth_client_id: None,
        })
    }

    /// Reports refreshed tokens (to persist) and sessions the server stopped accepting.
    pub async fn watch_session(&self, mut on_event: impl FnMut(SessionEvent)) {
        let mut changes = self.sdk().subscribe_to_session_changes();
        loop {
            match changes.recv().await {
                Ok(SessionChange::TokensRefreshed) => {
                    if let Ok(session) = self.session() {
                        on_event(SessionEvent::Refreshed { session });
                    }
                }
                Ok(SessionChange::UnknownToken(data)) => on_event(SessionEvent::Invalid {
                    soft_logout: data.soft_logout,
                }),
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    }

    /// Where the user manages their account on servers with next-generation auth.
    pub async fn account_management_url(&self) -> Option<String> {
        self.sdk()
            .oauth()
            .server_metadata()
            .await
            .ok()
            .and_then(|metadata| metadata.account_management_uri)
            .map(|url| url.to_string())
    }
}

impl PendingLogin {
    /// The page to open for signing in
    pub fn url(&self) -> &str {
        &self.url
    }

    /// Completes the sign-in with the URL the server redirected back to.
    pub async fn finish(
        self,
        callback_url: &str,
        device_name: &str,
    ) -> Result<(WizardClient, Session)> {
        let callback = parse_url(callback_url)?;
        match self.kind {
            PendingKind::OAuth { .. } => {
                self.client
                    .oauth()
                    .finish_login(UrlOrQuery::Url(callback))
                    .await
                    .map_err(|e| Error::Sdk(e.to_string()))?;
            }
            PendingKind::Sso => {
                let token = callback
                    .query_pairs()
                    .find(|(key, _)| key == "loginToken")
                    .map(|(_, value)| value.into_owned())
                    .ok_or_else(|| Error::Sdk("the redirect carries no login token".into()))?;
                self.client
                    .matrix_auth()
                    .login_token(&token)
                    .initial_device_display_name(device_name)
                    .request_refresh_token()
                    .await?;
            }
        }
        let client = WizardClient::from_sdk(self.client);
        let session = client.session()?;
        Ok((client, session))
    }

    /// Gives up on the sign-in (popup closed).
    pub async fn abort(self) {
        if let PendingKind::OAuth { state } = &self.kind {
            self.client.oauth().abort_login(state).await;
        }
    }
}

/// Our OAuth client registration, with the grant types a flow needs
pub(crate) fn registration_data(
    app: &AppInfo,
    application_type: ApplicationType,
    grant_types: Vec<OAuthGrantType>,
) -> Result<ClientRegistrationData> {
    let mut metadata = ClientMetadata::new(
        application_type,
        grant_types,
        Localized::new(parse_url(&app.client_uri)?, []),
    );
    metadata.client_name = Some(Localized::new(app.name.clone(), []));
    metadata.logo_uri = app
        .logo_uri
        .as_deref()
        .map(parse_url)
        .transpose()?
        .map(|u| Localized::new(u, []));
    metadata.policy_uri = app
        .policy_uri
        .as_deref()
        .map(parse_url)
        .transpose()?
        .map(|u| Localized::new(u, []));
    metadata.tos_uri = app
        .tos_uri
        .as_deref()
        .map(parse_url)
        .transpose()?
        .map(|u| Localized::new(u, []));
    Ok(ClientRegistrationData::new(
        Raw::new(&metadata).map_err(|e| Error::Sdk(e.to_string()))?,
    ))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn wire(identifier: LoginIdentifier) -> serde_json::Value {
        serde_json::to_value(identifier.to_user_identifier().unwrap()).unwrap()
    }

    #[test]
    fn login_identifiers_become_matrix_identifiers() {
        assert_eq!(
            wire(LoginIdentifier::User {
                user: " @ash:x.org ".into()
            }),
            json!({ "type": "m.id.user", "user": "@ash:x.org" })
        );
        assert_eq!(
            wire(LoginIdentifier::Email {
                address: "a@b.org".into()
            }),
            json!({ "type": "m.id.thirdparty", "medium": "email", "address": "a@b.org" })
        );
        assert_eq!(
            wire(LoginIdentifier::Phone {
                number: "+49 (151) 234-567".into()
            }),
            json!({ "type": "m.id.thirdparty", "medium": "msisdn", "address": "49151234567" })
        );
    }

    #[test]
    fn empty_identifiers_are_refused() {
        for identifier in [
            LoginIdentifier::User { user: "  ".into() },
            LoginIdentifier::Email {
                address: String::new(),
            },
            LoginIdentifier::Phone {
                number: "+ -".into(),
            },
        ] {
            assert!(identifier.to_user_identifier().is_err(), "{identifier:?}");
        }
    }

    #[test]
    fn only_client_errors_mean_not_matrix() {
        for status in [400, 403, 404, 410] {
            assert!(is_not_matrix_status(status), "{status}");
        }
        for status in [200, 302, 408, 429, 500, 502, 503, 521] {
            assert!(!is_not_matrix_status(status), "{status}");
        }
    }

    #[test]
    fn identifiers_are_read_from_json() {
        let id: LoginIdentifier =
            serde_json::from_value(json!({ "type": "phone", "number": "123" })).unwrap();
        assert_eq!(
            id,
            LoginIdentifier::Phone {
                number: "123".into()
            }
        );
    }
}
