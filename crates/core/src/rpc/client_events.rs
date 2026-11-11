//! `WizardClient`: delayed events, jumping to a date, edit history and per-room profiles

use serde_json::Value;

use super::Bytes;
use crate::{
    DelayedEvent, EventVersion, RoomMemberProfile, SearchDirection, TimestampEvent, WizardClient,
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
