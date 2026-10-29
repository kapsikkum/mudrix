import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
  type ComponentProps,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { MatrixClient, MatrixEvent, Room, IRoomTimelineData } from 'matrix-js-sdk';
import { Direction, EventStatus } from 'matrix-js-sdk';
import { CaretDownIcon, UploadIcon, ChatTeardropTextIcon, XIcon } from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { formatUserId, isDmRoom, roomStateMaybe } from '@/util/matrix';
import { scrollToBottom } from '@/util/dom';
import { getLiveTimeline, getEventTimeline, getFirstLinkedTimeline } from '@/util/timeline';
import {
  messageLayoutAtom,
  editMessageAtom,
  emojiPickerAtom,
  threadsPanelViewAtom,
  optimisticRedactedIdsAtom,
  optimisticEditBodiesAtom,
  reportMessageAtom,
  callUiAtom,
  callActionsAtom,
  isInCallAtom,
  roomSearchAtom,
  roomSearchResultsAtom,
  roomMessageSearcherAtom,
  globalSearchOpenAtom,
  pendingEventJumpAtom,
} from '@/app/store/atoms';
import type { RoomMessageMatch } from '@/app/store/atoms';
import { useRoomReceipts } from '@/app/hooks/useRoomReceipts';
import type { ReceiptUser } from '@/app/hooks/useRoomReceipts';
import { useLiveRoom } from '@/app/hooks/useLiveRoom';
import { useTimeline, itemContainsEvent, buildItems } from '@/app/hooks/useTimeline';
import type { TimelineItem } from '@/app/hooks/useTimeline';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { itemMatchesQuery, useSearch } from '@/app/hooks/useSearch';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useWidgets } from '@/app/hooks/useWidgets';
import { useVirtualPaginator } from '@/app/hooks/useVirtualPaginator';
import { useMessageHover } from './useMessageHover';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '@/app/hooks/useIntersectionObserver';
import { useRoomReadReceipts } from '@/app/hooks/useRoomReadReceipts';
import { DecryptionGate, Message } from './message';
import { toggleReaction } from './message/reactions';
import { Composer } from './composer';
import { RoomHeader } from './RoomHeader';
import { getErrorMessage } from '@/util/error';
import { ImagePacksProvider } from '@/app/hooks/useImagePacks';
import { useCallMemberships, uniqueMembers } from '@/app/features/calls/useCallMemberships';
import * as css from './Timeline.css';
import { scrollBehavior } from '@/app/hooks/useReducedMotion';

interface Props {
  client: MatrixClient;
  roomId: string;
  hideHeader?: boolean;
}

const EMPTY_RECEIPTS: ReceiptUser[] = [];
const PAGINATION_LIMIT = 80;
const STICK_TO_BOTTOM_PX = 4;
const EMPTY_SEARCH_ITEMS: TimelineItem[] = [];

