import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EventStatus, KnownMembership } from 'matrix-js-sdk';
import type {
  MatrixClient,
  MatrixEvent,
  Room,
  Membership,
  EventTimeline,
  EventTimelineSet,
} from 'matrix-js-sdk';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { useSyncReady } from '@/app/hooks/useSync';
import { formatUserId } from '@/util/matrix';
import { formatDateLabel } from '@/util/format';
import { isPinnedEvent } from '@/app/features/timeline/message/pinning';
import {
  computeRoomPermissions,
  computeMessagePermissions,
} from '@/app/features/timeline/message/permissions';
import { applyRedactionToRelations } from '@/app/features/timeline/message/reactions';
import {
  CALL_MEMBER_EVENT_TYPES,
  buildCallSessions,
  isRedundantJoin,
  type CallSessionSummary,
} from '@/app/features/timeline/message/callSessions';
import { getEncryptedFile } from '@/app/features/timeline/encryptedMedia';
import type { ItemRange } from '@/app/hooks/useVirtualPaginator';
import {
  getLiveTimeline,
  getLinkedTimelines,
  getTimelinesEventsCount,
  timelineToEventsCount,
  getEventIdAbsoluteIndex,
  decryptAllTimelineEvent,
} from '@/util/timeline';
import { Direction } from '@/app/hooks/useVirtualPaginator';

const PAGINATION_LIMIT = 80;
const PAGINATION_TIMEOUT_MS = 25000;

const SYSTEM_EVENT_TYPES = new Set(['m.room.member']);
const MESSAGE_EVENT_TYPES = new Set([
  'm.room.message',
  'm.sticker',
  'm.room.encrypted',
  'm.poll.start',
  'org.matrix.msc3381.poll.start',
]);
const HIDDEN_EVENT_TYPES = new Set([
  'm.poll.response',
  'org.matrix.msc3381.poll.response',
  'm.poll.end',
  'org.matrix.msc3381.poll.end',
]);

const EMPTY_REDACTED = new Set<string>();
const EMPTY_EDITS = new Map<string, string>();
const EMPTY_CALL_SESSIONS = new Map<string, CallSessionSummary>();

export function isTimelineRenderedEvent(event: MatrixEvent): boolean {
  const type = event.getType();
  if (HIDDEN_EVENT_TYPES.has(type)) return false;
  const rel = event.getRelation()?.rel_type;
  if (rel === 'm.replace' || rel === 'm.reference') return false;
  if (
    !MESSAGE_EVENT_TYPES.has(type) &&
    !SYSTEM_EVENT_TYPES.has(type) &&
    !CALL_MEMBER_EVENT_TYPES.has(type)
  )
    return false;

  if (CALL_MEMBER_EVENT_TYPES.has(type) && isRedundantJoin(event)) return false;

  if (type === 'm.room.member') {
    const content = event.getContent();
    const prevContent = event.getPrevContent();
    const membership = content?.membership;
    const prevMembership = prevContent?.membership;
    const isJoin = membership === 'join' && prevMembership !== 'join';
    const isLeave = (membership === 'leave' || membership === 'ban') && prevMembership === 'join';
    if (!isJoin && !isLeave) return false;
  }

  return true;
}

export interface TimelineItem {
  event: MatrixEvent;
  isOwn: boolean;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  isGrouped: boolean;
  showDateSep: boolean;
  dateSepLabel: string;
  isSystemMessage: boolean;
  reactionVersion: number;
  isEdited: boolean;
  isRedacted: boolean;
  isPinned: boolean;
  canEdit: boolean;
  canRedact: boolean;
  canPin: boolean;
  isDecrypting: boolean;
  isUndecryptable: boolean;
  isSending: boolean;
  isFailed: boolean;
  sendError: string | null;
  optimisticBody: string | null;
  galleryEvents: MatrixEvent[] | null;
  callSession: CallSessionSummary | null;
}

export function itemContainsEvent(item: TimelineItem, eventId: string): boolean {
  if (item.event.getId() === eventId) return true;
  if (item.callSession?.events.some((e) => e.getId() === eventId)) return true;
  return item.galleryEvents?.some((e) => e.getId() === eventId) ?? false;
}

export function indexOfEvent(items: TimelineItem[], eventId: string): number {
  return items.findIndex((item) => itemContainsEvent(item, eventId));
}

