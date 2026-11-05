//! MatrixRTC calls: who is in a room's call, joining and leaving it, ringing, and the
//! media encryption keys. Media itself (LiveKit) is up to each platform; this provides
//! what it needs to connect: the SFU URL and token, and the keys per participant.

use std::{
    collections::{HashMap, VecDeque},
    future::Future,
    sync::{Arc, Mutex},
    time::Duration,
};

use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use futures_util::{
    future::{select, Either},
    stream, StreamExt,
};
use matrix_sdk::{
    config::RequestConfig,
    deserialized_responses::{EncryptionInfo, RawAnySyncOrStrippedState},
    event_handler::EventHandlerDropGuard,
    ruma::{
        api::{
            client::{
                account::request_openid_token,
                delayed_events::{
                    delayed_state_event,
                    update_delayed_event::{unstable_v1 as update_delayed, UpdateAction},
                    DelayParameters,
                },
                state::send_state_event,
            },
            error::{ErrorKind, RetryAfter},
        },
        events::{
            AnySyncStateEvent, AnySyncTimelineEvent, AnyToDeviceEvent, AnyToDeviceEventContent,
            StateEventType,
        },
        serde::Raw,
        MilliSecondsSinceUnixEpoch,
    },
    sleep::sleep,
    HttpError, Room,
};
use matrix_sdk_crypto::CollectStrategy;
use serde::Serialize;
use serde_json::{json, Value};

use crate::{rooms::parse_room_id, Error, Result, WizardClient};

pub(crate) const CALL_MEMBER_EVENT: &str = "org.matrix.msc3401.call.member";
pub(crate) const VOICE_ROOM_TYPE: &str = "org.matrix.msc3417.call";
const KEYS_EVENT: &str = "io.element.call.encryption_keys";
const NOTIFICATION_EVENT: &str = "org.matrix.msc4075.rtc.notification";
const NOTIFICATION_EVENT_STABLE: &str = "m.rtc.notification";
const DECLINE_EVENT: &str = "org.matrix.msc4310.rtc.decline";
const CALL_REACTION_EVENT: &str = "io.element.call.reaction";
const RAISED_HAND_KEY: &str = "🖐️";
const RTC_FOCI_WELL_KNOWN_KEY: &str = "org.matrix.msc4143.rtc_foci";

/// How often the delayed leave is pushed back
const DELAYED_LEAVE_RESTART_MS: u64 = 4_000;
/// A restart that takes longer counts as a network error
const DELAYED_LEAVE_RESTART_TIMEOUT_MS: u64 = 2_000;
const MEMBERSHIP_EXPIRES_MS: u64 = 4 * 60 * 60 * 1000;
/// Memberships are renewed at least this often, a little before they run out
const MEMBERSHIP_RENEW_MAX_MS: u64 = 60 * 60 * 1000;
const MEMBERSHIP_RENEW_HEADROOM_MS: u64 = 5_000;
const NETWORK_RETRY_MS: u64 = 3_000;
const MAX_NETWORK_RETRIES: u32 = 40;
const MAX_RATE_LIMIT_RETRIES: u32 = 10;
const RING_LIFETIME_MS: u64 = 30_000;
/// A ring (or a caller's new membership) older than this doesn't ring anymore
const RING_TIMEOUT_MS: u64 = 45_000;
/// A key shared this recently is handed to new joiners instead of rotating
const KEY_ROTATION_GRACE_MS: u64 = 10_000;
/// Others need a moment to receive a new key before media is encrypted with it
const KEY_USE_DELAY_MS: u64 = 1_000;

/// One device in a room's call
#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CallMember {
    pub user_id: String,
    pub device_id: String,
    /// How the SFU and the media keys know this device: `@user:server:DEVICE`
    pub identity: String,
    /// The LiveKit service this device publishes to
    pub service_url: Option<String>,
    /// `audio` or `video`
    pub intent: Option<String>,
    pub joined_at: u64,
    pub is_own_device: bool,
    /// Reactions and raised hands refer to this event
    pub membership_event_id: Option<String>,
    /// The name to show, with the user ID added when others in the room share it
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

/// What a platform needs to connect to a LiveKit SFU
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SfuConfig {
    pub service_url: String,
    pub url: String,
    pub jwt: String,
    pub identity: String,
    /// The LiveKit room the token is for: services leading to the same SFU room share a connection
    pub alias: String,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum CallEvent {
    /// Everyone in the call, oldest first
    Members {
        members: Vec<CallMember>,
    },
    /// A media key for a participant (the own one too); keep every index
    Key {
        identity: String,
        index: u32,
        /// Base64
        key: String,
    },
    /// The person rung declined
    Declined {
        user_id: String,
    },
    /// Nobody answered the ring
    Unanswered,
    /// An emoji someone sent into the call (show it briefly)
    Reaction {
        identity: String,
        emoji: String,
    },
    HandRaised {
        identity: String,
        raised: bool,
    },
    /// `fatal`: the membership can't be kept up; the call has been left
    Error {
        message: String,
        fatal: bool,
    },
}

/// Someone calling, from a ring or notification event, or a caller's new membership in a direct chat
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct IncomingCall {
    pub room_id: String,
    pub room_name: Option<String>,
    /// The ring or notification event to decline; empty when only the membership is known so far
    pub event_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    /// Ring audibly (direct chats), or just show a notification
    pub ring: bool,
    pub intent: Option<String>,
    /// Milliseconds since the Unix epoch
    pub expires_at: u64,
}

/// How long memberships last and how fast a vanished client drops out. The defaults match
/// the original app; examples shorten them to watch renewals happen.
#[derive(Clone, Copy, Debug)]
pub struct CallTimings {
    pub membership_expiry: Duration,
    pub delayed_leave: Duration,
}

impl Default for CallTimings {
    fn default() -> Self {
        Self {
            membership_expiry: Duration::from_millis(MEMBERSHIP_EXPIRES_MS),
            delayed_leave: Duration::from_secs(18),
        }
    }
}

fn now_ms() -> u64 {
    u64::from(MilliSecondsSinceUnixEpoch::now().0)
}

fn call_error(error: impl std::fmt::Display) -> Error {
    Error::Sdk(error.to_string())
}

fn normalize_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_owned()
}

fn livekit_from(list: Option<&Value>) -> Option<String> {
    list?.as_array()?.iter().find_map(|t| {
        if t.get("type")?.as_str()? != "livekit" {
            return None;
        }
        t.get("livekit_service_url")?.as_str().map(normalize_url)
    })
}

