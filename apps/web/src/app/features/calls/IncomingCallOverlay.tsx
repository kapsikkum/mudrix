import { useTranslation } from 'react-i18next';
import { PhoneIcon, PhoneXIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Tooltip } from '@/app/components/Tooltip';
import type { WizardClient } from '@wizardchat/core';
import { useProfile } from '@/app/data';
import * as css from './IncomingCallOverlay.css';

interface Props {
  callerName: string;
  callerId: string;
  voiceOnly: boolean;
  roomName: string | null;
  client: WizardClient;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallOverlay({
  callerName,
  callerId,
  voiceOnly,
  roomName,
  client,
  onAccept,
  onDecline,
}: Props) {
  const { t } = useTranslation();
  const avatarMxc = useProfile(callerId).data?.avatarUrl ?? null;
  const CallIcon = voiceOnly ? PhoneIcon : VideoCameraIcon;
  const kind = voiceOnly ? t('voice.incomingVoiceCall') : t('voice.incomingVideoCall');

  return (
    <div className={css.overlay} role="alertdialog" aria-label={`${kind}: ${callerName}`}>
      <span className={css.avatarRing}>
        <Avatar name={callerName} mxcUrl={avatarMxc} client={client} size="md" placeholder="logo" />
      </span>
      <div className={css.callerInfo}>
        <span className={css.callerName}>{callerName}</span>
        <span className={css.callKind}>
          <CallIcon size={12} weight="fill" />
          <span className={css.ellipsis}>{kind}</span>
        </span>
        {roomName && <span className={css.roomName}>{roomName}</span>}
      </div>
      <Tooltip content={t('voice.declineShort')}>
        <button
          type="button"
          className={css.declineBtn}
          onClick={onDecline}
          aria-label={t('voice.declineShort')}
        >
          <PhoneXIcon size={18} weight="fill" />
        </button>
      </Tooltip>
      <Tooltip content={t('voice.acceptShort')}>
        <button
          type="button"
          className={css.acceptBtn}
          onClick={onAccept}
          aria-label={t('voice.acceptShort')}
        >
          <CallIcon size={18} weight="fill" />
        </button>
      </Tooltip>
    </div>
  );
}
