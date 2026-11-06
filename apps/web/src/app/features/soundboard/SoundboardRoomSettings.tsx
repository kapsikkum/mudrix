import { useTranslation } from 'react-i18next';
import { Select } from '@/app/components/Select';
import { ToggleRow } from '@/app/components/Toggle';
import { useToast } from '@/app/hooks/useToast';
import * as css from '@/app/components/Settings/Settings.css';
import { getErrorMessage } from '@/util/error';
import { SOUNDBOARD_MODERATOR_LEVEL } from './types';
import { useSoundboardRoomSettings } from './useSoundboardRoomSettings';

/**
 * Room / space settings section: turn the soundboard on or off for the room (or every room in the
 * space) and choose who may play. Rendered in the General panels of room and space settings.
 */
export function SoundboardRoomSettings({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings, canManage, update } = useSoundboardRoomSettings(roomId);

  const save = (patch: Parameters<typeof update>[0]) => {
    update(patch).catch((err) =>
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }))
    );
  };

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('soundboard.room.title')}</h3>
      <ToggleRow
        label={t('soundboard.room.enabled')}
        description={t('soundboard.room.enabledNote')}
        checked={settings.enabled}
        onChange={(enabled) => save({ enabled })}
        disabled={!canManage}
      />
      <div className={css.settingRow}>
        <div className={css.settingInfo}>
          <span className={css.settingLabel}>{t('soundboard.room.whoCanPlay')}</span>
          <span className={css.settingNote}>{t('soundboard.room.whoCanPlayNote')}</span>
        </div>
        <Select
          aria-label={t('soundboard.room.whoCanPlay')}
          value={settings.minPowerLevel >= SOUNDBOARD_MODERATOR_LEVEL ? 'moderators' : 'everyone'}
          disabled={!canManage || !settings.enabled}
          options={[
            { value: 'everyone', label: t('soundboard.room.everyone') },
            { value: 'moderators', label: t('soundboard.room.moderators') },
          ]}
          onChange={(v) =>
            save({ minPowerLevel: v === 'moderators' ? SOUNDBOARD_MODERATOR_LEVEL : 0 })
          }
        />
      </div>
    </div>
  );
}
