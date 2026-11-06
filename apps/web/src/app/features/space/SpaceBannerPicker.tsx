import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { ImageIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@/app/components/Button';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { SpaceBannerView } from './SpaceBannerView';
import { SPACE_BANNER_PRESETS, setSpaceBanner, useSpaceBanner } from './spaceBanner';
import * as css from './SpaceBanner.css';

interface SpaceBannerPickerProps {
  client: WizardClient | null;
  spaceId: string;
  /** Whether the signed-in user may change the banner. */
  canEdit: boolean;
}

/** Upload an image or pick a gradient for the space's banner. Changes save straight away. */
export function SpaceBannerPicker({ client, spaceId, canEdit }: SpaceBannerPickerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const banner = useSpaceBanner(spaceId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (change: () => Promise<void>) => {
    setBusy(true);
    try {
      await change();
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File) =>
    run(async () => {
      if (!client) return;
      const url = await client.uploadMedia(
        new Uint8Array(await file.arrayBuffer()),
        file.type || 'application/octet-stream'
      );
      await setSpaceBanner(client, spaceId, { url });
    });

  return (
    <div className={css.picker}>
      <h3 className={css.pickerTitle}>{t('room.space.banner.title')}</h3>
      <SpaceBannerView client={client} banner={banner} className={css.pickerPreview} />
      {canEdit ? (
        <>
          <div className={css.pickerActions}>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon size={14} className={css.buttonIcon} />
              {t('room.space.banner.upload')}
            </Button>
            {banner && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => client && run(() => setSpaceBanner(client, spaceId, null))}
              >
                <TrashIcon size={14} className={css.buttonIcon} />
                {t('room.space.banner.remove')}
              </Button>
            )}
          </div>
          <div className={css.swatches} role="group" aria-label={t('room.space.banner.colors')}>
            {SPACE_BANNER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={
                  banner?.color === preset.id && !banner.url ? css.swatchActive : css.swatch
                }
                style={{ background: preset.css }}
                aria-label={preset.id}
                aria-pressed={banner?.color === preset.id && !banner.url}
                disabled={busy}
                onClick={() =>
                  client && run(() => setSpaceBanner(client, spaceId, { color: preset.id }))
                }
              />
            ))}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={css.hidden}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
