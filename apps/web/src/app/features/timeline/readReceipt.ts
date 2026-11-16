/**
 * When the open room may send a read receipt.
 *
 * Ported from the old web app's `useRoomReadReceipts`, where receipts kept being sent while the
 * room still counted as unread on the server, a receipt that failed was retried instead of being
 * remembered as sent, and nothing was marked read while the timeline was scrolled up or the tab
 * was in the background.
 */

/** A receipt for the same event is not sent again within this window (its echo may still be due). */
export const READ_RECEIPT_RESEND_MS = 10_000;

/** A local echo's id starts with `~`: the server has never seen it, so a receipt for it is refused. */
export function isServerEventId(eventId: string | null | undefined): eventId is string {
  return typeof eventId === 'string' && eventId.length > 0 && !eventId.startsWith('~');
}

/** The room fields that say whether the server still counts anything as unread. */
export interface ReadReceiptRoomState {
  unreadMessages: number;
  unreadMentions: number;
  unreadNotifications: number;
  markedUnread: boolean;
}

/**
 * Whether the server still reports something unread in the room, so a receipt is worth sending
 * even when the latest known event has not changed (its echo may still be pending, or an earlier
 * receipt may have failed).
 */
export function roomHasUnread(room: ReadReceiptRoomState | null | undefined): boolean {
  if (!room) return false;
  return (
    room.markedUnread ||
    room.unreadMessages > 0 ||
    room.unreadMentions > 0 ||
    room.unreadNotifications > 0
  );
}

export type ReadReceiptSkipReason =
  | 'unfocused'
  | 'hidden'
  | 'scrolled-up'
  | 'not-live'
  | 'no-event'
  | 'pending-event'
  | 'already-sent';

export type ReadReceiptDecision = { send: true } | { send: false; reason: ReadReceiptSkipReason };

export interface ReadReceiptInput {
  /** The tab or window the timeline lives in has focus. */
  focused: boolean;
  /** The document is visible (not a hidden tab). */
  visible: boolean;
  /** The timeline is scrolled to the bottom of what is loaded. */
  atBottom: boolean;
  /** The loaded window reaches the live end, so nothing newer is below it. */
  atLiveEnd: boolean;
  /** The newest event in the timeline the server knows about; null when there is none. */
  latestEventId: string | null;
  /** The event the last receipt in this room went to, if any. */
  lastSentEventId: string | null;
  /** When that receipt was attempted, in milliseconds since the epoch. */
  lastSentAt: number | null;
  /** The room still counts as unread on the server. */
  roomUnread: boolean;
  now: number;
}

/**
 * The whole rule: an open, focused, visible room at the live end sends a receipt to its newest
 * server event; the same event is retried only after {@link READ_RECEIPT_RESEND_MS} while the
 * room still counts as unread (a receipt whose echo is late, or one that failed).
 */
export function decideReadReceipt(input: ReadReceiptInput): ReadReceiptDecision {
  if (!input.focused) return { send: false, reason: 'unfocused' };
  if (!input.visible) return { send: false, reason: 'hidden' };
  if (!input.atBottom) return { send: false, reason: 'scrolled-up' };
  if (!input.atLiveEnd) return { send: false, reason: 'not-live' };
  if (!input.latestEventId) return { send: false, reason: 'no-event' };
  if (!isServerEventId(input.latestEventId)) return { send: false, reason: 'pending-event' };
  if (input.latestEventId !== input.lastSentEventId) return { send: true };
  const since = input.lastSentAt === null ? Infinity : input.now - input.lastSentAt;
  if (input.roomUnread && since >= READ_RECEIPT_RESEND_MS) return { send: true };
  return { send: false, reason: 'already-sent' };
}
