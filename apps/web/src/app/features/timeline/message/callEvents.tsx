import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  PhoneDisconnectIcon,
  PhoneIcon,
  PhoneXIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from '@phosphor-icons/react';
import type { CallHistoryView, CallOutcome, WizardClient as MatrixClient } from '@wizardchat/core';
import { useRoom } from '@/app/data';
import { callActionsAtom, callUiAtom } from '@/app/store/atoms/call';
import { ReceiptAvatar } from './receiptAvatar';
import { ReadReceiptsPopover, useReadReceiptsPopover } from './readReceiptsPopover';
import { formatDuration } from '@/util/format';
import { formatUserId } from '@/util/matrix';
import * as css from '../Timeline.css';

interface CallHistoryProps {
  call: CallHistoryView;
  client: MatrixClient;
  roomId?: string | null;
}

const MAX_VISIBLE_AVATARS = 3;
const TICK_MS = 1000;

const TITLE_KEYS: Record<CallOutcome, string> = {
  ongoing: 'timeline.callOngoing',
  ended: 'timeline.callEnded',
  missed: 'timeline.callMissed',
  declined: 'timeline.callDeclined',
  unanswered: 'timeline.callUnanswered',
};

function CallIcon({ video, outcome }: { video: boolean; outcome: CallOutcome }) {
  if (outcome === 'ongoing') {
    return video ? (
      <VideoCameraIcon size={13} weight="fill" />
    ) : (
      <PhoneIcon size={13} weight="fill" />
    );
  }
  if (video) return <VideoCameraSlashIcon size={13} />;
  return outcome === 'ended' ? <PhoneDisconnectIcon size={13} /> : <PhoneXIcon size={13} />;
}

export function CallHistoryDisplay({ call, client, roomId }: CallHistoryProps) {
  const { t } = useTranslation();
  const receipts = useReadReceiptsPopover();
  const room = useRoom(roomId);
  const callUi = useAtomValue(callUiAtom);
  const callActions = useAtomValue(callActionsAtom);

  const isOngoing = call.outcome === 'ongoing';
  const inCall = !!room?.inCall || (!!roomId && callUi.roomId === roomId);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOngoing) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [isOngoing]);

  const participants = call.participants.map((p) => ({
    userId: p.userId,
    displayName: p.displayName ?? formatUserId(p.userId),
    avatarUrl: p.avatarUrl,
    ts: call.startedAt,
  }));
  const visible = participants.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = participants.length - visible.length;

  const endedAt = isOngoing ? now : call.outcome === 'ended' ? call.endedAt : null;
  const duration =
    call.partial || endedAt === null ? null : formatDuration(endedAt - call.startedAt);

  const pillClass = isOngoing
    ? css.callPillOngoing
    : call.outcome === 'ended'
      ? css.callPillEnded
      : css.callPillMissed;

  return (
    <>
      <div className={[css.callPill, pillClass].join(' ')}>
        <span
          className={css.callPillIcon}
          role="img"
          aria-label={t(call.video ? 'timeline.videoCall' : 'timeline.voiceCall')}
        >
          <CallIcon video={call.video} outcome={call.outcome} />
        </span>

        <span className={css.callPillLabel}>{t(TITLE_KEYS[call.outcome])}</span>

        {visible.length > 0 && (
          <span className={css.callAvatarStack}>
            {visible.map((u) => (
              <ReceiptAvatar key={u.userId} client={client} user={u} onClick={receipts.openFor} />
            ))}
            {overflow > 0 && (
              <button
                type="button"
                className={css.readReceiptOverflowBtn}
                aria-label={t('timeline.readReceiptsOverflow', { count: overflow })}
                aria-haspopup="listbox"
                onClick={(e) => receipts.openFor(e.currentTarget)}
              >
                +{overflow}
              </button>
            )}
          </span>
        )}

        {duration !== null && <span className={css.callPillDuration}>{duration}</span>}

        {isOngoing && !inCall && roomId && callActions && (
          <button
            type="button"
            className={css.callPillJoin}
            onClick={() =>
              void callActions.start(roomId, {
                voiceOnly: !!room?.isVoice || !call.video,
                presentation: 'room',
                ring: false,
              })
            }
          >
            {t('timeline.callJoin')}
          </button>
        )}
      </div>

      <ReadReceiptsPopover
        client={client}
        roomId={roomId}
        users={participants}
        anchorRef={receipts.anchorRef}
        open={receipts.open}
        onClose={receipts.close}
        title={t('timeline.callParticipants')}
        showTimestamp={false}
      />
    </>
  );
}
