import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { ArrowLeftIcon, PlayIcon, StopIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react';
import type { MudrixClient, SoundPack, SoundboardSound } from '@mudrix/core';
import { soundboardEmoji } from '@/call/soundboard';
import { emojiPickerAtom } from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Button, IconButton } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Tooltip } from '@/app/components/Tooltip';
import { SOUNDBOARD_MAX_NAME_LENGTH, SOUNDBOARD_MAX_SOUNDS, SoundboardError } from './types';
import { cleanSoundName, SOUNDBOARD_FILE_ACCEPT, uniqueShortcode, uploadSoundFile } from './upload';
import * as packCss from '@/app/features/room/roomsettings/RoomSettingsEmojiSticker.css';
import * as panelCss from '@/app/components/Settings/Settings.css';
import * as css from './SoundPackEditor.css';

/** The editor's error text: our own failure codes are translated, anything else is shown as is. */
function soundError(t: ReturnType<typeof useTranslation>['t'], error: unknown): string {
  if (error instanceof SoundboardError) return t(`soundboard.error.${error.code}`);
  return getErrorMessage(error);
}

/** Plays one clip from the pack while the editor is open. */
function usePreview(client: MudrixClient) {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    audio.current?.pause();
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
    audio.current = null;
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = async (sound: SoundboardSound) => {
    const same = playing === sound.url;
    stop();
    if (same) return;
    setPlaying(sound.url);
    try {
      const data = await client.soundboardSound(sound.url);
      const element = new Audio(
        URL.createObjectURL(new Blob([data as BlobPart], { type: sound.mimetype || 'audio/mpeg' }))
      );
      audio.current = element;
      element.onended = stop;
      element.onerror = stop;
      await element.play();
    } catch {
      stop();
    }
  };

  return { playing, toggle };
}

