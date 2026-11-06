import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Button } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { Field } from '@/app/components/Field';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { useExtendedProfile, useExtendedProfileMutations } from '@/app/hooks/useExtendedProfile';
import { getErrorMessage } from '@/util/error';
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

/** Account settings for MSC4133 extended profile fields: bio, pronouns, timezone. */
export function ExtendedProfile() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
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
      <Textarea
        label={t('settings.account.bio')}
        placeholder={t('settings.account.bioPlaceholder')}
        helperText={t(
          isTouchDevice() ? 'settings.account.bioHintTouch' : 'settings.account.bioHint',
          { chars: MAX_BIO_CHARS, lines: MAX_BIO_LINES }
        )}
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={MAX_BIO_CHARS}
        rows={5}
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
      />
      <Field label={t('settings.account.timezone')} hint={t('settings.account.timezoneHint')}>
        <Select value={timezone} onChange={setTimezone} options={timezoneOptions} />
      </Field>
      <div>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!dirty}
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
