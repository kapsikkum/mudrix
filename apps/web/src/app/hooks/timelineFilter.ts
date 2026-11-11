import type { TimelineEntry } from '@wizardchat/core';
import type { EventEntry } from '@/app/features/timeline/message/entry';

/** The appearance settings that hide some of a room's system lines. */
export interface TimelineHidePrefs {
  /** Joins and leaves (kicks and bans count as leaves) */
  hideMembership: boolean;
  /** Display name and picture changes */
  hideProfile: boolean;
}

/** Hide nothing: for places that only need to know what kinds of line exist. */
export const SHOW_ALL: TimelineHidePrefs = { hideMembership: false, hideProfile: false };

const JOIN_CHANGES = new Set(['Joined', 'InvitationAccepted']);
const LEAVE_CHANGES = new Set(['Left', 'Kicked', 'KickedAndBanned']);

/** Whether an event gets a row in the timeline, given what the user chose to hide. */
export function isTimelineRenderedEntry(
  entry: TimelineEntry,
  prefs: TimelineHidePrefs
): entry is EventEntry {
  if (entry.kind !== 'event') return false;
  const { content } = entry;
  switch (content.type) {
    case 'membership':
      return (
        !prefs.hideMembership &&
        content.change !== null &&
        (JOIN_CHANGES.has(content.change) || LEAVE_CHANGES.has(content.change))
      );
    case 'profileChange':
      // A change of neither name nor picture has nothing to say
      return !prefs.hideProfile && (content.displayName != null || content.avatar != null);
    case 'state':
    case 'callPart':
    case 'other':
      return false;
    default:
      return true;
  }
}

/** Read avatars sit on messages only, not on joins, leaves, profile changes or call events */
export function isReceiptAnchorEntry(entry: TimelineEntry): entry is EventEntry {
  if (!isTimelineRenderedEntry(entry, SHOW_ALL)) return false;
  const type = entry.content.type;
  return type !== 'membership' && type !== 'profileChange' && type !== 'call';
}

/** Lines of the room itself rather than a person's message: they never group with messages. */
export function isSystemLine(entry: EventEntry): boolean {
  return entry.content.type === 'membership' || entry.content.type === 'profileChange';
}