function UnreadDivider({ onDismiss, label }: { onDismiss: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasBeenVisibleRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          hasBeenVisibleRef.current = true;
        } else if (hasBeenVisibleRef.current && entry.boundingClientRect.bottom < 0) {
          // Divider has scrolled above the viewport — dismiss
          onDismiss();
        }
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onDismiss]);

  return (
    <div ref={ref} className={css.unreadDivider}>
      <div className={css.unreadDividerLines} />
      <span className={css.unreadDividerLabel}>{label}</span>
      <div className={css.unreadDividerRight}>
        <div className={css.unreadDividerLines} />
        <button
          type="button"
          className={css.unreadDividerDismiss}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <XIcon size={12} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function SkeletonRow({ width1 = '60%', width2 = '40%' }: { width1?: string; width2?: string }) {
  return (
    <div className={css.skeletonRow}>
      <div className={css.skeletonAvatar} />
      <div className={css.skeletonLines}>
        <div className={css.skeletonLine} style={{ width: width1 }} />
        <div className={css.skeletonLine} style={{ width: width2 }} />
      </div>
    </div>
  );
}

type UnreadInfo = { readUptoEventId: string; inLiveTimeline: boolean };

export function Timeline({ client, roomId, hideHeader }: Props) {
  const { t, i18n } = useTranslation();
  const layout = useAtomValue(messageLayoutAtom);
  const toast = useToast();

  const confirmDialog = useConfirm();
  const [, setEditMessage] = useAtom(editMessageAtom);
  const [, setEmojiPicker] = useAtom(emojiPickerAtom);
  const setThreadsPanelView = useSetAtom(threadsPanelViewAtom);
  const setReport = useSetAtom(reportMessageAtom);

  const [optimisticRedactedIds, setOptimisticRedactedIds] = useAtom(optimisticRedactedIdsAtom);
  const optimisticEditBodies = useAtomValue(optimisticEditBodiesAtom);

  const {
    items,
    events,
    range,
    eventsLength,
    liveTimelineLinked,
    canPaginateBack,
    rangeAtStart,
    rangeAtEnd,
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
  } = useTimeline(client, roomId, {
    onScrollbackError: (retry) => {
      toast.error(t('timeline.loadFailed'), {
        actionLabel: t('common.retry'),
        onClick: retry,
      });
    },
    optimisticRedactedIds,
    optimisticEditBodies,
  });

  const { stickerWidget } = useWidgets(client, roomId);

  const callActions = useAtomValue(callActionsAtom);
  const callUi = useAtomValue(callUiAtom);
  const isInCall = useAtomValue(isInCallAtom);
  const callActiveInRoom = callUi.roomId === roomId && isInCall;

  const callMemberships = useCallMemberships(client, [roomId]);
  const othersInCall = (() => {
    const members = callMemberships.get(roomId);
    if (!members) return false;
    const myId = client.getUserId();
    return uniqueMembers(members).some((m) => m.userId !== myId);
  })();

  const handleStartCall = useCallback(
    async (targetRoomId: string) => {
      const room = client.getRoom(targetRoomId);
      if (!room) return;
      if (isInCall && callUi.roomId === targetRoomId) {
        return;
      }
      await callActions?.start(room, { voiceOnly: true, presentation: 'room' });
    },
    [client, isInCall, callUi.roomId, callActions]
  );

  const room = useLiveRoom(client, roomId);
  const receiptMap = useRoomReceipts(client, room);

  const isInvite = room?.getMyMembership() === 'invite';
  const myId = client.getUserId() ?? '';

  const isDm = room ? isDmRoom(room, client) : false;
  const dmPartnerId = isDm
    ? (room?.getMembers().find((m) => m.userId !== myId)?.userId ?? null)
    : null;
  const dmPartnerName = dmPartnerId
    ? (room?.getMember(dmPartnerId)?.name ?? formatUserId(dmPartnerId))
    : null;

  const tombstoneEvent = roomStateMaybe(room)?.getStateEvents('m.room.tombstone', '');
  const tombstoneEventSingle = Array.isArray(tombstoneEvent) ? tombstoneEvent[0] : tombstoneEvent;
  const tombstoneContent = tombstoneEventSingle?.getContent() as
    | { replacement_room?: string }
    | undefined;
  const tombstoneReplacementRoomId = tombstoneContent?.replacement_room ?? null;

  const createEvent = roomStateMaybe(room)?.getStateEvents('m.room.create', '');
  const createEventSingle = Array.isArray(createEvent) ? createEvent[0] : createEvent;
  const createContent = createEventSingle?.getContent() as
    | { predecessor?: { room_id?: string } }
    | undefined;
  const predecessorRoomId = createContent?.predecessor?.room_id ?? null;

  const navigate = useNavigate();

  const [joiningReplacement, setJoiningReplacement] = useState(false);
  const replacedRoom = tombstoneReplacementRoomId
    ? client.getRoom(tombstoneReplacementRoomId)
    : null;
  const isInReplacement = replacedRoom?.getMyMembership() === 'join';

  const handleJoinReplacement = useCallback(async () => {
    if (!tombstoneReplacementRoomId) return;
    setJoiningReplacement(true);
    try {
      const serverDomain = tombstoneEventSingle?.getSender()?.split(':').slice(1).join(':') ?? '';
      await client.joinRoom(tombstoneReplacementRoomId, { viaServers: [serverDomain] });
      navigate(`/r/${encodeURIComponent(tombstoneReplacementRoomId)}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setJoiningReplacement(false);
    }
  }, [tombstoneReplacementRoomId, tombstoneEventSingle, client, navigate, toast]);

  const handleOpenReplacement = useCallback(() => {
    if (!tombstoneReplacementRoomId) return;
    navigate(`/r/${encodeURIComponent(tombstoneReplacementRoomId)}`);
  }, [tombstoneReplacementRoomId, navigate]);

  const handleOpenPredecessor = useCallback(() => {
    if (!predecessorRoomId) return;
    navigate(`/r/${encodeURIComponent(predecessorRoomId)}`);
  }, [predecessorRoomId, navigate]);

  const getSearchItems = useMemo(() => {
    let cache: TimelineItem[] | null = null;
    return () => {
      if (!client || !roomId) return EMPTY_SEARCH_ITEMS;
      cache ??= buildItems(
        events,
        client,
        roomId,
        t,
        i18n.language,
        optimisticRedactedIds,
        optimisticEditBodies,
        { prevEvent: undefined }
      );
      return cache;
    };
  }, [i18n.language, t, optimisticRedactedIds, optimisticEditBodies, events, client, roomId]);
  const roomSearchOpen = useAtomValue(roomSearchAtom)?.roomId === roomId;
  const searchItems = useMemo(
    () => (roomSearchOpen ? getSearchItems() : EMPTY_SEARCH_ITEMS),
    [roomSearchOpen, getSearchItems]
  );

  const {
    search,
    filteredItems,
    activeItemIndex,
    setQuery,
    goToNext,
    goToPrev,
    clear: clearSearch,
    isSearching,
  } = useSearch(searchItems);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(false);
  const atBottomAnchorRef = useRef<HTMLElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(atBottom);
  atBottomRef.current = atBottom;
  const atLiveEndRef = useRef(liveTimelineLinked && rangeAtEnd);
  atLiveEndRef.current = liveTimelineLinked && rangeAtEnd;
  const showScrollBtn = !atBottom && !isSearching;

  const scrollToBottomRef = useRef({
    count: 0,
    smooth: true,
  });
  const forceScrollToBottomRef = useRef({
    count: 0,
    smooth: false,
  });

  const getRoomUnreadInfo = useCallback((): UnreadInfo | undefined => {
    if (!room) return undefined;
    const readUptoEventId = room.getEventReadUpTo(client.getUserId() ?? '');
    if (!readUptoEventId) return undefined;
    const evtTimeline = getEventTimeline(room, readUptoEventId);
    const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
    return {
      readUptoEventId,
      inLiveTimeline: latestTimeline === getLiveTimeline(room),
    };
  }, [room, client]);

  const [unreadInfo, setUnreadInfo] = useState<UnreadInfo | undefined>(undefined);
  useEffect(() => {
    setUnreadInfo(getRoomUnreadInfo());
  }, [getRoomUnreadInfo]);

  const readUptoEventIdRef = useRef<string | undefined>(undefined);
  if (unreadInfo) {
    readUptoEventIdRef.current = unreadInfo.readUptoEventId;
  }

  const { getItems, scrollToItem, observeBackAnchor, observeFrontAnchor } = useVirtualPaginator({
    count: eventsLength,
    limit: PAGINATION_LIMIT,
    range,
    onRangeChange: setRange,
    getScrollElement: useCallback(() => scrollRef.current, []),
    getItemElement: useCallback(
      (index: number) =>
        (scrollRef.current?.querySelector(`[data-message-item="${index}"]`) as HTMLElement) ??
        undefined,
      []
    ),
    onEnd: useCallback(
      (back: boolean) => {
        handlePaginate(back);
      },
      [handlePaginate]
    ),
  });

  const sendReadReceiptIfAtBottom = useRoomReadReceipts(client, roomId);

  useEffect(() => {
    if (items.length > 0 && atBottomRef.current) sendReadReceiptIfAtBottom();
  }, [items, sendReadReceiptIfAtBottom]);

  const tryAutoMarkAsRead = useCallback(() => {
    if (!client) return;
    const roomObj = client.getRoom(roomId);
    if (!roomObj) return;
    const readUptoEventId = readUptoEventIdRef.current;
    if (!readUptoEventId) {
      requestAnimationFrame(() => sendReadReceiptIfAtBottom());
      return;
    }
    const evtTimeline = getEventTimeline(roomObj, readUptoEventId);
    const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
    if (latestTimeline === getLiveTimeline(roomObj)) {
      requestAnimationFrame(() => sendReadReceiptIfAtBottom());
    }
  }, [client, roomId, sendReadReceiptIfAtBottom]);

  const atBottomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceSetAtBottom = useCallback((entry: IntersectionObserverEntry) => {
    if (entry.isIntersecting) {
      if (atBottomDebounceRef.current !== null) {
        clearTimeout(atBottomDebounceRef.current);
        atBottomDebounceRef.current = null;
      }
      return;
    }
    if (atBottomDebounceRef.current !== null) return;
    atBottomDebounceRef.current = setTimeout(() => {
      atBottomDebounceRef.current = null;
      setAtBottom(false);
    }, 1000);
  }, []);

  useIntersectionObserver(
    useCallback(
      (entries: IntersectionObserverEntry[]) => {
        const target = atBottomAnchorRef.current;
        if (!target) return;
        const targetEntry = getIntersectionObserverEntry(target, entries);
        if (targetEntry) {
          debounceSetAtBottom(targetEntry);
          if (targetEntry.isIntersecting && atLiveEndRef.current) {
            setAtBottom(true);
            if (document.hasFocus()) {
              tryAutoMarkAsRead();
            }
          }
        }
      },
      [debounceSetAtBottom, tryAutoMarkAsRead]
    ),
    useCallback(
      () => ({
        root: scrollRef.current,
        rootMargin: '100px',
      }),
      []
    ),
    useCallback(() => atBottomAnchorRef.current, [])
  );

  const [flashEventId, setFlashEventId] = useState<string | null>(null);
  const mountTsRef = useRef(Date.now());

  const [focusItem, setFocusItem] = useState<{ index: number; scrollTo: boolean } | undefined>();

  const handleJumpToEvent = useCallback(
    async (eventId: string, flash: boolean = true) => {
      const roomObj = client.getRoom(roomId);
      if (!roomObj) return;
      stickToBottomRef.current = false;
      const evtTimeline = getEventTimeline(roomObj, eventId);
      const absIndex = evtTimeline && getEventAbsoluteIndex(evtTimeline, eventId);
      if (typeof absIndex === 'number') {
        scrollToItem(absIndex, {
          behavior: scrollBehavior() === 'smooth' ? 'smooth' : 'auto',
          align: 'center',
          stopInView: true,
        });
        if (flash) {
          setFlashEventId(eventId);
          setTimeout(() => setFlashEventId(null), 1600);
        }
        return;
      }
      setAtBottom(false);
      setEmptyTimeline();
      loadEventTimeline(
        eventId,
        (idx) => {
          setFocusItem({ index: idx, scrollTo: true });
          if (flash) {
            setFlashEventId(eventId);
            setTimeout(() => setFlashEventId(null), 1600);
          }
        },
        () => {}
      );
    },
    [client, roomId, getEventAbsoluteIndex, scrollToItem, setEmptyTimeline, loadEventTimeline]
  );

  const [pendingJump, setPendingJump] = useAtom(pendingEventJumpAtom);
  useEffect(() => {
    if (!pendingJump || pendingJump.roomId !== roomId) return;
    const timer = setTimeout(() => {
      setPendingJump(null);
      void handleJumpToEvent(pendingJump.eventId);
    }, 0);
    return () => clearTimeout(timer);
  }, [pendingJump, roomId, handleJumpToEvent, setPendingJump]);

  useLayoutEffect(() => {
    if (focusItem?.scrollTo) {
      scrollToItem(focusItem.index, {
        behavior: 'instant',
        align: 'center',
        stopInView: true,
      });
    }
    const timer = setTimeout(() => {
      setFocusItem((current) => (current === focusItem ? undefined : current));
    }, 2000);
    return () => clearTimeout(timer);
  }, [focusItem, scrollToItem]);

  const handleJumpToLatest = useCallback(() => {
    setInitialTimeline();
    forceScrollToBottomRef.current.count += 1;
    forceScrollToBottomRef.current.smooth = false;
  }, [setInitialTimeline]);

  const handleSearchClose = useCallback(() => {
    clearSearch();
    handleJumpToLatest();
  }, [clearSearch, handleJumpToLatest]);

  const [roomSearch, setRoomSearch] = useAtom(roomSearchAtom);
  const setRoomSearchResults = useSetAtom(roomSearchResultsAtom);
  const setGlobalSearchOpen = useSetAtom(globalSearchOpenAtom);
  const searchQueryForRoom = roomSearch?.roomId === roomId ? roomSearch.query : null;
  const searchOpenRef = useRef(false);
  useEffect(() => {
    if (searchQueryForRoom !== null) {
      searchOpenRef.current = true;
      setQuery(searchQueryForRoom);
    } else if (searchOpenRef.current) {
      searchOpenRef.current = false;
      handleSearchClose();
    }
  }, [searchQueryForRoom, setQuery, handleSearchClose]);

  useEffect(() => {
    if (searchQueryForRoom === null) return;
    setRoomSearchResults({
      roomId,
      matchCount: isSearching ? search.matchIndices.length : 0,
      activeMatch: search.activeMatch,
      next: goToNext,
      prev: goToPrev,
    });
  }, [
    searchQueryForRoom,
    roomId,
    isSearching,
    search.matchIndices.length,
    search.activeMatch,
    goToNext,
    goToPrev,
    setRoomSearchResults,
  ]);

  const setMessageSearcher = useSetAtom(roomMessageSearcherAtom);
  useEffect(() => {
    setMessageSearcher({
      roomId,
      find: (query, limit) => {
        const matches: RoomMessageMatch[] = [];
        let total = 0;
        const allItems = getSearchItems();
        for (let i = allItems.length - 1; i >= 0; i--) {
          const item = allItems[i];
          if (!itemMatchesQuery(item, query)) continue;
          total++;
          if (matches.length < limit) {
            matches.push({
              eventId: item.event.getId() ?? '',
              senderName: item.senderName,
              senderAvatar: item.senderAvatar,
              body: String(item.event.getContent()?.body ?? ''),
              ts: item.event.getTs(),
            });
          }
        }
        return { matches, total };
      },
      jumpTo: (eventId) => void handleJumpToEvent(eventId),
    });
  }, [roomId, getSearchItems, handleJumpToEvent, setMessageSearcher]);
  useEffect(
    () => () => setMessageSearcher((prev) => (prev?.roomId === roomId ? null : prev)),
    [roomId, setMessageSearcher]
  );

  useEffect(
    () => () => {
      setRoomSearch((prev) => (prev?.roomId === roomId ? null : prev));
      setRoomSearchResults((prev) => (prev?.roomId === roomId ? null : prev));
    },
    [roomId, setRoomSearch, setRoomSearchResults]
  );

  const epoch = timelineResetEpoch;
  const initialScrollDoneRef = useRef(false);
  useLayoutEffect(() => {
    if (initialScrollDoneRef.current) return;
    if (epoch === 0) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    if (eventsLength === 0) return;
    initialScrollDoneRef.current = true;
    const { readUptoEventId, inLiveTimeline } = unreadInfo ?? {};
    if (readUptoEventId && inLiveTimeline) {
      const evtTimeline = room && getEventTimeline(room, readUptoEventId);
      const absIndex = evtTimeline && getEventAbsoluteIndex(evtTimeline, readUptoEventId);
      if (typeof absIndex === 'number') {
        scrollToItem(absIndex, {
          behavior: 'instant',
          align: 'start',
          stopInView: true,
        });
        return;
      }
    }
    stickToBottomRef.current = true;
    scrollToBottom(scrollEl, 'instant');
  }, [epoch, eventsLength, unreadInfo, room, scrollToItem, getEventAbsoluteIndex]);

  const scrollToBottomCount = scrollToBottomRef.current.count;
  const forceScrollToBottom = forceScrollToBottomRef.current.count > 0;
  useLayoutEffect(() => {
    if (forceScrollToBottom) {
      const forceSmooth = forceScrollToBottomRef.current.smooth;
      forceScrollToBottomRef.current.count = 0;
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        scrollToBottom(scrollEl, forceSmooth ? 'smooth' : 'instant');
      }
      return;
    }
    if (scrollToBottomCount > 0) {
      if (!atBottomRef.current || !atLiveEndRef.current) return;
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        scrollToBottom(scrollEl, scrollToBottomRef.current.smooth ? 'smooth' : 'instant');
      }
    }
  }, [forceScrollToBottom, scrollToBottomCount, items]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const body = bodyRef.current;
    if (!scrollEl || !body || typeof ResizeObserver === 'undefined') return;
    let lastTop = scrollEl.scrollTop;
    const onScroll = () => {
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distance <= STICK_TO_BOTTOM_PX) stickToBottomRef.current = atLiveEndRef.current;
      else if (scrollEl.scrollTop < lastTop) stickToBottomRef.current = false;
      lastTop = scrollEl.scrollTop;
    };
    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current || !atLiveEndRef.current) return;
      scrollToBottom(scrollEl, 'instant');
      lastTop = scrollEl.scrollTop;
    });
    observer.observe(body);
    observer.observe(scrollEl);
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scrollEl.removeEventListener('scroll', onScroll);
    };
  }, [isInvite]);

  const handleLiveTimeline = useCallback(
    (
      _event: MatrixEvent,
      eventRoom?: Room,
      _toStartOfTimeline?: boolean,
      _removed?: boolean,
      data?: IRoomTimelineData
    ) => {
      if (eventRoom?.roomId !== roomId || !data?.liveEvent) return;
      if (atBottomRef.current && atLiveEndRef.current) {
        if (document.hasFocus() && (!unreadInfo || _event.getSender() === myId)) {
          requestAnimationFrame(() => sendReadReceiptIfAtBottom());
        }
        if (!document.hasFocus() && !unreadInfo) {
          setUnreadInfo(getRoomUnreadInfo());
        }
        scrollToBottomRef.current.count += 1;
        scrollToBottomRef.current.smooth = false;
        liveArrive(true);
        return;
      }
      liveArrive(false);
      if (!unreadInfo) {
        setUnreadInfo(getRoomUnreadInfo());
      }
    },
    [roomId, myId, unreadInfo, sendReadReceiptIfAtBottom, getRoomUnreadInfo, liveArrive]
  );
  useMatrixEvent(client, 'Room.timeline', handleLiveTimeline);

  useEffect(() => {
    const onFocus = () => {
      if (!atBottomRef.current) return;
      setUnreadInfo(getRoomUnreadInfo());
      tryAutoMarkAsRead();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [getRoomUnreadInfo, tryAutoMarkAsRead]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setGlobalSearchOpen(false);
        setRoomSearch((prev) => ({
          roomId,
          query: prev?.roomId === roomId ? prev.query : '',
          openedAt: Date.now(),
        }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [roomId, setRoomSearch, setGlobalSearchOpen]);

  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (++dragDepthRef.current === 1) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (--dragDepthRef.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  const [droppedFile, setDroppedFile] = useState<File[] | null>(null);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) setDroppedFile(files);
  }, []);
  const clearDroppedFile = useCallback(() => setDroppedFile(null), []);

  const [hoveredEventId, handleHover] = useMessageHover();

  const [replyTo, setReplyTo] = useState<MatrixEvent | null>(null);

  const handleEdit = useCallback(
    (event: MatrixEvent) => {
      const eventId = event.getId();
      if (!eventId) return;
      if (event.status === EventStatus.NOT_SENT || event.status === EventStatus.CANCELLED) {
        toast.info(t('timeline.editNotSent'));
        return;
      }
      setEditMessage({
        roomId,
        eventId,
        body: (event.getContent()?.body as string) ?? '',
        msgtype: (event.getContent()?.msgtype as string) ?? 'm.text',
      });
    },
    [roomId, setEditMessage, toast, t]
  );

  const handleDelete = useCallback(
    (event: MatrixEvent) => {
      const eventId = event.getId();
      if (!eventId) return;
      confirmDialog({
        title: t('timeline.deleteMessage'),
        message: t('timeline.deleteMessageConfirm'),
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        setOptimisticRedactedIds((prev) => new Set([...prev, eventId]));

        const clearOptimisticRedacted = () => {
          setOptimisticRedactedIds((prev) => {
            if (!prev.has(eventId)) return prev;
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
        };

        client.redactEvent(roomId, eventId).then(
          () => {
            // Keep the event hidden until the redaction is reflected locally,
            // then drop the optimistic entry so the set doesn't grow unbounded.
            const room = client.getRoom(roomId);
            const deadline = Date.now() + 3000;
            const poll = () => {
              const redacted = event.isRedacted() || !!room?.findEventById(eventId)?.isRedacted();
              if (redacted || Date.now() >= deadline) {
                clearOptimisticRedacted();
              } else {
                setTimeout(poll, 200);
              }
            };
            poll();
          },
          (err) => {
            clearOptimisticRedacted();
            toast.error(t('timeline.deleteFailed', { error: getErrorMessage(err) }));
          }
        );
      });
    },
    [client, roomId, confirmDialog, setOptimisticRedactedIds, toast, t]
  );

  const handleReport = useCallback(
    (event: MatrixEvent) => {
      const eventId = event.getId();
      const roomIdOfEvent = event.getRoomId();
      if (!eventId || !roomIdOfEvent) return;
      new Promise<string | null>((resolve) => {
        setReport({
          open: true,
          roomId: roomIdOfEvent,
          eventId,
          senderId: event.getSender() ?? '',
          resolve,
        });
      }).then((reason) => {
        if (reason === null) return;
        client
          .reportEvent(roomIdOfEvent, eventId, -100, reason)
          .catch((err) => toast.error(t('timeline.reportFailed', { error: getErrorMessage(err) })));
      });
    },
    [client, setReport, toast, t]
  );

  const handleResend = useCallback(
    (event: MatrixEvent) => {
      const r = client.getRoom(roomId);
      if (!r) return;
      client.resendEvent(event, r).catch((err) => {
        console.error('[Timeline] resendEvent failed', err);
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      });
    },
    [client, roomId, toast, t]
  );

  const handleCancel = useCallback(
    (event: MatrixEvent) => {
      try {
        client.cancelPendingEvent(event);
      } catch (err) {
        console.error('[Timeline] cancelPendingEvent failed', err);
      }
    },
    [client]
  );

  const handleThreadClick = useCallback(
    (event: MatrixEvent) => {
      setThreadsPanelView({ type: 'thread', rootEvent: event });
    },
    [setThreadsPanelView]
  );

  const handleReact = useCallback(
    (event: MatrixEvent, anchorEl?: HTMLElement) => {
      if (!event.getId()) return;
      let anchorRect: { x: number; y: number; width: number; height: number } | null = null;
      if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        anchorRect = { x: r.left, y: r.top, width: r.width, height: r.height };
      }
      setEmojiPicker({
        anchor: anchorEl ?? null,
        anchorRect,
        client,
        roomId,
        onPick: async (emoji: string, mxcUrl?: string) => {
          try {
            const reactionKey = mxcUrl ?? emoji;
            await toggleReaction(
              client,
              roomId,
              event,
              client.getUserId() ?? '',
              reactionKey,
              null
            );
          } catch (err) {
            toast.error(t('timeline.reactFailedShort', { error: getErrorMessage(err) }));
          }
        },
      });
    },
    [client, roomId, setEmojiPicker, toast, t]
  );

  const itemByEventId = useMemo(() => {
    const map = new Map<string, TimelineItem>();
    for (const item of items) {
      const id = item.event.getId();
      if (id) map.set(id, item);
    }
    return map;
  }, [items]);

  const renderMessage = (timelineItem: TimelineItem, opts: { index?: number } = {}) => {
    const eventId = timelineItem.event.getId() ?? '';
    const isActiveMatch =
      isSearching &&
      activeItemIndex !== null &&
      searchItems[activeItemIndex]?.event.getId() === eventId;
    const showUnreadDivider =
      !isSearching && !!firstUnreadEventId && itemContainsEvent(timelineItem, firstUnreadEventId);
    // Compare local arrival time so server clock skew can't misclassify the
    // entrance animation; falls back to origin_server_ts for no-age events.
    const isLive =
      (timelineItem.event.localTimestamp ?? timelineItem.event.getTs()) > mountTsRef.current;
    const isFlashing = flashEventId === eventId;

    let receiptUsers = receiptMap.get(eventId) ?? EMPTY_RECEIPTS;
    if (timelineItem.galleryEvents) {
      for (const galleryEvent of timelineItem.galleryEvents) {
        const galleryEventId = galleryEvent.getId();
        if (!galleryEventId) continue;
        const galleryReceipts = receiptMap.get(galleryEventId);
        if (galleryReceipts && galleryReceipts !== receiptUsers) {
          receiptUsers = [...receiptUsers, ...galleryReceipts];
        }
      }
    }
    if (timelineItem.callSession) {
      for (const callEvent of timelineItem.callSession.events) {
        const callEventId = callEvent.getId();
        if (!callEventId) continue;
        const callReceipts = receiptMap.get(callEventId);
        if (callReceipts && callReceipts !== receiptUsers) {
          receiptUsers = [...receiptUsers, ...callReceipts];
        }
      }
    }

    const animateIn = isLive && !timelineItem.isOwn;
    const itemClass = isActiveMatch ? css.searchMatchActive : animateIn ? css.msgLive : undefined;

    const messageProps = {
      event: timelineItem.event,
      isOwn: timelineItem.isOwn,
      senderId: timelineItem.senderId,
      senderName: timelineItem.senderName,
      senderAvatar: timelineItem.senderAvatar,
      isGrouped: isSearching ? false : timelineItem.isGrouped,
      variant: layout,
      isSystemMessage: timelineItem.isSystemMessage,
      isEdited: timelineItem.isEdited,
      isRedacted: timelineItem.isRedacted,
      isPinned: timelineItem.isPinned,
      canEdit: timelineItem.canEdit,
      canRedact: timelineItem.canRedact,
      canPin: timelineItem.canPin,
      isDecrypting: timelineItem.isDecrypting,
      isUndecryptable: timelineItem.isUndecryptable,
      isSending: timelineItem.isSending,
      isFailed: timelineItem.isFailed,
      sendError: timelineItem.sendError,
      optimisticBody: timelineItem.optimisticBody,
      galleryEvents: timelineItem.galleryEvents,
      callSession: timelineItem.callSession,
      client,
      searchQuery: isSearching ? search.query : '',
      receiptUsers,
      reactionVersion: timelineItem.reactionVersion,
      isFlashing,
      isHovered: hoveredEventId === eventId,
      onHover: handleHover,
      onReply: setReplyTo,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onReport: handleReport,
      onReact: handleReact,
      onThreadClick: handleThreadClick,
      onJumpToEvent: handleJumpToEvent,
      onResend: handleResend,
      onCancel: handleCancel,
    } as ComponentProps<typeof Message>;

    return (
      <div
        key={timelineItem.event.getTxnId() ?? eventId}
        data-event-id={eventId}
        {...(typeof opts.index === 'number' ? { 'data-message-item': String(opts.index) } : {})}
        className={itemClass}
      >
        <div
          className={css.dateSeparator}
          style={{ display: timelineItem.showDateSep || isSearching ? undefined : 'none' }}
        >
          {timelineItem.dateSepLabel}
        </div>
        {showUnreadDivider && (
          <UnreadDivider
            onDismiss={() => {
              clearUnreadDivider();
              sendReadReceiptIfAtBottom();
            }}
            label={t('timeline.unreadMessages')}
          />
        )}
        <DecryptionGate event={timelineItem.event}>
          {() => <Message {...messageProps} />}
        </DecryptionGate>
      </div>
    );
  };

  const eventRenderer = (item: number) => {
    const evt = getEventAtIndex(item);
    if (!evt) return null;
    const eventId = evt.getId();
    if (!eventId) return null;
    const timelineItem = itemByEventId.get(eventId);
    if (!timelineItem || timelineItem.event !== evt) return null;
    return renderMessage(timelineItem, { index: item });
  };

  // Scroll to the active search match.
  useEffect(() => {
    if (!isSearching || activeItemIndex === null) return;
    const activeId = searchItems[activeItemIndex]?.event.getId();
    if (!activeId) return;
    const el = scrollRef.current?.querySelector(`[data-event-id="${activeId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  }, [isSearching, activeItemIndex, searchItems]);

  useEffect(
    () => () => {
      if (atBottomDebounceRef.current !== null) {
        clearTimeout(atBottomDebounceRef.current);
        atBottomDebounceRef.current = null;
      }
    },
    []
  );

  if (isInvite) return null;

  return (
    <ImagePacksProvider client={client} roomId={roomId}>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            position: 'relative',
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className={css.chatDropZone}>
              <UploadIcon size={32} />
              <span>{t('timeline.dropToAttach')}</span>
            </div>
          )}

          {tombstoneReplacementRoomId && (
            <div className={css.tombstoneBanner}>
              <span className={css.tombstoneBannerText}>{t('timeline.roomUpgraded')}</span>
              {isInReplacement ? (
                <button
                  type="button"
                  className={css.tombstoneBannerBtn}
                  onClick={handleOpenReplacement}
                >
                  {t('timeline.viewNewRoom')}
                </button>
              ) : (
                <button
                  type="button"
                  className={css.tombstoneBannerBtn}
                  onClick={handleJoinReplacement}
                  disabled={joiningReplacement}
                >
                  {joiningReplacement ? t('explore.joining') : t('explore.join')}
                </button>
              )}
            </div>
          )}

          {!hideHeader && (
            <RoomHeader
              client={client}
              roomId={roomId}
              onJumpToEvent={handleJumpToEvent}
              onStartCall={handleStartCall}
              callActive={callActiveInRoom}
              othersInCall={othersInCall}
            />
          )}

          {isSearching && filteredItems.length > 0 && (
            <div className={css.searchBanner} role="status">
              {t('room.header.searchBanner', {
                count: filteredItems.length,
                query: search.query,
              })}
            </div>
          )}

          <div ref={scrollRef} className={css.timelineContainer}>
            <div ref={bodyRef} className={css.timelineBody}>
              {!isSearching && !canPaginateBack && rangeAtStart && getItems().length > 0 && (
                <div className={css.timelineIntro}>
                  {predecessorRoomId && (
                    <div className={css.predecessorNotice}>
                      <span>{t('timeline.roomUpgradedFrom')}</span>
                      <button
                        type="button"
                        className={css.predecessorNoticeBtn}
                        onClick={handleOpenPredecessor}
                      >
                        {t('timeline.viewOldRoom')}
                      </button>
                    </div>
                  )}
                  <div className={css.timelineStart}>
                    <div className={css.timelineStartIcon}>
                      <ChatTeardropTextIcon size={22} weight="duotone" />
                    </div>
                    <span className={css.timelineStartTitle}>
                      {isDm && dmPartnerName
                        ? t('timeline.startOfDm', { name: dmPartnerName })
                        : t('timeline.startOfConversation')}
                    </span>
                  </div>
                </div>
              )}

              {!isSearching && (canPaginateBack || !rangeAtStart) && (
                <div ref={observeBackAnchor} className={css.timelinePlaceholder}>
                  <SkeletonRow width1="55%" width2="35%" />
                  <SkeletonRow width1="70%" width2="50%" />
                  <SkeletonRow width1="45%" width2="60%" />
                </div>
              )}

              {isSearching
                ? filteredItems.map((timelineItem) => renderMessage(timelineItem))
                : getItems().map(eventRenderer)}

              {!isSearching && (!liveTimelineLinked || !rangeAtEnd) && (
                <div ref={observeFrontAnchor} className={css.timelinePlaceholder}>
                  <SkeletonRow width1="55%" width2="35%" />
                  <SkeletonRow width1="70%" width2="50%" />
                  <SkeletonRow width1="45%" width2="60%" />
                </div>
              )}

              <span ref={atBottomAnchorRef} />
            </div>
          </div>

          {isSearching && filteredItems.length === 0 && (
            <div className={css.searchEmpty}>
              {t('room.header.searchEmpty', { query: search.query })}
            </div>
          )}

          <div className={css.scrollToBottomAnchor}>
            {showScrollBtn && (
              <button type="button" className={css.scrollToBottomBtn} onClick={handleJumpToLatest}>
                <CaretDownIcon size={18} />
              </button>
            )}
          </div>

          {!isSearching && (
            <Composer
              client={client}
              roomId={roomId}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              stickerWidget={stickerWidget}
              droppedFile={droppedFile}
              onDroppedFileConsumed={clearDroppedFile}
            />
          )}
        </div>
      </div>
    </ImagePacksProvider>
  );
}
