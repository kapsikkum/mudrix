import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { ArrowCounterClockwiseIcon, PlayIcon } from '@phosphor-icons/react';
import { Select } from '@/app/components/Select';
import { RangeInput } from '@/app/components/Slider';
import {
  notificationSoundPackAtom,
  notificationSoundVolumeAtom,
  soundOverridesAtom,
} from '@/app/store/atoms';
import {
  SOUND_KINDS,
  SOUND_PACKS,
  getSoundPack,
  soundPackOptions,
  previewSound,
  resolveSoundPack,
  type SoundKind,
} from '@/util/notificationSounds';
import * as layoutCss from '../Settings.css';
import * as css from './VoiceAudio.css';

const KIND_LABELS: Record<SoundKind, string> = {
  message: 'settings.voice.sound.message',
  mention: 'settings.voice.sound.mention',
  ring: 'settings.voice.sound.ring',
  ringback: 'settings.voice.sound.ringback',
  callend: 'settings.voice.sound.callend',
  mute: 'settings.voice.sound.mute',
  unmute: 'settings.voice.sound.unmute',
  'camera-on': 'settings.voice.sound.cameraOn',
  join: 'settings.voice.sound.join',
  leave: 'settings.voice.sound.leave',
  'camera-off': 'settings.voice.sound.cameraOff',
  moved: 'settings.voice.sound.moved',
  'watch-together-start': 'settings.voice.sound.watchTogetherStart',
};

const SAME = '';
const OFF = 'off';

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
  // A pack that no longer exists (it was removed) reads as the default.
  const known = (id: string | undefined) => (SOUND_PACKS.some((p) => p.id === id) ? id : undefined);

  const hasOverrides = SOUND_KINDS.some((kind) => overrides[kind]);

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
          className={css.button}
          onClick={() => previewSound('message', soundPack, soundVolume)}
        >
          {t('settings.voice.soundPreview')}
        </button>
      </div>
      <div className={css.soundRow}>
        <span className={css.soundLabel}>{t('settings.voice.soundVolume')}</span>
        <RangeInput
          max={100}
          step={5}
          value={soundVolume}
          className={css.volumeSlider}
          aria-label={t('settings.voice.soundVolume')}
          onChange={setSoundVolume}
        />
        <span>{soundVolume}%</span>
      </div>

      <p className={layoutCss.settingNote}>{t('settings.voice.soundsNote')}</p>
      <div>
        {SOUND_KINDS.map((kind) => {
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
                className={css.iconButton}
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
        <div className={css.buttonRow}>
          <button type="button" className={css.button} onClick={() => setOverrides({})}>
            <ArrowCounterClockwiseIcon size={16} />
            {t('settings.voice.resetSounds')}
          </button>
        </div>
      )}
    </div>
  );
}