function computeDecryptState(event: MatrixEvent): {
  isDecrypting: boolean;
  isUndecryptable: boolean;
} {
  return {
    isDecrypting: event.isBeingDecrypted(),
    isUndecryptable: event.isDecryptionFailure(),
  };
}

export type BuildItemsSeed = { prevEvent?: MatrixEvent | null };

export function buildItems(
  events: MatrixEvent[],
  client: MatrixClient,
  roomId: string,
  t: (key: string) => string,
  locale: string,
  optimisticRedactedIds: ReadonlySet<string> = EMPTY_REDACTED,
  optimisticEditBodies: ReadonlyMap<string, string> = EMPTY_EDITS,
  seed: BuildItemsSeed = {},
  callSessions: ReadonlyMap<string, CallSessionSummary> = EMPTY_CALL_SESSIONS
): TimelineItem[] {
  const myId = client.getUserId() ?? '';
  const room = client.getRoom(roomId);
  const roomPerms = computeRoomPermissions(room, myId);
  const items: TimelineItem[] = [];

  const seedEvent = seed.prevEvent ?? null;
  let lastSenderId = seedEvent?.getSender() ?? '';
  let lastTs = seedEvent?.getTs() ?? 0;
  let lastDate = seedEvent ? formatDateLabel(seedEvent.getTs(), t, locale) : '';

  const isGalleryCandidate = (e: MatrixEvent): boolean => {
    if (e.isRedacted() || e.isDecryptionFailure()) return false;
    if (e.getRelation()) return false;
    const c = e.getContent() as Record<string, unknown> | null;
    if (!c || typeof c !== 'object') return false;
    if ((c.msgtype as string | undefined) !== 'm.image') return false;
    if (
      ((c.info as Record<string, unknown> | undefined)?.mimetype as string | undefined) ===
      'image/svg+xml'
    ) {
      return false;
    }
    const encFile = getEncryptedFile(c);
    const url = c.url;
    return Boolean(encFile) || (typeof url === 'string' && url.startsWith('mxc://'));
  };

  const GALLERY_GAP_MS = 5 * 60 * 1000;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const type = event.getType();
    const isSystemMessage = SYSTEM_EVENT_TYPES.has(type);
    const isCallEvent = CALL_MEMBER_EVENT_TYPES.has(type);

    if (!isTimelineRenderedEvent(event)) continue;

    const eventId = event.getId() ?? '';
    const callSession = isCallEvent ? (callSessions.get(eventId) ?? null) : null;
    if (isCallEvent && !callSession) continue;

    if (callSession) {
      let skip = callSession.events.length - 1;
      for (let j = i + 1; j <= i + skip && j < events.length; j++) {
        if (events[j] !== callSession.events[j - i]) {
          skip = j - i - 1;
          break;
        }
      }
      i += skip;
    }

    const senderId = event.getSender() ?? '';
    const ts = event.getTs();
    const dateLabel = formatDateLabel(ts, t, locale);
    const showDateSep = dateLabel !== lastDate;
    lastDate = dateLabel;

    const member = room?.getMember(senderId);
    const senderName = member?.name ?? formatUserId(senderId);
    const senderAvatar = member?.getMxcAvatarUrl() ?? null;

    const GROUP_MS = 5 * 60 * 1000;
    const isGrouped =
      !isSystemMessage &&
      !isCallEvent &&
      !showDateSep &&
      senderId === lastSenderId &&
      ts - lastTs < GROUP_MS;

    const reactionRelations = room?.relations?.getChildEventsForEvent(
      eventId,
      'm.annotation',
      'm.reaction'
    );

    const status = event.status;
    const isOptimisticallyRedacted = optimisticRedactedIds.has(eventId);
    const optimisticBody = optimisticEditBodies.get(eventId) ?? null;

    // Collapse consecutive image-only uploads from the same sender into a gallery.
    let galleryEvents: MatrixEvent[] | null = null;
    if (isGalleryCandidate(event)) {
      const group = [event];
      let prevTs = ts;
      for (let j = i + 1; j < events.length; j++) {
        const next = events[j];
        if (!isTimelineRenderedEvent(next)) continue;
        if (!isGalleryCandidate(next)) break;
        if (next.getSender() !== senderId) break;
        const nextTs = next.getTs();
        if (nextTs - prevTs >= GALLERY_GAP_MS) break;
        if (formatDateLabel(nextTs, t, locale) !== dateLabel) break;
        group.push(next);
        prevTs = nextTs;
      }
      if (group.length >= 2) galleryEvents = group;
    }

    items.push({
      event,
      isOwn: senderId === myId,
      senderId,
      senderName,
      senderAvatar,
      isGrouped,
      showDateSep,
      dateSepLabel: dateLabel,
      isSystemMessage: isSystemMessage || isCallEvent,
      reactionVersion:
        reactionRelations
          ?.getRelations()
          .filter((r) => r.getId() && !r.isRedacted() && r.status !== EventStatus.NOT_SENT)
          .length ?? 0,
      isEdited: !!event.replacingEvent() || optimisticBody !== null,
      isRedacted: event.isRedacted() || isOptimisticallyRedacted,
      isPinned: isPinnedEvent(room ?? null, eventId),
      ...computeMessagePermissions(room, myId, event, roomPerms),
      ...computeDecryptState(event),
      isSending:
        status === EventStatus.SENDING ||
        status === EventStatus.QUEUED ||
        status === EventStatus.ENCRYPTING,
      isFailed: status === EventStatus.NOT_SENT,
      sendError:
        status === EventStatus.NOT_SENT
          ? ((event.error as { message?: string } | null)?.message ?? null)
          : null,
      optimisticBody,
      galleryEvents,
      callSession,
    });

    if (galleryEvents !== null) {
      const galleryLast = galleryEvents[galleryEvents.length - 1];
      if (galleryLast) {
        i += galleryEvents.length - 1;
        lastSenderId = galleryLast.getSender() ?? '';
        lastTs = galleryLast.getTs();
      }
    } else if (isSystemMessage || isCallEvent) {
      lastSenderId = '';
      lastTs = 0;
    } else {
      lastSenderId = senderId;
      lastTs = ts;
    }
  }

  return items;
}

