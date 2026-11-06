import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { useToast } from '@/app/hooks/useToast';
import {
  useExtendedProfile,
  useExtendedProfileMutations,
  type ExtendedProfileUpdate,
} from '@/app/hooks/useExtendedProfile';
import { getErrorMessage } from '@/util/error';
import {
  ACCENT_PRESETS,
  AVATAR_DECORATION_IDS,
  avatarDecorationSrc,
  normalizeHex,
} from '@/util/profileCosmetics';
import {
  BUILTIN_FRAMES,
  BUILTIN_NAMEPLATES,
  builtinFramePreviewSrc,
  builtinNameplateSrc,
} from '@/util/builtinCosmetics';
import { DECORATION_LABEL_KEYS } from '@/app/features/profile/ProfileCosmetics';
import * as css from './ProfileStyle.css';

/**
 * Accent colour, avatar decoration, nameplate and profile frame: the Mudrix-only profile fields.
 * Each choice is saved as soon as it is picked. Other Matrix clients ignore them.
 */
export function ProfileStyle() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const { data: fields } = useExtendedProfile(client, client?.userId() ?? null);
  const { saveFields, busy } = useExtendedProfileMutations(client);
  const [hex, setHex] = useState('');

  useEffect(() => {
    setHex(fields?.accent ?? '');
  }, [fields?.accent]);

  if (!client || !fields) return null;

  const save = async (update: ExtendedProfileUpdate) => {
    try {
      await saveFields(update);
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const typedHex = hex.trim() === '' ? null : normalizeHex(hex);
  const hexInvalid = hex.trim() !== '' && !typedHex;
  const nameplateId = typeof fields.nameplate === 'string' ? fields.nameplate : null;
  const frameId = typeof fields.profileFrame === 'string' ? fields.profileFrame : null;

  return (
    <div className={css.group}>
      <p className={css.note}>
        {t('profile.cosmetics.mudrixOnly')}. {t('profile.cosmetics.note')}
      </p>

      <div className={css.group}>
        <span className={css.groupTitle}>{t('profile.accent.title')}</span>
        <div className={css.swatches}>
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={css.swatch}
              style={{ backgroundColor: preset }}
              aria-label={preset}
              aria-pressed={fields.accent === preset}
              disabled={busy}
              onClick={() => void save({ accent: preset })}
            />
          ))}
          <Input
            className={css.hexInput}
            aria-label={t('profile.accent.hex')}
            placeholder="#5865f2"
            value={hex}
            error={hexInvalid ? t('profile.accent.invalid') : undefined}
            onChange={(e) => setHex(e.target.value)}
            maxLength={7}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || hexInvalid || typedHex === fields.accent}
            onClick={() => void save({ accent: typedHex })}
          >
            {typedHex ? t('common.save') : t('profile.accent.reset')}
          </Button>
        </div>
        <p className={css.note}>{t('profile.accent.hint')}</p>
      </div>

      <div className={css.group}>
        <span className={css.groupTitle}>{t('profile.decoration.title')}</span>
        <div className={css.grid}>
          <button
            type="button"
            className={css.tile}
            aria-pressed={!fields.avatarDecoration}
            disabled={busy}
            onClick={() => void save({ avatarDecoration: null })}
          >
            {t('profile.decoration.none')}
          </button>
          {AVATAR_DECORATION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={css.tile}
              aria-pressed={fields.avatarDecoration === id}
              disabled={busy}
              onClick={() => void save({ avatarDecoration: id })}
            >
              <img className={css.tileImage} src={avatarDecorationSrc(id)} alt="" loading="lazy" />
              {t(DECORATION_LABEL_KEYS[id] ?? id)}
            </button>
          ))}
        </div>
      </div>

      <div className={css.group}>
        <span className={css.groupTitle}>{t('settings.account.styleNameplate')}</span>
        <div className={css.grid}>
          <button
            type="button"
            className={css.tile}
            aria-pressed={!fields.nameplate}
            disabled={busy}
            onClick={() => void save({ nameplate: null })}
          >
            {t('profile.decoration.none')}
          </button>
          {BUILTIN_NAMEPLATES.map((plate) => (
            <button
              key={plate.id}
              type="button"
              className={css.tile}
              aria-pressed={nameplateId === plate.id}
              disabled={busy}
              onClick={() => void save({ nameplate: plate.id })}
            >
              <img
                className={css.tileWide}
                src={builtinNameplateSrc(plate)}
                alt=""
                loading="lazy"
              />
              {plate.name}
            </button>
          ))}
        </div>
      </div>

      <div className={css.group}>
        <span className={css.groupTitle}>{t('settings.account.styleFrame')}</span>
        <div className={css.grid}>
          <button
            type="button"
            className={css.tile}
            aria-pressed={!fields.profileFrame}
            disabled={busy}
            onClick={() => void save({ profileFrame: null })}
          >
            {t('profile.decoration.none')}
          </button>
          {BUILTIN_FRAMES.map((frame) => (
            <button
              key={frame.id}
              type="button"
              className={css.tile}
              aria-pressed={frameId === frame.id}
              disabled={busy}
              onClick={() => void save({ profileFrame: frame.id })}
            >
              <img
                className={css.tileImage}
                src={builtinFramePreviewSrc(frame)}
                alt=""
                loading="lazy"
              />
              {frame.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
