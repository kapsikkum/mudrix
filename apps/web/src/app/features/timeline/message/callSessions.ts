import { formatUserId } from '@/util/matrix';
import { entryEventId, type EventEntry } from './entry';

export const CALL_MEMBER_EVENT_TYPES: ReadonlySet<string> = new Set([
  'org.matrix.msc3401.call.member',
  'org.matrix.msc4143.rtc.member',
]);

const CALL_SESSION_GAP_MS = 10 * 60 * 1000;

export interface CallSessionParticipant {
  userId: string;
  name: string;
  mxcAvatar: string | null;
  joinedTs: number;
}

export interface CallSessionSummary {
  events: EventEntry[];
  startTs: number;
  endTs: number | null;
  participants: CallSessionParticipant[];
  isPartial: boolean;
  version: string;
}

export type MemberLookup = (userId: string) => { name: string | null; avatarUrl: string | null };

export function isCallMemberEvent(event: EventEntry): boolean {
  return event.content.type === 'state' && CALL_MEMBER_EVENT_TYPES.has(event.content.eventType);
}

function isCallJoinEvent(event: EventEntry): boolean {
  if (event.content.type !== 'state' || !isCallMemberEvent(event)) return false;
  return Boolean(event.content.content?.application);
}

export function isRedundantJoin(event: EventEntry): boolean {
  if (event.content.type !== 'state' || !isCallJoinEvent(event)) return false;
  const prevContent = event.content.prevContent;
  return !!prevContent && 'application' in prevContent;
}

function getParticipant(
  lookup: MemberLookup | undefined,
  event: EventEntry,
  joinedTs: number
): CallSessionParticipant {
  const userId = event.sender;
  const member = lookup?.(userId);
  return {
    userId,
    name: member?.name ?? event.senderName ?? formatUserId(userId),
    mxcAvatar: member?.avatarUrl ?? event.senderAvatar ?? null,
    joinedTs,
  };
}

function dayKey(ts: number): number {
  const date = new Date(ts);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

interface SessionState {
  events: EventEntry[];
  openUsers: Set<string>;
  participants: CallSessionParticipant[];
  participantIds: Set<string>;
  startTs: number;
  lastActivityTs: number;
  endedTs: number | null;
  closing: boolean;
  isPartial: boolean;
  sawJoin: boolean;
}

function emptyState(): SessionState {
  return {
    events: [],
    openUsers: new Set(),
    participants: [],
    participantIds: new Set(),
    startTs: 0,
    lastActivityTs: 0,
    endedTs: null,
    closing: false,
    isPartial: false,
    sawJoin: false,
  };
}

export function buildCallSessions(
  events: EventEntry[],
  lookup?: MemberLookup
): Map<string, CallSessionSummary> {
  const sessions = new Map<string, CallSessionSummary>();
  let state = emptyState();

  const emit = (finalise: (s: SessionState) => void): void => {
    const first = state.events[0];
    if (!first) {
      state = emptyState();
      return;
    }
    finalise(state);
    sessions.set(entryEventId(first), {
      events: state.events,
      startTs: state.startTs,
      endTs: state.endedTs,
      participants: state.participants,
      isPartial: state.isPartial,
      version: `${state.endedTs ?? 'live'}|${state.isPartial}|${state.participants
        .map((p) => `${p.userId}:${p.name}:${p.mxcAvatar ?? ''}`)
        .join(',')}`,
    });
    state = emptyState();
  };

  const closeUnchanged = (s: SessionState): void => {
    if (s.endedTs === null) s.endedTs = s.lastActivityTs;
  };

  const closeLive = (s: SessionState): void => {
    if (s.endedTs === null && Date.now() - s.lastActivityTs >= CALL_SESSION_GAP_MS) {
      s.endedTs = s.lastActivityTs;
    }
  };

  for (const event of events) {
    if (!isCallMemberEvent(event)) continue;
    if (isRedundantJoin(event)) continue;

    const sender = event.sender;
    const ts = event.timestamp;
    const joined = isCallJoinEvent(event);
    const knownUser = state.participantIds.has(sender);

    const gap = state.events.length > 0 ? ts - state.lastActivityTs : 0;
    const dayChanged = state.events.length > 0 && dayKey(ts) !== dayKey(state.startTs);

    let continues: boolean;
    if (state.events.length === 0) {
      continues = false;
    } else if (dayChanged || gap >= CALL_SESSION_GAP_MS) {
      continues = false;
    } else if (state.closing) {
      continues = !joined && knownUser;
    } else {
      continues = true;
    }

    if (!continues) {
      if (state.events.length > 0) emit(closeUnchanged);
    }

    if (state.events.length === 0) {
      state.startTs = ts;
      state.isPartial = !joined;
    }

    state.events.push(event);
    state.lastActivityTs = ts;

    if (!joined) {
      state.openUsers.delete(sender);
      if (state.closing) {
        state.endedTs = ts;
      } else if (state.sawJoin && state.openUsers.size === 0) {
        state.endedTs = ts;
        state.closing = true;
      }
    } else {
      state.sawJoin = true;
      state.openUsers.add(sender);
      if (!state.participantIds.has(sender)) {
        state.participantIds.add(sender);
        state.participants.push(getParticipant(lookup, event, ts));
      }
    }
  }

  emit(closeLive);
  return sessions;
}
