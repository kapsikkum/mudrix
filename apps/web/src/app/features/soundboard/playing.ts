import { atom } from 'jotai';

/** A clip that is playing on this device right now. */
export interface SoundboardPlayingEntry {
  /** Unique per play. */
  key: string;
  senderId: string;
  soundId: string;
  name: string;
  emoji?: string;
  startedAt: number;
  durationMs: number;
}

let entries: SoundboardPlayingEntry[] = [];
const listeners = new Set<(list: SoundboardPlayingEntry[]) => void>();

function emit(): void {
  listeners.forEach((fn) => fn(entries));
}

export function getSoundboardPlaying(): SoundboardPlayingEntry[] {
  return entries;
}

/** Subscribe to changes of the playing list; returns the unsubscribe function. */
export function subscribeSoundboardPlaying(
  listener: (list: SoundboardPlayingEntry[]) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addSoundboardPlaying(entry: SoundboardPlayingEntry): void {
  entries = [...entries, entry];
  emit();
}

export function removeSoundboardPlaying(key: string): void {
  if (!entries.some((e) => e.key === key)) return;
  entries = entries.filter((e) => e.key !== key);
  emit();
}

export function clearSoundboardPlaying(): void {
  if (entries.length === 0) return;
  entries = [];
  emit();
}

/**
 * Who is playing which clip right now (read-only; entries clear when the clip ends). Includes our
 * own presses. Use `useAtomValue(soundboardPlayingAtom)`, or `subscribeSoundboardPlaying` outside React.
 */
export const soundboardPlayingAtom = atom<SoundboardPlayingEntry[]>([]);
soundboardPlayingAtom.onMount = (set) => {
  set(entries);
  return subscribeSoundboardPlaying(set);
};
