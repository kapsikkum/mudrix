import type { SpaceNode, WizardClient } from '@wizardchat/core';
import { DEFAULT_PREFERENCES } from '@/app/store/atoms/settings';
import { STORAGE_KEY_PREFERENCES } from '@/const/storageKeys';
import type { SoundboardPlayContent } from './types';

/**
 * What the plain (non-React) soundboard functions need to know about the current session. The
 * receiver hook (`useSoundboardReceiver`, mounted once in the call layer) keeps this current;
 * before it mounts, the device preferences are read straight from storage.
 */
export interface SoundboardRuntime {
  mounted: boolean;
  enabled: boolean;
  /** 0-100 */
  volume: number;
  mutedUsers: ReadonlySet<string>;
  deafened: boolean;
  /** The room of the call we are connected to, or null. */
  callRoomId: string | null;
  setMutedUsers: ((ids: string[]) => void) | null;
  client: WizardClient | null;
  /** Spaces and their rooms, to find the spaces whose boards apply in a room. */
  spaceGraph: SpaceNode[];
  /** Tells the rest of the call about a press; null outside a call. */
  send: ((content: SoundboardPlayContent) => void) | null;
}

function readStoredPrefs(): {
  enabled: boolean;
  volume: number;
  muted: string[];
} {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}') as Record<
      string,
      unknown
    >;
    const muted = raw.soundboardMutedUsers;
    return {
      enabled:
        typeof raw.soundboardEnabled === 'boolean'
          ? raw.soundboardEnabled
          : DEFAULT_PREFERENCES.soundboardEnabled,
      volume:
        typeof raw.soundboardVolume === 'number'
          ? raw.soundboardVolume
          : DEFAULT_PREFERENCES.soundboardVolume,
      muted: Array.isArray(muted) ? muted.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return {
      enabled: DEFAULT_PREFERENCES.soundboardEnabled,
      volume: DEFAULT_PREFERENCES.soundboardVolume,
      muted: [],
    };
  }
}

export const soundboardRuntime: SoundboardRuntime = {
  mounted: false,
  enabled: DEFAULT_PREFERENCES.soundboardEnabled,
  volume: DEFAULT_PREFERENCES.soundboardVolume,
  mutedUsers: new Set(),
  deafened: false,
  callRoomId: null,
  setMutedUsers: null,
  client: null,
  spaceGraph: [],
  send: null,
};

/** Current device preferences: the live values when the receiver is mounted, else from storage. */
export function getSoundboardDevicePrefs(): {
  enabled: boolean;
  volume: number;
  muted: Set<string>;
} {
  if (soundboardRuntime.mounted) {
    return {
      enabled: soundboardRuntime.enabled,
      volume: soundboardRuntime.volume,
      muted: new Set(soundboardRuntime.mutedUsers),
    };
  }
  const stored = readStoredPrefs();
  return { enabled: stored.enabled, volume: stored.volume, muted: new Set(stored.muted) };
}

/** Writes the muted list straight to storage (used only when the receiver is not mounted). */
export function writeStoredMutedUsers(ids: string[]): void {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}') as Record<
      string,
      unknown
    >;
    localStorage.setItem(
      STORAGE_KEY_PREFERENCES,
      JSON.stringify({ ...raw, soundboardMutedUsers: ids })
    );
  } catch {
    // storage unavailable
  }
}
