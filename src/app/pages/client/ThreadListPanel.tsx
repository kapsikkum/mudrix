import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue } from 'jotai';
import { ThreadEvent, RoomEvent, Direction, ReceiptType } from 'matrix-js-sdk';
import { sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import type { MatrixClient, MatrixEvent, EventTimelineSet } from 'matrix-js-sdk';
import {
  ChatDotsIcon,
  XIcon,
  LockIcon,
  ChecksIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
} from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Tooltip } from '@/app/components/Tooltip';
import { formatUserId } from '@/util/matrix';
import { isThreadUnread } from '@/util/threads';
import {
  threadFilterAtom,
  threadLastSeenAtom,
  threadPanelWidthAtom,
  threadPanelExpandedAtom,
  THREAD_PANEL_WIDTH_MIN,
  THREAD_PANEL_WIDTH_MAX,
  THREAD_PANEL_WIDTH_DEFAULT,
} from '@/app/store/atoms';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { PanelResizer } from '@/app/components/PanelResizer/PanelResizer';
import * as css from './ThreadListPanel.css';
import * as panelCss from './SidePanel.css';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';

interface ThreadListPanelProps {
  client: MatrixClient;
  roomId: string;
  className?: string;
  onSelectThread: (rootEvent: MatrixEvent) => void;
  onClose: () => void;
}

function relativeTime(ts: number, locale: string): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(locale);
}