/// Client well-knowns per account, kept for the session
static WELL_KNOWN: Mutex<Vec<(String, Value)>> = Mutex::new(Vec::new());
/// Accounts whose server is known to support calls
static RTC_SUPPORTED: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn parse_member(event: &Value, own: (&str, &str), now: u64) -> Option<CallMember> {
    let content = event.get("content")?;
    if content.get("application")?.as_str()? != "m.call"
        || content.get("scope").and_then(Value::as_str) != Some("m.room")
        || content
            .get("call_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            != ""
    {
        return None;
    }
    let user_id = event.get("sender")?.as_str()?.to_owned();
    let device_id = content.get("device_id")?.as_str()?.to_owned();
    let joined_at = content
        .get("created_ts")
        .and_then(Value::as_u64)
        .or_else(|| event.get("origin_server_ts")?.as_u64())?;
    let expires = content
        .get("expires")
        .and_then(Value::as_u64)
        .unwrap_or(MEMBERSHIP_EXPIRES_MS);
    if joined_at + expires < now {
        return None;
    }
    let service_url = content
        .get("foci_preferred")
        .and_then(Value::as_array)
        .and_then(|foci| {
            foci.iter()
                .find(|f| f.get("type").and_then(Value::as_str) == Some("livekit"))
        })
        .and_then(|f| f.get("livekit_service_url")?.as_str())
        .map(normalize_url);
    Some(CallMember {
        identity: format!("{user_id}:{device_id}"),
        is_own_device: user_id == own.0 && device_id == own.1,
        membership_event_id: event
            .get("event_id")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        intent: content
            .get("m.call.intent")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        user_id,
        device_id,
        service_url,
        joined_at,
        display_name: None,
        avatar_url: None,
    })
}

fn decode_jwt_claims(jwt: &str) -> Option<Value> {
    let payload = URL_SAFE_NO_PAD
        .decode(jwt.split('.').nth(1)?.trim_end_matches('='))
        .ok()?;
    serde_json::from_slice(&payload).ok()
}

fn random_key() -> Result<[u8; 16]> {
    let mut key = [0u8; 16];
    getrandom::fill(&mut key).map_err(call_error)?;
    Ok(key)
}

pub(crate) fn random_uuid() -> Result<String> {
    let mut b = random_key()?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let hex: String = b.iter().map(|x| format!("{x:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    ))
}

/// Runs `future`, giving up after `ms`
async fn within<T>(ms: u64, future: impl Future<Output = T>) -> Option<T> {
    let future = std::pin::pin!(future);
    let timer = std::pin::pin!(sleep(Duration::from_millis(ms)));
    match select(future, timer).await {
        Either::Left((value, _)) => Some(value),
        Either::Right(_) => None,
    }
}

/// How a failed membership request is handled, like matrix-js-sdk's MembershipManager
enum Failure {
    NotFound,
    /// The server has no delayed events
    Unsupported,
    RateLimited(u64),
    /// Connection problems, timeouts and server errors: retried
    Network,
    Other(String),
}

fn classify(error: &HttpError) -> Failure {
    if let Some(api) = error.as_client_api_error() {
        return match api.error_kind() {
            Some(ErrorKind::LimitExceeded(data)) => Failure::RateLimited(match data.retry_after {
                Some(RetryAfter::Delay(delay)) => delay.as_millis() as u64,
                Some(RetryAfter::DateTime(at)) => MilliSecondsSinceUnixEpoch::from_system_time(at)
                    .map(|at| u64::from(at.0).saturating_sub(now_ms()))
                    .unwrap_or(5_000),
                None => 5_000,
            }),
            Some(ErrorKind::NotFound) => Failure::NotFound,
            Some(ErrorKind::Unrecognized) => Failure::Unsupported,
            _ if api.status_code.is_server_error() => Failure::Network,
            _ => Failure::Other(error.to_string()),
        };
    }
    match error {
        HttpError::Reqwest(_) => Failure::Network,
        _ => Failure::Other(error.to_string()),
    }
}

/// Servers that turned delayed events off (matrix.org) answer with M_FORBIDDEN
fn classify_delayed(error: &HttpError) -> Failure {
    match error.client_api_error_kind() {
        Some(ErrorKind::Forbidden) => Failure::Unsupported,
        _ => classify(error),
    }
}

/// No automatic retries: failures are handled (and counted) here
fn once() -> RequestConfig {
    RequestConfig::new().disable_retry()
}

#[derive(Default)]
struct Retries {
    network: u32,
    rate: u32,
}

impl Retries {
    /// When to try again, or why to give up
    fn next(&mut self, failure: Failure, what: &str) -> std::result::Result<u64, String> {
        match failure {
            Failure::RateLimited(ms) if self.rate < MAX_RATE_LIMIT_RETRIES => {
                self.rate += 1;
                Ok(ms)
            }
            Failure::RateLimited(_) => Err(format!("rate limited too often ({what})")),
            Failure::Network if self.network < MAX_NETWORK_RETRIES => {
                self.network += 1;
                Ok(NETWORK_RETRY_MS)
            }
            Failure::Network => Err(format!("the server can't be reached ({what})")),
            Failure::NotFound => Err(format!("not found ({what})")),
            Failure::Unsupported => Err(format!("not supported by the server ({what})")),
            Failure::Other(message) => Err(format!("{what}: {message}")),
        }
    }
}

struct TokenRequest<'a> {
    service_url: &'a str,
    room_id: &'a str,
    user_id: &'a str,
    device_id: &'a str,
    member_id: &'a str,
    /// The publisher hands its delayed leave to the call server: (delay id, timeout, homeserver)
    delay: Option<(String, u64, String)>,
}

async fn openid_token(client: &matrix_sdk::Client) -> Result<Value> {
    let user = client.user_id().ok_or(Error::NotSignedIn)?.to_owned();
    let token = client
        .send(request_openid_token::v3::Request::new(user))
        .await?;
    Ok(json!({
        "access_token": token.access_token,
        "token_type": "Bearer",
        "matrix_server_name": token.matrix_server_name,
        "expires_in": token.expires_in.as_secs(),
    }))
}

fn delay_parts(body: &mut Value, delay: &Option<(String, u64, String)>) {
    if let Some((id, timeout, homeserver)) = delay {
        body["delay_id"] = json!(id);
        body["delay_timeout"] = json!(timeout);
        body["delay_cs_api_url"] = json!(homeserver);
    }
}

async fn post(url: String, body: &Value) -> Result<reqwest::Response> {
    reqwest::Client::new()
        .post(url)
        .json(body)
        .send()
        .await
        .map_err(|e| Error::Call(format!("the call server can't be reached: {e}")))
}

fn token_refused(status: reqwest::StatusCode) -> Error {
    Error::Call(format!("SFU token request failed ({})", status.as_u16()))
}

async fn legacy_token(request: &TokenRequest<'_>, openid: &Value) -> Result<Value> {
    let url = format!("{}/sfu/get", request.service_url);
    let base = json!({
        "room": request.room_id,
        "openid_token": openid,
        "device_id": request.device_id,
    });
    let mut body = base.clone();
    delay_parts(&mut body, &request.delay);
    let mut response = post(url.clone(), &body).await?;
    if response.status() == reqwest::StatusCode::BAD_REQUEST && request.delay.is_some() {
        let error: Value = response.json().await.unwrap_or_default();
        if error.get("errcode").and_then(Value::as_str) != Some("M_BAD_JSON") {
            return Err(token_refused(reqwest::StatusCode::BAD_REQUEST));
        }
        response = post(url, &base).await?;
    }
    if !response.status().is_success() {
        return Err(token_refused(response.status()));
    }
    response.json().await.map_err(call_error)
}

async fn matrix2_token(request: &TokenRequest<'_>, openid: &Value) -> Result<Value> {
    let mut body = json!({
        "room_id": request.room_id,
        "slot_id": "m.call#ROOM",
        "openid_token": openid,
        "member": {
            "id": request.member_id,
            "claimed_user_id": request.user_id,
            "claimed_device_id": request.device_id,
        },
    });
    delay_parts(&mut body, &request.delay);
    let response = post(format!("{}/get_token", request.service_url), &body).await?;
    if !response.status().is_success() {
        return Err(token_refused(response.status()));
    }
    response.json().await.map_err(call_error)
}

/// The publisher asks the legacy endpoint (it also takes the delayed leave); subscribers try
/// the newer endpoint first.
async fn request_sfu_config(
    client: &matrix_sdk::Client,
    request: TokenRequest<'_>,
    publisher: bool,
) -> Result<SfuConfig> {
    let mut body = None;
    if !publisher {
        if let Ok(openid) = openid_token(client).await {
            body = matrix2_token(&request, &openid).await.ok();
        }
    }
    let body = match body {
        Some(body) => body,
        None => legacy_token(&request, &openid_token(client).await?).await?,
    };
    let url = body
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| Error::Call("no SFU URL".into()))?;
    let jwt = body
        .get("jwt")
        .and_then(Value::as_str)
        .ok_or_else(|| Error::Call("no SFU token".into()))?;
    let claims = decode_jwt_claims(jwt).unwrap_or_default();
    Ok(SfuConfig {
        service_url: request.service_url.to_owned(),
        url: url.to_owned(),
        identity: claims
            .get("sub")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("{}:{}", request.user_id, request.device_id)),
        alias: claims
            .pointer("/video/room")
            .and_then(Value::as_str)
            .unwrap_or(request.room_id)
            .to_owned(),
        jwt: jwt.to_owned(),
    })
}

