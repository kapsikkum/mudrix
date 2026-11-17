import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { PlayIcon } from '@phosphor-icons/react';
import { RangeInput } from '@/app/components/Slider';
import { ToggleRow } from '@/app/components/Toggle';
import { soundboardEnabledAtom, soundboardVolumeAtom } from '@/app/store/atoms/settings';
import { useProfile } from '@/app/data';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { formatUserId } from '@/util/matrix';
import { BUILT_IN_CLIPS } from '@/app/features/soundboard/builtIn';
import { useSoundboardMutedUsers } from '@/app/features/soundboard/mute';
import { playClipLocal } from '@/app/features/soundboard/playback';
import * as layoutCss from '../Settings.css';
import * as css from './VoiceAudio.css';

function MutedUserRow({ userId, onUnmute }: { userId: string; onUnmute: () => void }) {
  const { t } = useTranslation();
  const { data: profile } = useProfile(userId);
  return (
    <div className={css.kindRow}>
      <span className={css.kindLabel}>{profile?.displayName || formatUserId(userId)}</span>
      <button type="button" className={css.button} onClick={onUnmute}>
        {t('settings.voice.soundboardUnmute')}
      </button>
    </div>
  );
}

export function SoundboardSection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useAtom(soundboardEnabledAtom);
  const [volume, setVolume] = useAtom(soundboardVolumeAtom);
  const { mutedUsers, unmute } = useSoundboardMutedUsers();
  const client = getMatrixClientOrNull();
  const sample = BUILT_IN_CLIPS[0];

  const preview = () => {
    void playClipLocal({
      client,
      senderId: client?.userId() ?? '',
      soundId: sample.id,
      name: sample.name,
      emoji: sample.emoji,
      url: sample.url,
      mimetype: sample.mimetype,
      volume: volume / 100,
      durationMs: sample.durationMs,
    });
  };

  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voice.soundboardTitle')}</h3>
      <ToggleRow
        label={t('settings.voice.soundboardEnable')}
        description={t('settings.voice.soundboardEnableNote')}
        checked={enabled}
        onChange={setEnabled}
      />
      <div className={css.soundRow}>
        <span className={css.soundLabel}>{t('settings.voice.soundboardVolume')}</span>
        <RangeInput
          max={100}
          step={5}
          value={volume}
          disabled={!enabled}
          className={css.volumeSlider}
          aria-label={t('settings.voice.soundboardVolume')}
          onChange={setVolume}
        />
        <span>{volume}%</span>
        {sample && (
          <button
            type="button"
            className={css.iconButton}
            disabled={!enabled}
            aria-label={t('settings.voice.soundboardPreview')}
            onClick={preview}
          >
            <PlayIcon size={16} weight="fill" />
          </button>
        )}
      </div>

      <h4 className={layoutCss.settingLabel}>{t('settings.voice.soundboardMuted')}</h4>
      {mutedUsers.length === 0 ? (
        <p className={layoutCss.settingNote}>{t('settings.voice.soundboardMutedNone')}</p>
      ) : (
        <>
          <p className={layoutCss.settingNote}>{t('settings.voice.soundboardMutedNote')}</p>
          <div>
            {mutedUsers.map((userId) => (
              <MutedUserRow key={userId} userId={userId} onUnmute={() => unmute(userId)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
