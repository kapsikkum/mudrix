import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventEntry as MatrixEvent } from './entry';
import { Tooltip } from '@/app/components/Tooltip';
import {
  ArrowBendUpLeftIcon,
  ChatDotsIcon,
  SmileyIcon,
  PushPinIcon,
  PushPinSlashIcon,
  PencilSimpleIcon,
  XSquareIcon,
  EyeSlashIcon,
  DotsThreeVerticalIcon,
} from '@phosphor-icons/react';
import * as css from '../Timeline.css';

interface MessageActionToolbarProps {
  event: MatrixEvent;
  canEdit: boolean;
  canPin: boolean;
  canEndPoll: boolean;
  isPinned: boolean;
  canHideMedia: boolean;
  onHideMedia: () => void;
  onReply: (event: MatrixEvent) => void;
  onReact: (event: MatrixEvent, anchor?: HTMLElement) => void;
  onEdit: (event: MatrixEvent) => void;
  onEndPoll: (event: MatrixEvent) => void;
  onPin: () => void;
  onThreadClick?: (event: MatrixEvent) => void;
  onMore?: (e: React.MouseEvent) => void;
}

export const MessageActionToolbar = memo(function MessageActionToolbar({
  event,
  canEdit,
  canPin,
  canEndPoll,
  isPinned,
  canHideMedia,
  onHideMedia,
  onReply,
  onReact,
  onEdit,
  onEndPoll,
  onPin,
  onThreadClick,
  onMore,
}: MessageActionToolbarProps) {
  const { t } = useTranslation();

  const handleReply = useCallback(() => onReply(event), [onReply, event]);
  const handleThreadClick = useCallback(() => onThreadClick?.(event), [onThreadClick, event]);
  const handleReact = useCallback(
    (e: React.MouseEvent) => onReact(event, e.currentTarget as HTMLElement),
    [onReact, event]
  );
  const handleEdit = useCallback(() => onEdit(event), [onEdit, event]);
  const handleEndPoll = useCallback(() => onEndPoll(event), [onEndPoll, event]);

  return (
    <div className={`${css.msgActions} ${css.actionsVisible}`}>
      <Tooltip content={t('timeline.reply')} placement="top">
        <button
          type="button"
          className={css.msgActionBtn}
          aria-label={t('timeline.reply')}
          onClick={handleReply}
        >
          <ArrowBendUpLeftIcon size={16} />
        </button>
      </Tooltip>
      {onThreadClick && (
        <Tooltip content={t('timeline.replyInThread')} placement="top">
          <button
            type="button"
            className={css.msgActionBtn}
            aria-label={t('timeline.replyInThread')}
            onClick={handleThreadClick}
          >
            <ChatDotsIcon size={16} />
          </button>
        </Tooltip>
      )}
      <Tooltip content={t('timeline.react')} placement="top">
        <button
          type="button"
          className={css.msgActionBtn}
          aria-label={t('timeline.react')}
          onClick={handleReact}
        >
          <SmileyIcon size={16} />
        </button>
      </Tooltip>
      {canPin && (
        <Tooltip content={isPinned ? t('timeline.unpin') : t('timeline.pin')} placement="top">
          <button
            type="button"
            className={isPinned ? css.msgActionBtnPinned : css.msgActionBtn}
            aria-label={isPinned ? t('timeline.unpin') : t('timeline.pin')}
            onClick={onPin}
          >
            {isPinned ? <PushPinSlashIcon size={16} /> : <PushPinIcon size={16} />}
          </button>
        </Tooltip>
      )}
      {canEdit && (
        <Tooltip content={t('common.edit')} placement="top">
          <button
            type="button"
            className={css.msgActionBtn}
            aria-label={t('common.edit')}
            onClick={handleEdit}
          >
            <PencilSimpleIcon size={16} />
          </button>
        </Tooltip>
      )}
      {canEndPoll && (
        <Tooltip content={t('timeline.poll.end')} placement="top">
          <button
            type="button"
            className={css.msgActionBtn}
            aria-label={t('timeline.poll.end')}
            onClick={handleEndPoll}
          >
            <XSquareIcon size={16} />
          </button>
        </Tooltip>
      )}
      {canHideMedia && (
        <Tooltip content={t('timeline.hideMedia')} placement="top">
          <button
            type="button"
            className={css.msgActionBtn}
            aria-label={t('timeline.hideMedia')}
            onClick={onHideMedia}
          >
            <EyeSlashIcon size={16} />
          </button>
        </Tooltip>
      )}
      {onMore && (
        <Tooltip content={t('common.more')} placement="top">
          <button
            type="button"
            className={css.msgActionBtn}
            aria-label={t('common.more')}
            onClick={onMore}
          >
            <DotsThreeVerticalIcon size={16} weight="bold" />
          </button>
        </Tooltip>
      )}
    </div>
  );
});
