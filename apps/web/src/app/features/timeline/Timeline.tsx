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
import type { WizardClient } from '@wizardchat/core';
import { CaretDownIcon, UploadIcon, ChatTeardropTextIcon, XIcon } from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { formatUserId, isDmRoom } from '@/util/matrix';
import { scrollToBottom } from '@/util/dom';
import { useRoom, useRoomSettings, useTimeline as useLiveTimeline } from '@/app/data';
import {
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
import { useMessageLayout } from '@/app/hooks/useMessageLayout';
import type { RoomMessageMatch } from '@/app/store/atoms';
import { useRoomReceipts } from '@/app/hooks/useRoomReceipts';
import type { ReceiptUser } from '@/app/hooks/useRoomReceipts';
import { useTimeline, itemContainsEvent, buildItems } from '@/app/hooks/useTimeline';
import type { TimelineItem } from '@/app/hooks/useTimeline';
import { itemMatchesQuery, useSearch } from '@/app/hooks/useSearch';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useWidgets } from '@/app/hooks/useWidgets';
import { useVirtualPaginator } from '@/app/hooks/useVirtualPaginator';
import { MessageSkeletonList } from './MessageSkeleton';
import { ROW_KEY_ATTR, useTimelineScrollAnchor } from './useTimelineScrollAnchor';
import { SearchResults } from './SearchResults';
import { useRoomServerSearch } from '@/app/hooks/useRoomServerSearch';
import * as searchCss from './SearchResults.css';
import {
  UndecryptableCollapse,
  UndecryptableFold,
  UndecryptableHistoryNotice,
} from './message/UndecryptableMessage';
import {
  UNDECRYPTABLE_RUN_THRESHOLD,
  computeUndecryptableRuns,
  expandedUndecryptableRoomsAtom,
} from './message/undecryptable';
import { useMessageHover } from './useMessageHover';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '@/app/hooks/useIntersectionObserver';
import { useRoomReadReceipts } from '@/app/hooks/useRoomReadReceipts';
import { DecryptionGate, Message } from './message';
import { toggleReaction } from './message/reactions';
import { editStateFor, publishTimelineEntries } from './message/editNavigation';
import { TimelineEntriesContext, entryBody, entryEventId, type EventEntry } from './message/entry';
import { useLoadedMembers } from './message/members';
import { Composer } from './composer';
import { RoomHeader } from './RoomHeader';
import { getErrorMessage } from '@/util/error';
import { ImagePacksProvider } from '@/app/hooks/useImagePacks';
import * as css from './Timeline.css';
import { scrollBehavior } from '@/app/hooks/useReducedMotion';

interface Props {
  client: WizardClient;
  roomId: string;
  hideHeader?: boolean;
}

const EMPTY_RECEIPTS: ReceiptUser[] = [];
const PAGINATION_LIMIT = 80;
const INITIAL_SKELETON_ROWS = 14;
const BACK_SKELETON_ROWS = 4;
const FRONT_SKELETON_ROWS = 4;
/** Least time between two pages of unreadable history loaded by scrolling up at the top. */
const MANUAL_BACKFILL_INTERVAL_MS = 1500;
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
          // Divider has scrolled above the viewport - dismiss
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

const LIVE_KIND = { type: 'main' } as const;

