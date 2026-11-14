import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilSimpleIcon, StickerIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  useUserPack,
  saveUserPack,
  type UserPackImage,
  type UserPackData,
  type PackUsage,
} from '@/app/hooks/useUserPacks';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Button } from '@/app/components/Button';
import {
  PackEditor,
  type PackData,
  type ImageEntry,
} from '@/app/features/room/roomsettings/PackEditor';
import * as css from './EmojisStickers.css';
import * as panelCss from '@/app/components/Settings/Settings.css';
import { USER_PACK } from '@/app/features/settings/emojis/imagePackTypes';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';

interface Props {
  client: MatrixClient;
  editing: boolean;
  onEdit: () => void;
  onBack: () => void;
}

function toImageEntry(
  shortcode: string,
  img: {
    url: string;
    usage: string[];
    body?: string;
    mimetype?: string;
    info?: Record<string, unknown>;
  }
): ImageEntry {
  return {
    shortcode,
    url: img.url,
    usage: img.usage,
    body: img.body,
    mimetype: img.mimetype,
    info: img.info,
  };
}

function packDataToContent(pack: PackData): UserPackData {
  const imagesContent: Record<string, UserPackImage> = {};
  for (const [key, img] of Object.entries(pack.images)) {
    imagesContent[key] = {
      url: img.url,
      // Keep each image's own usage (a decoration stays a decoration); an image without one
      // inherits the pack's.
      usage: img.usage.length > 0 ? (img.usage as PackUsage[]) : (pack.usage as PackUsage[]),
      body: img.body ?? key,
      mimetype: img.mimetype,
      info: img.info,
    };
  }
  return {
    displayName: pack.displayName,
    usage: pack.usage as PackUsage[],
    images: imagesContent,
  };
}

export function UserPack({ client, editing, onEdit, onBack }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const userPack = useUserPack(client);
  const [saving, setSaving] = useState(false);

  const firstImage = useMemo(
    () => (userPack ? Object.values(userPack.images)[0] : undefined),
    [userPack]
  );

  const packData: PackData = useMemo(
    () =>
      userPack
        ? {
            stateKey: USER_PACK,
            displayName: userPack.displayName,
            usage: userPack.usage,
            images: Object.fromEntries(
              Object.entries(userPack.images).map(([shortcode, img]) => [
                shortcode,
                toImageEntry(shortcode, img),
              ])
            ),
          }
        : {
            stateKey: USER_PACK,
            displayName: 'personal',
            usage: ['emoticon', 'sticker'] as PackUsage[],
            images: {},
          },
    [userPack]
  );

  const handleSave = useCallback(
    async (updated: PackData) => {
      setSaving(true);
      try {
        const next = packDataToContent(updated);
        await saveUserPack(client, next);
        onBack();
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      } finally {
        setSaving(false);
      }
    },
    [client, toast, t, onBack]
  );

  if (editing) {
    return (
      <PackEditor client={client} roomId="" pack={packData} onSave={handleSave} onBack={onBack} />
    );
  }

  return (
    <div>
      <h3 className={panelCss.sectionTitle}>{t('settings.emojisStickers.defaultPack')}</h3>
      <p className={panelCss.settingNote} style={{ marginBottom: 12 }}>
        {t('settings.emojisStickers.defaultPackNote')}
      </p>

      <div className={css.packCard}>
        <div className={css.packCardPreview}>
          {firstImage ? (
            <AuthMediaImg
              client={client}
              mxcUrl={firstImage.url}
              width={64}
              height={64}
              alt=""
              className={css.packCardPreviewImg}
            />
          ) : (
            <StickerIcon size={20} />
          )}
        </div>
        <div className={css.packCardInfo}>
          <span className={css.packCardName}>{packData.displayName}</span>
          <span className={css.packCardMeta}>
            {t('settings.emojisStickers.imageCount', {
              count: Object.keys(packData.images).length,
            })}
          </span>
        </div>
        <div className={css.packCardActions}>
          <Button variant="secondary" size="sm" onClick={onEdit} disabled={saving}>
            <PencilSimpleIcon size={14} className={panelCss.iconBefore} />
            {t('common.edit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