impl WizardClient {
    /// The LiveKit service the homeserver offers for calls, if any: the client well-known
    /// first, then the server's RTC transports.
    pub async fn rtc_service_url(&self) -> Option<String> {
        if let Some(url) = self
            .client_well_known()
            .await
            .and_then(|w| livekit_from(w.get(RTC_FOCI_WELL_KNOWN_KEY)))
        {
            return Some(url);
        }
        self.livekit_transport().await
    }

    /// Whether calls can work here. Lenient: only a readable well-known
    /// without call servers, and no LiveKit transport, count as unsupported. A yes is remembered.
    pub async fn rtc_supported(&self) -> bool {
        let Some(user_id) = self.sdk().user_id().map(ToString::to_string) else {
            return false;
        };
        if RTC_SUPPORTED.lock().unwrap().contains(&user_id) {
            return true;
        }
        let supported = self.livekit_transport().await.is_some()
            || match self.client_well_known().await {
                None => true,
                Some(well_known) => well_known
                    .get(RTC_FOCI_WELL_KNOWN_KEY)
                    .and_then(Value::as_array)
                    .is_some_and(|foci| !foci.is_empty()),
            };
        if supported {
            RTC_SUPPORTED.lock().unwrap().push(user_id);
        }
        supported
    }

    async fn livekit_transport(&self) -> Option<String> {
        let transports = self.sdk().discover_rtc_transports().await.ok().flatten()?;
        transports.into_iter().find_map(|t| {
            if t.transport_type() != "livekit" {
                return None;
            }
            t.data()
                .get("livekit_service_url")?
                .as_str()
                .map(normalize_url)
        })
    }

    /// The account server's `.well-known/matrix/client`, fetched once per session; `None`
    /// when it can't be read.
    async fn client_well_known(&self) -> Option<Value> {
        let user_id = self.sdk().user_id()?.to_owned();
        let cached = WELL_KNOWN
            .lock()
            .unwrap()
            .iter()
            .find(|(user, _)| *user == user_id.as_str())
            .map(|(_, content)| content.clone());
        if cached.is_some() {
            return cached;
        }
        let response = reqwest::Client::new()
            .get(format!(
                "https://{}/.well-known/matrix/client",
                user_id.server_name()
            ))
            .send()
            .await
            .ok()?;
        if !response.status().is_success() {
            return None;
        }
        let content: Value = response.json().await.ok()?;
        WELL_KNOWN
            .lock()
            .unwrap()
            .push((user_id.to_string(), content.clone()));
        Some(content)
    }

    pub async fn call_members(&self, room_id: &str) -> Result<Vec<CallMember>> {
        call_members_of(&self.room(room_id)?, self.own_device()).await
    }

    fn own_device(&self) -> (String, String) {
        (
            self.sdk()
                .user_id()
                .map(ToString::to_string)
                .unwrap_or_default(),
            self.sdk()
                .device_id()
                .map(ToString::to_string)
                .unwrap_or_default(),
        )
    }

    /// Calls `on_members` with the room's call members now and whenever they change.
    pub async fn watch_call_members(
        &self,
        room_id: &str,
        mut on_members: impl FnMut(Vec<CallMember>),
    ) -> Result<()> {
        let room = self.room(room_id)?;
        let own = self.own_device();
        let mut info = room.subscribe_info();
        let mut last = None;
        // Memberships also expire with time, so look again now and then
        let changes = stream::select(
            (&mut info).map(|_| ()),
            stream::unfold((), |_| async {
                sleep(Duration::from_secs(10)).await;
                Some(((), ()))
            }),
        );
        futures_util::pin_mut!(changes);
        loop {
            let members = call_members_of(&room, own.clone()).await?;
            if last.as_ref() != Some(&members) {
                on_members(members.clone());
                last = Some(members);
            }
            if changes.next().await.is_none() {
                return Ok(());
            }
        }
    }

    /// A token for a LiveKit service, for this device in this room's call. Prefer
    /// `CallSession::sfu_config` while in the call.
    pub async fn sfu_config(&self, room_id: &str, service_url: &str) -> Result<SfuConfig> {
        let room_id = parse_room_id(room_id)?;
        let (user_id, device_id) = self.own_device();
        let service_url = normalize_url(service_url);
        let member_id = format!("{user_id}:{device_id}");
        let request = TokenRequest {
            service_url: &service_url,
            room_id: room_id.as_str(),
            user_id: &user_id,
            device_id: &device_id,
            member_id: &member_id,
            delay: None,
        };
        match request_sfu_config(self.sdk(), request, true).await {
            Ok(config) => Ok(config),
            Err(_) => {
                let request = TokenRequest {
                    service_url: &service_url,
                    room_id: room_id.as_str(),
                    user_id: &user_id,
                    device_id: &device_id,
                    member_id: &member_id,
                    delay: None,
                };
                request_sfu_config(self.sdk(), request, false).await
            }
        }
    }

    /// Joins the room's call. Run the session to stay in it; `ring` notifies the others
    /// (ringing in direct chats) when nobody is in the call yet.
    pub async fn join_call(&self, room_id: &str, video: bool, ring: bool) -> Result<CallSession> {
        let service_url = self
            .rtc_service_url()
            .await
            .ok_or_else(|| Error::Call("this homeserver has no call server".into()))?;
        self.join_call_via(room_id, &service_url, video, ring).await
    }

    /// Like `join_call`, publishing to a chosen LiveKit service.
    pub async fn join_call_via(
        &self,
        room_id: &str,
        service_url: &str,
        video: bool,
        ring: bool,
    ) -> Result<CallSession> {
        self.join_call_with(room_id, service_url, video, ring, CallTimings::default())
            .await
    }

    /// Like `join_call_via`, with other membership timings.
    pub async fn join_call_with(
        &self,
        room_id: &str,
        service_url: &str,
        video: bool,
        ring: bool,
        timings: CallTimings,
    ) -> Result<CallSession> {
        let room = self.room(room_id)?;
        let service_url = normalize_url(service_url);
        let (user_id, device_id) = self.own_device();
        let ongoing = call_members_of(&room, (user_id.clone(), device_id.clone()))
            .await?
            .iter()
            .any(|m| !m.is_own_device);
        let session = CallSession {
            client: self.sdk().clone(),
            room,
            state_key: format!("_{user_id}_{device_id}_m.call"),
            identity: format!("{user_id}:{device_id}"),
            member_id: random_uuid()?,
            user_id,
            device_id,
            service_url,
            intent: if video { "video" } else { "audio" }.to_owned(),
            timings,
            state: Arc::new(Mutex::new(SessionState::default())),
        };
        session.join().await?;
        if ring && !ongoing {
            let membership = session.state.lock().unwrap().membership_event_id.clone();
            if let Some(membership) = membership {
                session.notify(&membership).await?;
            }
        }
        Ok(session)
    }

    /// Every timeline and state event as JSON, with the guards that keep the handlers alive
    fn room_events(
        &self,
    ) -> (
        futures_channel::mpsc::UnboundedReceiver<(Value, Room)>,
        [EventHandlerDropGuard; 2],
    ) {
        let (sender, receiver) = futures_channel::mpsc::unbounded::<(Value, Room)>();
        let timeline = self.sdk().add_event_handler({
            let sender = sender.clone();
            move |raw: Raw<AnySyncTimelineEvent>, room: Room| {
                let sender = sender.clone();
                async move {
                    if let Ok(event) = raw.deserialize_as_unchecked::<Value>() {
                        let _ = sender.unbounded_send((event, room));
                    }
                }
            }
        });
        let state = self
            .sdk()
            .add_event_handler(move |raw: Raw<AnySyncStateEvent>, room: Room| {
                let sender = sender.clone();
                async move {
                    if let Ok(event) = raw.deserialize_as_unchecked::<Value>() {
                        let _ = sender.unbounded_send((event, room));
                    }
                }
            });
        let guards = [
            self.sdk().event_handler_drop_guard(timeline),
            self.sdk().event_handler_drop_guard(state),
        ];
        (receiver, guards)
    }

