import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import {
  M_POLL_START,
  M_POLL_END,
  M_POLL_KIND_DISCLOSED,
  MatrixEventEvent,
  RoomEvent,
  THREAD_RELATION_TYPE,
} from 'matrix-js-sdk';
import { SmileyIcon, WarningIcon, ChatDotsIcon, ArrowBendUpLeftIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Avatar } from '@/app/components/Avatar';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { MessageActionToolbar } from './MessageActionToolbar';
import { ViewSourceModal } from './ViewSourceModal';
import { formatTime } from '@/util/format';
import { formatUserId, isPrivateRoom } from '@/util/matrix';
import { isThreadReplyUnread } from '@/util/threads';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { useContextMenu, isMenuOpenKey, syntheticMouseEvent } from '@/app/hooks/useContextMenu';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import type { ReceiptUser } from '@/app/hooks/useRoomReceipts';
import { CallSessionDisplay } from './callEvents';
import type { CallSessionSummary } from './callSessions';
import { SystemMessageDisplay } from './systemMessages';
import {
  buildReactionMap,
  buildGalleryReactionMap,
  useReactionHandler,
  useGalleryReactionHandler,
  getReactionSenderNames,
} from './reactions';
import { useImagePacksContext } from '@/app/hooks/useImagePacks';
import { emojiToShortcode } from '@/app/features/timeline/emojiData';
import { togglePin } from './pinning';
import { openMessageContextMenu } from './contextMenu';
import { useSwipeToReply } from '@/app/hooks/useTouchGestures';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { TOUCH_FIRST_QUERY } from '@/theme/uiDensity';
import type { ImagePackImage } from '@/app/hooks/useImagePacks';
import { MessageContent } from './content';
import { MessageGallery } from './GalleryGrid';
import { useDecryptedMedia } from './encryption';
import { getMediaSpoiler } from './spoiler';
import type { MediaCover } from './MediaSpoiler';
import { markdownToHtml, plainTextToHtml } from '@/util/markdownToHtml';
import { emojiPickerAtom } from '@/app/store/atoms/ui';
import { contextMenuAtom } from '@/app/features/contextMenu/contextMenuAtom';

function findMxcShortcode(packs: Map<string, ImagePackImage>, mxcUrl: string): string | null {
  for (const [shortcode, img] of packs) {
    if (img.url === mxcUrl) return shortcode;
  }
  return null;
}

const MAX_REACTOR_NAMES = 6;

const MAX_HIDDEN_MEDIA_EVENTS = 500;

function wrapShortcode(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith(':') ? value : `:${value}:`;
}

function formatReactors(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= MAX_REACTOR_NAMES) {
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  const shown = names.slice(0, MAX_REACTOR_NAMES - 1).join(', ');
  const others = names.length - (MAX_REACTOR_NAMES - 1);
  return `${shown} and ${others} others`;
}

import {
  getReplyContent,
  extractReplyMxcUrl,
  stripReplyFallback,
  stripReplyFallbackHtml,
  isEditableEvent,
  type ReplyContent,
} from './textContent';
import { getReplyEventId } from '@/util/mentions';
import { ReceiptAvatar } from './receiptAvatar';
import { ReadReceiptsPopover, useReadReceiptsPopover } from './readReceiptsPopover';
import {
  editMessageAtom,
  userProfileAtom,
  mentionInsertAtom,
  developerModeAtom,
  threadLastSeenAtom,
  hiddenMediaAtom,
  mediaVisibilityAtom,
  forwardMessageAtom,
  type MessageLayout,
} from '@/app/store/atoms';
import { PollCreatorModal } from '@/app/features/timeline/composer/PollCreatorModal';
import { EditMessageComposer } from './EditMessageComposer';
import { ReplyMediaThumb, isReplyMediaEvent } from './ReplyMediaThumb';
import { extractPollData } from './PollViewer';
import * as css from '../Timeline.css';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';

const FLOATING_OVERLAY_SELECTOR =
  '[data-emoji-picker], [data-popover], [role="menu"], [role="listbox"], [role="dialog"]';

function isFloatingOverlayTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FLOATING_OVERLAY_SELECTOR) !== null;
}

export interface MessageProps {
  event: MatrixEvent;
  isOwn: boolean;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  isGrouped: boolean;
  variant: MessageLayout;
  isSystemMessage: boolean;
  isEdited: boolean;
  isRedacted: boolean;
  isPinned: boolean;
  canEdit: boolean;
  canRedact: boolean;
  canPin: boolean;
  isDecrypting: boolean;
  isUndecryptable: boolean;
  isSending?: boolean;
  isFailed?: boolean;
  sendError?: string | null;
  optimisticBody?: string | null;
  galleryEvents?: MatrixEvent[] | null;
  callSession?: CallSessionSummary | null;
  client: MatrixClient;
  searchQuery?: string;
  receiptUsers?: ReceiptUser[];
  reactionVersion?: number;
  isFlashing?: boolean;
  onReply: (event: MatrixEvent) => void;
  onEdit: (event: MatrixEvent) => void;
  onDelete: (event: MatrixEvent) => void;
  onReport: (event: MatrixEvent) => void;
  onReact: (event: MatrixEvent, anchor?: HTMLElement) => void;
  onThreadClick?: (event: MatrixEvent) => void;
  onResend?: (event: MatrixEvent) => void;
  onCancel?: (event: MatrixEvent) => void;
  onJumpToEvent?: (eventId: string) => void;
  hideReplyQuote?: boolean;
  hideThreadBadge?: boolean;
  isHovered: boolean;
  onHover: (eventId: string | null) => void;
}