function galleryEventsEqual(a: TimelineItem, b: TimelineItem): boolean {
  const ga = a.galleryEvents;
  const gb = b.galleryEvents;
  if (!!ga !== !!gb) return false;
  if (!ga || !gb) return true;
  if (ga.length !== gb.length) return false;
  for (let i = 0; i < ga.length; i++) {
    if (ga[i].getId() !== gb[i].getId()) return false;
  }
  return true;
}

function itemsRenderEq(a: TimelineItem, b: TimelineItem): boolean {
  if (a.event.getId() !== b.event.getId()) return false;
  return (
    a.isRedacted === b.isRedacted &&
    a.isEdited === b.isEdited &&
    a.isPinned === b.isPinned &&
    a.isSending === b.isSending &&
    a.isFailed === b.isFailed &&
    a.sendError === b.sendError &&
    a.isDecrypting === b.isDecrypting &&
    a.isUndecryptable === b.isUndecryptable &&
    a.reactionVersion === b.reactionVersion &&
    a.canEdit === b.canEdit &&
    a.canRedact === b.canRedact &&
    a.canPin === b.canPin &&
    a.isOwn === b.isOwn &&
    a.senderName === b.senderName &&
    a.senderAvatar === b.senderAvatar &&
    a.isGrouped === b.isGrouped &&
    a.showDateSep === b.showDateSep &&
    a.dateSepLabel === b.dateSepLabel &&
    (a.optimisticBody ?? null) === (b.optimisticBody ?? null) &&
    a.isSystemMessage === b.isSystemMessage &&
    (a.callSession?.version ?? null) === (b.callSession?.version ?? null) &&
    galleryEventsEqual(a, b)
  );
}

export function mergePreservingIdentity(
  built: TimelineItem[],
  previous: TimelineItem[]
): TimelineItem[] {
  if (previous.length === 0) return built;
  const prevById = new Map<string, TimelineItem>();
  for (const item of previous) {
    const id = item.event.getId();
    if (id) prevById.set(id, item);
  }
  const merged = built.map((item) => {
    const id = item.event.getId();
    if (!id) return item;
    const prev = prevById.get(id);
    if (prev && itemsRenderEq(prev, item)) {
      return prev;
    }
    return item;
  });
  return merged;
}