    pub async fn watch_incoming_calls(&self, mut on_call: impl FnMut(IncomingCall)) {
        let (mut receiver, _guards) = self.room_events();
        let own = self.own_device();
        let mut seen: VecDeque<String> = VecDeque::new();
        while let Some((event, room)) = receiver.next().await {
            let id = event
                .get("event_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            if seen.contains(&id) {
                continue;
            }
            if let Some(call) = incoming_call(&event, &room, &own).await {
                seen.push_back(id);
                if seen.len() > 64 {
                    seen.pop_front();
                }
                on_call(call);
            }
        }
    }

    pub async fn watch_calls_handled_elsewhere(&self, mut on_room: impl FnMut(String)) {
        let (mut receiver, _guards) = self.room_events();
        let own = self.own_device();
        while let Some((event, room)) = receiver.next().await {
            if handled_elsewhere(&event, &own) {
                on_room(room.room_id().to_string());
            }
        }
    }

    /// Tells the caller this device won't answer.
    pub async fn decline_call(&self, room_id: &str, notification_event_id: &str) -> Result<()> {
        let content = json!({
            "m.relates_to": { "rel_type": "m.reference", "event_id": notification_event_id },
        });
        self.room(room_id)?.send_raw(DECLINE_EVENT, content).await?;
        Ok(())
    }
}

fn handled_elsewhere(event: &Value, own: &(String, String)) -> bool {
    if event.get("sender").and_then(Value::as_str) != Some(own.0.as_str()) {
        return false;
    }
    let now = now_ms();
    match event.get("type").and_then(Value::as_str) {
        Some(DECLINE_EVENT) => event
            .get("origin_server_ts")
            .and_then(Value::as_u64)
            .is_some_and(|sent| sent + RING_TIMEOUT_MS >= now),
        Some(CALL_MEMBER_EVENT) => {
            parse_member(event, (&own.0, &own.1), now).is_some_and(|m| !m.is_own_device)
        }
        _ => false,
    }
}

async fn incoming_call(event: &Value, room: &Room, own: &(String, String)) -> Option<IncomingCall> {
    if room
        .room_type()
        .is_some_and(|t| t.to_string() == VOICE_ROOM_TYPE)
    {
        return None;
    }
    let kind = event.get("type")?.as_str()?;
    let from = event.get("sender")?.as_str()?;
    if from == own.0 {
        return None;
    }
    let now = now_ms();
    let content = event.get("content")?;
    let (ring, intent, expires_at, event_id) =
        if kind == NOTIFICATION_EVENT || kind == NOTIFICATION_EVENT_STABLE {
            let sent = content
                .get("sender_ts")
                .and_then(Value::as_u64)
                .or_else(|| event.get("origin_server_ts")?.as_u64())
                .unwrap_or(now);
            let lifetime = content
                .get("lifetime")
                .and_then(Value::as_u64)
                .unwrap_or(RING_LIFETIME_MS)
                .min(RING_TIMEOUT_MS);
            if now.saturating_sub(sent) > lifetime {
                return None;
            }
            let ring = content.get("notification_type").and_then(Value::as_str) == Some("ring");
            if ring && !room.is_direct().await.unwrap_or(false) {
                return None;
            }
            (
                ring,
                content
                    .get("m.call.intent")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                sent + lifetime,
                event.get("event_id")?.as_str()?.to_owned(),
            )
        } else if kind == CALL_MEMBER_EVENT {
            let member = parse_member(event, (&own.0, &own.1), now)?;
            let intent = member.intent.as_deref()?;
            if member.joined_at + RING_TIMEOUT_MS < now
                || !matches!(intent, "ring" | "audio" | "video")
                || !room.is_direct().await.unwrap_or(false)
            {
                return None;
            }
            (
                true,
                member.intent.clone(),
                member.joined_at + RING_TIMEOUT_MS,
                String::new(),
            )
        } else {
            return None;
        };
    let members = call_members_of(room, own.clone()).await.ok()?;
    let answered_elsewhere = members
        .iter()
        .any(|m| m.user_id == own.0 && !m.is_own_device);
    if answered_elsewhere || !members.iter().any(|m| m.user_id == from) {
        return None;
    }
    let user = <&matrix_sdk::ruma::UserId>::try_from(from).ok()?;
    let sender_name = match room.get_member_no_sync(user).await {
        Ok(Some(member)) => Some(member_name(&member)),
        _ => None,
    };
    Some(IncomingCall {
        room_id: room.room_id().to_string(),
        room_name: room.cached_display_name().map(|n| n.to_string()),
        event_id,
        sender: from.to_owned(),
        sender_name,
        ring,
        intent,
        expires_at,
    })
}

/// The member's name as other clients show it: the user ID added when the name is ambiguous
fn member_name(member: &matrix_sdk::room::RoomMember) -> String {
    match member.display_name() {
        Some(name) if member.name_ambiguous() => format!("{name} ({})", member.user_id()),
        Some(name) => name.to_owned(),
        None => member.user_id().to_string(),
    }
}

async fn call_members_of(room: &Room, own: (String, String)) -> Result<Vec<CallMember>> {
    let now = now_ms();
    let events = room
        .get_state_events(StateEventType::from(CALL_MEMBER_EVENT))
        .await?;
    let mut members: Vec<CallMember> = events
        .into_iter()
        .filter_map(|raw| match raw {
            RawAnySyncOrStrippedState::Sync(raw) => raw.deserialize_as_unchecked::<Value>().ok(),
            RawAnySyncOrStrippedState::Stripped(_) => None,
        })
        .filter_map(|event| parse_member(&event, (&own.0, &own.1), now))
        .collect();
    for member in &mut members {
        let Ok(user) = <&matrix_sdk::ruma::UserId>::try_from(member.user_id.as_str()) else {
            continue;
        };
        if let Ok(Some(info)) = room.get_member_no_sync(user).await {
            member.display_name = Some(member_name(&info));
            member.avatar_url = info.avatar_url().map(ToString::to_string);
        }
    }
    members.sort_by_key(|m| m.joined_at);
    Ok(members)
}

/// Steps to get the membership back after it vanished (the server's delayed leave fired, or
/// someone removed it)
#[derive(Clone, Copy, PartialEq)]
enum Rejoin {
    CancelOldLeave,
    ScheduleLeave,
    Join,
}

#[derive(Default)]
struct SessionState {
    delay_id: Option<String>,
    /// The server has no delayed events: memberships only expire
    no_delayed_events: bool,
    /// When the server will send the delayed leave unless it's restarted
    leave_expected_at: u64,
    left: bool,
    notification_event_id: Option<String>,
    membership_event_id: Option<String>,
    own_hand_event_id: Option<String>,
    rung_at: Option<u64>,
    rang: bool,
    outbound: Option<OutboundKey>,
    /// When the current membership was first sent; renewals count from here
    started_at: u64,
    expiry_iteration: u64,
    created_ts: Option<u64>,
    own_seen: bool,
    restart_due: Option<u64>,
    renew_due: Option<u64>,
    rejoin: Option<(Rejoin, u64)>,
    restart_retries: Retries,
    renew_retries: Retries,
    rejoin_retries: Retries,
}

#[derive(Clone)]
struct OutboundKey {
    index: u32,
    key: [u8; 16],
    created_at: u64,
    /// (user, device, joined at)
    shared_with: Vec<(String, String, u64)>,
}

enum Input {
    Tick,
    MembersChanged,
    Key(CallEvent),
    Declined(String),
    Timeline(Value),
}

