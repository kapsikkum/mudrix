import { useCallback, useState } from 'react';
import { useStore } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { StickerIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { roomsAtom, useRoom } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { findPackSourceForImage, type PackSource } from '@/app/hooks/useUserPacks';
import { zIndex } from '@/theme/zIndex';
import * as css from '../Timeline.css';

/**
 * Opens the pack a sticker came from: looks for it in the current room first, then the others.
 * Only packs in public rooms are shown, so a sticker is no way to peek into a private room.
 */
export function useStickerPackPreview(client: MatrixClient, roomId: string | undefined) {
  const { t } = useTranslation();
  const toast = useToast();
  const store = useStore();
  const [source, setSource] = useState<PackSource | null>(null);

  const open = useCallback(
    async (mxc: string) => {
      const others = store
        .get(roomsAtom)
        .filter((r) => !r.isInvite && r.id !== roomId)
        .map((r) => r.id);
      const found = await findPackSourceForImage(
        client,
        mxc,
        roomId ? [roomId, ...others] : others
      );
      if (!found) {
        toast.info(t('timeline.stickerPack.unknown'));
        return;
      }
      const settings = await client.localRoomSettings(found.summary.roomId).catch(() => null);
      if (settings?.joinRule !== 'public') {
        toast.info(t('timeline.stickerPack.notPublic'));
        return;
      }
      setSource(found);
    },
    [client, roomId, store, toast, t]
  );

  return { open, source, close: () => setSource(null) };
}

interface Props {
  client: MatrixClient;
  source: PackSource;
  onClose: () => void;
}

/** Read-only look at the sticker pack a sticker in the timeline came from. */
export function StickerPackPreviewModal({ client, source, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { summary: pack, images } = source;
  const entries = Object.entries(images);
  const room = useRoom(pack.roomId);
  const roomName = room?.name ?? pack.roomId;

  return (
    <Modal
      open
      onClose={onClose}
      title={pack.displayName}
      zIndex={zIndex.dialogNested}
      footer={
        <Button
          variant="secondary"
          onClick={() => {
            onClose();
            navigate(`/r/${encodeURIComponent(pack.roomId)}`);
          }}
        >
          {t('timeline.stickerPack.viewRoom')}
        </Button>
      }
    >
      <div className={css.stickerPackPreviewHeader}>
        {pack.avatarMxc ? (
          <AuthMediaImg
            client={client}
            mxcUrl={pack.avatarMxc}
            width={40}
            height={40}
            alt=""
            className={css.stickerPackPreviewAvatar}
          />
        ) : (
          <StickerIcon size={24} />
        )}
        <div className={css.stickerPackPreviewInfo}>
          <span className={css.stickerPackPreviewName}>{pack.displayName}</span>
          <span className={css.stickerPackPreviewMeta}>
            {t('timeline.stickerPack.stickerCount', { count: entries.length })}
            {' · '}
            {t('timeline.stickerPack.fromRoom', { room: roomName })}
          </span>
        </div>
      </div>
      <div className={css.stickerPackPreviewGrid}>
        {entries.map(([shortcode, img]) => (
          <div key={shortcode} className={css.stickerPackPreviewItem}>
            <AuthMediaImg
              client={client}
              mxcUrl={img.url}
              alt={img.body ?? shortcode}
              className={css.stickerPackPreviewItemImg}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
