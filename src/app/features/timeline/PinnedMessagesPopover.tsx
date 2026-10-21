import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { EventType, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import { ArrowBendDownRightIcon, PushPinIcon, PushPinSlashIcon } from '@phosphor-icons/react';
import { Popover } from '@/app/components/Popover/Popover';
import { Tooltip } from '@/app/components/Tooltip';
import { Avatar } from '@/app/components/Avatar';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { formatShortDateLabel, formatTime } from '@/util/format';
import { formatUserId, roomState } from '@/util/matrix';
import { togglePin } from './message/pinning';
import { ReplyMediaThumb, isReplyMediaEvent } from './message/ReplyMediaThumb';
import * as css from './PinnedMessagesPopover.css';

function getPinnedIds(client: MatrixClient, roomId: string): string[] {
  const room = client.getRoom(roomId);
  if (!room) return [];
  const stateEvent = roomState(room).getStateEvents('m.room.pinned_events', '');
  const event = Array.isArray(stateEvent) ? stateEvent[0] : stateEvent;
  const pinned = event?.getContent()?.pinned;
  return Array.isArray(pinned) ? pinned.filter((id): id is string => typeof id === 'string') : [];
}

function usePinnedEvents(client: MatrixClient, roomId: string, enabled: boolean): MatrixEvent[] {
  const [ids, setIds] = useState(() => getPinnedIds(client, roomId));
  const [fetched, setFetched] = useState<Map<string, MatrixEvent>>(new Map());
  const attemptedRef = useRef(new Set<string>());
  const [, setRevision] = useState(0);

  const refresh = useCallback(() => setIds(getPinnedIds(client, roomId)), [client, roomId]);
  useEffect(refresh, [refresh]);
  useMatrixEvent(client, 'RoomState.events', refresh);
  useMatrixEvent(client, 'Event.decrypted', () => setRevision((n) => n + 1));

  useEffect(() => {
    if (!enabled) return;
    const room = client.getRoom(roomId);
    const missing = ids.filter((id) => !room?.findEventById(id) && !attemptedRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => attemptedRef.current.add(id));
    const mapper = client.getEventMapper();
    void Promise.all(
      missing.map(async (id) => {
        try {
          const event = mapper(await client.fetchRoomEvent(roomId, id));
          await client.decryptEventIfNeeded(event);
          return [id, event] as const;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      setFetched((prev) => {
        const next = new Map(prev);
        for (const result of results) if (result) next.set(result[0], result[1]);
        return next;
      });
    });
  }, [client, roomId, ids, enabled]);

  const room = client.getRoom(roomId);
  return [...ids]
    .reverse()
    .map((id) => room?.findEventById(id) ?? fetched.get(id))
    .filter((event): event is MatrixEvent => !!event);
}

interface PinnedMessagesPopoverProps {
  client: MatrixClient;
  roomId: string;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onJumpTo: (eventId: string) => void;
}

export function PinnedMessagesPopover({
  client,
  roomId,
  open,
  onClose,
  anchorRef,
  onJumpTo,
}: PinnedMessagesPopoverProps) {
  const { t } = useTranslation();
  const pinned = usePinnedEvents(client, roomId, open);
  const room = client.getRoom(roomId);
  const canPin = useCanSendState(room)(EventType.RoomPinnedEvents);

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-end"
      shiftCrossAxis
      role="dialog"
      labelledBy="pinned-messages-title"
      className={css.panel}
    >
      <div className={css.header} id="pinned-messages-title">
        <PushPinIcon size={16} weight="fill" className={css.headerIcon} />
        {t('room.header.pinnedMessages')}
      </div>
      <div className={css.list}>
        {pinned.length === 0 ? (
          <div className={css.empty}>{t('room.header.noPinnedMessages')}</div>
        ) : (
          pinned.map((event) => (
            <PinnedItem
              key={event.getId()}
              client={client}
              event={event}
              canUnpin={canPin}
              onJumpTo={() => {
                onJumpTo(event.getId() ?? '');
                onClose();
              }}
            />
          ))
        )}
      </div>
    </Popover>
  );
}

interface PinnedItemProps {
  client: MatrixClient;
  event: MatrixEvent;
  canUnpin: boolean;
  onJumpTo: () => void;
}

function PinnedItem({ client, event, canUnpin, onJumpTo }: PinnedItemProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [unpinning, setUnpinning] = useState(false);
  const room = client.getRoom(event.getRoomId() ?? '');
  const senderId = event.getSender() ?? '';
  const member = room?.getMember(senderId);
  const senderName = member?.name ?? formatUserId(senderId);
  const ts = event.getTs();
  const body = (event.getContent()?.body as string | undefined) ?? '';

  const unpin = () => {
    if (!room) return;
    setUnpinning(true);
    togglePin(client, room, event, true)
      .catch((err) => toast.error(t('timeline.pinFailed', { error: getErrorMessage(err) })))
      .finally(() => setUnpinning(false));
  };

  let content;
  if (event.isRedacted()) {
    content = <div className={css.textMuted}>{t('timeline.messageDeleted')}</div>;
  } else if (event.isDecryptionFailure()) {
    content = <div className={css.textMuted}>{t('timeline.couldNotDecrypt')}</div>;
  } else if (isReplyMediaEvent(event)) {
    content = (
      <ReplyMediaThumb
        event={event}
        client={client}
        body={body}
        thumbClassName={css.media}
        thumbWrapClassName={css.mediaWrap}
        rowClassName={css.mediaRow}
        animate
      />
    );
  } else {
    content = <div className={css.text}>{body}</div>;
  }

  return (
    <div className={css.item}>
      <Avatar
        name={senderName}
        mxcUrl={member?.getMxcAvatarUrl()}
        client={client}
        size="sm"
        placeholder="logo"
      />
      <div className={css.body}>
        <div className={css.meta}>
          <span className={css.sender}>{senderName}</span>
          <span className={css.time}>
            {formatShortDateLabel(ts, t, i18n.language)}, {formatTime(ts, i18n.language)}
          </span>
        </div>
        {content}
      </div>
      <div className={css.actions}>
        <Tooltip content={t('room.header.jumpToMessage')}>
          <button
            type="button"
            className={css.actionBtn}
            onClick={onJumpTo}
            aria-label={t('room.header.jumpToMessage')}
          >
            <ArrowBendDownRightIcon size={15} />
          </button>
        </Tooltip>
        {canUnpin && (
          <Tooltip content={t('timeline.unpin')}>
            <button
              type="button"
              className={css.actionBtn}
              onClick={unpin}
              disabled={unpinning}
              aria-label={t('timeline.unpin')}
            >
              <PushPinSlashIcon size={15} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