function getFirstUnreadEventId(client: MatrixClient, roomId: string, myId: string): string | null {
  const room = client.getRoom(roomId);
  if (!room) return null;
  const receiptEventId = room.getEventReadUpTo(myId, false);
  if (!receiptEventId) return null;
  const events = room.getLiveTimeline().getEvents();
  let foundReceipt = false;
  const renderedTypes = new Set([
    'm.room.message',
    'm.sticker',
    'm.room.encrypted',
    'm.room.member',
    'm.poll.start',
    'org.matrix.msc3381.poll.start',
    ...CALL_MEMBER_EVENT_TYPES,
  ]);
  for (const event of events) {
    const type = event.getType();
    if (!renderedTypes.has(type)) continue;
    if (foundReceipt) {
      if (event.getSender() === myId) continue;
      return event.getId() ?? null;
    }
    if (event.getId() === receiptEventId) foundReceipt = true;
  }
  return null;
}

type Timeline = {
  linkedTimelines: EventTimeline[];
  range: ItemRange;
};

const getInitialTimeline = (room: Room): Timeline => {
  const linkedTimelines = getLinkedTimelines(getLiveTimeline(room));
  const evLength = getTimelinesEventsCount(linkedTimelines);
  return {
    linkedTimelines,
    range: {
      start: Math.max(evLength - PAGINATION_LIMIT, 0),
      end: evLength,
    },
  };
};

const getEmptyTimeline = (): Timeline => ({
  range: { start: 0, end: 0 },
  linkedTimelines: [],
});

export interface UseTimelineResult {
  items: TimelineItem[];
  events: MatrixEvent[];
  range: ItemRange;
  eventsLength: number;
  liveTimelineLinked: boolean;
  canPaginateBack: boolean;
  rangeAtStart: boolean;
  rangeAtEnd: boolean;
  isPaginating: boolean;
  timelineResetEpoch: number;
  firstUnreadEventId: string | null;
  clearUnreadDivider: () => void;
  setRange: (range: ItemRange) => void;
  handlePaginate: (backwards: boolean) => Promise<void>;
  getEventAtIndex: (index: number) => MatrixEvent | undefined;
  getEventAbsoluteIndex: (eventTimeline: EventTimeline, eventId: string) => number | undefined;
  loadEventTimeline: (
    eventId: string,
    onLoad: (absIndex: number, eventId: string) => void,
    onError: (err: Error | null) => void
  ) => Promise<void>;
  setEmptyTimeline: () => void;
  setInitialTimeline: () => void;
  liveArrive: (atBottom: boolean) => void;
}

export interface UseTimelineOptions {
  onScrollbackError?: (retry: () => void) => void;
  optimisticRedactedIds?: ReadonlySet<string>;
  optimisticEditBodies?: ReadonlyMap<string, string>;
}

