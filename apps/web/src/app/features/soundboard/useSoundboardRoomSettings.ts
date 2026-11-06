import { useCallback, useEffect, useState } from 'react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import {
  canManageSoundboard,
  getCachedRoomSoundboardData,
  loadRoomSoundboardData,
  subscribeRoomSoundboardData,
  writeRoomSoundboardSettings,
} from './boards';
import {
  DEFAULT_SOUNDBOARD_ROOM_SETTINGS,
  SOUNDBOARD_SETTINGS_TYPE,
  type SoundboardRoomSettings,
} from './types';

export interface UseSoundboardRoomSettingsResult {
  /** This room's (or space's) own setting; the default (on, everyone) when it never set one. */
  settings: SoundboardRoomSettings;
  /** Whether the setting has been made on this room. */
  isSet: boolean;
  /** Whether we may change it (needs the power level to send `io.github.kapsikkum.mudrix.soundboard.settings`). */
  canManage: boolean;
  /** Saves a change; rejects if the homeserver refuses. */
  update: (patch: Partial<SoundboardRoomSettings>) => Promise<void>;
}

/** The soundboard on/off switch and "who can play" level of one room or space. */
export function useSoundboardRoomSettings(roomId: string): UseSoundboardRoomSettingsResult {
  const client = getMatrixClientOrNull();
  const myId = client?.userId() ?? '';
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (client) void loadRoomSoundboardData(client, roomId, true).catch(() => {});
    return subscribeRoomSoundboardData(() => setRevision((n) => n + 1));
  }, [client, roomId]);

  const data = getCachedRoomSoundboardData(roomId);
  const explicit = data?.settings ?? null;
  const settings = explicit ?? DEFAULT_SOUNDBOARD_ROOM_SETTINGS;
  const canManage = canManageSoundboard(data, myId, SOUNDBOARD_SETTINGS_TYPE);

  const update = useCallback(
    async (patch: Partial<SoundboardRoomSettings>) => {
      const c = getMatrixClientOrNull();
      if (!c) return;
      const current =
        (await loadRoomSoundboardData(c, roomId, true)).settings ??
        DEFAULT_SOUNDBOARD_ROOM_SETTINGS;
      await writeRoomSoundboardSettings(c, roomId, { ...current, ...patch });
    },
    [roomId]
  );

  return { settings, isSet: !!explicit, canManage, update };
}
