import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon, TrashIcon } from '@phosphor-icons/react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Button } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { Field } from '@/app/components/Field';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import {
  useExtendedProfile,
  useExtendedProfileMutations,
  useExtendedProfileSupport,
} from '@/app/hooks/useExtendedProfile';
import { useUserBannerBlob } from '@/app/hooks/useUserBanner';
import { getErrorMessage } from '@/util/error';
import { RangeInput } from '@/app/components/Slider';
import { BANNER_ASPECT, cropImageToAspect, readImageSize } from '@/util/cropImage';
import {
  MAX_BIO_CHARS,
  MAX_BIO_LINES,
  MAX_PRONOUN_CHARS,
  MAX_PRONOUN_ENTRIES,
  browserTimeZone,
  formatPronouns,
  listTimeZones,
  parsePronounsInput,
  sanitizeBio,
} from '@/util/profileFields';
import * as settingsCss from '@/app/components/Settings/Settings.css';
import { isTouchDevice } from '@/util/touch';
import { ProfileStyle } from './ProfileStyle';
import * as css from './ExtendedProfile.css';

interface PendingBanner {
  file: File;
  url: string;
  width: number;
  height: number;
}

function BannerEditor({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: fields } = useExtendedProfile(client, client?.userId() ?? null);
  const { saveBannerFile, removeBannerField, busy } = useExtendedProfileMutations(client);
  const { data: bannerSrc } = useUserBannerBlob(client, fields?.bannerMxc);
  const [pending, setPending] = useState<PendingBanner | null>(null);
  // 0..100: which part of the image is kept along the axis that gets cropped.
  const [focus, setFocus] = useState(50);

  useEffect(
    () => () => {
      if (pending) URL.revokeObjectURL(pending.url);
    },
    [pending]
  );

  const imageAspect = pending ? pending.width / pending.height : BANNER_ASPECT;
  // Crops left/right when the image is wider than the banner, top/bottom when taller.
  const sliderAxis = imageAspect > BANNER_ASPECT ? 'x' : 'y';
  const canPosition =
    !!pending && pending.file.type !== 'image/gif' && imageAspect !== BANNER_ASPECT;

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const { width, height } = await readImageSize(url);
      setFocus(50);
      setPending({ file, url, width, height });
    } catch (err) {
      URL.revokeObjectURL(url);
      toast.error(t('profile.bannerSaveFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleApply = async () => {
    if (!pending) return;
    try {
      const cropped = await cropImageToAspect(pending.file, BANNER_ASPECT, focus / 100);
      await saveBannerFile(cropped);
      setPending(null);
    } catch (err) {
      toast.error(t('profile.bannerSaveFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleRemove = async () => {
    const ok = await confirmDialog({
      title: t('profile.removeBanner'),
      message: t('profile.removeBannerConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeBannerField();
    } catch (err) {
      toast.error(t('profile.bannerRemoveFailed', { error: getErrorMessage(err) }));
    }
  };

  const shownSrc = pending?.url ?? (fields?.bannerMxc ? bannerSrc : undefined);
  const objectPosition = sliderAxis === 'x' ? `${focus}% 50%` : `50% ${focus}%`;

  return (
    <Field label={t('settings.account.banner')} hint={t('settings.account.bannerHint')}>
      <div className={css.bannerPreview}>
        {shownSrc ? (
          <img src={shownSrc} alt="" className={css.bannerImg} style={{ objectPosition }} />
        ) : (
          <div className={css.bannerEmpty}>{t('settings.account.noBanner')}</div>
        )}
      </div>
      {canPosition && (
        <div className={css.positionRow}>
          <span>{t('settings.account.bannerPosition')}</span>
          <RangeInput
            max={100}
            value={focus}
            onChange={setFocus}
            className={css.positionSlider}
            aria-label={t('settings.account.bannerPosition')}
          />
        </div>
      )}
      <div className={css.bannerActions}>
        {pending ? (
          <>
            <Button size="sm" onClick={handleApply} loading={busy} spinnerWhileLoading>
              {t('common.apply')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon size={14} className={settingsCss.iconBefore} />
              {fields?.bannerMxc
                ? t('settings.account.changeBanner')
                : t('settings.account.uploadBanner')}
            </Button>
            {fields?.bannerMxc && (
              <Button size="sm" variant="danger" disabled={disabled || busy} onClick={handleRemove}>
                <TrashIcon size={14} className={settingsCss.iconBefore} />
                {t('common.remove')}
              </Button>
            )}
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className={settingsCss.hiddenInput}
        onChange={handlePick}
      />
    </Field>
  );
}

/** Account settings for MSC4133 extended profile fields: banner, bio, pronouns, timezone. */
export function ExtendedProfile() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const { supported, loading: supportLoading } = useExtendedProfileSupport(client);
  const { data: fields } = useExtendedProfile(client, client?.userId() ?? null);
  const { saveFields, busy } = useExtendedProfileMutations(client);

  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    if (!fields) return;
    setBio(fields.bio);
    setPronouns(formatPronouns(fields.pronouns));
    setTimezone(fields.timezone ?? '');
  }, [fields]);

  const browserTz = useMemo(() => browserTimeZone(), []);
  const timezoneOptions = useMemo(() => {
    const options = [{ value: '', label: t('settings.account.timezoneUnset') }];
    if (browserTz) {
      options.push({
        value: browserTz,
        label: t('settings.account.timezoneBrowser', { tz: browserTz.replace(/_/g, ' ') }),
      });
    }
    const zones = listTimeZones();
    // A saved zone this browser does not list must still show up as selected.
    if (fields?.timezone && !zones.includes(fields.timezone)) zones.unshift(fields.timezone);
    for (const tz of zones) {
      if (tz !== browserTz) options.push({ value: tz, label: tz.replace(/_/g, ' ') });
    }
    return options;
  }, [t, browserTz, fields?.timezone]);

  if (!client) return null;

  const disabled = !supported || supportLoading;
  const parsedPronouns = parsePronounsInput(pronouns);
  const cleanBio = sanitizeBio(bio);
  const bioChanged = !!fields && cleanBio !== fields.bio;
  const pronounsChanged =
    !!fields && formatPronouns(parsedPronouns) !== formatPronouns(fields.pronouns);
  const timezoneChanged = !!fields && timezone !== (fields.timezone ?? '');
  const dirty = bioChanged || pronounsChanged || timezoneChanged;

  const handleSave = async () => {
    try {
      await saveFields({
        bio: bioChanged ? cleanBio : undefined,
        pronouns: pronounsChanged ? parsedPronouns : undefined,
        timezone: timezoneChanged ? timezone || null : undefined,
      });
      toast.success(t('settings.account.profileSaved'));
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  return (
    <div className={settingsCss.fieldGroup}>
      {!supportLoading && !supported && (
        <p className={css.unsupportedNote}>{t('settings.account.extendedProfileUnsupported')}</p>
      )}
      <BannerEditor disabled={disabled} />
      <Textarea
        label={t('settings.account.bio')}
        placeholder={t('settings.account.bioPlaceholder')}
        helperText={t(
          isTouchDevice() ? 'settings.account.bioHintTouch' : 'settings.account.bioHint',
          {
            chars: MAX_BIO_CHARS,
            lines: MAX_BIO_LINES,
          }
        )}
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={MAX_BIO_CHARS}
        rows={5}
        disabled={disabled}
      />
      <Input
        label={t('settings.account.pronouns')}
        placeholder={t('settings.account.pronounsPlaceholder')}
        helperText={t('settings.account.pronounsHint', {
          count: MAX_PRONOUN_ENTRIES,
          chars: MAX_PRONOUN_CHARS,
        })}
        value={pronouns}
        onChange={(e) => setPronouns(e.target.value)}
        disabled={disabled}
      />
      <Field label={t('settings.account.timezone')} hint={t('settings.account.timezoneHint')}>
        <Select
          value={timezone}
          onChange={setTimezone}
          options={timezoneOptions}
          disabled={disabled}
        />
      </Field>
      <div className={css.saveRow}>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={disabled || !dirty}
          loading={busy}
          spinnerWhileLoading
        >
          {t('common.save')}
        </Button>
      </div>
      <ProfileStyle />
    </div>
  );
}