export function Timeline({ client, roomId, hideHeader }: Props) {
  const { t, i18n } = useTranslation();
  const layout = useMessageLayout();
  const toast = useToast();

  const confirmDialog = useConfirm();
  const [, setEditMessage] = useAtom(editMessageAtom);
  const [, setEmojiPicker] = useAtom(emojiPickerAtom);
  const setThreadsPanelView = useSetAtom(threadsPanelViewAtom);
  const setReport = useSetAtom(reportMessageAtom);

  const [optimisticRedactedIds, setOptimisticRedactedIds] = useAtom(optimisticRedactedIdsAtom);
  const optimisticEditBodies = useAtomValue(optimisticEditBodiesAtom);

  const atBottomRef = useRef(true);

  const {
    timeline,
    entries,
    items,
    events,
    buildContext,
    range,
    eventsLength,
    liveTimelineLinked,
    canPaginateBack,
    rangeAtStart,
    rangeAtEnd,
    isPaginating,
    backfillPaused,
    timelineResetEpoch,
    firstUnreadEventId,
    readUpToEventId,
    clearUnreadDivider,
    setRange,
    handlePaginate,
    getEventAtIndex,
    getEventIndex,
    loadEventTimeline,
    setInitialTimeline,
  } = useTimeline(client, roomId, {
    onScrollbackError: (retry) => {
      toast.error(t('timeline.loadFailed'), {
        actionLabel: t('common.retry'),
        onClick: retry,
      });
    },
    optimisticRedactedIds,
    optimisticEditBodies,
    isAtBottom: () => atBottomRef.current,
  });

  // After a jump the window shows older messages; sending and arrow-up editing stay on the
  // live timeline
  const live = useLiveTimeline(client, roomId, LIVE_KIND, !liveTimelineLinked);
  const liveEntries = liveTimelineLinked ? entries : live.entries;
  const sendTimeline = liveTimelineLinked ? timeline : live.timeline;
  useEffect(() => publishTimelineEntries(roomId, null, liveEntries), [roomId, liveEntries]);

  const entriesById = useMemo(() => {
    const map = new Map<string, EventEntry>();
    for (const event of events) map.set(entryEventId(event), event);
    return map;
  }, [events]);
  const eventsRef = useRef(entriesById);
  eventsRef.current = entriesById;

  const { stickerWidget } = useWidgets(client, roomId);

  const callActions = useAtomValue(callActionsAtom);
  const callUi = useAtomValue(callUiAtom);
  const isInCall = useAtomValue(isInCallAtom);
  const callActiveInRoom = callUi.roomId === roomId && isInCall;

  const room = useRoom(roomId);
  const myUserId = client.userId();
  const othersInCall = !!room?.callParticipants.some((userId) => userId !== myUserId);
  const inCallElsewhere = !!room?.inCallElsewhere;

  const handleStartCall = useCallback(
    async (targetRoomId: string, ring: boolean) => {
      if (isInCall && callUi.roomId === targetRoomId) {
        return;
      }
      await callActions?.start(targetRoomId, { voiceOnly: true, presentation: 'room', ring });
    },
    [isInCall, callUi.roomId, callActions]
  );

  const receiptMap = useRoomReceipts(client, roomId, entries);
  const members = useLoadedMembers(roomId);

  const isInvite = room?.isInvite === true;

  const isDm = isDmRoom(room);
  const dmPartnerId = isDm ? (room?.dmUserId ?? null) : null;
  const dmPartnerName = dmPartnerId
    ? (members.get(dmPartnerId)?.displayName ?? formatUserId(dmPartnerId))
    : null;

  const { data: roomSettings } = useRoomSettings(roomId);
  const tombstoneReplacementRoomId = roomSettings?.tombstone?.replacementRoom ?? null;
  const predecessorRoomId = roomSettings?.predecessor ?? null;

  const navigate = useNavigate();

  const [joiningReplacement, setJoiningReplacement] = useState(false);
  const replacedRoom = useRoom(tombstoneReplacementRoomId);
  const isInReplacement = !!replacedRoom && !replacedRoom.isInvite;

  const handleJoinReplacement = useCallback(async () => {
    if (!tombstoneReplacementRoomId) return;
    setJoiningReplacement(true);
    try {
      const joined = await client.joinUpgradedRoom(roomId);
      navigate(`/r/${encodeURIComponent(joined)}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setJoiningReplacement(false);
    }
  }, [tombstoneReplacementRoomId, roomId, client, navigate, toast]);

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
        buildContext,
        t,
        i18n.language,
        optimisticRedactedIds,
        optimisticEditBodies,
        { prevEvent: undefined }
      );
      return cache;
    };
  }, [
    i18n.language,
    t,
    optimisticRedactedIds,
    optimisticEditBodies,
    events,
    client,
    roomId,
    buildContext,
  ]);
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

  // Unencrypted rooms are searched on the homeserver, which can page through every message;
  // encrypted ones can only be matched against what this device has loaded.
  const serverSearchEnabled = isSearching && !room?.isEncrypted;
  const serverSearch = useRoomServerSearch(client, roomId, search.query, serverSearchEnabled);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(false);
  const atBottomAnchorRef = useRef<HTMLElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  atBottomRef.current = atBottom;
  const atLiveEndRef = useRef(liveTimelineLinked && rangeAtEnd);
  atLiveEndRef.current = liveTimelineLinked && rangeAtEnd;

  // Keeps the view steady while row heights settle after first paint (images and previews
  // loading, replies fetched, decryption finishing): stays at the bottom at the live end, and
  // otherwise moves the scroll by the growth of rows above the viewport so what is being read stays
  // put. The container turns native scroll anchoring off, so this does it.
  const { registerRow, markPinned } = useTimelineScrollAnchor(
    scrollRef,
    useCallback(() => atLiveEndRef.current, []),
    !isInvite
  );
  const showScrollBtn = !atBottom && !isSearching;

  const scrollToBottomRef = useRef({
    count: 0,
    smooth: true,
  });
  const forceScrollToBottomRef = useRef({
    count: 0,
    smooth: false,
  });

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

  const latestEventId = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const id = events[i].eventId;
      if (id) return id;
    }
    return null;
  }, [events]);
  const sendReadReceiptIfAtBottom = useRoomReadReceipts(
    client,
    roomId,
    liveTimelineLinked ? timeline : null,
    latestEventId
  );

  useEffect(() => {
    if (items.length > 0 && atBottomRef.current) sendReadReceiptIfAtBottom();
  }, [items, sendReadReceiptIfAtBottom]);

  const tryAutoMarkAsRead = useCallback(() => {
    requestAnimationFrame(() => sendReadReceiptIfAtBottom());
  }, [sendReadReceiptIfAtBottom]);

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

  const [focusItem, setFocusItem] = useState<{ index: number; scrollTo: boolean } | undefined>();

  const handleJumpToEvent = useCallback(
    async (eventId: string, flash: boolean = true) => {
      stickToBottomRef.current = false;
      const absIndex = getEventIndex(eventId);
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
    [getEventIndex, scrollToItem, loadEventTimeline]
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
    stickToBottomRef.current = true;
    forceScrollToBottomRef.current.count += 1;
    forceScrollToBottomRef.current.smooth = false;
  }, [setInitialTimeline]);

  const handleSearchClose = useCallback(() => {
    clearSearch();
    handleJumpToLatest();
  }, [clearSearch, handleJumpToLatest]);

  const handleSearchResultJump = useCallback(
    (result: { eventId: string }) => {
      clearSearch();
      // Let the regular timeline render again before scrolling/loading around the event.
      setTimeout(() => void handleJumpToEvent(result.eventId), 50);
    },
    [clearSearch, handleJumpToEvent]
  );

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
      matchCount: serverSearchEnabled
        ? serverSearch.hits.length
        : isSearching
          ? search.matchIndices.length
          : 0,
      activeMatch: serverSearchEnabled ? 0 : search.activeMatch,
      next: goToNext,
      prev: goToPrev,
      showNav: !serverSearchEnabled,
    });
  }, [
    searchQueryForRoom,
    roomId,
    isSearching,
    serverSearchEnabled,
    serverSearch.hits.length,
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
              eventId: item.eventId,
              senderName: item.senderName,
              senderAvatar: item.senderAvatar,
              body: entryBody(item.event),
              ts: item.event.timestamp,
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
    if (readUpToEventId) {
      const absIndex = getEventIndex(readUpToEventId);
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
    markPinned();
    scrollToBottom(scrollEl, 'instant');
  }, [epoch, eventsLength, readUpToEventId, scrollToItem, getEventIndex, markPinned]);

  const scrollToBottomCount = scrollToBottomRef.current.count;
  const forceScrollToBottom = forceScrollToBottomRef.current.count > 0;
  useLayoutEffect(() => {
    if (forceScrollToBottom) {
      const forceSmooth = forceScrollToBottomRef.current.smooth;
      forceScrollToBottomRef.current.count = 0;
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        markPinned(forceSmooth);
        scrollToBottom(scrollEl, forceSmooth ? 'smooth' : 'instant');
      }
      return;
    }
    if (scrollToBottomCount > 0) {
      if (!atBottomRef.current || !atLiveEndRef.current) return;
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        markPinned(scrollToBottomRef.current.smooth);
        scrollToBottom(scrollEl, scrollToBottomRef.current.smooth ? 'smooth' : 'instant');
      }
    }
  }, [forceScrollToBottom, scrollToBottomCount, items, markPinned]);

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

  const liveIdsRef = useRef(new Set<string>());
  const lastEventRef = useRef<string | null>(null);
  const liveArrival = useMemo(() => {
    const prevLast = lastEventRef.current;
    const last = events[events.length - 1]?.id ?? null;
    lastEventRef.current = last;
    if (!prevLast || !last || prevLast === last) return null;
    const prevIndex = events.findIndex((e) => e.id === prevLast);
    if (prevIndex === -1) return null;
    for (let i = prevIndex + 1; i < events.length; i++) liveIdsRef.current.add(events[i].id);
    return events[events.length - 1];
  }, [events]);

  useLayoutEffect(() => {
    if (!liveArrival) return;
    if (atBottomRef.current && atLiveEndRef.current) {
      if (document.hasFocus()) {
        requestAnimationFrame(() => sendReadReceiptIfAtBottom());
      }
      const scrollEl = scrollRef.current;
      if (scrollEl) scrollToBottom(scrollEl, 'instant');
    }
  }, [liveArrival, sendReadReceiptIfAtBottom]);

  useEffect(() => {
    const onFocus = () => {
      if (!atBottomRef.current) return;
      tryAutoMarkAsRead();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tryAutoMarkAsRead]);

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

  const [replyTo, setReplyTo] = useState<EventEntry | null>(null);

  const handleEdit = useCallback(
    (event: EventEntry) => {
      if (event.sendState === 'failed') {
        toast.info(t('timeline.editNotSent'));
        return;
      }
      setEditMessage(editStateFor(event, roomId));
    },
    [roomId, setEditMessage, toast, t]
  );

  const handleDelete = useCallback(
    (event: EventEntry) => {
      const eventId = entryEventId(event);
      confirmDialog({
        title: t('timeline.deleteMessage'),
        message: t('timeline.deleteMessageConfirm'),
        danger: true,
      }).then((ok) => {
        if (!ok || !timeline) return;
        setOptimisticRedactedIds((prev) => new Set([...prev, eventId]));

        const clearOptimisticRedacted = () => {
          setOptimisticRedactedIds((prev) => {
            if (!prev.has(eventId)) return prev;
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
        };

        timeline.redact(event.itemKey).then(
          () => {
            // Keep the event hidden until the redaction is reflected locally,
            // then drop the optimistic entry so the set doesn't grow unbounded.
            const deadline = Date.now() + 3000;
            const poll = () => {
              const current = eventsRef.current.get(eventId);
              const redacted = !current || current.content.type === 'redacted';
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
    [timeline, confirmDialog, setOptimisticRedactedIds, toast, t]
  );

  const handleReport = useCallback(
    (event: EventEntry) => {
      const eventId = event.eventId;
      if (!eventId) return;
      new Promise<string | null>((resolve) => {
        setReport({
          open: true,
          roomId,
          eventId,
          senderId: event.sender,
          resolve,
        });
      }).then((reason) => {
        if (reason === null) return;
        client
          .reportEvent(roomId, eventId, reason)
          .catch((err) => toast.error(t('timeline.reportFailed', { error: getErrorMessage(err) })));
      });
    },
    [client, roomId, setReport, toast, t]
  );

  const handleResend = useCallback(
    (event: EventEntry) => {
      timeline?.retrySend(event.itemKey).catch((err) => {
        console.error('[Timeline] resend failed', err);
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      });
    },
    [timeline, toast, t]
  );

  const handleCancel = useCallback(
    (event: EventEntry) => {
      timeline?.redact(event.itemKey).catch((err) => {
        console.error('[Timeline] cancelling the send failed', err);
      });
    },
    [timeline]
  );

  const handleThreadClick = useCallback(
    (event: EventEntry) => {
      if (!event.eventId) return;
      setThreadsPanelView({ type: 'thread', rootEventId: event.eventId });
    },
    [setThreadsPanelView]
  );

  const handleReact = useCallback(
    (event: EventEntry, anchorEl?: HTMLElement) => {
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
          if (!timeline) return;
          try {
            const reactionKey = mxcUrl ?? emoji;
            await toggleReaction(timeline, event, reactionKey);
          } catch (err) {
            toast.error(t('timeline.reactFailedShort', { error: getErrorMessage(err) }));
          }
        },
      });
    },
    [client, roomId, timeline, setEmojiPicker, toast, t]
  );

  // Runs of unreadable messages fold into one row, unless this room was told to show them all.
  const expandedUndecryptableRooms = useAtomValue(expandedUndecryptableRoomsAtom);
  const undecryptableRuns = useMemo(() => computeUndecryptableRuns(items), [items]);
  const showAllUndecryptable = expandedUndecryptableRooms.has(roomId);

  // Older history stopped loading by itself because it was all messages this device cannot read:
  // say so once at the top instead of a skeleton that keeps fetching.
  // First load of a room: nothing to show yet, so reserve a realistic conversation instead of a
  // blank list.
  const showInitialSkeleton = !isSearching && eventsLength === 0 && isPaginating;
  const showHistoryNotice = !isSearching && backfillPaused && canPaginateBack && rangeAtStart;
  const historyNoticeReason = useMemo(() => {
    const first = events.find((e) => e.content.type === 'unableToDecrypt');
    return first?.content.type === 'unableToDecrypt' ? first.content.reason : null;
  }, [events]);
  const loadOlderManually = useCallback(() => {
    void handlePaginate(true, { manual: true });
  }, [handlePaginate]);

  // While paused, scrolling up at the very top (wheel, swipe, PageUp/Home/ArrowUp) still loads one
  // more page per gesture, at most every MANUAL_BACKFILL_INTERVAL_MS. The time lives in a ref: the
  // notice briefly unmounts while a page lands, which must not reset the limit.
  const lastManualBackfillRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !showHistoryNotice) return undefined;
    let touchY: number | null = null;
    const loadIfAtTop = () => {
      if (el.scrollTop > 8) return;
      const now = Date.now();
      if (now - lastManualBackfillRef.current < MANUAL_BACKFILL_INTERVAL_MS) return;
      lastManualBackfillRef.current = now;
      loadOlderManually();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) loadIfAtTop();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined || y - touchY < 40) return;
      touchY = y;
      loadIfAtTop();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PageUp' || e.key === 'Home' || e.key === 'ArrowUp') loadIfAtTop();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [showHistoryNotice, loadOlderManually]);

  const itemByEventId = useMemo(() => {
    const map = new Map<string, TimelineItem>();
    for (const item of items) map.set(item.eventId, item);
    return map;
  }, [items]);

  // Where each reader has got to: their read receipt, or their own latest message if that is later
  // (replying means they saw what came before). A reader's marker never sits on their own messages,
  // so it moves back to the last message from someone else.
  const effectiveReceiptMap = useMemo(() => {
    const myUserId = client.userId();
    const indexOfEvent = new Map<string, number>();
    const lastSenderPos = new Map<string, number>();
    items.forEach((it, i) => {
      const id = it.eventId;
      if (id) indexOfEvent.set(id, i);
      if (it.senderId && !it.isSystemMessage) {
        lastSenderPos.set(it.senderId, i);
      }
      it.galleryEvents?.forEach((e) => {
        const gid = entryEventId(e);
        if (gid) indexOfEvent.set(gid, i);
      });
    });

    const readers = new Map<string, { user: ReceiptUser; pos: number }>();
    for (const [eventId, users] of receiptMap) {
      const idx = indexOfEvent.get(eventId);
      if (idx === undefined) continue;
      for (const user of users) {
        // If a receipt landed on the timeline tail from a thread or server synthesis,
        // do not advance past the reader's latest message in the room unless they sent one here.
        const senderPos = lastSenderPos.get(user.userId);
        const effectivePos =
          senderPos !== undefined && idx === items.length - 1 && idx > senderPos ? senderPos : idx;
        const known = readers.get(user.userId);
        if (!known || effectivePos > known.pos)
          readers.set(user.userId, { user, pos: effectivePos });
      }
    }
    items.forEach((it, i) => {
      if (!it.senderId || it.senderId === myUserId || it.isSystemMessage) return;
      const known = readers.get(it.senderId);
      if (known && known.pos >= i) return;
      readers.set(it.senderId, {
        user: {
          userId: it.senderId,
          displayName: it.senderName,
          avatarUrl: it.senderAvatar ?? null,
          ts: it.event.timestamp ?? 0,
        },
        pos: i,
      });
    });

    const out = new Map<string, ReceiptUser[]>();
    for (const { user, pos } of readers.values()) {
      let i = pos;
      while (i >= 0 && items[i].senderId === user.userId) i -= 1;
      const targetId = i >= 0 ? items[i].eventId : null;
      if (!targetId) continue;
      const list = out.get(targetId) ?? [];
      list.push(user);
      out.set(targetId, list);
    }
    return out;
  }, [items, receiptMap, client]);

  // Your latest message that has actually been sent: the bubble layout marks it Sent until read.
  const lastOwnEventId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i];
      if (it.isOwn && !it.isSending && !it.isFailed) return it.eventId || null;
    }
    return null;
  }, [items]);

  const renderMessage = (timelineItem: TimelineItem, opts: { index?: number } = {}) => {
    const eventId = timelineItem.eventId;
    const isActiveMatch =
      isSearching && activeItemIndex !== null && searchItems[activeItemIndex]?.eventId === eventId;
    const showUnreadDivider =
      !isSearching && !!firstUnreadEventId && itemContainsEvent(timelineItem, firstUnreadEventId);
    const run = isSearching ? undefined : undecryptableRuns.get(eventId);
    const inLongRun = !!run && run.count >= UNDECRYPTABLE_RUN_THRESHOLD;
    const foldedRun = inLongRun && !showAllUndecryptable ? run : undefined;
    const unfoldedRun = inLongRun && showAllUndecryptable ? run : undefined;
    const isLive = liveIdsRef.current.has(timelineItem.event.id);
    const isFlashing = flashEventId === eventId;

    let receiptUsers = effectiveReceiptMap.get(eventId) ?? EMPTY_RECEIPTS;
    if (timelineItem.galleryEvents) {
      for (const galleryEvent of timelineItem.galleryEvents) {
        const galleryEventId = entryEventId(galleryEvent);
        if (galleryEventId === eventId) continue;
        const galleryReceipts = effectiveReceiptMap.get(galleryEventId);
        if (galleryReceipts && galleryReceipts !== receiptUsers) {
          receiptUsers = [...receiptUsers, ...galleryReceipts];
        }
      }
    }

    const animateIn = isLive && !timelineItem.isOwn;
    const itemClass = isActiveMatch ? css.searchMatchActive : animateIn ? css.msgLive : undefined;

    const messageProps = {
      event: timelineItem.event,
      roomId,
      timeline,
      isOwn: timelineItem.isOwn,
      senderId: timelineItem.senderId,
      senderName: timelineItem.senderName,
      senderAvatar: timelineItem.senderAvatar,
      isGrouped: isSearching ? false : timelineItem.isGrouped,
      isLastOwn: !!eventId && eventId === lastOwnEventId,
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
        key={timelineItem.event.id}
        ref={registerRow}
        {...{ [ROW_KEY_ATTR]: timelineItem.event.id }}
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
        {foldedRun && !foldedRun.isFirst ? null : foldedRun ? (
          <UndecryptableFold
            client={client}
            roomId={roomId}
            count={foldedRun.count}
            reason={
              timelineItem.event.content.type === 'unableToDecrypt'
                ? timelineItem.event.content.reason
                : null
            }
          />
        ) : (
          <>
            {unfoldedRun?.isFirst && (
              <div className={css.undecryptableCollapseRow}>
                <UndecryptableCollapse roomId={roomId} />
              </div>
            )}
            <DecryptionGate event={timelineItem.event}>
              {() => <Message {...messageProps} />}
            </DecryptionGate>
          </>
        )}
      </div>
    );
  };

  const eventRenderer = (item: number) => {
    const evt = getEventAtIndex(item);
    if (!evt) return null;
    const timelineItem = itemByEventId.get(entryEventId(evt));
    if (!timelineItem || timelineItem.event !== evt) return null;
    return renderMessage(timelineItem, { index: item });
  };

  // Scroll to the active search match.
  useEffect(() => {
    if (!isSearching || activeItemIndex === null) return;
    const activeId = searchItems[activeItemIndex]?.eventId;
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
      <TimelineEntriesContext.Provider value={entriesById}>
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
                    {joiningReplacement ? t('explore.joining') : t('common.join')}
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
                inCallElsewhere={inCallElsewhere}
              />
            )}

            {isSearching && !serverSearchEnabled && filteredItems.length > 0 && (
              <div className={css.searchBanner} role="status">
                {t('room.header.searchBanner', {
                  count: filteredItems.length,
                  query: search.query,
                })}
              </div>
            )}

            {isSearching && room?.isEncrypted && (
              <div className={searchCss.encryptedNote} role="status">
                {t('room.header.searchEncryptedNote')}
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

                {showHistoryNotice && (
                  <UndecryptableHistoryNotice
                    client={client}
                    roomId={roomId}
                    reason={historyNoticeReason}
                    loading={isPaginating}
                    onLoadOlder={loadOlderManually}
                  />
                )}

                {!isSearching && !showHistoryNotice && (canPaginateBack || !rangeAtStart) && (
                  <div ref={observeBackAnchor} className={css.timelinePlaceholder}>
                    {showInitialSkeleton ? (
                      <MessageSkeletonList
                        count={INITIAL_SKELETON_ROWS}
                        label={t('common.loading')}
                        initial
                      />
                    ) : (
                      <MessageSkeletonList count={BACK_SKELETON_ROWS} startGroup={3} />
                    )}
                  </div>
                )}

                {serverSearchEnabled ? (
                  <SearchResults
                    roomId={roomId}
                    query={search.query}
                    status={serverSearch.status}
                    results={serverSearch.hits}
                    loadingMore={serverSearch.loadingMore}
                    next={serverSearch.next}
                    error={serverSearch.error}
                    onLoadMore={serverSearch.loadMore}
                    onJump={handleSearchResultJump}
                  />
                ) : isSearching ? (
                  filteredItems.map((timelineItem) => renderMessage(timelineItem))
                ) : (
                  getItems().map(eventRenderer)
                )}

                {!isSearching && (!liveTimelineLinked || !rangeAtEnd) && (
                  <div ref={observeFrontAnchor} className={css.timelinePlaceholder}>
                    <MessageSkeletonList count={FRONT_SKELETON_ROWS} />
                  </div>
                )}

                <span ref={atBottomAnchorRef} />
              </div>
            </div>

            {isSearching && !serverSearchEnabled && filteredItems.length === 0 && (
              <div className={css.searchEmpty}>
                {t('room.header.searchEmpty', { query: search.query })}
              </div>
            )}

            <div className={css.scrollToBottomAnchor}>
              {showScrollBtn && (
                <button
                  type="button"
                  className={css.scrollToBottomBtn}
                  onClick={handleJumpToLatest}
                >
                  <CaretDownIcon size={18} />
                </button>
              )}
            </div>

            {!isSearching && (
              <Composer
                client={client}
                roomId={roomId}
                timeline={sendTimeline}
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
                stickerWidget={stickerWidget}
                droppedFile={droppedFile}
                onDroppedFileConsumed={clearDroppedFile}
              />
            )}
          </div>
        </div>
      </TimelineEntriesContext.Provider>
    </ImagePacksProvider>
  );
}