export function ThreadListPanel({
  client,
  roomId,
  className,
  onSelectThread,
  onClose,
}: ThreadListPanelProps) {
  const { t, i18n } = useTranslation();
  const colorFor = useUsernameColor();
  const [filter, setFilter] = useAtom(threadFilterAtom);
  const [threadLastSeen, setThreadLastSeen] = useAtom(threadLastSeenAtom);
  const [threadPanelWidth, setThreadPanelWidth] = useAtom(threadPanelWidthAtom);
  const [expanded, setExpanded] = useAtom(threadPanelExpandedAtom);
  const isDesktop = useMediaQuery('(min-width: 769px)');
  const [version, setVersion] = useState(0);

  const threadListSetRef = useRef<EventTimelineSet | null>(null);
  const paginatingRef = useRef(false);

  const room = useMemo(() => client.getRoom(roomId), [client, roomId]);

  // Recompute whenever a thread event fires (tracked via `version`).
  const allThreads = useMemo(() => {
    void version;
    return room?.getThreads() ?? [];
  }, [room, version]);

  type ThreadInfo = (typeof allThreads)[number];

  const threadCounts = useMemo(() => {
    let all = 0;
    let my = 0;
    for (const th of allThreads) {
      if (!isThreadUnread(th, threadLastSeen)) continue;
      all += 1;
      if (th.hasCurrentUserParticipated) my += 1;
    }
    return { all, my };
  }, [allThreads, threadLastSeen]);

  const hasAnyUnread = threadCounts.all > 0;

  useEffect(() => {
    if (!room) return;
    const bump = () => setVersion((v) => v + 1);
    room.on(ThreadEvent.New, bump);
    room.on(ThreadEvent.Update, bump);
    room.on(ThreadEvent.Delete, bump);
    room.on(RoomEvent.Timeline, bump);
    room.on(RoomEvent.Receipt, bump);
    return () => {
      room.off(ThreadEvent.New, bump);
      room.off(ThreadEvent.Update, bump);
      room.off(ThreadEvent.Delete, bump);
      room.off(RoomEvent.Timeline, bump);
      room.off(RoomEvent.Receipt, bump);
    };
  }, [room]);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    const load = async () => {
      threadListSetRef.current = null;
      paginatingRef.current = false;
      try {
        await room.createThreadsTimelineSets();
        threadListSetRef.current = room.threadsTimelineSets[0] ?? null;
        await room.fetchRoomThreads();
      } catch (err) {
        console.error('[ThreadListPanel] failed to fetch thread list', err);
      } finally {
        if (!cancelled) setVersion((v) => v + 1);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [room]);

  const loadMore = useCallback(async () => {
    const set = threadListSetRef.current;
    if (!set || paginatingRef.current) return;
    if (set.getLiveTimeline().getPaginationToken(Direction.Backward) === null) return;
    paginatingRef.current = true;
    try {
      await client.paginateEventTimeline(set.getLiveTimeline(), {
        backwards: true,
        limit: 20,
      });
    } catch (err) {
      console.error('[ThreadListPanel] failed to paginate thread list', err);
    } finally {
      paginatingRef.current = false;
      setVersion((v) => v + 1);
    }
  }, [client]);

  const threads = useMemo(() => {
    const list =
      filter === 'my' ? allThreads.filter((th) => th.hasCurrentUserParticipated) : allThreads;
    return [...list].sort((a, b) => {
      const aTime = a.lastReply()?.getTs() ?? a.rootEvent?.getTs() ?? 0;
      const bTime = b.lastReply()?.getTs() ?? b.rootEvent?.getTs() ?? 0;
      return bTime - aTime;
    });
  }, [allThreads, filter]);

  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const sendThreadReceipt = useCallback(
    (reply: MatrixEvent) => {
      const receiptType = sendReadReceipts ? ReceiptType.Read : ReceiptType.ReadPrivate;
      client.sendReadReceipt(reply, receiptType).catch(() => {});
    },
    [client, sendReadReceipts]
  );

  const markThreadRead = useCallback(
    (th: ThreadInfo) => {
      const lastReply = th.lastReply();
      const lastId = lastReply?.getId();
      if (!lastReply || !lastId) return;
      setThreadLastSeen({ ...threadLastSeen, [th.id]: lastId });
      sendThreadReceipt(lastReply);
    },
    [threadLastSeen, setThreadLastSeen, sendThreadReceipt]
  );

  const markAllRead = useCallback(() => {
    const newSeen: Record<string, string> = { ...threadLastSeen };
    for (const th of allThreads) {
      if (!isThreadUnread(th, threadLastSeen)) continue;
      const lastReply = th.lastReply();
      const lastId = lastReply?.getId();
      if (!lastReply || !lastId) continue;
      newSeen[th.id] = lastId;
      sendThreadReceipt(lastReply);
    }
    setThreadLastSeen(newSeen);
  }, [allThreads, threadLastSeen, setThreadLastSeen, sendThreadReceipt]);

  return (
    <aside
      data-swipe-back="panel"
      className={`${panelCss.sidePanel}${className ? ` ${className}` : ''}${expanded ? ` ${panelCss.sidePanelExpanded}` : ''}`}
      aria-label={t('timeline.threads')}
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
      <div className={panelCss.sidePanelHeader}>
        <h2 className={panelCss.sidePanelTitle}>{t('timeline.threads')}</h2>
        {hasAnyUnread && (
          <Tooltip content={t('common.markAllRead')}>
            <button
              type="button"
              className={css.headerAction}
              onClick={markAllRead}
              aria-label={t('common.markAllRead')}
            >
              <ChecksIcon size={16} />
            </button>
          </Tooltip>
        )}
        {isDesktop && (
          <Tooltip content={expanded ? t('common.collapse') : t('common.expand')}>
            <button
              type="button"
              className={panelCss.sidePanelClose}
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
            className={panelCss.sidePanelClose}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <XIcon size={16} />
          </button>
        </Tooltip>
      </div>

      <div className={css.threadTabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={filter === 'all' ? css.threadTabActive : css.threadTab}
          onClick={() => setFilter('all')}
        >
          {t('timeline.threadsAll')}
          {threadCounts.all > 0 && (
            <span className={filter === 'all' ? css.threadTabCountAccent : css.threadTabCount}>
              {threadCounts.all > 99 ? '99+' : threadCounts.all}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'my'}
          className={filter === 'my' ? css.threadTabActive : css.threadTab}
          onClick={() => setFilter('my')}
        >
          {t('timeline.threadsMy')}
          {threadCounts.my > 0 && (
            <span className={filter === 'my' ? css.threadTabCountAccent : css.threadTabCount}>
              {threadCounts.my > 99 ? '99+' : threadCounts.my}
            </span>
          )}
        </button>
      </div>

      <div
        className={css.threadListBody}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
            loadMore();
          }
        }}
      >
        {threads.length === 0 ? (
          <div className={css.threadListEmpty}>
            {filter === 'my' ? t('timeline.threadListEmptyMy') : t('timeline.threadListEmpty')}
          </div>
        ) : (
          threads.map((thread) => {
            const rootEvent = thread.rootEvent;
            if (!rootEvent) return null;

            const rootId = rootEvent.getId() ?? '';
            const senderId = rootEvent.getSender() ?? '';
            const member = room?.getMember(senderId);
            const senderName = member?.name ?? formatUserId(senderId);
            const senderAvatar = member?.getMxcAvatarUrl() ?? null;
            const body = rootEvent.isDecryptionFailure()
              ? t('timeline.couldNotDecrypt')
              : ((rootEvent.getContent()?.body as string) ?? '');
            const rootIsUndecryptable = rootEvent.isDecryptionFailure();
            const lastReply = thread.lastReply();
            const lastTs = lastReply?.getTs() ?? rootEvent.getTs();
            const unread = isThreadUnread(thread, threadLastSeen);

            return (
              <div
                key={rootId}
                className={css.threadListItem}
                role="button"
                tabIndex={0}
                onClick={() => onSelectThread(rootEvent)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectThread(rootEvent);
                  }
                }}
              >
                <div className={css.threadItemAvatar}>
                  <Avatar
                    name={senderName}
                    mxcUrl={senderAvatar}
                    client={client}
                    size="sm"
                    placeholder="logo"
                  />
                </div>
                <div className={css.threadItemContent}>
                  <div className={css.threadItemMeta}>
                    <span className={css.threadItemSender} style={{ color: colorFor(senderId) }}>
                      {senderName}
                    </span>
                    <span className={css.threadItemTime}>
                      {relativeTime(lastTs, i18n.language)}
                    </span>
                  </div>
                  <div className={css.threadItemBody}>
                    {rootIsUndecryptable ? (
                      <span className={css.threadItemBodyUndecryptable}>
                        <LockIcon size={12} /> {body}
                      </span>
                    ) : (
                      body
                    )}
                  </div>
                  <div className={css.threadItemFooter}>
                    <span className={css.threadItemReplyCount}>
                      <ChatDotsIcon size={12} />
                      {thread.length}
                    </span>
                    {unread && (
                      <Tooltip placement="left" content={t('common.markRead')}>
                        <button
                          type="button"
                          className={css.markReadButton}
                          aria-label={t('common.markRead')}
                          onClick={(e) => {
                            e.stopPropagation();
                            markThreadRead(thread);
                          }}
                        >
                          <ChecksIcon size={14} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
