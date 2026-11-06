import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { ArrowCounterClockwiseIcon, PlayIcon } from '@phosphor-icons/react';
import { Select } from '@/app/components/Select';
import { Slider } from '@/app/components/Slider';
import {
  notificationSoundPackAtom,
  notificationSoundVolumeAtom,
  soundOverridesAtom,
} from '@/app/store/atoms';
import {
  PLAYED_SOUND_KINDS,
  SOUND_PACKS,
  getSoundPack,
  previewSound,
  resolveSoundPack,
  soundPackOptions,
  type SoundKind,
} from '@/util/notificationSounds';
import * as layoutCss from '../Settings.css';
import * as css from './Notifications.css';

const KIND_LABELS: Record<SoundKind, string> = {
  message: 'settings.voice.sound.message',
  mention: 'settings.voice.sound.mention',
  ring: 'settings.voice.sound.ring',
  ringback: 'settings.voice.sound.ringback',
  callend: 'settings.voice.sound.callend',
  mute: 'settings.voice.sound.mute',
  unmute: 'settings.voice.sound.unmute',
  'camera-on': 'settings.voice.sound.cameraOn',
  'camera-off': 'settings.voice.sound.cameraOff',
  join: 'settings.voice.sound.join',
  leave: 'settings.voice.sound.leave',
  moved: 'settings.voice.sound.moved',
  'watch-together-start': 'settings.voice.sound.watchTogetherStart',
};

const VOLUME_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const SAME = '';
const OFF = 'off';

/** The sound pack, the volume, and a pack (or off) for each sound on its own. */
export function SoundsSection() {
  const { t } = useTranslation();
  const [soundPack, setSoundPack] = useAtom(notificationSoundPackAtom);
  const [soundVolume, setSoundVolume] = useAtom(notificationSoundVolumeAtom);
  const [overrides, setOverrides] = useAtom(soundOverridesAtom);

  const setOverride = (kind: SoundKind, value: string) => {
    const next = { ...overrides };
    if (value === SAME) delete next[kind];
    else next[kind] = value;
    setOverrides(next);
  };

  const packOptions = soundPackOptions((c) => t(`settings.voice.packGroup.${c}`));
  const known = (id: string | undefined) => (SOUND_PACKS.some((p) => p.id === id) ? id : undefined);
  const hasOverrides = PLAYED_SOUND_KINDS.some((kind) => overrides[kind]);

  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voice.soundsTitle')}</h3>
      <div className={css.soundRow}>
        <span className={css.soundLabel}>{t('settings.voice.soundPack')}</span>
        <div className={css.soundSelect}>
          <Select
            value={getSoundPack(soundPack).id}
            aria-label={t('settings.voice.soundPack')}
            options={packOptions}
            onChange={setSoundPack}
          />
        </div>
        <button
          type="button"
          className={css.soundButton}
          onClick={() => previewSound('message', soundPack, soundVolume)}
        >
          {t('settings.voice.soundPreview')}
        </button>
      </div>
      <div className={css.soundRow}>
        <span className={css.soundLabel}>{t('settings.voice.soundVolume')}</span>
        <Slider
          value={soundVolume}
          stops={VOLUME_STOPS}
          format={(v) => `${v}%`}
          aria-label={t('settings.voice.soundVolume')}
          onChange={setSoundVolume}
        />
      </div>

      <p className={layoutCss.settingNote}>{t('settings.voice.soundsNote')}</p>
      <div>
        {PLAYED_SOUND_KINDS.map((kind) => {
          const resolved = resolveSoundPack(kind, soundPack, overrides);
          const label = t(KIND_LABELS[kind]);
          return (
            <div key={kind} className={css.kindRow}>
              <span className={css.kindLabel}>{label}</span>
              <div className={css.kindSelect}>
                <Select
                  value={overrides[kind] === OFF ? OFF : (known(overrides[kind]) ?? SAME)}
                  aria-label={label}
                  options={[
                    {
                      value: SAME,
                      label: t('settings.voice.soundSame', { pack: getSoundPack(soundPack).name }),
                    },
                    ...packOptions,
                    { value: OFF, label: t('settings.voice.soundOff') },
                  ]}
                  onChange={(v) => setOverride(kind, v)}
                />
              </div>
              <button
                type="button"
                className={css.soundButton}
                disabled={!resolved}
                aria-label={t('settings.voice.playSound', { sound: label })}
                onClick={() => resolved && previewSound(kind, resolved, soundVolume)}
              >
                <PlayIcon size={16} weight="fill" />
              </button>
            </div>
          );
        })}
      </div>
      {hasOverrides && (
        <div className={css.resetRow}>
          <button type="button" className={css.soundButton} onClick={() => setOverrides({})}>
            <ArrowCounterClockwiseIcon size={16} />
            {t('settings.voice.resetSounds')}
          </button>
        </div>
      )}
    </div>
  );
}
