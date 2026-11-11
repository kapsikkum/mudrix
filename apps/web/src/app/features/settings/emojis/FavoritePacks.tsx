import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, StickerIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useRoomNames } from './roomNames';
import {
  useFavoritePacks,
  saveFavoritePacks,
  type RoomPackSummary,
} from '@/app/hooks/useUserPacks';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { IconButton } from '@/app/components/Button';
import { FavoritePacksSelect } from './SelectFavoritePacksModal';
import * as css from './EmojisStickers.css';
import * as panelCss from '@/app/components/Settings/Settings.css';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';

interface Props {
  client: MatrixClient;
}

export function FavoritePacks({ client }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const favoritePacks = useFavoritePacks(client);
  const roomNames = useRoomNames();
  const [removing, setRemoving] = useState(false);

  const handleRemove = useCallback(
    async (fav: RoomPackSummary) => {
      setRemoving(true);
      try {
        const next = favoritePacks.filter(
          (f) => !(f.roomId === fav.roomId && f.stateKey === fav.stateKey)
        );
        await saveFavoritePacks(client, next);
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      } finally {
        setRemoving(false);
      }
    },
    [favoritePacks, client, toast, t]
  );

  const handleSave = useCallback(
    async (favorites: RoomPackSummary[]) => {
      try {
        await saveFavoritePacks(client, favorites);
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      }
    },
    [client, toast, t]
  );

  const renderPack = (fav: RoomPackSummary) => {
    return (
      <div key={`${fav.roomId}/${fav.stateKey}`} className={css.packCard}>
        <div className={css.packCardPreview}>
          {fav.avatarMxc ? (
            <AuthMediaImg
              client={client}
              mxcUrl={fav.avatarMxc}
              width={112}
              height={112}
              alt=""
              className={css.packCardPreviewImg}
            />
          ) : (
            <StickerIcon size={20} />
          )}
        </div>
        <div className={css.packCardInfo}>
          <span className={css.packCardName}>{fav.displayName}</span>
          <span className={css.packCardMeta}>{roomNames.get(fav.roomId) ?? fav.roomId}</span>
        </div>
        <div className={css.packCardActions}>
          <IconButton
            size="sm"
            onClick={() => handleRemove(fav)}
            disabled={removing}
            aria-label={t('settings.emojisStickers.removeFavorite')}
            tooltip={t('settings.emojisStickers.removeFavorite')}
          >
            <XIcon size={14} />
          </IconButton>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className={css.headerRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className={panelCss.sectionTitle}>{t('settings.emojisStickers.favoritePacks')}</h3>
          <p className={panelCss.settingNote} style={{ marginBottom: 4 }}>
            {t('settings.emojisStickers.favoritePacksNote')}
          </p>
        </div>
        <div className={css.headerButton}>
          <FavoritePacksSelect client={client} current={favoritePacks} onSave={handleSave} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {favoritePacks.length === 0 ? (
          <div className={css.emptyPacks}>{t('settings.emojisStickers.noFavoritePacks')}</div>
        ) : (
          <div className={css.packList}>{favoritePacks.map(renderPack)}</div>
        )}
      </div>
    </div>
  );
}
