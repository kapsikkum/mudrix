import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { MusicNoteIcon, MusicNotesIcon } from '@phosphor-icons/react';
import { IconButton } from '@/app/components/Button';
import { Tooltip } from '@/app/components/Tooltip';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { soundboardEnabledAtom } from '@/app/store/atoms/settings';
import { useSoundboardMute } from './mute';
import { soundboardPlayingAtom, type SoundboardPlayingEntry } from './playing';
import * as css from './SoundboardPanel.css';

/** The clip this person is playing right now (the newest), or null. */
export function useSoundboardPlayingFor(
  userId: string | null | undefined
): SoundboardPlayingEntry | null {
  const playing = useAtomValue(soundboardPlayingAtom);
  if (!userId) return null;
  for (let i = playing.length - 1; i >= 0; i -= 1) {
    if (playing[i].senderId === userId) return playing[i];
  }
  return null;
}

/** A music note with a slash through it. */
export function SoundboardMutedIcon({ size = 12 }: { size?: number }) {
  return (
    <span className={css.mutedIcon} aria-hidden="true">
      <MusicNoteIcon size={size} weight="fill" />
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        style={{ position: 'absolute', inset: 0 }}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M2 2 L14 14" />
      </svg>
    </span>
  );
}

/** Next to a name: shown while this person's soundboard is muted on this device. */
export function SoundboardMutedBadge({ userId }: { userId: string | null | undefined }) {
  const { t } = useTranslation();
  const { muted } = useSoundboardMute(userId);
  if (!muted) return null;
  return (
    <span title={t('soundboard.person.mutedBadge')} data-soundboard-muted-badge>
      <SoundboardMutedIcon size={12} />
    </span>
  );
}

/** Small chip with the name of the clip this person is playing; nothing when they play none. */
export function SoundboardPlayingChip({ userId }: { userId: string | null | undefined }) {
  const { t } = useTranslation();
  const entry = useSoundboardPlayingFor(userId);
  if (!entry) return null;
  return (
    <span
      className={css.chip}
      role="status"
      aria-label={t('soundboard.person.playing', { name: entry.name })}
      data-soundboard-chip
    >
      <MusicNotesIcon size={10} weight="fill" />
      <span className={css.chipText}>
        {entry.emoji ? `${entry.emoji} ` : ''}
        {entry.name}
      </span>
    </span>
  );
}

/**
 * The same chip for a call tile. Call tiles live in the call's own document, whose stylesheet
 * does not reach this one, so it is styled inline.
 */
export function SoundboardTileChip({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const entry = useSoundboardPlayingFor(userId);
  if (!entry) return null;
  return (
    <div
      role="status"
      aria-label={t('soundboard.person.playing', { name: entry.name })}
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 3,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        maxWidth: 'calc(100% - 16px)',
        padding: '2px 8px',
        borderRadius: 999,
        background: 'rgba(0,0,0,.65)',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: '16px',
        pointerEvents: 'none',
      }}
    >
      <span aria-hidden="true">{entry.emoji || '🔊'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.name}
      </span>
    </div>
  );
}

/** Profile card action: mute or unmute this person's soundboard clips (device-only). */
export function SoundboardMuteButton({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const enabled = useAtomValue(soundboardEnabledAtom);
  const { muted, toggle } = useSoundboardMute(userId);
  if (!enabled || getMatrixClientOrNull()?.userId() === userId) return null;
  const label = muted ? t('soundboard.person.unmute') : t('soundboard.person.mute');
  return (
    <Tooltip content={label}>
      <IconButton
        size="xs"
        danger={!muted}
        onClick={toggle}
        aria-label={label}
        aria-pressed={muted}
        data-soundboard-mute
      >
        {muted ? <MusicNotesIcon size={14} /> : <SoundboardMutedIcon size={14} />}
      </IconButton>
    </Tooltip>
  );
}
