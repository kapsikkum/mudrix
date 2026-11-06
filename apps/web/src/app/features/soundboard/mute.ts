import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { soundboardMutedUsersAtom } from '@/app/store/atoms/settings';
import { getSoundboardDevicePrefs, soundboardRuntime, writeStoredMutedUsers } from './runtime';

/**
 * Per-person soundboard mute. Stored as the device-only preference `soundboardMutedUsers` (a list
 * of user ids): who you silence depends on where you are listening, so it is not synced to the
 * account. Muting someone silences their soundboard clips only, not their voice.
 */

/** Whether this person's soundboard clips are muted on this device. */
export function isSoundboardMuted(userId: string): boolean {
  return getSoundboardDevicePrefs().muted.has(userId);
}

/** Mutes or unmutes a person's soundboard (flips it when `muted` is omitted). Returns the new state. */
export function toggleSoundboardMute(userId: string, muted?: boolean): boolean {
  const current = getSoundboardDevicePrefs().muted;
  const next = muted ?? !current.has(userId);
  if (next === current.has(userId)) return next;
  if (next) current.add(userId);
  else current.delete(userId);
  const ids = [...current];
  if (soundboardRuntime.setMutedUsers) soundboardRuntime.setMutedUsers(ids);
  else writeStoredMutedUsers(ids);
  return next;
}

/** The muted people, with `unmute(userId)`. For the Voice & Audio settings list. */
export function useSoundboardMutedUsers(): {
  mutedUsers: string[];
  unmute: (userId: string) => void;
} {
  const [mutedUsers, setMutedUsers] = useAtom(soundboardMutedUsersAtom);
  const unmute = useCallback(
    (userId: string) => setMutedUsers(mutedUsers.filter((id) => id !== userId)),
    [mutedUsers, setMutedUsers]
  );
  return { mutedUsers, unmute };
}

/** For a per-person menu: whether `userId` is muted for soundboard, and a toggle. */
export function useSoundboardMute(userId: string | null | undefined): {
  muted: boolean;
  toggle: () => void;
} {
  const [mutedUsers, setMutedUsers] = useAtom(soundboardMutedUsersAtom);
  const muted = !!userId && mutedUsers.includes(userId);
  const toggle = useCallback(() => {
    if (!userId) return;
    setMutedUsers(
      mutedUsers.includes(userId)
        ? mutedUsers.filter((id) => id !== userId)
        : [...mutedUsers, userId]
    );
  }, [userId, mutedUsers, setMutedUsers]);
  return { muted, toggle };
}
