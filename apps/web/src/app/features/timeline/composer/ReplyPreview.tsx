import { Trans, useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { ArrowBendUpLeftIcon, XIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { formatUserId } from '@/util/matrix';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';
import { useRoleNameColor } from '@/app/features/space/spaceRoles';
import { useMember } from '@/app/data';
import { buildReplyContent } from '../message/textContent';
import type { ReplyTarget } from './sendMessageContent';
import * as css from '../Composer.css';

interface ReplyPreviewProps {
  replyTo: ReplyTarget;
  onClear: () => void;
  client: MatrixClient;
  roomId: string;
}

export function ReplyPreview({ replyTo, onClear, roomId }: ReplyPreviewProps) {
  const { t } = useTranslation();
  const colorFor = useUsernameColor();
  const roleColorFor = useRoleNameColor(roomId);
  const preview = buildReplyContent(replyTo);
  const senderId = preview?.senderId ?? replyTo.sender;
  const member = useMember(roomId, senderId);
  const displayName = member?.displayName ?? replyTo.senderName ?? formatUserId(senderId);
  const nameColor = roleColorFor(senderId, member?.powerLevel ?? 0) ?? colorFor(senderId);
  const body =
    preview?.isUndecryptable || replyTo.content.type === 'unableToDecrypt'
      ? t('timeline.couldNotDecrypt')
      : (preview?.body ?? '');

  return (
    <div className={css.replyPreview}>
      <ArrowBendUpLeftIcon size={14} className={css.replyIcon} />
      <span className={css.replyText}>
        <Trans
          i18nKey="composer.replyingTo"
          values={{ name: displayName }}
          components={{
            name: <span className={css.replyName} style={{ color: nameColor }} />,
          }}
        />
        {body && <span className={css.replySnippet}>{body.substring(0, 200)}</span>}
      </span>
      <Tooltip content={t('composer.cancelReply')}>
        <button
          type="button"
          className={css.replyCancel}
          onClick={onClear}
          aria-label={t('composer.cancelReply')}
        >
          <XIcon size={14} />
        </button>
      </Tooltip>
    </div>
  );
}