function EmojiButton({
  client,
  sound,
  disabled,
  onPick,
}: {
  client: MudrixClient;
  sound: SoundboardSound;
  disabled: boolean;
  onPick: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  const [picker, setPicker] = useAtom(emojiPickerAtom);

  return (
    <button
      type="button"
      className={css.emojiBtn}
      disabled={disabled}
      aria-label={t('settings.soundboard.emoji')}
      title={t('settings.soundboard.emoji')}
      onClick={(event) => {
        if (picker) {
          setPicker(null);
          return;
        }
        setPicker({
          anchor: event.currentTarget,
          client,
          roomId: '',
          onPick: (emoji, mxcUrl) => {
            if (!mxcUrl) onPick(emoji);
            setPicker(null);
          },
        });
      }}
    >
      {soundboardEmoji(sound.shortcode, sound.emoji)}
    </button>
  );
}

interface SoundPackEditorProps {
  client: MudrixClient;
  pack: SoundPack;
  onSave: (name: string, attribution: string, sounds: SoundboardSound[]) => Promise<void>;
  onBack: () => void;
}

/**
 * Edits one sound pack: its name and attribution, and the clips in it. Uploaded clips are checked
 * and stored by the core (`uploadSound`); `onSave` writes the whole pack back.
 */
export function SoundPackEditor({ client, pack, onSave, onBack }: SoundPackEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(pack.name ?? '');
  const [attribution, setAttribution] = useState(pack.attribution ?? '');
  const [sounds, setSounds] = useState<SoundboardSound[]>(pack.sounds);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const preview = usePreview(client);
  const title = pack.name || t('settings.soundboard.defaultPack');

  const update = (index: number, patch: Partial<SoundboardSound>) =>
    setSounds((prev) => prev.map((sound, i) => (i === index ? { ...sound, ...patch } : sound)));

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    const added: SoundboardSound[] = [];
    let failure: string | null = null;
    let count = sounds.length;
    for (const file of files) {
      if (count >= SOUNDBOARD_MAX_SOUNDS) {
        failure = t('soundboard.error.limit');
        break;
      }
      try {
        const body = cleanSoundName(file.name.replace(/\.[^.]+$/, ''));
        const uploaded = await uploadSoundFile(client, file, { name: body });
        added.push({ ...uploaded, shortcode: '', body });
        count += 1;
      } catch (error) {
        failure = soundError(t, error);
      }
    }
    if (added.length > 0) setSounds((prev) => [...prev, ...added]);
    if (failure) toast.error(failure);
    setUploading(false);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const used = new Set<string>();
      const named = sounds.map((sound) => {
        const shortcode = uniqueShortcode(sound.body || sound.shortcode || 'sound', used);
        used.add(shortcode);
        return {
          ...sound,
          shortcode,
          body: sound.body?.trim() || null,
          emoji: sound.emoji?.trim() || null,
        };
      });
      await onSave(name.trim(), attribution.trim(), named);
    } catch (error) {
      toast.error(soundError(t, error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={packCss.editorTitle}>
        <IconButton
          size="sm"
          onClick={onBack}
          aria-label={t('common.back')}
          tooltip={t('common.back')}
        >
          <ArrowLeftIcon size={16} />
        </IconButton>
        <span>{title}</span>
      </div>

      <div className={panelCss.divider} />

      <div className={packCss.editorSection}>
        <Input
          label={t('settings.soundboard.packName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('settings.soundboard.packNamePlaceholder')}
          maxLength={64}
        />
        <Input
          label={t('settings.soundboard.attribution')}
          value={attribution}
          onChange={(event) => setAttribution(event.target.value)}
          placeholder={t('settings.soundboard.attributionPlaceholder')}
          maxLength={200}
        />
      </div>

      <div className={panelCss.divider} />

      <div className={packCss.editorSection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={panelCss.settingLabel}>
            {t('settings.soundboard.sounds')} ({sounds.length})
          </span>
          <Button
            variant="secondary"
            size="sm"
            loading={uploading}
            disabled={sounds.length >= SOUNDBOARD_MAX_SOUNDS}
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimpleIcon size={14} />
            {t('settings.soundboard.addSounds')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={SOUNDBOARD_FILE_ACCEPT}
            className={panelCss.hiddenInput}
            multiple
            onChange={(event) => {
              void upload(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>
        <p className={panelCss.settingNote}>{t('settings.soundboard.limits')}</p>

        {sounds.length === 0 ? (
          <div className={packCss.emptyPacks}>{t('settings.soundboard.noSounds')}</div>
        ) : (
          <div className={packCss.imageGrid}>
            {sounds.map((sound, index) => {
              const isPlaying = preview.playing === sound.url;
              const label = sound.body || sound.shortcode;
              return (
                <div key={`${sound.url}-${index}`} className={`${packCss.imageCard} ${css.card}`}>
                  <Tooltip
                    content={
                      isPlaying
                        ? t('settings.soundboard.stopPreview')
                        : t('settings.soundboard.preview')
                    }
                  >
                    <button
                      type="button"
                      className={isPlaying ? `${css.playBtn} ${css.playing}` : css.playBtn}
                      onClick={() => void preview.toggle(sound)}
                      aria-label={
                        isPlaying
                          ? t('settings.soundboard.stopPreview')
                          : t('settings.soundboard.preview')
                      }
                    >
                      {isPlaying ? (
                        <StopIcon size={12} weight="fill" />
                      ) : (
                        <PlayIcon size={12} weight="fill" />
                      )}
                    </button>
                  </Tooltip>
                  <Tooltip content={t('settings.soundboard.removeSound', { name: label })}>
                    <button
                      type="button"
                      className={packCss.imageRemoveBtn}
                      onClick={() => setSounds((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={t('settings.soundboard.removeSound', { name: label })}
                    >
                      <XIcon size={12} weight="bold" />
                    </button>
                  </Tooltip>
                  <EmojiButton
                    client={client}
                    sound={sound}
                    disabled={false}
                    onPick={(emoji) => update(index, { emoji })}
                  />
                  <input
                    className={css.nameInput}
                    value={sound.body ?? ''}
                    placeholder={t('settings.soundboard.name')}
                    maxLength={SOUNDBOARD_MAX_NAME_LENGTH}
                    aria-label={t('settings.soundboard.name')}
                    onChange={(event) => update(index, { body: event.target.value })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={packCss.actions}>
        <Button variant="secondary" onClick={onBack}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          loading={saving}
          spinnerWhileLoading
          onClick={() => void save()}
          disabled={uploading || !name.trim()}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
