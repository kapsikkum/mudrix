import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  TrayIcon,
  HashStraightIcon,
  StackIcon,
  ChecksIcon,
  ProhibitIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Avatar } from '@/app/components/Avatar';
import { Popover } from '@/app/components/Popover/Popover';
import {
  inboxOpenAtom,
  mobileDrawerOpenAtom,
  pendingEventJumpAtom,
  threadsPanelViewAtom,
} from '@/app/store/atoms';
import { sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import { formatRelativeTime } from '@/util/format';
import { markRoomsAsRead } from '@/app/pages/client/spaceContextMenu';
import { savedMessagesAtom, toggleSavedMessage } from '@/util/savedMessages';
import { useInvites, type Invite } from './useInvites';
import { useMentions, useHasUnreadMentions } from './useMentions';
import { SavedRow, ThreadRow, type RowKind } from './InboxRows';
import { useThreadsInbox, type InboxThread } from './useThreadsInbox';
import * as css from './Inbox.css';
import { vars } from '@/theme/vars.css';

type Tab = 'invites' | 'mentions' | 'threads' | 'saved';

const ROUTE_PREFIX: Record<Invite['kind'], string> = {
  room: '/r/',
  dm: '/dm/',
  space: '/space/',
};

function InboxContent({ mobile = false }: { mobile?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const client = getMatrixClientOrNull();
  const setOpen = useSetAtom(inboxOpenAtom);
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);
  const [tab, setTab] = useState<Tab>('invites');
  const [busyId, setBusyId] = useState<string | null>(null);
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);

  const invites = useInvites();
  const { mentions, mentionRoomIds, refresh: refreshMentions } = useMentions(true);
  const hasUnreadMentions = useHasUnreadMentions();
  const saved = useAtomValue(savedMessagesAtom);
  const setPendingJump = useSetAtom(pendingEventJumpAtom);
  const setThreadsPanelView = useSetAtom(threadsPanelViewAtom);
  const { threads: inboxThreads, unreadCount: unreadThreads } = useThreadsInbox(tab === 'threads');

  const activeCount =
    tab === 'invites'
      ? invites.length
      : tab === 'mentions'
        ? mentions.length
        : tab === 'threads'
          ? inboxThreads.length
          : saved.length;

  const openRoom = (kind: Invite['kind'], roomId: string) => {
    setOpen(false);
    if (mobile) setDrawerOpen(false);
    navigate(ROUTE_PREFIX[kind] + encodeURIComponent(roomId));
  };

  const handleMarkRead = (roomId: string) => {
    if (!client) return;
    void markRoomsAsRead(client, sendReadReceipts, [roomId]).then(refreshMentions);
  };

  const handleMarkAllRead = () => {
    if (!client) return;
    void markRoomsAsRead(client, sendReadReceipts, mentionRoomIds).then(refreshMentions);
  };

  const closeForRoom = () => {
    setOpen(false);
    if (mobile) setDrawerOpen(false);
  };

  const handleOpenSaved = (entry: { roomId: string; eventId: string }, kind: RowKind) => {
    closeForRoom();
    setPendingJump({ roomId: entry.roomId, eventId: entry.eventId });
    navigate(ROUTE_PREFIX[kind] + encodeURIComponent(entry.roomId));
  };

  const handleOpenThread = (item: InboxThread, kind: RowKind) => {
    closeForRoom();
    navigate(ROUTE_PREFIX[kind] + encodeURIComponent(item.room.id));
    // After the route change, so opening the room does not close the panel again.
    setTimeout(
      () => setThreadsPanelView({ type: 'thread', rootEventId: item.info.rootEventId }),
      50
    );
  };

  const handleRemoveSaved = (entry: { roomId: string; eventId: string }) => {
    if (!client) return;
    toggleSavedMessage(client, entry.roomId, entry.eventId).catch((err) =>
      toast.error(t('timeline.saveFailed', { error: getErrorMessage(err) }))
    );
  };

  const handleAccept = async (invite: Invite) => {
    if (!client || busyId) return;
    setBusyId(invite.roomId);
    try {
      await client.acceptInvite(invite.roomId);
      openRoom(invite.kind, invite.roomId);
    } catch (err) {
      toast.error(t('common.joinFailed', { error: getErrorMessage(err) }));
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (invite: Invite) => {
    if (!client) return;
    setBusyId(invite.roomId);
    try {
      await client.declineInvite(invite.roomId);
    } catch (err) {
      toast.error(t('invite.declineFailed', { error: getErrorMessage(err) }));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeclineAndBlock = async (invite: Invite) => {
    if (!client || !invite.inviterUserId) return;
    const inviterName = invite.inviterDisplayName ?? invite.inviterUserId;
    const ok = await confirmDialog({
      title: t('invite.declineAndBlockTitle', { name: inviterName }),
      message: t('invite.declineAndBlockBody', { name: inviterName, id: invite.inviterUserId }),
      confirmLabel: t('invite.declineAndBlock'),
      danger: true,
    });
    if (!ok) return;
    setBusyId(invite.roomId);
    try {
      await client.declineInvite(invite.roomId);
      await client.ignoreUser(invite.inviterUserId);
    } catch (err) {
      toast.error(t('invite.declineAndBlockFailed', { error: getErrorMessage(err) }));
    } finally {
      setBusyId(null);
    }
  };

  const markAllButton = tab === 'mentions' && hasUnreadMentions && (
    <Tooltip content={t('common.markAllRead')}>
      <button
        type="button"
        className={css.headerAction}
        onClick={handleMarkAllRead}
        aria-label={t('common.markAllRead')}
      >
        <ChecksIcon size={16} />
      </button>
    </Tooltip>
  );

  return (
    <>
      {!mobile && (
        <div className={css.header}>
          <span id="inbox-title" className={css.title}>
            <TrayIcon size={18} weight="fill" className={css.titleIcon} />
            {t('inbox.title')}
          </span>
          {markAllButton}
        </div>
      )}

      <div className={css.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'invites'}
          className={tab === 'invites' ? css.tabActive : css.tab}
          onClick={() => setTab('invites')}
        >
          {t('inbox.tabInvites')}
          {invites.length > 0 && (
            <span className={tab === 'invites' ? css.tabCountAccent : css.tabCount}>
              {invites.length > 99 ? '99+' : invites.length}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mentions'}
          className={tab === 'mentions' ? css.tabActive : css.tab}
          onClick={() => setTab('mentions')}
        >
          {t('inbox.tabMentions')}
          {mentions.length > 0 && (
            <span className={tab === 'mentions' ? css.tabCountAccent : css.tabCount}>
              {mentions.length > 99 ? '99+' : mentions.length}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'threads'}
          className={tab === 'threads' ? css.tabActive : css.tab}
          onClick={() => setTab('threads')}
        >
          {t('inbox.tabThreads')}
          {unreadThreads > 0 && (
            <span className={tab === 'threads' ? css.tabCountAccent : css.tabCount}>
              {unreadThreads > 99 ? '99+' : unreadThreads}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'saved'}
          className={tab === 'saved' ? css.tabActive : css.tab}
          onClick={() => setTab('saved')}
        >
          {t('inbox.tabSaved')}
          {saved.length > 0 && (
            <span className={tab === 'saved' ? css.tabCountAccent : css.tabCount}>
              {saved.length > 99 ? '99+' : saved.length}
            </span>
          )}
        </button>
        {mobile && markAllButton}
      </div>

      <div className={css.content}>
        {activeCount === 0 ? (
          <div className={css.empty}>
            {tab === 'invites'
              ? t('inbox.emptyInvites')
              : tab === 'mentions'
                ? t('inbox.emptyMentions')
                : tab === 'threads'
                  ? t('inbox.emptyThreads')
                  : t('inbox.emptySaved')}
          </div>
        ) : tab === 'invites' ? (
          invites.map((invite) => {
            const inviterName = invite.inviterDisplayName ?? t('invite.unknownInviter');
            const KindIcon = invite.kind === 'space' ? StackIcon : HashStraightIcon;
            const when = invite.ts != null ? formatRelativeTime(invite.ts, t, i18n.language) : '';
            return (
              <div key={invite.roomId} className={css.inviteItem}>
                <Avatar
                  name={invite.name}
                  mxcUrl={invite.avatarMxc}
                  client={client ?? undefined}
                  size="sm"
                />
                <div className={css.info}>
                  <span className={css.name}>
                    <span className={css.kindPrefix}>
                      {invite.kind === 'dm' ? '@' : <KindIcon size={13} weight="regular" />}
                    </span>
                    {invite.name}
                  </span>
                  <span className={css.subRow}>
                    <span className={css.sub}>{t('inbox.invitedBy', { name: inviterName })}</span>
                    {when && <span className={css.time}>{when}</span>}
                  </span>
                </div>
                <div className={css.actions}>
                  <button
                    type="button"
                    className={css.acceptButton}
                    disabled={busyId === invite.roomId}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleAccept(invite);
                    }}
                  >
                    {t('common.accept')}
                  </button>
                  <button
                    type="button"
                    className={css.declineButton}
                    disabled={busyId === invite.roomId}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDecline(invite);
                    }}
                  >
                    {t('common.decline')}
                  </button>
                  {invite.inviterUserId && (
                    <Tooltip content={t('invite.declineAndBlock')}>
                      <button
                        type="button"
                        className={css.blockButton}
                        aria-label={t('invite.declineAndBlock')}
                        disabled={busyId === invite.roomId}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeclineAndBlock(invite);
                        }}
                      >
                        <ProhibitIcon size={14} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })
        ) : tab === 'threads' ? (
          inboxThreads.map((item) =>
            client ? (
              <ThreadRow
                key={`${item.room.id}:${item.info.rootEventId}`}
                client={client}
                item={item}
                onOpen={handleOpenThread}
              />
            ) : null
          )
        ) : tab === 'saved' ? (
          saved.map((entry) =>
            client ? (
              <SavedRow
                key={entry.eventId}
                client={client}
                saved={entry}
                onOpen={handleOpenSaved}
                onRemove={handleRemoveSaved}
              />
            ) : null
          )
        ) : (
          mentions.map((mention) => (
            <div
              key={mention.eventId || `${mention.roomId}:${mention.ts}`}
              className={css.item}
              role="button"
              tabIndex={0}
              onClick={() => openRoom(mention.kind, mention.roomId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openRoom(mention.kind, mention.roomId);
                }
              }}
            >
              <Avatar
                name={mention.roomName}
                mxcUrl={mention.roomAvatarMxc}
                client={client ?? undefined}
                size="sm"
              />
              <div className={css.info}>
                <span className={css.name}>{mention.roomName}</span>
                <span className={css.sub}>
                  {t('inbox.mentionedYou', { name: mention.senderName })}
                </span>
              </div>
              <span className={css.entryMeta}>
                <span className={css.time}>{formatRelativeTime(mention.ts, t, i18n.language)}</span>
                <Tooltip placement="left" content={t('common.markRead')}>
                  <button
                    type="button"
                    className={css.markReadButton}
                    aria-label={t('common.markRead')}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkRead(mention.roomId);
                    }}
                  >
                    <ChecksIcon size={14} />
                  </button>
                </Tooltip>
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function useInboxBadge() {
  const invites = useInvites();
  const hasUnreadMentions = useHasUnreadMentions();
  return { show: invites.length > 0 || hasUnreadMentions, mention: hasUnreadMentions };
}

export function Inbox() {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useAtom(inboxOpenAtom);
  const badge = useInboxBadge();

  return (
    <>
      <div ref={anchorRef} className={css.anchor}>
        <Tooltip placement="bottom" content={t('inbox.title')}>
          <button
            type="button"
            className={open ? css.inboxButtonActive : css.inboxButton}
            style={{ color: !open && badge.show ? vars.color.textPrimary : undefined }}
            aria-label={t('inbox.title')}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <TrayIcon size={18} weight={open ? 'fill' : 'regular'} />
            {badge.show && <span className={badge.mention ? css.notifDotMention : css.notifDot} />}
          </button>
        </Tooltip>
      </div>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-end"
        shiftCrossAxis
        role="dialog"
        labelledBy="inbox-title"
        className={css.panel}
      >
        <InboxContent />
      </Popover>
    </>
  );
}

export function MobileInboxPage() {
  return (
    <section className={css.mobilePage}>
      <InboxContent mobile />
    </section>
  );
}
