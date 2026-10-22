import { Trans, useTranslation } from 'react-i18next';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { ArrowBendUpLeftIcon, XIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { formatUserId } from '@/util/matrix';
import { buildReplyContent } from '../message/textContent';
import * as css from '../Composer.css';

interface ReplyPreviewProps {
  replyTo: MatrixEvent;
  onClear: () => void;
  client: MatrixClient;
  roomId: string;
}

export function ReplyPreview({ replyTo, onClear, client, roomId }: ReplyPreviewProps) {
  const { t } = useTranslation();
  const room = client.getRoom(roomId);
  const preview = buildReplyContent(replyTo);
  const senderId = preview?.senderId ?? replyTo.getSender() ?? '';
  const displayName = room?.getMember(senderId)?.name ?? formatUserId(senderId);
  const body =
    preview?.isUndecryptable || replyTo.isDecryptionFailure()
      ? t('timeline.couldNotDecrypt')
      : (preview?.body ?? (replyTo.getContent()?.body as string) ?? '');

  return (
    <div className={css.replyPreview}>
      <ArrowBendUpLeftIcon size={14} className={css.replyIcon} />
      <span className={css.replyText}>
        <Trans
          i18nKey="composer.replyingTo"
          values={{ name: displayName }}
          components={{ name: <span className={css.replyName} /> }}
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