/// This device's membership in a room's call
#[derive(Clone)]
pub struct CallSession {
    client: matrix_sdk::Client,
    room: Room,
    state_key: String,
    identity: String,
    /// Identifies this session to the newer token endpoint
    member_id: String,
    user_id: String,
    device_id: String,
    service_url: String,
    intent: String,
    timings: CallTimings,
    state: Arc<Mutex<SessionState>>,
}

impl CallSession {
    pub fn room_id(&self) -> String {
        self.room.room_id().to_string()
    }

    /// The LiveKit service this device publishes to
    pub fn service_url(&self) -> &str {
        &self.service_url
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    /// Whether joining rang the others (a direct chat nobody was in): show "calling..."
    pub fn rang(&self) -> bool {
        self.state.lock().unwrap().rang
    }

    /// The scheduled leave the server sends if this device stops confirming it's there
    pub fn delay_id(&self) -> Option<String> {
        self.state.lock().unwrap().delay_id.clone()
    }

    /// Whether media is end-to-end encrypted (the room is)
    pub async fn encrypted(&self) -> bool {
        self.room
            .latest_encryption_state()
            .await
            .map(|s| s.is_encrypted())
            .unwrap_or(false)
    }

    /// A token for a LiveKit service in this call. The publisher's token hands the delayed
    /// leave to the call server, so others see a crashed client leave right away.
    pub async fn sfu_config(&self, service_url: &str, publisher: bool) -> Result<SfuConfig> {
        let service_url = normalize_url(service_url);
        let delay = if publisher {
            self.delay_id().map(|id| {
                (
                    id,
                    self.state.lock().unwrap().delayed_leave_ms(&self.timings),
                    self.client
                        .homeserver()
                        .to_string()
                        .trim_end_matches('/')
                        .to_owned(),
                )
            })
        } else {
            None
        };
        let request = TokenRequest {
            service_url: &service_url,
            room_id: self.room.room_id().as_str(),
            user_id: &self.user_id,
            device_id: &self.device_id,
            member_id: &self.member_id,
            delay,
        };
        request_sfu_config(&self.client, request, publisher).await
    }

    fn membership_content(&self, expires: u64, created_ts: Option<u64>) -> Value {
        let mut content = json!({
            "application": "m.call",
            "call_id": "",
            "scope": "m.room",
            "device_id": self.device_id,
            "membershipID": self.identity,
            "expires": expires,
            "m.call.intent": self.intent,
            "focus_active": { "type": "livekit", "focus_selection": "multi_sfu" },
            "foci_preferred": [{
                "type": "livekit",
                "livekit_service_url": self.service_url,
                "livekit_alias": self.room.room_id(),
            }],
        });
        if let Some(ts) = created_ts {
            content["created_ts"] = json!(ts);
        }
        content
    }

    async fn send_member_state(&self, content: Value) -> std::result::Result<String, HttpError> {
        let request = send_state_event::v3::Request::new_raw(
            self.room.room_id().to_owned(),
            StateEventType::from(CALL_MEMBER_EVENT),
            self.state_key.clone(),
            Raw::new(&content)
                .map_err(|e| HttpError::IntoHttp(e.into()))?
                .cast_unchecked(),
        );
        let response = self
            .client
            .send(request)
            .with_request_config(once())
            .await?;
        Ok(response.event_id.to_string())
    }

    async fn send_delayed_leave(&self) -> std::result::Result<String, HttpError> {
        let delay = self.state.lock().unwrap().delayed_leave_ms(&self.timings);
        let request = delayed_state_event::unstable::Request::new_raw(
            self.room.room_id().to_owned(),
            self.state_key.clone(),
            StateEventType::from(CALL_MEMBER_EVENT),
            DelayParameters::Timeout {
                timeout: Duration::from_millis(delay),
            },
            Raw::new(&json!({}))
                .map_err(|e| HttpError::IntoHttp(e.into()))?
                .cast_unchecked(),
        );
        let response = self
            .client
            .send(request)
            .with_request_config(once())
            .await?;
        let mut state = self.state.lock().unwrap();
        state.delay_id = Some(response.delay_id.clone());
        state.leave_expected_at = now_ms() + delay;
        Ok(response.delay_id)
    }

    async fn update_delayed(
        &self,
        delay_id: String,
        action: UpdateAction,
    ) -> std::result::Result<(), HttpError> {
        let request = update_delayed::Request::new(delay_id, action);
        self.client
            .send(request)
            .with_request_config(once())
            .await?;
        Ok(())
    }

    /// Schedules the leave (so a vanished client drops out), then announces the membership.
    async fn join(&self) -> Result<()> {
        let mut retries = Retries::default();
        loop {
            match self.send_delayed_leave().await {
                Ok(_) => break,
                Err(error) => match classify_delayed(&error) {
                    failure @ (Failure::RateLimited(_) | Failure::Network) => {
                        match retries.next(failure, "scheduling the leave") {
                            Ok(wait) => sleep(Duration::from_millis(wait)).await,
                            Err(_) => break,
                        }
                    }
                    Failure::Unsupported => {
                        self.state.lock().unwrap().no_delayed_events = true;
                        break;
                    }
                    // Without delayed events the membership just expires
                    _ => break,
                },
            }
        }
        self.send_join()
            .await
            .map_err(|e| Error::Call(format!("can't join the call: {e}")))
    }

    /// Sends a fresh membership; retries what can be retried, returns why it failed otherwise.
    async fn send_join(&self) -> std::result::Result<(), String> {
        let expires = self.timings.membership_expiry.as_millis() as u64;
        let mut retries = Retries::default();
        let event_id = loop {
            match self
                .send_member_state(self.membership_content(expires, None))
                .await
            {
                Ok(event_id) => break event_id,
                Err(error) => {
                    let wait = retries.next(classify(&error), "sending the membership")?;
                    sleep(Duration::from_millis(wait)).await;
                }
            }
        };
        let now = now_ms();
        let mut state = self.state.lock().unwrap();
        state.membership_event_id = Some(event_id);
        state.started_at = now;
        state.expiry_iteration = 1;
        state.created_ts = None;
        state.own_seen = false;
        // Check right away whether sending the membership cancelled the delayed leave
        state.restart_due = (!state.no_delayed_events).then_some(now);
        state.renew_due = Some(state.renew_at(&self.timings));
        Ok(())
    }

    async fn notify(&self, membership_event_id: &str) -> Result<()> {
        let direct = self.room.direct_targets_length() > 0;
        let content = json!({
            "m.mentions": { "user_ids": [], "room": true },
            "notification_type": if direct { "ring" } else { "notification" },
            "sender_ts": now_ms(),
            "lifetime": RING_LIFETIME_MS,
            "m.call.intent": self.intent,
            "m.relates_to": { "rel_type": "m.reference", "event_id": membership_event_id },
        });
        let response = self.room.send_raw(NOTIFICATION_EVENT, content).await?;
        let mut state = self.state.lock().unwrap();
        state.notification_event_id = Some(response.response.event_id.to_string());
        state.rung_at = direct.then(now_ms);
        state.rang = direct;
        Ok(())
    }

    /// Keeps the membership alive and the media keys flowing until `leave`.
    pub async fn run(&self, mut on_event: impl FnMut(CallEvent)) {
        let encrypted = self.encrypted().await;
        let (key_sender, key_receiver) = futures_channel::mpsc::unbounded();
        let room_id = self.room.room_id().to_owned();
        let key_handle = self.client.add_event_handler({
            let key_sender = key_sender.clone();
            move |raw: Raw<AnyToDeviceEvent>, encryption_info: Option<EncryptionInfo>| {
                let key_sender = key_sender.clone();
                let room_id = room_id.clone();
                async move {
                    // Keys only count when they arrived encrypted from the device they claim
                    let Some(info) = encryption_info else { return };
                    let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                        return;
                    };
                    if event.get("type").and_then(Value::as_str) != Some(KEYS_EVENT) {
                        return;
                    }
                    let content = event.get("content").cloned().unwrap_or_default();
                    if content.get("room_id").and_then(Value::as_str) != Some(room_id.as_str()) {
                        return;
                    }
                    let claimed = content
                        .pointer("/member/claimed_device_id")
                        .and_then(Value::as_str);
                    if claimed.is_none()
                        || claimed != info.sender_device.as_ref().map(|d| d.as_str())
                    {
                        return;
                    }
                    let (Some(index), Some(key)) = (
                        content.pointer("/keys/index").and_then(Value::as_u64),
                        content.pointer("/keys/key").and_then(Value::as_str),
                    ) else {
                        return;
                    };
                    let _ = key_sender.unbounded_send(Input::Key(CallEvent::Key {
                        identity: format!("{}:{}", info.sender, claimed.unwrap_or_default()),
                        index: index as u32,
                        key: key.to_owned(),
                    }));
                }
            }
        });
        let own_user = self.user_id.clone();
        let decline_handle = self.client.add_room_event_handler(self.room.room_id(), {
            let state = self.state.clone();
            move |raw: Raw<AnySyncTimelineEvent>| {
                let key_sender = key_sender.clone();
                let state = state.clone();
                let own_user = own_user.clone();
                async move {
                    let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                        return;
                    };
                    let kind = event
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if matches!(
                        kind,
                        CALL_REACTION_EVENT | "m.reaction" | "m.room.redaction"
                    ) {
                        let _ = key_sender.unbounded_send(Input::Timeline(event));
                        return;
                    }
                    if kind != DECLINE_EVENT {
                        return;
                    }
                    let relates = event
                        .pointer("/content/m.relates_to/event_id")
                        .and_then(Value::as_str);
                    let user = event
                        .get("sender")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let ours = state.lock().unwrap().notification_event_id.clone();
                    if relates.is_some()
                        && relates.map(ToOwned::to_owned) == ours
                        && user != own_user
                    {
                        let _ = key_sender.unbounded_send(Input::Declined(user.to_owned()));
                    }
                }
            }
        });
        let _guards = (
            self.client.event_handler_drop_guard(key_handle),
            self.client.event_handler_drop_guard(decline_handle),
        );

