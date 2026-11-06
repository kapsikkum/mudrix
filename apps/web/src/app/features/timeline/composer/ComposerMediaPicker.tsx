import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, SmileyIcon, StickerIcon, GifIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import type { ReplyTarget } from './sendMessageContent';
import { EmojiPicker } from '@/app/features/timeline/EmojiPicker';
import { GifPicker } from '@/app/features/timeline/composer/GifPicker';
import { GifConsentGate } from '@/app/features/timeline/composer/GifConsentGate';
import { NativeStickerPicker } from '@/app/features/widget/NativeStickerPicker';
import { useBackToClose } from '@/app/hooks/useBackToClose';
import { useOutsideDismiss, usePickerDrawer } from '@/app/hooks/usePickerShell';
import * as css from './ComposerMediaPicker.css';

export type MediaTab = 'emoji' | 'sticker' | 'gif';

interface Props {
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  tab: MediaTab;
  onTabChange: (tab: MediaTab) => void;
  onPickEmoji?: (emoji: string, mxcUrl?: string) => void;
  onClose: () => void;
  onGifStatusChange?: (sending: boolean) => void;
  replyTo?: ReplyTarget | null;
  onReplySent?: () => void;
}

export function ComposerMediaPicker({
  client,
  roomId,
  threadId,
  tab,
  onTabChange,
  onPickEmoji,
  onClose,
  onGifStatusChange,
  replyTo,
  onReplySent,
}: Props) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Phones get a drawer docked under the composer (in the keyboard's place) instead of a popover
  // above it; the composer and the message being typed stay on screen.
  const drawer = usePickerDrawer(wrapperRef, onClose);

  useBackToClose(drawer, onClose);
  useOutsideDismiss(wrapperRef, onClose, !drawer);

  return (
    <div ref={wrapperRef} className={drawer ? css.wrapperDocked : css.wrapper}>
      {drawer && <div className={css.drawerHandle} aria-hidden="true" />}
      <div className={css.header}>
        <div className={css.tabs}>
          <button
            type="button"
            className={`${css.tab} ${tab === 'emoji' ? css.tabActive : ''}`}
            onClick={() => onTabChange('emoji')}
          >
            <SmileyIcon size={16} weight={tab === 'emoji' ? 'fill' : 'regular'} />
            {t('composer.emoji')}
          </button>
          <button
            type="button"
            className={`${css.tab} ${tab === 'sticker' ? css.tabActive : ''}`}
            onClick={() => onTabChange('sticker')}
          >
            <StickerIcon size={16} weight={tab === 'sticker' ? 'fill' : 'regular'} />
            {t('composer.stickers')}
          </button>
          <button
            type="button"
            className={`${css.tab} ${tab === 'gif' ? css.tabActive : ''}`}
            onClick={() => onTabChange('gif')}
          >
            <GifIcon size={16} weight="bold" />
            GIF
          </button>
        </div>
        <button
          type="button"
          className={css.closeBtn}
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>
      <div className={css.content}>
        {tab === 'emoji' && (
          <EmojiPicker
            embedded
            naked
            client={client}
            roomId={roomId}
            onPick={onPickEmoji ?? (() => {})}
            onClose={onClose}
          />
        )}
        {tab === 'sticker' && (
          <NativeStickerPicker
            naked
            client={client}
            roomId={roomId}
            threadId={threadId}
            onClose={onClose}
            replyTo={replyTo}
            onReplySent={onReplySent}
          />
        )}
        {tab === 'gif' && (
          <GifConsentGate>
            <GifPicker
              naked
              client={client}
              roomId={roomId}
              threadId={threadId}
              onClose={onClose}
              onStatusChange={onGifStatusChange}
              replyTo={replyTo}
              onReplySent={onReplySent}
            />
          </GifConsentGate>
        )}
      </div>
    </div>
  );
}
