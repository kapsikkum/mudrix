import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneDisconnectIcon, PhoneIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { ReceiptAvatar } from './receiptAvatar';
import { ReadReceiptsPopover, useReadReceiptsPopover } from './readReceiptsPopover';
import type { CallSessionSummary } from './callSessions';
import { formatDuration } from '@/util/format';
import * as css from '../Timeline.css';

interface CallSessionProps {
  session: CallSessionSummary;
  client: MatrixClient;
  roomId?: string | null;
}

const MAX_VISIBLE_AVATARS = 3;
const TICK_MS = 1000;

export function CallSessionDisplay({ session, client, roomId }: CallSessionProps) {
  const { t } = useTranslation();
  const receipts = useReadReceiptsPopover();

  const isOngoing = session.endTs === null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOngoing) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [isOngoing]);

  const participants = session.participants.map((p) => ({
    userId: p.userId,
    displayName: p.name,
    avatarUrl: p.mxcAvatar,
    ts: p.joinedTs,
  }));
  const visible = participants.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = participants.length - visible.length;

  const duration = session.isPartial
    ? null
    : formatDuration((session.endTs ?? now) - session.startTs);

  return (
    <>
      <div
        className={[css.callPill, isOngoing ? css.callPillOngoing : css.callPillEnded].join(' ')}
      >
        <span className={css.callPillIcon}>
          {isOngoing ? <PhoneIcon size={13} weight="fill" /> : <PhoneDisconnectIcon size={13} />}
        </span>

        <span className={css.callPillLabel}>
          {isOngoing ? t('timeline.callOngoing') : t('timeline.callEnded')}
        </span>

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