export function useTimeline(
  client: MatrixClient | null,
  roomId: string | null,
  options: UseTimelineOptions = {}
): UseTimelineResult {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const optimisticRedactedIds = options.optimisticRedactedIds ?? EMPTY_REDACTED;
  const optimisticEditBodies = options.optimisticEditBodies ?? EMPTY_EDITS;

  const currentRoomIdRef = useRef(roomId);
  currentRoomIdRef.current = roomId;

  const [timeline, setTimeline] = useState<Timeline>(getEmptyTimeline);
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const [isPaginating, setIsPaginating] = useState(false);
  const [timelineResetEpoch, setTimelineResetEpoch] = useState(0);
  const [firstUnreadEventId, setFirstUnreadEventId] = useState<string | null>(null);
  const [rebuildVersion, setRebuildVersion] = useState(0);
  const unreadLatchRef = useRef<string | null | undefined>(undefined);

  const [membership, setMembership] = useState<Membership | null>(() =>
    roomId && client ? (client.getRoom(roomId)?.getMyMembership() ?? null) : null
  );

  const flatEvents = useMemo(() => {
    const out: MatrixEvent[] = [];
    for (const tl of timeline.linkedTimelines) {
      out.push(...tl.getEvents());
    }
    return out;
  }, [timeline.linkedTimelines, timeline.range.start, timeline.range.end, rebuildVersion]);
  const eventsLength = flatEvents.length;
  const liveTimeline = roomId
    ? (client?.getRoom(roomId)?.getUnfilteredTimelineSet()?.getLiveTimeline() ?? null)
    : null;
  const liveTimelineLinked =
    timeline.linkedTimelines[timeline.linkedTimelines.length - 1] === liveTimeline;
  const canPaginateBack =
    typeof timeline.linkedTimelines[0]?.getPaginationToken(Direction.Backward) === 'string';
  const rangeAtStart = timeline.range.start === 0;
  const rangeAtEnd = timeline.range.end === eventsLength;

  const prevItemsRef = useRef<TimelineItem[]>([]);
  const items = useMemo(() => {
    if (!client || !roomId) {
      prevItemsRef.current = [];
      return [];
    }
    const start = Math.max(0, Math.min(timeline.range.start, eventsLength));
    const end = Math.max(start, Math.min(timeline.range.end, eventsLength));
    if (start >= end && eventsLength > 0) {
      return prevItemsRef.current;
    }
    const slice: MatrixEvent[] = [];
    for (let i = start; i < end; i++) {
      const e = flatEvents[i];
      if (e) slice.push(e);
    }
    const prevEvent = start - 1 >= 0 ? (flatEvents[start - 1] ?? null) : null;
    let built: TimelineItem[];
    try {
      const callSessions = buildCallSessions(slice, client.getRoom(roomId));
      built = buildItems(
        slice,
        client,
        roomId,
        t,
        locale,
        optimisticRedactedIds,
        optimisticEditBodies,
        { prevEvent },
        callSessions
      );
    } catch (err) {
      console.error('[useTimeline] buildItems failed, keeping last render', err);
      return prevItemsRef.current;
    }
    const merged = mergePreservingIdentity(built, prevItemsRef.current);
    prevItemsRef.current = merged;
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    timeline.range.start,
    timeline.range.end,
    eventsLength,
    flatEvents,
    rebuildVersion,
    locale,
    t,
    optimisticRedactedIds,
    optimisticEditBodies,
    client,
    roomId,
  ]);

  const flatEventsRef = useRef<MatrixEvent[]>([]);
  flatEventsRef.current = flatEvents;

  useEffect(() => {
    if (!client || !roomId) return;
    if (unreadLatchRef.current !== undefined) return;
    if (eventsLength === 0) return;
    const myId = client.getUserId() ?? '';
    const id = getFirstUnreadEventId(client, roomId, myId);
    unreadLatchRef.current = id;
    setFirstUnreadEventId(id);
  }, [client, roomId, eventsLength]);

  const setRange = useCallback((range: ItemRange) => {
    timelineRef.current = { ...timelineRef.current, range };
    setTimeline({ ...timelineRef.current });
  }, []);

  const setEmptyTimeline = useCallback(() => {
    timelineRef.current = getEmptyTimeline();
    setTimeline(getEmptyTimeline());
  }, []);

  const setInitialTimeline = useCallback(() => {
    if (!client || !roomId) return;
    const room = client.getRoom(roomId);
    if (!room) return;
    timelineRef.current = getInitialTimeline(room);
    setTimeline(timelineRef.current);
    setTimelineResetEpoch((e) => e + 1);
  }, [client, roomId]);

  const handlePaginate = useCallback(
    async (backwards: boolean) => {
      const mx = client;
      if (!mx || !roomId) return;
      if (fetchingRef.current) return;
      const { linkedTimelines: lTimelines } = timelineRef.current;
      const timelinesEventsCount = lTimelines.map(timelineToEventsCount);

      const timelineToPaginate = backwards ? lTimelines[0] : lTimelines[lTimelines.length - 1];
      if (!timelineToPaginate) return;
      if (
        !backwards &&
        timelineToPaginate === timelineToPaginate.getTimelineSet()?.getLiveTimeline()
      ) {
        return;
      }

      const paginationToken = timelineToPaginate.getPaginationToken(
        backwards ? Direction.Backward : Direction.Forward
      );
      const tokenBefore = backwards ? paginationToken : undefined;
      if (
        !paginationToken &&
        getTimelinesEventsCount(lTimelines) !==
          getTimelinesEventsCount(getLinkedTimelines(timelineToPaginate))
      ) {
        recalibratePaginationRef.current?.(lTimelines, timelinesEventsCount, backwards);
        return;
      }

      fetchingRef.current = true;
      setIsPaginating(true);
      let err: Error | null = null;
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const request = mx.paginateEventTimeline(timelineToPaginate, {
          backwards,
          limit: PAGINATION_LIMIT,
        });
        timeoutId = setTimeout(() => {
          timedOut = true;
          err = new Error('Scrollback request timed out');
        }, PAGINATION_TIMEOUT_MS);
        await request;
      } catch (e) {
        err = e as Error;
      } finally {
        clearTimeout(timeoutId);
      }
      if (timedOut) {
        const direction = backwards ? Direction.Backward : Direction.Forward;
        const requests = (
          timelineToPaginate as unknown as {
            paginationRequests?: Record<string, Promise<unknown> | null>;
          }
        ).paginationRequests;
        if (requests) requests[direction] = null;
      }
      fetchingRef.current = false;
      setIsPaginating(false);

      if (err) {
        const { onScrollbackError } = optionsRef.current;
        if (onScrollbackError) onScrollbackError(() => handlePaginate(backwards));
        return;
      }
      const fetchedTimeline =
        timelineToPaginate.getNeighbouringTimeline(
          backwards ? Direction.Backward : Direction.Forward
        ) ?? timelineToPaginate;
      const roomIdOfTimeline = fetchedTimeline.getRoomId();
      const room = roomIdOfTimeline ? mx.getRoom(roomIdOfTimeline) : null;
      if (room?.hasEncryptionStateEvent()) {
        await decryptAllTimelineEvent(mx, fetchedTimeline);
      }
      if (currentRoomIdRef.current !== roomId) return;
      const countsEqual =
        getTimelinesEventsCount(lTimelines) ===
        timelinesEventsCount.reduce((total, c) => total + c, 0);
      const tokenAfter = backwards
        ? timelineToPaginate.getPaginationToken(Direction.Backward)
        : undefined;
      if (backwards && countsEqual) {
        if (tokenAfter === tokenBefore) {
          timelineToPaginate.setPaginationToken(null, Direction.Backward);
        }
      }
      recalibratePaginationRef.current?.(lTimelines, timelinesEventsCount, backwards);
    },
    [client, roomId]
  );

  const fetchingRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const recalibratePaginationRef = useRef<
    (linkedTimelines: EventTimeline[], timelinesEventsCount: number[], backwards: boolean) => void
  >(() => {});
  recalibratePaginationRef.current = (linkedTimelines, timelinesEventsCount, backwards) => {
    const topTimeline = linkedTimelines[0];
    const timelineMatch = (mt: EventTimeline) => (t: EventTimeline) => t === mt;

    const newLTimelines = getLinkedTimelines(topTimeline);
    const topTmIndex = newLTimelines.findIndex(timelineMatch(topTimeline));
    const topAddedTm = topTmIndex === -1 ? [] : newLTimelines.slice(0, topTmIndex);

    const topTmAddedEvt =
      timelineToEventsCount(newLTimelines[topTmIndex]) - timelinesEventsCount[0];
    const offsetRange = getTimelinesEventsCount(topAddedTm) + (backwards ? topTmAddedEvt : 0);

    timelineRef.current = {
      linkedTimelines: newLTimelines,
      range:
        offsetRange > 0
          ? {
              start: timelineRef.current.range.start + offsetRange,
              end: timelineRef.current.range.end + offsetRange,
            }
          : { ...timelineRef.current.range },
    };
    setTimeline({ ...timelineRef.current });
  };

  const liveArrive = useCallback((atBottom: boolean) => {
    setTimeline((ct) => {
      const next = atBottom
        ? {
            ...ct,
            range: {
              start: ct.range.start + 1,
              end: ct.range.end + 1,
            },
          }
        : { ...ct };
      timelineRef.current = next;
      return next;
    });
  }, []);

  const loadEventTimeline = useCallback(
    async (
      eventId: string,
      onLoad: (absIndex: number, eventId: string) => void,
      onError: (err: Error | null) => void
    ) => {
      if (!client || !roomId) return;
      const room = client.getRoom(roomId);
      if (!room) return;
      setEmptyTimeline();
      try {
        const replyEvtTimeline = await client.getEventTimeline(
          room.getUnfilteredTimelineSet(),
          eventId
        );
        if (!replyEvtTimeline) {
          onError(null);
          return;
        }
        const linkedTimelines = getLinkedTimelines(replyEvtTimeline);
        const absIndex = getEventIdAbsoluteIndex(linkedTimelines, replyEvtTimeline, eventId);

        if (absIndex === undefined) {
          onError(null);
          return;
        }
        const evLength = getTimelinesEventsCount(linkedTimelines);
        timelineRef.current = {
          linkedTimelines,
          range: {
            start: Math.max(absIndex - PAGINATION_LIMIT, 0),
            end: Math.min(absIndex + PAGINATION_LIMIT, evLength),
          },
        };
        setTimeline({ ...timelineRef.current });
        onLoad(absIndex, eventId);
      } catch (e) {
        onError(e as Error);
      }
    },
    [client, roomId, setEmptyTimeline]
  );

  const getEventAtIndex = useCallback((index: number) => flatEventsRef.current[index], []);
  const getEventAbsoluteIndex = useCallback(
    (eventTimeline: EventTimeline, eventId: string) =>
      getEventIdAbsoluteIndex(timelineRef.current.linkedTimelines, eventTimeline, eventId),
    []
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRebuild = useCallback(() => {
    if (debounceRef.current !== null) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setRebuildVersion((v) => v + 1);
    }, 16);
  }, []);

  const clearUnreadDivider = useCallback(() => {
    unreadLatchRef.current = null;
    setFirstUnreadEventId(null);
  }, []);

  const handleRedactionOrEcho = useCallback(
    (event: MatrixEvent) => {
      if (!client || !roomId) return;
      applyRedactionToRelations(client.getRoom(roomId), event);
      scheduleRebuild();
    },
    [client, roomId, scheduleRebuild]
  );

  const handleTimelineReset = useCallback(
    (_resetRoom: Room | null, timelineSet: EventTimelineSet | null) => {
      if (!client || !roomId) return;
      const room = client.getRoom(roomId);
      const mainSet = room?.getUnfilteredTimelineSet() ?? null;
      if (mainSet && timelineSet && timelineSet !== mainSet) return;
      if (fetchingRef.current) return;
      if (liveTimelineLinked) setInitialTimeline();
    },
    [client, roomId, liveTimelineLinked, setInitialTimeline]
  );

  useMatrixEvent(client, 'Room.redaction', handleRedactionOrEcho);
  useMatrixEvent(client, 'Room.localEchoUpdated', handleRedactionOrEcho);
  useMatrixEvent(client, 'Event.decrypted', scheduleRebuild);
  useMatrixEvent(client, 'sync', scheduleRebuild);
  useMatrixEvent(client, 'Room.timelineReset', handleTimelineReset);

  useMatrixEvent(client, 'Room.myMembership', (room: Room, newMembership: Membership) => {
    if (currentRoomIdRef.current === room.roomId) setMembership(newMembership);
  });

  // Reset state on room/membership change so old data is never visible.
  useEffect(() => {
    timelineRef.current = getEmptyTimeline();
    setTimeline(getEmptyTimeline());
    prevItemsRef.current = [];
    unreadLatchRef.current = undefined;
    setFirstUnreadEventId(null);
    setIsPaginating(false);
  }, [roomId, membership]);

  const syncReady = useSyncReady();
  useEffect(() => {
    if (!client || !roomId || !syncReady) return;
    const room = client.getRoom(roomId);
    if (!room) return;
    if (room.getMyMembership() !== KnownMembership.Join) return;
    if (timelineRef.current.linkedTimelines.length > 0) return;
    setInitialTimeline();
  }, [client, roomId, syncReady, membership, setInitialTimeline]);

  useEffect(
    () => () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    },
    [roomId]
  );

  return {
    items,
    events: flatEvents,
    range: timeline.range,
    eventsLength,
    liveTimelineLinked,
    canPaginateBack,
    rangeAtStart,
    rangeAtEnd,
    isPaginating,
    timelineResetEpoch,
    firstUnreadEventId,
    clearUnreadDivider,
    setRange,
    handlePaginate,
    getEventAtIndex,
    getEventAbsoluteIndex,
    loadEventTimeline,
    setEmptyTimeline,
    setInitialTimeline,
    liveArrive,
  };
}