        let mut info = self.room.subscribe_info();
        let ticks = stream::unfold((), |_| async {
            sleep(Duration::from_secs(1)).await;
            Some((Input::Tick, ()))
        });
        let inputs = stream::select(
            stream::select((&mut info).map(|_| Input::MembersChanged), key_receiver),
            ticks,
        );
        futures_util::pin_mut!(inputs);

        let mut last_members: Option<Vec<CallMember>> = None;
        let mut pending_own_key: Option<(u64, CallEvent)> = None;
        let mut others_seen = false;
        // Raised hand reaction event id -> who raised it
        let mut hands: HashMap<String, String> = HashMap::new();
        let mut input = Some(Input::MembersChanged);
        while let Some(next) = input.take() {
            if self.state.lock().unwrap().left {
                break;
            }
            match next {
                Input::Tick => {
                    if let Err(message) = self.maintain().await {
                        if !self.state.lock().unwrap().left {
                            let _ = self.leave().await;
                            on_event(CallEvent::Error {
                                message,
                                fatal: true,
                            });
                        }
                        break;
                    }
                    if pending_own_key
                        .as_ref()
                        .is_some_and(|(due, _)| *due <= now_ms())
                    {
                        on_event(pending_own_key.take().unwrap().1);
                    }
                    let rung_at = self.state.lock().unwrap().rung_at;
                    if let Some(rung_at) = rung_at {
                        if others_seen {
                            self.state.lock().unwrap().rung_at = None;
                        } else if now_ms() > rung_at + RING_LIFETIME_MS {
                            self.state.lock().unwrap().rung_at = None;
                            on_event(CallEvent::Unanswered);
                        }
                    }
                }
                Input::MembersChanged => {
                    let members = match call_members_of(
                        &self.room,
                        (self.user_id.clone(), self.device_id.clone()),
                    )
                    .await
                    {
                        Ok(members) => members,
                        Err(e) => {
                            on_event(CallEvent::Error {
                                message: e.to_string(),
                                fatal: false,
                            });
                            Vec::new()
                        }
                    };
                    self.observe_own_membership(&members);
                    if last_members.as_ref() != Some(&members) {
                        others_seen |= members.iter().any(|m| m.user_id != self.user_id);
                        on_event(CallEvent::Members {
                            members: members.clone(),
                        });
                        if encrypted {
                            match self.share_key(&members).await {
                                Ok(Some((event, delay))) => {
                                    if delay {
                                        pending_own_key =
                                            Some((now_ms() + KEY_USE_DELAY_MS, event));
                                    } else {
                                        on_event(event);
                                    }
                                }
                                Ok(None) => {}
                                Err(e) => on_event(CallEvent::Error {
                                    message: e.to_string(),
                                    fatal: false,
                                }),
                            }
                        }
                        last_members = Some(members);
                    }
                }
                Input::Key(event) => on_event(event),
                Input::Declined(user_id) => {
                    self.state.lock().unwrap().rung_at = None;
                    on_event(CallEvent::Declined { user_id });
                }
                Input::Timeline(event) => {
                    let members = last_members.as_deref().unwrap_or_default();
                    if let Some(event) = call_timeline_event(&event, members, &mut hands) {
                        on_event(event);
                    }
                }
            }
            input = inputs.next().await;
        }
    }

    /// Notices the own membership vanishing (the server sent the delayed leave, or someone
    /// removed it) and joins again.
    fn observe_own_membership(&self, members: &[CallMember]) {
        let mut state = self.state.lock().unwrap();
        if state.left {
            return;
        }
        match members.iter().find(|m| m.is_own_device) {
            Some(own) => {
                state.own_seen = true;
                state.created_ts = Some(own.joined_at);
                state.membership_event_id = own.membership_event_id.clone();
            }
            None if state.own_seen && state.rejoin.is_none() => {
                tracing::warn!("own call membership vanished, joining again");
                state.own_seen = false;
                state.restart_due = None;
                state.renew_due = None;
                state.rejoin_retries = Retries::default();
                let first = if state.delay_id.is_some() {
                    Rejoin::CancelOldLeave
                } else {
                    Rejoin::ScheduleLeave
                };
                state.rejoin = Some((first, now_ms()));
            }
            None => {}
        }
    }

    /// Runs whatever keeps the membership up that is due: rejoining, restarting the delayed
    /// leave, renewing the membership before it expires. Errs when the call can't continue.
    async fn maintain(&self) -> std::result::Result<(), String> {
        let now = now_ms();
        let (rejoin, restart_due, renew_due) = {
            let state = self.state.lock().unwrap();
            (state.rejoin, state.restart_due, state.renew_due)
        };
        if let Some((step, due)) = rejoin {
            if due <= now {
                self.rejoin_step(step).await?;
            }
            return Ok(());
        }
        if restart_due.is_some_and(|due| due <= now) {
            self.restart_delayed_leave().await?;
        }
        if renew_due.is_some_and(|due| due <= now) {
            self.renew_membership().await?;
        }
        Ok(())
    }

    async fn rejoin_step(&self, step: Rejoin) -> std::result::Result<(), String> {
        let next = match step {
            Rejoin::CancelOldLeave => {
                let delay_id = self.state.lock().unwrap().delay_id.clone();
                let result = match delay_id {
                    Some(id) => self.update_delayed(id, UpdateAction::Cancel).await,
                    None => Ok(()),
                };
                match result.map_err(|e| classify_delayed(&e)) {
                    Ok(()) | Err(Failure::NotFound) => {
                        self.state.lock().unwrap().delay_id = None;
                        Some(Rejoin::ScheduleLeave)
                    }
                    Err(Failure::Unsupported) => {
                        self.state.lock().unwrap().delay_id = None;
                        Some(Rejoin::Join)
                    }
                    Err(failure) => {
                        return self.retry_rejoin(step, failure, "cancelling the old leave")
                    }
                }
            }
            Rejoin::ScheduleLeave => {
                if self.state.lock().unwrap().no_delayed_events {
                    Some(Rejoin::Join)
                } else {
                    match self
                        .send_delayed_leave()
                        .await
                        .map_err(|e| classify_delayed(&e))
                    {
                        Ok(_) => Some(Rejoin::Join),
                        Err(failure @ (Failure::RateLimited(_) | Failure::Network)) => {
                            return self.retry_rejoin(step, failure, "scheduling the leave")
                        }
                        Err(failure) => {
                            if matches!(failure, Failure::Unsupported) {
                                self.state.lock().unwrap().no_delayed_events = true;
                            }
                            Some(Rejoin::Join)
                        }
                    }
                }
            }
            Rejoin::Join => {
                self.send_join().await?;
                None
            }
        };
        let mut state = self.state.lock().unwrap();
        state.rejoin_retries = Retries::default();
        state.rejoin = next.map(|step| (step, now_ms()));
        Ok(())
    }

    fn retry_rejoin(
        &self,
        step: Rejoin,
        failure: Failure,
        what: &str,
    ) -> std::result::Result<(), String> {
        let mut state = self.state.lock().unwrap();
        let wait = state.rejoin_retries.next(failure, what)?;
        state.rejoin = Some((step, now_ms() + wait));
        Ok(())
    }

    /// Pushes the delayed leave back. A failed request never stops this: network errors are
    /// retried, and a leave the server lost is replaced by a new one.
    async fn restart_delayed_leave(&self) -> std::result::Result<(), String> {
        let (delay_id, leave_expected_at) = {
            let state = self.state.lock().unwrap();
            (state.delay_id.clone(), state.leave_expected_at)
        };
        let now = now_ms();
        let Some(delay_id) = delay_id else {
            return match self
                .send_delayed_leave()
                .await
                .map_err(|e| classify_delayed(&e))
            {
                Ok(_) => {
                    let mut state = self.state.lock().unwrap();
                    state.restart_retries = Retries::default();
                    state.restart_due = Some(now_ms() + DELAYED_LEAVE_RESTART_MS);
                    Ok(())
                }
                Err(Failure::Unsupported) => {
                    let mut state = self.state.lock().unwrap();
                    state.no_delayed_events = true;
                    state.restart_due = None;
                    Ok(())
                }
                Err(failure) => self.retry_restart(failure, "scheduling the leave"),
            };
        };
        let timeout = match leave_expected_at.checked_sub(now) {
            Some(left) if left > 0 => left.min(DELAYED_LEAVE_RESTART_TIMEOUT_MS),
            _ => DELAYED_LEAVE_RESTART_TIMEOUT_MS,
        };
        let result = within(
            timeout,
            self.update_delayed(delay_id.clone(), UpdateAction::Restart),
        )
        .await;
        let mut state = self.state.lock().unwrap();
        match result {
            Some(Ok(())) => {
                state.leave_expected_at = now_ms() + state.delayed_leave_ms(&self.timings);
                state.restart_retries = Retries::default();
                state.restart_due = Some(now_ms() + DELAYED_LEAVE_RESTART_MS);
                Ok(())
            }
            // A local timeout: try again right away
            None => {
                state
                    .restart_retries
                    .next(Failure::Network, "restarting the delayed leave")?;
                state.restart_due = Some(now_ms());
                Ok(())
            }
            Some(Err(error)) => match classify_delayed(&error) {
                Failure::NotFound => {
                    // The server lost it (or sending the membership cancelled it): schedule a new one
                    if state.delay_id.as_deref() == Some(delay_id.as_str()) {
                        state.delay_id = None;
                    }
                    state.restart_due = Some(now_ms());
                    Ok(())
                }
                Failure::Unsupported => {
                    state.no_delayed_events = true;
                    state.restart_due = None;
                    Ok(())
                }
                failure => {
                    drop(state);
                    self.retry_restart(failure, "restarting the delayed leave")
                }
            },
        }
    }

    fn retry_restart(&self, failure: Failure, what: &str) -> std::result::Result<(), String> {
        let mut state = self.state.lock().unwrap();
        let wait = state.restart_retries.next(failure, what)?;
        state.restart_due = Some(now_ms() + wait);
        Ok(())
    }

    /// Sends the membership again with a later `expires`, a little before it runs out.
    async fn renew_membership(&self) -> std::result::Result<(), String> {
        let (iteration, created_ts, started_at) = {
            let state = self.state.lock().unwrap();
            (state.expiry_iteration, state.created_ts, state.started_at)
        };
        let next = iteration + 1;
        let expires = self.timings.membership_expiry.as_millis() as u64 * next;
        let content = self.membership_content(expires, Some(created_ts.unwrap_or(started_at)));
        let result = self.send_member_state(content).await;
        let mut state = self.state.lock().unwrap();
        match result {
            Ok(_) => {
                state.expiry_iteration = next;
                state.renew_retries = Retries::default();
                state.renew_due = Some(state.renew_at(&self.timings));
                Ok(())
            }
            Err(error) => {
                let wait = state
                    .renew_retries
                    .next(classify(&error), "renewing the membership")?;
                state.renew_due = Some(now_ms() + wait);
                Ok(())
            }
        }
    }

    /// Cancels the scheduled leave on the server, as if the server had lost it. For tests.
    #[doc(hidden)]
    pub async fn cancel_delayed_leave(&self) -> Result<()> {
        if let Some(id) = self.delay_id() {
            self.update_delayed(id, UpdateAction::Cancel).await?;
        }
        Ok(())
    }

    /// Gives the media key to devices that lack it, rotating it when someone left. Returns the
    /// own key event when it changed, and whether to wait before using it.
    async fn share_key(&self, members: &[CallMember]) -> Result<Option<(CallEvent, bool)>> {
        let targets: Vec<(String, String, u64)> = members
            .iter()
            .filter(|m| !m.is_own_device)
            .map(|m| (m.user_id.clone(), m.device_id.clone(), m.joined_at))
            .collect();
        let current = self.state.lock().unwrap().outbound.clone();
        let now = now_ms();
        let (key, recipients, changed) = match current {
            None => {
                let key = OutboundKey {
                    index: 0,
                    key: random_key()?,
                    created_at: now,
                    shared_with: Vec::new(),
                };
                (key, targets.clone(), true)
            }
            Some(current) => {
                let left = current.shared_with.iter().any(|s| !targets.contains(s));
                let joined: Vec<_> = targets
                    .iter()
                    .filter(|t| !current.shared_with.contains(t))
                    .cloned()
                    .collect();
                if left || (!joined.is_empty() && now - current.created_at >= KEY_ROTATION_GRACE_MS)
                {
                    let key = OutboundKey {
                        index: (current.index + 1) % 256,
                        key: random_key()?,
                        created_at: now,
                        shared_with: Vec::new(),
                    };
                    (key, targets.clone(), true)
                } else if !joined.is_empty() {
                    (current, joined, false)
                } else {
                    return Ok(None);
                }
            }
        };
        let encoded = STANDARD.encode(key.key);
        if !recipients.is_empty() {
            let content = json!({
                "keys": { "index": key.index, "key": encoded },
                "room_id": self.room.room_id(),
                "member": { "claimed_device_id": self.device_id, "id": self.identity },
                "session": { "application": "m.call", "call_id": "", "scope": "m.room" },
                "sent_ts": now,
            });
            let raw: Raw<AnyToDeviceEventContent> =
                Raw::new(&content).map_err(call_error)?.cast_unchecked();
            let encryption = self.client.encryption();
            let mut devices = Vec::new();
            for (user, device, _) in &recipients {
                let (Ok(user), device) = (
                    <&matrix_sdk::ruma::UserId>::try_from(user.as_str()),
                    device.as_str(),
                ) else {
                    continue;
                };
                if let Ok(Some(device)) = encryption.get_device(user, device.into()).await {
                    devices.push(device);
                }
            }
            encryption
                .encrypt_and_send_raw_to_device(
                    devices.iter().collect(),
                    KEYS_EVENT,
                    raw,
                    CollectStrategy::AllDevices,
                )
                .await
                .map_err(call_error)?;
        }
        let mut shared = key.clone();
        shared.shared_with.extend(recipients);
        let delay = changed && !shared.shared_with.is_empty();
        self.state.lock().unwrap().outbound = Some(shared);
        Ok(changed.then(|| {
            (
                CallEvent::Key {
                    identity: self.identity.clone(),
                    index: key.index,
                    key: encoded,
                },
                delay,
            )
        }))
    }

    /// Rings the others again (when nobody answered); returns false when someone is in the call.
    pub async fn ring_again(&self) -> Result<bool> {
        let others = call_members_of(&self.room, (self.user_id.clone(), self.device_id.clone()))
            .await?
            .iter()
            .any(|m| m.user_id != self.user_id);
        let membership = self.state.lock().unwrap().membership_event_id.clone();
        match membership {
            Some(id) if !others => {
                self.notify(&id).await?;
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    /// Sends an emoji into the call; everyone sees it on this device's tile.
    pub async fn send_reaction(&self, emoji: &str, name: &str) -> Result<()> {
        let Some(membership) = self.state.lock().unwrap().membership_event_id.clone() else {
            return Ok(());
        };
        let content = json!({
            "m.relates_to": { "rel_type": "m.reference", "event_id": membership },
            "emoji": emoji,
            "name": name,
        });
        self.room.send_raw(CALL_REACTION_EVENT, content).await?;
        Ok(())
    }

    /// Raises or lowers this device's hand (a 🖐️ reaction to the membership).
    pub async fn set_hand_raised(&self, raised: bool) -> Result<()> {
        let (membership, current) = {
            let state = self.state.lock().unwrap();
            (
                state.membership_event_id.clone(),
                state.own_hand_event_id.clone(),
            )
        };
        let Some(membership) = membership else {
            return Ok(());
        };
        match (raised, current) {
            (true, None) => {
                let content = json!({
                    "m.relates_to": { "rel_type": "m.annotation", "event_id": membership, "key": RAISED_HAND_KEY },
                });
                let response = self.room.send_raw("m.reaction", content).await?;
                self.state.lock().unwrap().own_hand_event_id =
                    Some(response.response.event_id.to_string());
            }
            (false, Some(event_id)) => {
                self.state.lock().unwrap().own_hand_event_id = None;
                let event_id =
                    matrix_sdk::ruma::OwnedEventId::try_from(event_id).map_err(call_error)?;
                self.room.redact(&event_id, None, None).await?;
            }
            _ => {}
        }
        Ok(())
    }

    /// Leaves the call (the delayed leave goes out right away).
    pub async fn leave(&self) -> Result<()> {
        let delay_id = {
            let mut state = self.state.lock().unwrap();
            state.left = true;
            state.rejoin = None;
            state.delay_id.take()
        };
        if let Some(delay_id) = delay_id {
            if self
                .update_delayed(delay_id, UpdateAction::Send)
                .await
                .is_ok()
            {
                return Ok(());
            }
        }
        self.room
            .send_state_event_raw(CALL_MEMBER_EVENT, &self.state_key, json!({}))
            .await?;
        Ok(())
    }
}

impl SessionState {
    fn delayed_leave_ms(&self, timings: &CallTimings) -> u64 {
        timings.delayed_leave.as_millis() as u64
    }

    /// When to renew next: before the current `expires` runs out, and at least hourly
    fn renew_at(&self, timings: &CallTimings) -> u64 {
        let period = (timings.membership_expiry.as_millis() as u64).min(MEMBERSHIP_RENEW_MAX_MS);
        (self.started_at + period * self.expiry_iteration)
            .saturating_sub(MEMBERSHIP_RENEW_HEADROOM_MS)
    }
}

/// Reactions and raised hands relate to someone's membership event
fn call_timeline_event(
    event: &Value,
    members: &[CallMember],
    hands: &mut HashMap<String, String>,
) -> Option<CallEvent> {
    let kind = event.get("type")?.as_str()?;
    if kind == "m.room.redaction" {
        let redacts = event
            .get("redacts")
            .or_else(|| event.pointer("/content/redacts"))?
            .as_str()?;
        let identity = hands.remove(redacts)?;
        return Some(CallEvent::HandRaised {
            identity,
            raised: false,
        });
    }
    let relates = event.pointer("/content/m.relates_to/event_id")?.as_str()?;
    let sender = event.get("sender")?.as_str()?;
    let member = members
        .iter()
        .find(|m| m.membership_event_id.as_deref() == Some(relates) && m.user_id == sender)?;
    if kind == CALL_REACTION_EVENT {
        let emoji = event.pointer("/content/emoji")?.as_str()?;
        return Some(CallEvent::Reaction {
            identity: member.identity.clone(),
            emoji: emoji.to_owned(),
        });
    }
    let key = event.pointer("/content/m.relates_to/key")?.as_str()?;
    if kind == "m.reaction" && key.starts_with('🖐') {
        hands.insert(
            event.get("event_id")?.as_str()?.to_owned(),
            member.identity.clone(),
        );
        return Some(CallEvent::HandRaised {
            identity: member.identity.clone(),
            raised: true,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_session_memberships() {
        let event = json!({
            "sender": "@a:x", "origin_server_ts": 1000, "state_key": "_@a:x_DEV_m.call",
            "content": {
                "application": "m.call", "call_id": "", "scope": "m.room", "device_id": "DEV",
                "expires": 10_000, "m.call.intent": "audio",
                "foci_preferred": [{ "type": "livekit", "livekit_service_url": "https://sfu.x/", "livekit_alias": "!r:x" }],
                "focus_active": { "type": "livekit", "focus_selection": "multi_sfu" },
            },
        });
        let member = parse_member(&event, ("@a:x", "DEV"), 2000).unwrap();
        assert_eq!(member.identity, "@a:x:DEV");
        assert_eq!(member.service_url.as_deref(), Some("https://sfu.x"));
        assert!(member.is_own_device);
        assert_eq!(member.intent.as_deref(), Some("audio"));
        assert!(
            parse_member(&event, ("@b:x", "D"), 20_000).is_none(),
            "expired"
        );
        let left = json!({ "sender": "@a:x", "origin_server_ts": 1000, "content": {} });
        assert!(parse_member(&left, ("@a:x", "DEV"), 2000).is_none());
    }

    #[test]
    fn reads_the_jwt_claims() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"sub":"@a:x:DEV","video":{"room":"r"}}"#);
        let claims = decode_jwt_claims(&format!("h.{payload}.s")).unwrap();
        assert_eq!(claims["sub"], "@a:x:DEV");
        assert_eq!(claims["video"]["room"], "r");
    }

    #[test]
    fn finds_livekit_foci_leniently() {
        let foci = json!([{ "type": "other" }, { "type": "livekit", "livekit_service_url": " https://sfu.x// " }]);
        assert_eq!(livekit_from(Some(&foci)).as_deref(), Some("https://sfu.x"));
        assert_eq!(livekit_from(Some(&json!({}))), None);
    }

    #[test]
    fn renews_before_expiry() {
        let timings = CallTimings {
            membership_expiry: Duration::from_secs(20),
            delayed_leave: Duration::from_secs(18),
        };
        let state = SessionState {
            started_at: 1_000_000,
            expiry_iteration: 1,
            ..Default::default()
        };
        assert_eq!(state.renew_at(&timings), 1_015_000);
        assert_eq!(
            SessionState {
                started_at: 0,
                expiry_iteration: 2,
                ..Default::default()
            }
            .renew_at(&CallTimings::default()),
            2 * 60 * 60 * 1000 - 5_000
        );
    }
}