export const Message = memo(function Message({
  event,
  isOwn,
  senderId,
  senderName,
  senderAvatar,
  isGrouped,
  variant,
  isSystemMessage,
  isEdited,
  isRedacted,
  isPinned,
  canEdit,
  canRedact,
  canPin,
  isDecrypting,
  isUndecryptable,
  isSending = false,
  isFailed = false,
  optimisticBody = null,
  galleryEvents = null,
  callSession = null,
  client,
  searchQuery = '',
  receiptUsers = [],
  reactionVersion = 0,
  isFlashing = false,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onReact,
  onResend,
  onCancel,
  onJumpToEvent,
  onThreadClick,
  hideReplyQuote = false,
  hideThreadBadge = false,
  isHovered,
  onHover,
}: MessageProps) {
  const { t, i18n } = useTranslation();
  const msgRowRef = useRef<HTMLDivElement>(null);
  const swipeContentRef = useRef<HTMLDivElement>(null);
  const swipeIconRef = useRef<HTMLSpanElement>(null);
  const toast = useToast();
  const emojiPicker = useAtomValue(emojiPickerAtom);
  const contextMenu = useAtomValue(contextMenuAtom);
  const pickerOpenForThisRow =
    emojiPicker?.anchor != null && msgRowRef.current?.contains(emojiPicker.anchor) === true;
  const menuOpenForThisRow =
    contextMenu?.opener != null && msgRowRef.current?.contains(contextMenu.opener) === true;
  const showActions = isHovered || pickerOpenForThisRow || menuOpenForThisRow;
  const [lightboxItem, setLightboxItem] = useState<{
    src: string;
    type: 'image' | 'video';
    initialTime?: number;
  } | null>(null);
  const [viewSourceEvent, setViewSourceEvent] = useState<MatrixEvent | null>(null);
  const [devModeEnabled] = useAtom(developerModeAtom);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const threadLastSeen = useAtomValue(threadLastSeenAtom);
  const { openContextMenu } = useContextMenu();
  const setProfile = useSetAtom(userProfileAtom);
  const setMentionInsert = useSetAtom(mentionInsertAtom);
  const confirmDialog = useConfirm();
  const receipts = useReadReceiptsPopover();

  const colorFor = useUsernameColor();
  const senderColor = colorFor(senderId);
  const senderNameStyle = useMemo(
    () => (senderColor ? { color: senderColor } : undefined),
    [senderColor]
  );

  const handleNameClick = useCallback(() => {
    setMentionInsert({ text: `@${senderName} `, displayName: senderName, userId: senderId });
  }, [senderName, senderId, setMentionInsert]);

  const handleOpenProfile = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setProfile({
        userId: senderId,
        roomId: event.getRoomId(),
        anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
    },
    [senderId, event, setProfile]
  );

  const handleMouseEnter = useCallback(() => {
    onHover(event.getId() ?? null);
  }, [onHover, event]);
  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleRowFocus = useCallback(() => {
    onHover(event.getId() ?? null);
  }, [onHover, event]);

  const handleRowBlur = useCallback(
    (e: React.FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      if (isFloatingOverlayTarget(next)) return;
      onHover(null);
    },
    [onHover]
  );

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (isMenuOpenKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      handleContextMenu(syntheticMouseEvent(0, 0, e.currentTarget));
    }
  };

  const type = event.getType();
  const content = event.getContent();
  const hasCodeBlock =
    typeof content?.formatted_body === 'string' &&
    (content.formatted_body as string).includes('<pre');
  const ts = event.getTs();
  const myId = client.getUserId() ?? '';
  const room = client.getRoom(event.getRoomId() ?? '');
  const isPollEvent = M_POLL_START.matches(type);
  const canEditMessageType = isEditableEvent(event) || isPollEvent;
  const [replacedVersion, setReplacedVersion] = useState(0);

  // Re-read poll data when an edit (m.replace) is applied
  useEffect(() => {
    const onReplaced = () => setReplacedVersion((v) => v + 1);
    event.on(MatrixEventEvent.Replaced, onReplaced);
    return () => {
      event.off(MatrixEventEvent.Replaced, onReplaced);
    };
  }, [event]);

  useEffect(() => {
    if (!room) return;
    const myEventId = event.getId();
    if (!myEventId) return;
    const bump = (ev: MatrixEvent) => {
      const rel = ev.getRelation();
      if (rel?.rel_type === 'm.thread' && rel.event_id === myEventId) {
        setTimelineVersion((v) => v + 1);
      }
    };
    room.on(RoomEvent.Timeline, bump);
    return () => {
      room.off(RoomEvent.Timeline, bump);
    };
  }, [room, event]);

  const isThreadRoot =
    !!event.getServerAggregatedRelation(THREAD_RELATION_TYPE.name) ||
    !!room?.getThread(event.getId() ?? '');
  useEffect(() => {
    if (!room || !isThreadRoot) return;
    const myUserId = room.client.getUserId();
    const onReceipt = (ev: MatrixEvent) => {
      const content = ev.getContent<Record<string, Record<string, Record<string, unknown>>>>();
      const mine = Object.values(content).some((byType) =>
        Object.values(byType ?? {}).some((byUser) => !!myUserId && !!byUser?.[myUserId])
      );
      if (mine) setTimelineVersion((v) => v + 1);
    };
    room.on(RoomEvent.Receipt, onReceipt);
    return () => {
      room.off(RoomEvent.Receipt, onReceipt);
    };
  }, [room, isThreadRoot]);

  const pollData = useMemo(() => {
    if (!isPollEvent) return null;
    const data = extractPollData(event);
    return {
      question: data.questionText,
      answers: data.answers.map((a) => ({ id: a.id, text: a.label })),
      kind: (data.kind && M_POLL_KIND_DISCLOSED.matches(data.kind)
        ? 'disclosed'
        : 'undisclosed') as 'disclosed' | 'undisclosed',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, isPollEvent, replacedVersion]);

  const canEndPoll =
    isPollEvent &&
    event.getSender() === client.getUserId() &&
    !room?.polls.get(event.getId() ?? '')?.isEnded;

  const handleEndPoll = useCallback(
    async (ev: MatrixEvent) => {
      const roomId = ev.getRoomId();
      const eventId = ev.getId();
      if (!roomId || !eventId) return;
      const question = extractPollData(ev).questionText;
      const ok = await confirmDialog({
        title: `${t('timeline.poll.end')}?`,
        message: t('timeline.poll.endConfirmMessage', { question }),
        danger: true,
      });
      if (!ok) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).sendEvent(roomId, null, M_POLL_END.name, {
          'm.relates_to': { rel_type: 'm.reference', event_id: eventId },
          [M_POLL_END.name]: {},
          [M_POLL_END.altName]: {},
        });
      } catch (err) {
        toast.error(t('timeline.poll.endFailed', { error: getErrorMessage(err) }));
      }
    },
    [client, confirmDialog, toast, t]
  );

  // Decrypted media (encrypted attachments)
  const contentRecord = content as Record<string, unknown>;
  const mediaSpoiler = getMediaSpoiler(contentRecord);
  const isMediaType =
    contentRecord != null &&
    (contentRecord.msgtype === 'm.image' || contentRecord.msgtype === 'm.video');
  const isGallery = galleryEvents != null && galleryEvents.length >= 2;
  const hasMedia = isMediaType || isGallery;

  const mediaVisibility = useAtomValue(mediaVisibilityAtom);
  const hiddenMedia = useAtomValue(hiddenMediaAtom);
  const setHiddenMedia = useSetAtom(hiddenMediaAtom);
  const setForwardMessage = useSetAtom(forwardMessageAtom);
  const [mediaRevealed, setMediaRevealed] = useState(false);

  // Hiding from the toolbar covers every event in the group, but a hidden image can
  // then be revealed one at a time from the grid.
  const mediaEventIds = useMemo(
    () =>
      (isGallery ? (galleryEvents ?? []) : [event])
        .map((ev) => ev.getId() ?? '')
        .filter((id) => id !== ''),
    [isGallery, galleryEvents, event]
  );
  const isMediaHidden =
    mediaEventIds.length > 0 && mediaEventIds.every((id) => hiddenMedia[id] === true);
  const isCoveredByPreference =
    mediaVisibility === 'never' ||
    (mediaVisibility === 'private' && (!room || !isPrivateRoom(room, client)));
  const galleryHiddenEventIds = useMemo(
    () => new Set(mediaEventIds.filter((id) => hiddenMedia[id] === true)),
    [mediaEventIds, hiddenMedia]
  );
  const galleryForceCovered = isCoveredByPreference && !mediaRevealed;

  const mediaCover: MediaCover | null =
    hasMedia && !mediaRevealed && (mediaSpoiler.isSpoiler || isCoveredByPreference || isMediaHidden)
      ? {
          label: mediaSpoiler.isSpoiler ? t('timeline.spoilerMedia') : t('timeline.showMedia'),
          reason: mediaSpoiler.isSpoiler ? mediaSpoiler.reason : undefined,
        }
      : null;
  const mediaEnabled = !hasMedia || mediaCover == null;

  const {
    mediaSrc,
    thumbnailSrc,
    isDecrypting: isFileDecrypting,
    hasFailed: mediaFailed,
    setMediaSrc,
    requestFullRes,
  } = useDecryptedMedia(event, contentRecord, client, mediaEnabled);

  const handleRevealMedia = useCallback(() => {
    setMediaRevealed(true);
    setHiddenMedia((prev) => {
      if (!mediaEventIds.some((id) => prev[id] === true)) return prev;
      const next = { ...prev };
      for (const id of mediaEventIds) delete next[id];
      return next;
    });
  }, [mediaEventIds, setHiddenMedia]);

  const handleRevealMediaEvent = useCallback(
    (eventId: string) => {
      setHiddenMedia((prev) => {
        if (prev[eventId] !== true) return prev;
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    },
    [setHiddenMedia]
  );

  const handleHideMedia = useCallback(() => {
    setMediaRevealed(false);
    setHiddenMedia((prev) => {
      if (mediaEventIds.length === 0) return prev;
      const next = { ...prev };
      for (const id of mediaEventIds) next[id] = true;
      const keys = Object.keys(next);
      for (const key of keys.slice(0, Math.max(0, keys.length - MAX_HIDDEN_MEDIA_EVENTS))) {
        delete next[key];
      }
      return next;
    });
  }, [mediaEventIds, setHiddenMedia]);

  const handleMediaClick = useCallback(
    (src: string, type: 'image' | 'video' = 'image', opts?: { currentTime?: number }) => {
      if (type === 'video') {
        setLightboxItem({ src, type, initialTime: opts?.currentTime ?? 0 });
        return;
      }
      setLightboxItem({ src, type });
      requestFullRes().then((full) => {
        if (!full) return;
        setLightboxItem((prev) => (prev?.src === src ? { src: full, type } : prev));
      });
    },
    [requestFullRes]
  );

  const handleLightboxClose = useCallback(() => {
    setLightboxItem(null);
  }, []);

  // Reactions: reactionVersion is a reaction-count derived from buildItems, passed
  // as a prop so React.memo detects changes. It invalidates this useMemo when
  // reactions are added or removed, since room and event are stable SDK references.
  // For galleries, reactions from every member image are merged into one deduped row.
  const reactionMap = useMemo(
    () =>
      isGallery
        ? buildGalleryReactionMap(room, galleryEvents, myId)
        : buildReactionMap(room, event, myId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, event, galleryEvents, myId, reactionVersion]
  );
  const singleReactionHandler = useReactionHandler(event, client);
  const galleryReactionHandler = useGalleryReactionHandler(galleryEvents ?? [], client);
  const handleReactionClick = isGallery ? galleryReactionHandler : singleReactionHandler;

  const imagePacks = useImagePacksContext();

  const [failedReactions, setFailedReactions] = useState<Set<string>>(new Set());
  const markFailed = useCallback((key: string) => {
    setFailedReactions((prev) => new Set(prev).add(key));
  }, []);

  const renderReactionKey = useCallback(
    (key: string) => {
      if (failedReactions.has(key)) return <>{key}</>;

      let imgUrl: string | null = null;

      const shortcode = key.replace(/^:/, '').replace(/:$/, '');
      const pack = imagePacks.get(shortcode);

      if (pack) {
        imgUrl = pack.url;
      } else if (key.startsWith('mxc://')) {
        for (const img of imagePacks.values()) {
          if (img.url === key) {
            imgUrl = key;
            break;
          }
        }
        if (!imgUrl) imgUrl = key;
      }

      if (imgUrl) {
        return (
          <AuthMediaImg
            client={client}
            mxcUrl={imgUrl}
            alt={key}
            className={css.reactionImg}
            onError={() => markFailed(key)}
          />
        );
      }
      return <>{key}</>;
    },
    [client, imagePacks, failedReactions, markFailed]
  );

  const threadBadge = useMemo(() => {
    if (hideThreadBadge || isRedacted || isUndecryptable) return null;
    const eventId = event.getId();
    if (!eventId) return null;

    const threadRel = event.getServerAggregatedRelation<{
      count: number;
      latest_event?: { event_id?: string };
      current_user_participated?: boolean;
    }>('m.thread');

    const localThread = room?.getThread(eventId);

    let count: number;
    let lastEvent: MatrixEvent | undefined;

    const RENDERABLE_TYPES = new Set([
      'm.room.message',
      'm.sticker',
      'm.room.encrypted',
      'm.poll.start',
      'org.matrix.msc3381.poll.start',
    ]);
    const NON_RENDERABLE_RELATION_TYPES = new Set(['m.replace', 'm.reference', 'm.annotation']);

    const findLastRenderable = (events: MatrixEvent[]): MatrixEvent | undefined => {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (!RENDERABLE_TYPES.has(e.getType())) continue;
        const relType = e.getRelation()?.rel_type;
        if (relType && NON_RENDERABLE_RELATION_TYPES.has(relType)) continue;
        return e;
      }
      return undefined;
    };

    if (localThread && localThread.initialEventsFetched) {
      count = localThread.length;
      lastEvent = findLastRenderable(localThread.events);
    } else if (threadRel && threadRel.count > 0) {
      count = threadRel.count;
      const latestId = threadRel.latest_event?.event_id;
      lastEvent = latestId ? room?.findEventById(latestId) : undefined;
    } else if (localThread && localThread.length > 0) {
      count = localThread.length;
      lastEvent = findLastRenderable(localThread.events);
    } else {
      const childEvents = room?.relations?.getAllChildEventsForEvent(eventId);
      const threadReplies =
        childEvents?.filter((e) => e.getRelation()?.rel_type === 'm.thread') ?? [];
      if (threadReplies.length === 0) return null;
      count = threadReplies.length;
      lastEvent = findLastRenderable(threadReplies);
    }

    if (count === 0) return null;

    const hasNewReplies = isThreadReplyUnread(
      room,
      localThread,
      eventId,
      lastEvent,
      threadLastSeen
    );

    let previewSenderId = '';
    let previewSenderName = '';
    let previewSenderAvatar: string | null = null;
    let previewBody = '';
    if (lastEvent) {
      previewSenderId = lastEvent.getSender() ?? '';
      const member = previewSenderId ? room?.getMember(previewSenderId) : null;
      previewSenderName = member?.name || formatUserId(previewSenderId) || t('common.unknown');
      previewSenderAvatar = member?.getMxcAvatarUrl() ?? null;

      if (lastEvent.isRedacted()) {
        previewBody = t('timeline.messageDeleted');
      } else {
        const content = lastEvent.getClearContent() ?? lastEvent.getContent();
        const raw = typeof content?.body === 'string' ? content.body : '';
        const firstLine = stripReplyFallback(raw).split('\n')[0].trim();
        previewBody =
          firstLine ||
          (lastEvent.isDecryptionFailure()
            ? t('timeline.couldNotDecrypt')
            : t('common.newMessage'));
      }
    }

    return {
      count,
      hasNewReplies,
      lastEvent,
      previewSenderId,
      previewSenderName,
      previewSenderAvatar,
      previewBody,
    };
  }, [
    hideThreadBadge,
    isRedacted,
    isUndecryptable,
    event,
    room,
    timelineVersion,
    threadLastSeen,
    t,
  ]);

  const handleReactionDelegate = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-reaction-key]');
      if (!btn) return;
      const key = btn.dataset.reactionKey;
      if (!key) return;
      const reaction = reactionMap.get(key);
      if (reaction) handleReactionClick(reaction);
    },
    [reactionMap, handleReactionClick]
  );

  // Pinning
  const handlePin = useCallback(() => {
    if (!room) return;
    togglePin(client, room, event, isPinned).catch((err) => {
      toast.error(t('timeline.pinFailed', { error: getErrorMessage(err) }));
    });
  }, [client, room, event, isPinned, toast, t]);

  // View Source
  const handleViewSource = useCallback((ev: MatrixEvent) => {
    setViewSourceEvent(ev);
  }, []);

  const handleForward = useCallback(
    (ev: MatrixEvent) => {
      const raw = ev.getContent<Record<string, unknown>>();
      const base = (raw['m.new_content'] as Record<string, unknown> | undefined) ?? raw;
      const content = { ...base };
      delete content['m.relates_to'];
      delete content['m.replace'];
      delete content['m.new_content'];
      delete content['m.mentions'];
      setForwardMessage({ open: true, eventType: ev.getType(), content });
    },
    [setForwardMessage]
  );

  const handleViewSourceClose = useCallback(() => {
    setViewSourceEvent(null);
  }, []);

  // Context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    openMessageContextMenu(e, event, {
      canEdit: canEdit && canEditMessageType,
      canRedact,
      canPin,
      canEndPoll,
      canHideMedia: hasMedia && !isMediaHidden,
      isDecrypting,
      isUndecryptable,
      isRedacted,
      isPinned,
      devModeEnabled,
      t,
      openContextMenu,
      callbacks: {
        onReply,
        onThreadClick,
        onEdit,
        onDelete,
        onReport,
        onEndPoll: handleEndPoll,
        onReact: (ev, anchorEl) => onReact(ev, anchorEl),
        onPin: handlePin,
        onHideMedia: handleHideMedia,
        onViewSource: handleViewSource,
        onForward: isPollEvent ? undefined : handleForward,
      },
    });
  };

  const handleToolbarContextMenu = (e: React.MouseEvent) => {
    const el = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    if (!el) {
      handleContextMenu(e);
      return;
    }
    const rect = (el.parentElement ?? el).getBoundingClientRect();
    handleContextMenu(
      syntheticMouseEvent(0, 0, el, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        placement: 'bottom-end',
      })
    );
  };

  // Reply quote
  const reply = !isRedacted && !isUndecryptable ? getReplyContent(event, client) : null;

  const replyEventId =
    reply === null && !isRedacted && !isUndecryptable ? getReplyEventId(event) : null;
  const [fetchedReply, setFetchedReply] = useState<ReplyContent | null>(null);
  const fetchedReplyEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!replyEventId) {
      setFetchedReply(null);
      fetchedReplyEventIdRef.current = null;
      return;
    }
    if (fetchedReplyEventIdRef.current === replyEventId) return;
    fetchedReplyEventIdRef.current = replyEventId;
    const roomId = event.getRoomId() ?? '';
    const mapper = client.getEventMapper();
    client
      .fetchRoomEvent(roomId, replyEventId)
      .then(async (raw) => {
        const matrixEvent = mapper(raw);
        await client.decryptEventIfNeeded(matrixEvent);
        if (matrixEvent.isDecryptionFailure()) {
          setFetchedReply({
            eventId: replyEventId,
            body: '',
            senderId: matrixEvent.getSender() ?? '',
            isUndecryptable: true,
          });
          return;
        }
        const c = matrixEvent.getContent() as Record<string, unknown>;
        const mxcUrl = extractReplyMxcUrl(matrixEvent.getType(), c);
        const body = stripReplyFallback((c?.body as string | undefined) ?? '');
        const formattedBody =
          stripReplyFallbackHtml((c?.formatted_body as string | undefined) ?? '') || undefined;
        setFetchedReply({
          eventId: replyEventId,
          body,
          formattedBody,
          senderId: matrixEvent.getSender() ?? '',
          mxcUrl,
          event: matrixEvent,
          isUndecryptable: false,
        });
      })
      .catch(() => {
        setFetchedReply(null);
      });
  }, [replyEventId, client, event]);

  const displayReply = reply ?? fetchedReply;

  const handleQuickReact = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onReact(event, e.currentTarget);
    },
    [event, onReact]
  );

  const handleThreadClick = useCallback(() => {
    onThreadClick?.(event);
  }, [event, onThreadClick]);

  // Inline editing
  const [editState, setEditState] = useAtom(editMessageAtom);
  const isEditing = editState?.eventId === event.getId();

  const cancelEdit = useCallback(() => {
    setEditState(null);
    onHover(null);
  }, [setEditState, onHover]);

  const editPollModal = isEditing && isPollEvent && (
    <PollCreatorModal
      open={true}
      onClose={cancelEdit}
      client={client}
      roomId={editState?.roomId ?? ''}
      threadId={editState?.threadId ?? null}
      editEventId={editState?.eventId}
      initialPoll={pollData ?? undefined}
    />
  );

  const touchFirst = useMediaQuery(TOUCH_FIRST_QUERY);
  const canSwipeReply =
    touchFirst && !isRedacted && !isDecrypting && !isUndecryptable && !isFailed && !isSending;
  useSwipeToReply(msgRowRef, swipeContentRef, swipeIconRef, () => onReply(event), canSwipeReply);

  if (callSession) {
    return <CallSessionDisplay session={callSession} client={client} roomId={event.getRoomId()} />;
  }

  if (isSystemMessage) {
    return <SystemMessageDisplay event={event} senderName={senderName} client={client} />;
  }

  const messageContent =
    galleryEvents != null && galleryEvents.length >= 2 ? (
      <MessageGallery
        events={galleryEvents}
        client={client}
        senderName={senderName}
        senderAvatar={senderAvatar}
        forceCovered={galleryForceCovered}
        hiddenEventIds={galleryHiddenEventIds}
        coverLabel={t('timeline.showMedia')}
        onRevealTile={handleRevealMediaEvent}
      />
    ) : (
      <MessageContent
        event={event}
        client={client}
        mediaSrc={mediaSrc}
        thumbnailSrc={thumbnailSrc}
        isDecrypting={isFileDecrypting}
        mediaFailed={mediaFailed}
        isRedacted={isRedacted}
        isEventDecrypting={isDecrypting}
        isUndecryptable={isUndecryptable}
        searchQuery={searchQuery}
        myId={myId}
        senderName={senderName}
        onMediaLoad={setMediaSrc}
        onMediaClick={handleMediaClick}
        roomId={event.getRoomId()}
        optimisticBody={optimisticBody}
        imagePacks={imagePacks}
        requestFullRes={requestFullRes}
        mediaCover={mediaCover}
        onRevealMedia={handleRevealMedia}
        onMentionClick={(userId, rect) =>
          setProfile({
            userId,
            roomId: event.getRoomId(),
            anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          })
        }
      />
    );

  const isCompact = variant === 'compact';
  const compactMsgtype = contentRecord?.msgtype;
  const isCompactInline =
    !(galleryEvents != null && galleryEvents.length >= 2) &&
    (isRedacted ||
      isUndecryptable ||
      isDecrypting ||
      (type === 'm.room.message' &&
        (compactMsgtype === 'm.text' ||
          compactMsgtype === 'm.notice' ||
          compactMsgtype === 'm.emote')));

  const showEncryptedBanner = isDecrypting || isUndecryptable;
  const showFailedUI = isFailed && !isEdited && !isRedacted;
  const actionToolbar = showActions && !isRedacted && !showEncryptedBanner && !showFailedUI && (
    <MessageActionToolbar
      event={event}
      canEdit={canEdit && canEditMessageType}
      canPin={canPin}
      canEndPoll={canEndPoll}
      isPinned={isPinned}
      canHideMedia={hasMedia && !isMediaHidden}
      onHideMedia={handleHideMedia}
      onReply={onReply}
      onThreadClick={onThreadClick}
      onReact={onReact}
      onEdit={onEdit}
      onEndPoll={handleEndPoll}
      onPin={handlePin}
      onMore={handleToolbarContextMenu}
    />
  );

  const reactionsBar = !showEncryptedBanner &&
    !showFailedUI &&
    !isRedacted &&
    reactionMap.size > 0 && (
      <div
        className={css.reactionsBar}
        role="group"
        aria-label={t('timeline.reactions')}
        onClick={handleReactionDelegate}
      >
        {Array.from(reactionMap.values())
          .sort((a, b) => b.count - a.count)
          .map((r) => (
            <Tooltip
              key={r.key}
              content={(() => {
                const shortcode =
                  wrapShortcode(r.shortcode) ??
                  emojiToShortcode(r.key) ??
                  wrapShortcode(
                    r.key.startsWith('mxc://') ? findMxcShortcode(imagePacks, r.key) : null
                  ) ??
                  r.key;
                const targetEvents = isGallery ? (galleryEvents ?? []) : [event];
                const reactorNames = getReactionSenderNames(room, targetEvents, r.key);
                return t('timeline.reactedWith', {
                  emoji: shortcode,
                  names: formatReactors(reactorNames),
                  count: reactorNames.length,
                });
              })()}
            >
              <button
                type="button"
                data-reaction-key={r.key}
                className={r.isOwn ? css.reactionChipOwn : css.reactionChip}
              >
                {renderReactionKey(r.key)}
                {r.count > 1 ? ` ${r.count}` : ''}
              </button>
            </Tooltip>
          ))}
        <button
          type="button"
          className={css.reactionQuickAdd}
          onClick={handleQuickReact}
          aria-label={t('timeline.react')}
        >
          <span className={css.reactionQuickAddIconWrap}>
            <SmileyIcon size={14} />
            <span className={css.reactionQuickAddPlus}>+</span>
          </span>
        </button>
      </div>
    );

  const MAX_VISIBLE_WITH_OVERFLOW = 3;
  const MAX_VISIBLE_NO_OVERFLOW = 4;
  const hasMoreReaders = receiptUsers.length > MAX_VISIBLE_NO_OVERFLOW;
  const maxVisible = hasMoreReaders ? MAX_VISIBLE_WITH_OVERFLOW : MAX_VISIBLE_NO_OVERFLOW;
  const visibleReceipts = receiptUsers.slice(0, maxVisible);
  const overflowCount = receiptUsers.length - visibleReceipts.length;

  const readReceiptBar = (
    <div className={[css.readReceiptRow, hasCodeBlock ? css.readReceiptRowSpaced : null].join(' ')}>
      {[...visibleReceipts].reverse().map((u) => (
        <ReceiptAvatar key={u.userId} user={u} client={client} onClick={receipts.openFor} />
      ))}
      {overflowCount > 0 && (
        <button
          type="button"
          className={css.readReceiptOverflowBtn}
          aria-label={t('timeline.readReceiptsOverflow', { count: overflowCount })}
          aria-haspopup="listbox"
          onClick={(e) => receipts.openFor(e.currentTarget)}
        >
          +{overflowCount}
        </button>
      )}
    </div>
  );

  const failedUI = showFailedUI && (
    <div className={css.sendFailedRow}>
      <WarningIcon size={14} className={css.sendFailedIcon} />
      <span className={css.sendFailedText}>{t('timeline.sendFailedGeneric')}</span>
      <button type="button" className={css.sendRetryBtn} onClick={() => onResend?.(event)}>
        {t('common.retry')}
      </button>
      <button type="button" className={css.sendDiscardBtn} onClick={() => onCancel?.(event)}>
        {t('common.cancel')}
      </button>
    </div>
  );

  const contentClass =
    variant === 'classic'
      ? isGrouped
        ? isOwn
          ? css.msgContentClassicGroupedOwn
          : css.msgContentClassicGrouped
        : isOwn
          ? css.msgContentClassicOwn
          : css.msgContentClassic
      : isGrouped
        ? css.msgContentGrouped
        : css.msgContent;

  const rowClass = [
    isCompact ? css.msgRowCompact : isGrouped ? css.msgRowGrouped : css.msgRow,
    showActions ? css.msgRowActive : null,
    isSending ? css.msgSending : null,
    isFailed ? css.msgFailed : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={msgRowRef}
      className={rowClass}
      onMouseEnter={handleMouseEnter}
      onMouseDown={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onFocusCapture={handleRowFocus}
      onBlurCapture={handleRowBlur}
      onKeyDown={handleRowKeyDown}
      tabIndex={0}
      role="group"
      data-hovered={showActions ? 'true' : 'false'}
    >
      {canSwipeReply && (
        <span ref={swipeIconRef} className={css.swipeReplyIcon} aria-hidden>
          <ArrowBendUpLeftIcon size={18} weight="bold" />
        </span>
      )}
      <div
        ref={swipeContentRef}
        className={`${css.msgHoverRegion} ${css.msgJumpFlash}`}
        data-flashing={isFlashing ? 'true' : undefined}
      >
        {!isCompact && (
          <div className={css.msgAvatarCol}>
            {!isGrouped && (
              <button
                type="button"
                onClick={handleOpenProfile}
                aria-label={senderName}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  lineHeight: 0,
                }}
              >
                <Avatar
                  name={senderName}
                  mxcUrl={senderAvatar}
                  client={client}
                  size="sm"
                  placeholder="logo"
                />
              </button>
            )}
          </div>
        )}

        <div className={isCompact ? css.compactBody : css.msgBody}>
          {!isGrouped && !isCompact ? (
            <div className={css.msgMeta}>
              <button
                type="button"
                className={css.msgSender}
                style={senderNameStyle}
                onClick={handleNameClick}
              >
                {senderName}
              </button>
              <span className={css.msgTime}>{formatTime(ts, i18n.language)}</span>
              {isEdited && <span className={css.editedMarkerHeader}>{t('timeline.edited')}</span>}
            </div>
          ) : null}

          {!hideReplyQuote && displayReply && (
            <button
              type="button"
              className={css.replyQuote}
              onClick={() => onJumpToEvent?.(displayReply.eventId)}
            >
              <strong style={{ color: colorFor(displayReply.senderId) }}>
                {room?.getMember(displayReply.senderId)?.name ??
                  formatUserId(displayReply.senderId)}
                :{' '}
              </strong>
              {displayReply.isUndecryptable ? (
                <span>{t('timeline.couldNotDecrypt')}</span>
              ) : displayReply.event && isReplyMediaEvent(displayReply.event) ? (
                <ReplyMediaThumb
                  event={displayReply.event}
                  client={client}
                  body={displayReply.body.substring(0, 100)}
                />
              ) : displayReply.mxcUrl ? (
                <AuthMediaImg
                  client={client}
                  mxcUrl={displayReply.mxcUrl}
                  width={24}
                  height={24}
                  alt={displayReply.body || ''}
                  placeholder="none"
                  style={{
                    height: '1.4em',
                    width: 'auto',
                    verticalAlign: 'middle',
                    display: 'inline',
                  }}
                />
              ) : (
                <span
                  dangerouslySetInnerHTML={{
                    __html: displayReply.formattedBody
                      ? markdownToHtml(displayReply.formattedBody, myId, true, false, true)
                      : plainTextToHtml(displayReply.body.substring(0, 100), myId, true),
                  }}
                />
              )}
              {!displayReply.isUndecryptable &&
              !(displayReply.event && isReplyMediaEvent(displayReply.event)) &&
              !displayReply.formattedBody &&
              displayReply.body.length > 100
                ? '...'
                : ''}
            </button>
          )}

          {isCompact ? (
            <>
              <div className={css.compactLine}>
                <span className={css.compactHeader}>
                  <span
                    className={css.compactTime}
                    title={new Date(ts).toLocaleString(i18n.language)}
                  >
                    {formatTime(ts, i18n.language)}
                  </span>
                  <button
                    type="button"
                    className={css.msgSender}
                    style={senderNameStyle}
                    onClick={handleNameClick}
                  >
                    {senderName}
                  </button>
                </span>
                {!isEditing && isCompactInline && (
                  <div className={css.compactText}>
                    {messageContent}
                    {isEdited && (
                      <span className={css.editedMarkerGroupedClassic}>
                        {' '}
                        {t('timeline.edited')}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {isEditing && !isPollEvent && editState ? (
                <EditMessageComposer client={client} editState={editState} onClose={cancelEdit} />
              ) : !isEditing && !isCompactInline ? (
                <div className={css.compactBlock}>
                  {messageContent}
                  {isEdited && (
                    <span className={css.editedMarkerGroupedClassic}> {t('timeline.edited')}</span>
                  )}
                </div>
              ) : null}
            </>
          ) : isEditing && !isPollEvent ? (
            editState ? (
              <EditMessageComposer client={client} editState={editState} onClose={cancelEdit} />
            ) : null
          ) : !isEditing ? (
            <div className={contentClass}>
              {messageContent}
              {isGrouped && isEdited && (
                <span
                  className={
                    variant === 'classic' ? css.editedMarkerGroupedClassic : css.editedMarkerGrouped
                  }
                >
                  {t('timeline.edited')}
                </span>
              )}
            </div>
          ) : null}

          {failedUI}

          {reactionsBar}

          {!isEditing && threadBadge && (
            <Tooltip content={t('timeline.threadReplies', { count: threadBadge.count })}>
              <button type="button" className={css.threadBadge} onClick={handleThreadClick}>
                <span className={css.threadBadgeIconWrap}>
                  <ChatDotsIcon size={16} />
                  {threadBadge.hasNewReplies && <span className={css.threadBadgeDot} />}
                </span>
                <span className={css.threadBadgeCount}>{threadBadge.count}</span>
                {threadBadge.lastEvent && (
                  <>
                    <Avatar
                      name={threadBadge.previewSenderName}
                      mxcUrl={threadBadge.previewSenderAvatar}
                      client={client}
                      size="xs"
                      placeholder="logo"
                    />
                    <span
                      className={css.threadBadgeName}
                      style={{ color: colorFor(threadBadge.previewSenderId) }}
                    >
                      <span className={css.threadBadgeNameText}>
                        {threadBadge.previewSenderName}
                      </span>
                      :
                    </span>
                    <span className={css.threadBadgeBody}>{threadBadge.previewBody}</span>
                  </>
                )}
              </button>
            </Tooltip>
          )}
        </div>
        {!isEditing && actionToolbar}
      </div>

      {readReceiptBar}

      <ReadReceiptsPopover
        client={client}
        roomId={event.getRoomId()}
        users={receiptUsers}
        anchorRef={receipts.anchorRef}
        open={receipts.open}
        onClose={receipts.close}
      />

      {lightboxItem && (
        <MediaLightbox
          src={lightboxItem.src}
          type={lightboxItem.type}
          initialTime={lightboxItem.initialTime}
          name={senderName}
          filename={content?.body as string | undefined}
          client={client}
          avatarMxc={senderAvatar}
          onClose={handleLightboxClose}
        />
      )}
      <ViewSourceModal event={viewSourceEvent} onClose={handleViewSourceClose} />
      {editPollModal}
    </div>
  );
});
