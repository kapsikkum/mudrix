import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import type { ThreadInfo, MudrixClient } from '@mudrix/core';
import {
  ChatDotsIcon,
  XIcon,
  LockIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
} from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Tooltip } from '@/app/components/Tooltip';
import { formatUserId } from '@/util/matrix';
import { useMembers, useRoom } from '@/app/data';
import {
  threadFilterAtom,
  threadPanelWidthAtom,
  threadPanelExpandedAtom,
  THREAD_PANEL_WIDTH_MIN,
  THREAD_PANEL_WIDTH_MAX,
  THREAD_PANEL_WIDTH_DEFAULT,
} from '@/app/store/atoms';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { useSwipeDownDismiss } from '@/app/hooks/useSwipeDownDismiss';
import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { PanelResizer } from '@/app/components/PanelResizer/PanelResizer';
import * as css from './ThreadListPanel.css';
import * as panelCss from './SidePanel.css';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';
import { useRoleNameColor } from '@/app/features/space/spaceRoles';

interface ThreadListPanelProps {
  client: MudrixClient;
  roomId: string;
  className?: string;
  onSelectThread: (rootEventId: string) => void;
  onClose: () => void;
}

function latestTs(th: ThreadInfo): number {
  return th.latestTimestamp ?? th.timestamp;
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
  const roleColorFor = useRoleNameColor(roomId);
  const [filter, setFilter] = useAtom(threadFilterAtom);
  const [threadPanelWidth, setThreadPanelWidth] = useAtom(threadPanelWidthAtom);
  const [expanded, setExpanded] = useAtom(threadPanelExpandedAtom);
  // Phones and touch tablets: a bottom sheet that a drag down closes.
  const overlay = useMediaQuery(PANEL_OVERLAY_QUERY);
  const isDesktop = useMediaQuery('(min-width: 769px)') && !overlay;
  const sheetRef = useRef<HTMLElement>(null);
  useSwipeDownDismiss({ enabled: overlay, sheetRef, onClose });
  const [allThreads, setAllThreads] = useState<ThreadInfo[]>([]);
  const nextRef = useRef<string | null>(null);
  const paginatingRef = useRef(false);
  const { data: members } = useMembers(roomId);
  const lastActivity = useRoom(roomId)?.lastActivity;

  const memberById = useMemo(() => new Map((members ?? []).map((m) => [m.userId, m])), [members]);

  useEffect(() => {
    setAllThreads([]);
    nextRef.current = null;
    paginatingRef.current = false;
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const page = await client.threads(roomId, false, null);
        if (cancelled) return;
        setAllThreads((prev) => {
          if (prev.length === 0) {
            nextRef.current = page.next;
            return page.threads;
          }
          const fresh = new Set(page.threads.map((th) => th.rootEventId));
          return [...page.threads, ...prev.filter((th) => !fresh.has(th.rootEventId))];
        });
      } catch (err) {
        console.error('[ThreadListPanel] failed to fetch thread list', err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [client, roomId, lastActivity]);

  const loadMore = useCallback(async () => {
    const from = nextRef.current;
    if (!from || paginatingRef.current) return;
    paginatingRef.current = true;
    try {
      const page = await client.threads(roomId, false, from);
      nextRef.current = page.next;
      setAllThreads((prev) => {
        const known = new Set(prev.map((th) => th.rootEventId));
        return [...prev, ...page.threads.filter((th) => !known.has(th.rootEventId))];
      });
    } catch (err) {
      console.error('[ThreadListPanel] failed to paginate thread list', err);
    } finally {
      paginatingRef.current = false;
    }
  }, [client, roomId]);

  const threads = useMemo(() => {
    const list = filter === 'my' ? allThreads.filter((th) => th.participated) : allThreads;
    return [...list].sort((a, b) => latestTs(b) - latestTs(a));
  }, [allThreads, filter]);

  return (
    <aside
      ref={sheetRef}
      data-swipe-back="panel"
      data-swipe-drawer={overlay ? undefined : 'right'}
      data-no-swipe={overlay ? true : undefined}
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
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'my'}
          className={filter === 'my' ? css.threadTabActive : css.threadTab}
          onClick={() => setFilter('my')}
        >
          {t('timeline.threadsMy')}
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
            const rootId = thread.rootEventId;
            const senderId = thread.sender;
            const member = memberById.get(senderId);
            const senderName = member?.displayName ?? formatUserId(senderId);
            const senderAvatar = member?.avatarUrl ?? null;
            const body = thread.body;
            const rootIsUndecryptable = false;
            const lastTs = latestTs(thread);

            return (
              <div
                key={rootId}
                className={css.threadListItem}
                role="button"
                tabIndex={0}
                onClick={() => onSelectThread(rootId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectThread(rootId);
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
                    <span
                      className={css.threadItemSender}
                      style={{
                        color:
                          roleColorFor(senderId, member?.powerLevel ?? 0) ?? colorFor(senderId),
                      }}
                    >
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
                      {thread.replies}
                    </span>
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
