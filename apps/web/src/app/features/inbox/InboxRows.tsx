import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookmarkSimpleIcon, ChatDotsIcon } from '@phosphor-icons/react';
import type { RoomSummary, WizardClient } from '@wizardchat/core';
import { Avatar } from '@/app/components/Avatar';
import { Tooltip } from '@/app/components/Tooltip';
import { useProfile, useRoom } from '@/app/data';
import { formatRelativeTime } from '@/util/format';
import { formatUserId } from '@/util/matrix';
import { stripReplyFallback } from '@/app/features/timeline/message/textContent';
import { resolveSavedEvent, type EventPreview, type SavedMessage } from '@/util/savedMessages';
import type { InboxThread } from './useThreadsInbox';
import * as css from './Inbox.css';

export type RowKind = 'dm' | 'room';

/** How a room shows up in a row: a direct chat by the other person, any other room by its name. */
function rowRoom(room: RoomSummary | null, fallbackName: string) {
  const dm = !!room?.isDirect && !!room.dmUserId;
  return {
    kind: (dm ? 'dm' : 'room') as RowKind,
    name: dm ? (room?.dmUserName ?? formatUserId(room?.dmUserId)) : (room?.name ?? fallbackName),
    avatarMxc: dm ? (room?.dmUserAvatar ?? null) : (room?.avatarUrl ?? null),
  };
}

/** The first line of a message with its sender: "Name: text". */
function useLine(senderId: string | null, body: string, fallback: string): string {
  const { data: profile } = useProfile(senderId);
  const name = profile?.displayName || formatUserId(senderId);
  const text = stripReplyFallback(body).split('\n')[0].trim();
  return `${name}: ${text || fallback}`;
}

interface ThreadRowProps {
  client: WizardClient;
  item: InboxThread;
  onOpen: (item: InboxThread, kind: RowKind) => void;
}

/** One entry of the threads list: room, the thread's root message and its latest reply. */
export function ThreadRow({ client, item, onOpen }: ThreadRowProps) {
  const { t, i18n } = useTranslation();
  const { room, info, unread, ts } = item;
  const { kind, name, avatarMxc } = rowRoom(room, room.id);
  const fallback = t('common.newMessage');
  const rootLine = useLine(info.sender, info.body, fallback);
  const replyLine = useLine(info.latestSender, info.latestBody ?? '', fallback);
  const open = () => onOpen(item, kind);

  return (
    <div
      className={css.item}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <Avatar name={name} mxcUrl={avatarMxc} client={client} size="sm" />
      <div className={css.info}>
        <span className={css.name}>
          {name}
          {unread && (
            <span className={css.notifDot} style={{ position: 'static', marginLeft: 6 }} />
          )}
        </span>
        <span className={css.sub}>{rootLine}</span>
        {info.latestSender && <span className={css.sub}>↳ {replyLine}</span>}
      </div>
      <span className={css.entryMeta}>
        <span className={css.time}>{formatRelativeTime(ts, t, i18n.language)}</span>
        <span className={css.sub}>
          <ChatDotsIcon size={12} /> {info.replies}
        </span>
      </span>
    </div>
  );
}

interface SavedRowProps {
  client: WizardClient;
  saved: SavedMessage;
  onOpen: (saved: SavedMessage, kind: RowKind) => void;
  onRemove: (saved: SavedMessage) => void;
}

/** One entry of the saved-messages list: room, sender and the start of the message. */
export function SavedRow({ client, saved, onOpen, onRemove }: SavedRowProps) {
  const { t, i18n } = useTranslation();
  const { roomId, eventId } = saved;
  const room = useRoom(roomId);
  // undefined while it loads, null when the message can no longer be read
  const [preview, setPreview] = useState<EventPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void resolveSavedEvent(client, { roomId, eventId }).then((result) => {
      if (!cancelled) setPreview(result && !result.redacted ? result : null);
    });
    return () => {
      cancelled = true;
    };
  }, [client, roomId, eventId]);

  const { data: profile } = useProfile(preview?.sender);
  const { kind, name, avatarMxc } = rowRoom(room, roomId);
  const canOpen = !!room && !room.isInvite;
  const open = () => {
    if (canOpen) onOpen(saved, kind);
  };
  const body = preview
    ? stripReplyFallback(preview.body).split('\n')[0].trim() || t('common.newMessage')
    : '';

  return (
    <div
      className={css.item}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <Avatar name={name} mxcUrl={avatarMxc} client={client} size="sm" />
      <div className={css.info}>
        <span className={css.name}>{name}</span>
        <span className={css.sub}>
          {preview === undefined
            ? '…'
            : preview === null
              ? t('inbox.savedUnavailable')
              : `${profile?.displayName || formatUserId(preview.sender)}: ${body}`}
        </span>
      </div>
      <span className={css.entryMeta}>
        <span className={css.time}>
          {formatRelativeTime(preview?.timestamp || saved.savedAt, t, i18n.language)}
        </span>
        <Tooltip placement="left" content={t('timeline.unsaveMessage')}>
          <button
            type="button"
            className={css.markReadButton}
            aria-label={t('timeline.unsaveMessage')}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(saved);
            }}
          >
            <BookmarkSimpleIcon size={14} weight="fill" />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}
