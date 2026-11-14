import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import type { PackKind } from '@/app/hooks/useUserPacks';
import type { PackData } from './PackEditor';
import * as css from './CosmeticPackPreview.css';
import * as emojiCss from './RoomSettingsEmojiSticker.css';

interface Props {
  client: MatrixClient;
  pack: PackData | null;
  kind: PackKind;
  onClose: () => void;
}

/**
 * A look at what a cosmetic pack holds, without opening the editor: every item at its own size on a
 * plain backdrop, animated where the art is.
 */
export function CosmeticPackPreview({ client, pack, kind, onClose }: Props) {
  const { t } = useTranslation();
  const items = pack ? Object.values(pack.images) : [];
  const tile = {
    decoration: css.decorationTile,
    effect: css.effectTile,
    nameplate: css.nameplateTile,
    profile_frame: css.frameTile,
    emoji: css.frameTile,
  }[kind];

  return (
    <Modal
      open={pack !== null}
      onClose={onClose}
      title={pack?.displayName ?? ''}
      size="lg"
      footer={
        <div className={css.footer}>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      {items.length === 0 ? (
        <div className={emojiCss.emptyPacks}>{t('room.settings.cosmetics.previewEmpty')}</div>
      ) : (
        <div className={kind === 'nameplate' ? css.gridWide : css.grid}>
          {items.map((img) => (
            <figure key={img.shortcode} className={css.item}>
              <div className={tile}>
                {kind === 'decoration' && <div className={css.sampleAvatar} />}
                {/* No size is asked for: a thumbnail would be a still frame of an animation. */}
                <AuthMediaImg
                  client={client}
                  mxcUrl={img.url}
                  alt={img.body || img.shortcode}
                  className={kind === 'decoration' ? css.decorationImg : css.art}
                  placeholder="sticker"
                />
              </div>
              <figcaption className={css.caption}>{img.body || img.shortcode}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </Modal>
  );
}
