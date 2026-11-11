//! `WizardClient`: delayed events, jumping to a date, edit history and per-room profiles

use serde_json::Value;

use super::{Bytes, Listener, Subscription};
use crate::{
    DelayedEvent, EventVersion, KeyImportResult, RoomMemberProfile, SearchDirection,
    StateEventView, TimestampEvent, WizardClient,
};

rpc_methods! {
    WizardClient(this: WizardClient) {
        /// Asks the homeserver to send an event later (MSC4140, "send later"): `eventType` with
        /// `content` after `delayMs` milliseconds, as a state event when `stateKey` is given.
        /// Resolves to the delay id. Rejects with `unsupportedByServer` when the homeserver
        /// hasn't switched delayed events on, and with `unsupported` for an encrypted room (the
        /// server would have to send the plain event).
        call fn sendDelayedEvent(
            room_id: String,
            event_type: String,
            content: Value,
            delay_ms: u64,
            state_key: Option<String>,
        ) -> String {
            this.send_delayed_event(&room_id, &event_type, content, delay_ms, state_key).await
        }

        /// The user's scheduled delayed events, soonest first; only a room's with `roomId`.
        /// Rejects with `unsupportedByServer` like `sendDelayedEvent`.
        call fn listDelayedEvents(room_id: Option<String>) -> Vec<DelayedEvent> {
            this.list_delayed_events(room_id.as_deref()).await
        }

        /// The ID of the event nearest `timestamp` (milliseconds since the Unix epoch) in a room,
        /// looking `direction` from it ("jump to date"); null when the room has no event that
        /// way. Open it with `timelineOf(roomId, { type: 'event', eventId })`. Rejects with
        /// `unsupportedByServer` when the homeserver can't look up dates.
        call fn timestampToEvent(
            room_id: String,
            timestamp: u64,
            direction: SearchDirection,
        ) -> Option<TimestampEvent> {
            this.timestamp_to_event(&room_id, timestamp, direction).await
        }

        /// Every version of a message, oldest first: the original (`isOriginal`) and its edits,
        /// decrypted in encrypted rooms (up to 200 edits; edits by anyone but the sender are
        /// left out).
        call fn eventEditHistory(room_id: String, event_id: String) -> Vec<EventVersion> {
            this.event_edit_history(&room_id, &event_id).await
        }

        /// A person's name and picture in one room or space (its `m.room.member` event), which
        /// can differ from their account profile. Works for any user; the server answers for
        /// people this device hasn't loaded.
        call fn roomMemberProfile(room_id: String, user_id: String) -> RoomMemberProfile {
            this.room_member_profile(&room_id, &user_id).await
        }

        /// Sets the own name in one room or space only (the member event's `displayname`); null
        /// or empty goes back to the account's display name. Needs a joined room.
        call fn setRoomNickname(room_id: String, displayname: Option<String>) -> () {
            this.set_room_nickname(&room_id, displayname).await
        }

        /// Sets the own picture in one room or space only; without `data` it goes back to the
        /// account's picture. Needs a joined room.
        call fn setRoomMemberAvatar(room_id: String, data: Option<Bytes>, mimetype: Option<String>) -> () {
            let image = data.map(|d| (d.0, mimetype.unwrap_or_else(|| "image/png".into())));
            this.set_room_member_avatar(&room_id, image).await
        }

        /// Every state event of the given types in a room, with who set it and when (the sender
        /// is what permission checks need). Mudrix's own types (`io.github.kapsikkum.mudrix.*`
        /// and the older `chat.mudrix.*`) and space children come from this device; the server
        /// is asked once when there are none there or for other types.
        call fn stateEventsWithSender(room_id: String, event_types: Vec<String>) -> Vec<StateEventView> {
            this.state_events_with_sender(&room_id, &event_types).await
        }

        /// Calls `listener` with every state event of one of `types` arriving in a joined room,
        /// the first sync's and your own changes included. Mudrix's state types are requested
        /// from the server in every room (a separate light sync connection runs beside the room
        /// list's), so this hears them without polling.
        watch fn watchStateEvents(types: Vec<String>, listener: Listener<StateEventView>) -> Subscription {
            Ok(listener.clone().watch(async move {
                this.watch_state_events(types, |e| listener.emit(&e)).await
            }))
        }

        /// The state types Mudrix keeps in rooms and spaces, under both namespaces; pass them to
        /// `stateEventsWithSender` or `watchStateEvents`.
        bare fn mudrixStateTypes() -> Vec<String> {
            Ok(crate::mudrix_state_types())
        }

        /// Writes every room key this device has to a file, encrypted with `passphrase`
        /// (Element's key file format). Desktop and mobile only: in the browser it rejects with
        /// `unsupported`.
        call fn exportRoomKeys(path: String, passphrase: String) -> () {
            this.export_room_keys(&path, &passphrase).await
        }

        /// Adds the room keys of a key file (from `exportRoomKeys` or Element); messages they
        /// unlock decrypt by themselves. A wrong passphrase rejects with `wrongRecoveryKey`.
        /// Desktop and mobile only: in the browser it rejects with `unsupported`.
        call fn importRoomKeys(path: String, passphrase: String) -> KeyImportResult {
            this.import_room_keys(&path, &passphrase).await
        }

        /// Calls a delayed event off so it is never sent.
        call fn cancelDelayedEvent(delay_id: String) -> () {
            this.cancel_delayed_event(&delay_id).await
        }

        /// Has the server send a delayed event right now.
        call fn sendDelayedEventNow(delay_id: String) -> () {
            this.send_delayed_event_now(&delay_id).await
        }
    }
}
