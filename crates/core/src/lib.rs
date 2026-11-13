//! WizardChat's client core.
//!
//! Everything a WizardChat app needs that isn't UI: signing in, syncing, the room list and room
//! timelines, built on matrix-rust-sdk. Apps talk to it only through [`WizardClient`] and get
//! state pushed to them as [`ListDiff`]s of plain, serialisable view models, so the same core can
//! sit behind the web app (wasm), desktop (Tauri), iOS (SwiftUI) and Android (Compose).

// matrix-sdk's deeply nested futures need more than the default limit
#![recursion_limit = "256"]
// The SDK types aren't Send on wasm, but native builds need the Arcs
#![cfg_attr(target_arch = "wasm32", allow(clippy::arc_with_non_send_sync))]

mod account;
mod auth;
mod call_history;
mod calls;
mod client;
mod content;
mod custom_state;
mod delayed_events;
mod diff;
mod directory;
mod encryption;
mod error;
mod event_history;
mod extras;
mod features;
mod homeserver;
mod key_export;
mod key_recovery;
mod media_download;
mod member_profile;
mod net;
mod profile;
mod push;
mod qr_login;
mod rich_text;
mod room_admin;
mod room_details;
mod room_events;
mod rooms;
pub mod rpc;
mod sections;
mod session;
mod settings;
mod spaces;
mod timeline;
mod trust;
mod widgets;

pub use account::{RegistrationInfo, ServerFeatures, ThirdPartyId};
pub use account::{UiaAuth, UiaOutcome};
pub use auth::{
    AppInfo, IdentityProvider, LoginIdentifier, PendingLogin, ServerInfo, SessionEvent,
};
pub use call_history::{CallHistoryView, CallOutcome, CallParticipantView};
pub use calls::CallTimings;
pub use calls::{
    CallEvent, CallMember, CallSession, IncomingCall, IncomingCallEvent, RingEnd, SfuConfig,
};
pub use client::{sniff_mime_type, LoadState};
pub use client::{SyncState, WizardClient};
pub use content::{EntryContent, MediaInfo, PollAnswerView, PollView, ReplyPreview};
pub use custom_state::{mudrix_state_types, StateEventView};
pub use delayed_events::DelayedEvent;
pub use diff::ListDiff;
pub use directory::{PublicRoom, PublicRoomsPage, UserResult};
pub use encryption::{
    DeviceInfo, EncryptionStatus, VerificationEmoji, VerificationFlow, VerificationStatus,
};
pub use error::{Error, Result};
pub use event_history::{EventVersion, SearchDirection, TimestampEvent};
pub use extras::{ThreadInfo, ThreadPage, UrlPreview};
pub use features::{EmojiPack, Notification, PackImage, SearchHit, SearchResults};
pub use homeserver::HomeserverSoftware;
pub use key_export::KeyImportResult;
pub use key_recovery::KeyRestoreProgress;
pub use media_download::DownloadProgress;
pub use member_profile::RoomMemberProfile;
pub use profile::{
    CustomStatus, Presence, PresenceInfo, UserProfile, MAX_STATUS_LENGTH, STATUS_FIELD,
};
pub use push::PusherConfig;
pub use qr_login::{QrLoginControl, QrLoginStatus};
pub use rich_text::{RichBlock, RichSpan};
pub use room_admin::{
    EventSource, MemberEntry, ResolvedAlias, RoomSettings, RoomTag, ServerCapabilities,
    StateChange, Tombstone,
};
pub use room_details::{Member, RoomDetails, RoomPermissions};
pub use room_events::{RoomEvent, RoomEventsPage};
pub use rooms::UnreadMention;
pub use rooms::{
    CreateRoomOptions, InviteInfo, LastMessage, LastMessageKind, RoomFilter, RoomKind, RoomSummary,
};
pub use sections::RoomSection;
pub use session::{Session, StoreConfig};
pub use settings::{MentionRule, NotificationMode, NotificationPrefs};
pub use spaces::SpaceHierarchy;
pub use spaces::{SpaceChild, SpaceLink, SpaceNode, SpaceSummary};
pub use timeline::{
    Attachment, MentionsInput, MentionsView, MessageKind, Reaction, ReadReceiptView, RoomTimeline,
    SendState, ShieldCode, ShieldColor, ShieldView, ThreadSummaryView, TimelineEntry, TimelineKind,
    TypingUser,
};
pub use timeline::{UploadProgress, UploadedAttachment};
pub use trust::{IdentityChange, UserTrust};
pub use widgets::Widget;
