import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  ThreadEvent,
  RelationType,
  ReceiptType,
  Direction,
  TimelineWindow,
  EventStatus,
} from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room, Thread, IRoomTimelineData } from 'matrix-js-sdk';
import {
  XIcon,
  ArrowLeftIcon,
  LockIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { Avatar } from '@/app/components/Avatar';
import { formatTime } from '@/util/format';
import { formatUserId } from '@/util/matrix';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import { Composer } from '@/app/features/timeline';
import { Message } from '@/app/features/timeline/message/Message';
import {
  threadLastSeenAtom,
  editMessageAtom,
  emojiPickerAtom,
  messageLayoutAtom,
  sendReadReceiptsAtom,
  reportMessageAtom,
  threadPanelWidthAtom,
  threadPanelExpandedAtom,
  THREAD_PANEL_WIDTH_MIN,
  THREAD_PANEL_WIDTH_MAX,
  THREAD_PANEL_WIDTH_DEFAULT,
} from '@/app/store/atoms';
import {
  toggleReaction,
  applyRedactionToRelations,
} from '@/app/features/timeline/message/reactions';
import { useRoomReceipts } from '@/app/hooks/useRoomReceipts';
import { useLiveRoom } from '@/app/hooks/useLiveRoom';
import { useWidgets } from '@/app/hooks/useWidgets';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { PanelResizer } from '@/app/components/PanelResizer/PanelResizer';
import { buildItems } from '@/app/hooks/useTimeline';
import type { TimelineItem } from '@/app/hooks/useTimeline';
import { useMessageHover } from '@/app/features/timeline/useMessageHover';
import { ImagePacksProvider } from '@/app/hooks/useImagePacks';
import { isPendingEvent } from './markAsRead';
import * as css from './ThreadPanel.css';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';

const INITIAL_SIZE = 50;
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

interface ThreadPanelProps {
  client: MatrixClient;
  roomId: string;
  rootEvent: MatrixEvent;
  className?: string;
  onClose: () => void;
  onBack?: () => void;
}

export function ThreadPanel({
  client,
  roomId,
  rootEvent,
  className,
  onClose,
  onBack,
}: ThreadPanelProps) {
  const { t, i18n } = useTranslation();
  const colorFor = useUsernameColor();
  const myId = client.getUserId() ?? '';
  const toast = useToast();
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const confirmDialog = useConfirm();
  const [, setEditMessage] = useAtom(editMessageAtom);
  const [, setEmojiPicker] = useAtom(emojiPickerAtom);

  const [replies, setReplies] = useState<MatrixEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredEventId, handleHover] = useMessageHover();
  const [replyTo, setReplyTo] = useState<MatrixEvent | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const rootId = rootEvent.getId() ?? '';
  const setThreadLastSeen = useSetAtom(threadLastSeenAtom);
  const setReport = useSetAtom(reportMessageAtom);
  const [threadPanelWidth, setThreadPanelWidth] = useAtom(threadPanelWidthAtom);
  const [expanded, setExpanded] = useAtom(threadPanelExpandedAtom);
  const isDesktop = useMediaQuery('(min-width: 769px)');

  const twRef = useRef<TimelineWindow | null>(null);
  const localEchoesRef = useRef<MatrixEvent[]>([]);
  const serverRepliesRef = useRef<MatrixEvent[]>([]);

  const room = useLiveRoom(client, roomId);
  const receiptMap = useRoomReceipts(client, room);
  const layout = useAtomValue(messageLayoutAtom);

  const items = useMemo<TimelineItem[]>(
    () => buildItems(replies, client, roomId, t, i18n.language),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replies, client, roomId, t, i18n.language, renderVersion]
  );

  const { stickerWidget } = useWidgets(client, roomId);

  useMatrixEvent(client, 'Event.decrypted', () => setRenderVersion((v) => v + 1));

  const markRead = useCallback(
    (event: MatrixEvent) => {
      const eventId = event.getId();
      if (!eventId || isPendingEvent(event)) return;
      setThreadLastSeen((prev) => ({ ...prev, [rootId]: eventId }));
      const receiptType = sendReadReceipts ? ReceiptType.Read : ReceiptType.ReadPrivate;
      client.sendReadReceipt(event, receiptType).catch(() => {});
      client.sendReadReceipt(event, receiptType, true).catch(() => {});
    },
    [client, rootId, sendReadReceipts, setThreadLastSeen]
  );

  const refresh = useCallback(() => {
    const room = client.getRoom(roomId);
    if (!room) return;

    const seen = new Set<string>();
    const merged: MatrixEvent[] = [];
    const push = (ev: MatrixEvent | undefined) => {
      if (!ev) return;
      const id = ev.getId();
      if (!id || seen.has(id)) return;
      seen.add(id);
      merged.push(ev);
    };

    twRef.current?.getEvents().forEach(push);
    room.getThread(rootId)?.getUnfilteredTimelineSet().getLiveTimeline().getEvents().forEach(push);
    localEchoesRef.current.forEach(push);
    serverRepliesRef.current.forEach(push);

    merged.sort((a, b) => a.getTs() - b.getTs());
    setReplies(merged.filter((e) => e.getId() !== rootId));
  }, [client, roomId, rootId]);

  const eventBelongsToThread = useCallback(
    (event: MatrixEvent, room: Room): boolean => {
      if (event.threadRootId === rootId) return true;
      const rel = event.getRelation();
      if (!rel) return false;
      if (rel.rel_type === RelationType.Thread) return rel.event_id === rootId;
      const parentId = rel.event_id;
      if (!parentId) return false;
      const parent = room.findEventById(parentId);
      return parent?.threadRootId === rootId;
    },
    [rootId]
  );

  const handleTimeline = useCallback(
    (
      event: MatrixEvent,
      room?: Room,
      _toStart?: boolean,
      _removed?: boolean,
      data?: IRoomTimelineData
    ) => {
      if (room?.roomId !== roomId) return;

      const threadTimelineSet = room.getThread(rootId)?.getUnfilteredTimelineSet();
      const isThreadReply = event.threadRootId === rootId && event.isRelation(RelationType.Thread);
      const isInThreadTimeline =
        !!threadTimelineSet && data?.timeline?.getTimelineSet() === threadTimelineSet;

      if (!isThreadReply && !isInThreadTimeline) return;

      if (isThreadReply) {
        const tw = twRef.current;
        if (tw) {
          try {
            const liveTimeline = threadTimelineSet?.getLiveTimeline();
            const endIndex = tw.getTimelineIndex(Direction.Forward);
            if (liveTimeline && endIndex?.timeline === liveTimeline) {
              tw.extend(Direction.Forward, 1);
            }
          } catch {
            // ignore
          }
        }
        refresh();
      } else {
        setRenderVersion((v) => v + 1);
      }
    },
    [roomId, rootId, refresh]
  );

  const handleLocalEcho = useCallback(
    (event: MatrixEvent) => {
      const room = client.getRoom(roomId);
      if (!room) return;

      if (event.isRedaction()) {
        applyRedactionToRelations(room, event);
        setRenderVersion((v) => v + 1);
        return;
      }

      if (!eventBelongsToThread(event, room)) return;

      if (event.isRelation(RelationType.Thread)) {
        const list = localEchoesRef.current;
        const idx = list.findIndex((e) => e === event || e.getId() === event.getId());
        if (idx === -1) list.push(event);
        else list[idx] = event;
        refresh();
      } else {
        setRenderVersion((v) => v + 1);
      }
    },
    [client, roomId, eventBelongsToThread, refresh]
  );

  const handleRedaction = useCallback(
    (event: MatrixEvent) => {
      const room = client.getRoom(roomId);
      if (!room) return;
      applyRedactionToRelations(room, event);
      setRenderVersion((v) => v + 1);
    },
    [client, roomId]
  );

  const handleTimelineReset = useCallback(() => {
    setReloadEpoch((e) => e + 1);
  }, []);

  const handleThreadNew = useCallback(
    (thread: Thread) => {
      if (thread.id !== rootId) return;
      if (twRef.current) {
        refresh();
        return;
      }
      const tw = new TimelineWindow(client, thread.getUnfilteredTimelineSet(), {
        windowLimit: INITIAL_SIZE * MAX_PAGES,
      });
      twRef.current = tw;
      tw.load(undefined, INITIAL_SIZE).then(async () => {
        let pages = 0;
        while (tw.canPaginate(Direction.Backward) && pages < MAX_PAGES) {
          const more = await tw.paginate(Direction.Backward, PAGE_SIZE);
          if (!more) break;
          pages++;
        }
        refresh();
      });
    },
    [client, rootId, refresh]
  );

  const handleThreadUpdate = useCallback(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (items.length === 0) return;
    const lastItem = items[items.length - 1];
    markRead(lastItem.event);
  }, [items, markRead]);

  useEffect(() => {
    if (!room) return;
    twRef.current = null;
    localEchoesRef.current = [];
    serverRepliesRef.current = [];
    setReplies([]);
    setLoading(true);

    let cancelled = false;

    const load = async () => {
      try {
        const thread = room.getThread(rootId);

        if (thread) {
          const tw = new TimelineWindow(client, thread.getUnfilteredTimelineSet(), {
            windowLimit: INITIAL_SIZE * MAX_PAGES,
          });
          twRef.current = tw;

          await tw.load(undefined, INITIAL_SIZE);
          if (cancelled) return;

          let pages = 0;
          while (tw.canPaginate(Direction.Backward) && pages < MAX_PAGES) {
            const more = await tw.paginate(Direction.Backward, PAGE_SIZE);
            if (cancelled) return;
            if (!more) break;
            pages++;
          }
        }

        const allEvents: MatrixEvent[] = [];
        let nextBatch: string | null | undefined;
        do {
          const result = await client.relations(roomId, rootId, 'm.thread', null, {
            dir: Direction.Backward,
            ...(nextBatch ? { from: nextBatch } : {}),
          });
          allEvents.push(...(result.events ?? []));
          nextBatch = result.nextBatch;
        } while (nextBatch);

        await Promise.all(allEvents.map((e) => client.decryptEventIfNeeded(e).catch(() => {})));

        if (cancelled) return;

        serverRepliesRef.current = allEvents.reverse().filter((e) => e.getId() !== rootId);
        refresh();
        // markRead fires via the items useEffect once buildItems has filtered to renderable events.
      } catch (err) {
        if (!cancelled) console.error('[ThreadPanel] failed to load thread', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [client, room, roomId, rootId, refresh, reloadEpoch]);

  useMatrixEvent(client, 'Room.timeline', handleTimeline);
  useMatrixEvent(client, 'Room.localEchoUpdated', handleLocalEcho);
  useMatrixEvent(client, 'Room.redaction', handleRedaction);
  useMatrixEvent(client, 'Room.timelineReset', handleTimelineReset);
  useMatrixEvent(client, 'sync', () => setRenderVersion((v) => v + 1));

  useEffect(() => {
    if (!room) return;
    room.on(ThreadEvent.New, handleThreadNew);
    room.on(ThreadEvent.Update, handleThreadUpdate);
    return () => {
      room.off(ThreadEvent.New, handleThreadNew);
      room.off(ThreadEvent.Update, handleThreadUpdate);
    };
  }, [room, handleThreadNew, handleThreadUpdate]);

  const rootSenderId = rootEvent.getSender() ?? '';
  const rootMember = room?.getMember(rootSenderId);
  const rootSenderName = rootMember?.name ?? formatUserId(rootSenderId);
  const rootSenderAvatar = rootMember?.getMxcAvatarUrl() ?? null;
  const rootBody = rootEvent.isDecryptionFailure()
    ? t('timeline.couldNotDecrypt')
    : ((rootEvent.getContent()?.body as string) ?? '');
  const rootIsUndecryptable = rootEvent.isDecryptionFailure();

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
        threadId: rootId || null,
      });
    },
    [roomId, rootId, setEditMessage, toast, t]
  );

  const handleDelete = useCallback(
    (event: MatrixEvent) => {
      const eventId = event.getId();
      if (!eventId) return;
      confirmDialog({
        title: t('timeline.deleteMessage'),
        message: t('timeline.deleteMessageConfirm'),
        danger: true,
      }).then(async (ok) => {
        if (!ok) return;
        try {
          await client.redactEvent(roomId, eventId);
        } catch (err) {
          toast.error(t('timeline.deleteFailed', { error: getErrorMessage(err) }));
        }
      });
    },
    [client, roomId, confirmDialog, toast, t]
  );

  const handleReport = useCallback(
    (event: MatrixEvent) => {
      const eventId = event.getId();
      const eventRoomId = event.getRoomId();
      if (!eventId || !eventRoomId) return;
      new Promise<string | null>((resolve) => {
        setReport({
          open: true,
          roomId: eventRoomId,
          eventId,
          senderId: event.getSender() ?? '',
          resolve,
        });
      }).then((reason) => {
        if (reason === null) return;
        client
          .reportEvent(eventRoomId, eventId, -100, reason)
          .catch((err) => toast.error(t('timeline.reportFailed', { error: getErrorMessage(err) })));
      });
    },
    [client, setReport, toast, t]
  );

  const handleResend = useCallback(
    (event: MatrixEvent) => {
      if (!room) return;
      client.resendEvent(event, room).catch((err) => {
        console.error('[ThreadPanel] resendEvent failed', err);
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      });
    },
    [client, room, toast, t]
  );

  const handleCancel = useCallback(
    (event: MatrixEvent) => {
      try {
        client.cancelPendingEvent(event);
      } catch (err) {
        console.error('[ThreadPanel] cancelPendingEvent failed', err);
      }
    },
    [client]
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
            await toggleReaction(client, roomId, event, myId, reactionKey, null);
          } catch (err) {
            toast.error(t('timeline.reactFailedShort', { error: getErrorMessage(err) }));
          }
        },
      });
    },
    [client, roomId, myId, setEmojiPicker, toast, t]
  );

  const replyListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = replyListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [replies.length]);

  return (
    <aside
      data-swipe-back="panel"
      className={`${css.threadPanel}${className ? ` ${className}` : ''}${expanded ? ` ${css.threadPanelExpanded}` : ''}`}
      aria-label={t('timeline.threadPanel')}
      style={isDesktop && !expanded ? { width: `${threadPanelWidth}px` } : undefined}
    >
      {isDesktop && !expanded && (
        <PanelResizer
          width={threadPanelWidth}
          onWidthChange={setThreadPanelWidth}
          defaultWidth={THREAD_PANEL_WIDTH_DEFAULT}
          min={THREAD_PANEL_WIDTH_MIN}
          max={THREAD_PANEL_WIDTH_MAX}
        />
      )}
      <div className={css.threadPanelHeader}>
        {onBack ? (
          <button
            type="button"
            className={css.threadPanelBack}
            onClick={onBack}
            aria-label={t('common.back')}
          >
            <ArrowLeftIcon size={16} />
          </button>
        ) : null}
        <h2 className={css.threadPanelLabel}>{t('timeline.threadPanel')}</h2>
        <span className={css.threadPanelDivider} />
        <span className={css.threadPanelTitle}>
          {t('timeline.threadPanelCount', { count: items.length })}
        </span>
        {isDesktop && (
          <Tooltip content={expanded ? t('common.collapse') : t('common.expand')}>
            <button
              type="button"
              className={css.threadPanelClose}
              onClick={() => setExpanded((prev) => !prev)}
              aria-label={expanded ? t('common.collapse') : t('common.expand')}
            >
              {expanded ? <ArrowsInSimpleIcon size={16} /> : <ArrowsOutSimpleIcon size={16} />}
            </button>
          </Tooltip>
        )}
        <Tooltip content={t('common.close')}>
          <button
            type="button"
            className={css.threadPanelClose}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <XIcon size={16} />
          </button>
        </Tooltip>
      </div>

      <div className={css.threadRootWrap}>
        <div className={css.threadRootMeta}>
          <Avatar
            name={rootSenderName}
            mxcUrl={rootSenderAvatar}
            client={client}
            size="sm"
            placeholder="logo"
          />
          <span className={css.threadRootSender} style={{ color: colorFor(rootSenderId) }}>
            {rootSenderName}
          </span>
          <span className={css.threadRootTime}>{formatTime(rootEvent.getTs(), i18n.language)}</span>
        </div>
        <div className={css.threadRootContent}>
          {rootIsUndecryptable ? (
            <span className={css.threadRootUndecryptable}>
              <LockIcon size={14} /> {rootBody}
            </span>
          ) : (
            rootBody
          )}
        </div>
      </div>

      {loading ? (
        <div className={css.threadLoading}>{t('common.loading')}</div>
      ) : (
        <ImagePacksProvider client={client} roomId={roomId}>
          <div ref={replyListRef} className={css.threadReplyList}>
            {items.length === 0 && (
              <div className={css.threadEmpty}>{t('timeline.threadEmpty')}</div>
            )}
            {items.map((item) => {
              const eventId = item.event.getId() ?? '';
              return (
                <div key={eventId}>
                  {item.showDateSep && <div className={css.dateSeparator}>{item.dateSepLabel}</div>}
                  <Message
                    event={item.event}
                    isOwn={item.isOwn}
                    senderId={item.senderId}
                    senderName={item.senderName}
                    senderAvatar={item.senderAvatar}
                    isGrouped={item.isGrouped}
                    variant={layout}
                    isSystemMessage={item.isSystemMessage}
                    isEdited={item.isEdited}
                    isRedacted={item.isRedacted}
                    isPinned={item.isPinned}
                    canEdit={item.canEdit}
                    canRedact={item.canRedact}
                    canPin={item.canPin}
                    isDecrypting={item.isDecrypting}
                    isUndecryptable={item.isUndecryptable}
                    isSending={item.isSending}
                    isFailed={item.isFailed}
                    sendError={item.sendError}
                    client={client}
                    receiptUsers={receiptMap.get(eventId) ?? []}
                    reactionVersion={item.reactionVersion}
                    onReply={setReplyTo}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onReport={handleReport}
                    onReact={handleReact}
                    onResend={handleResend}
                    onCancel={handleCancel}
                    hideThreadBadge
                    isHovered={hoveredEventId === eventId}
                    onHover={handleHover}
                  />
                </div>
              );
            })}
          </div>
        </ImagePacksProvider>
      )}

      <Composer
        client={client}
        roomId={roomId}
        threadId={rootId}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        stickerWidget={stickerWidget}
        className={css.threadComposerBg}
        onSent={() => {}}
      />
    </aside>
  );
}
