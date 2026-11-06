import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { useAccountData, spaceGraphAtom } from '@/app/data';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { callUiAtom } from '@/app/store/atoms/call';
import { soundboardEnabledAtom } from '@/app/store/atoms/settings';
import { legacyTypeOf } from '@/util/namespace';
import {
  canManageSoundboard,
  evaluateSoundboardAccess,
  getCachedRoomSoundboardData,
  loadRoomClips,
  loadRoomSoundboardData,
  parsePersonalBoard,
  readPersonalBoard,
  subscribeRoomSoundboardData,
  writePersonalBoard,
  writeRoomBoard,
  type SoundboardAccess,
} from './boards';
import { BUILT_IN_CLIPS } from './builtIn';
import { playSoundboard } from './play';
import {
  SOUNDBOARD_DATA_TYPE,
  SOUNDBOARD_MAX_SOUNDS,
  SoundboardError,
  type PlaySoundboardResult,
  type SoundboardClip,
  type SoundboardSound,
} from './types';
import { cleanSoundName, uploadSoundFile, type ValidatedSoundFile } from './upload';

export type SoundboardTarget = 'personal' | 'room';

export interface SoundboardClipPatch {
  name?: string;
  /** '' removes the emoji. */
  emoji?: string;
  /** 0..1 */
  volume?: number;
}

export interface UseSoundboardResult {
  /** The "Enable soundboard" device preference. When false, hide the soundboard UI. */
  enabled: boolean;
  /** Bundled clips. Always available, never stored. */
  builtIn: readonly SoundboardClip[];
  /** The signed-in user's own clips (account data). */
  personal: SoundboardClip[];
  /** Clips of this room and the spaces it is in; each has `originRoomId`. */
  room: SoundboardClip[];
  /** Whether this room/space allows the soundboard and lets us play ('room-disabled' | 'forbidden' otherwise). */
  access: SoundboardAccess;
  /** enabled, connected to a call in this room, and allowed here. */
  canPlay: boolean;
  /** Whether we may add/edit/remove clips on this room's board (needs the power level to send state). */
  canManageRoom: boolean;
  /** Plays a clip here and sends it to the call. See playSoundboard for the result values. */
  play: (clip: SoundboardClip) => Promise<PlaySoundboardResult>;
  /**
   * Validates (mp3/ogg/wav, at most 512 KB and 5 s), uploads and saves a new clip to the personal
   * board or to this room's board. Rejects with SoundboardError (see `code`).
   */
  addSound: (
    target: SoundboardTarget,
    file: File,
    meta: { name: string; emoji?: string; volume?: number },
    validated?: ValidatedSoundFile
  ) => Promise<SoundboardSound>;
  /** Changes a personal or room clip's name, emoji or volume (a built-in clip cannot be edited). */
  editSound: (clip: SoundboardClip, patch: SoundboardClipPatch) => Promise<void>;
  /** Removes a personal or room clip from its board (the uploaded file stays on the server). */
  removeSound: (clip: SoundboardClip) => Promise<void>;
}

function requireClient(): WizardClient {
  const client = getMatrixClientOrNull();
  if (!client) throw new SoundboardError('offline');
  return client;
}

/**
 * Everything the soundboard UI needs for the call in `roomId`: the three clip lists, whether the
 * user can play, and add/edit/remove. The personal list updates live with account data; the room
 * lists when the room's board is loaded or changed.
 */
export function useSoundboard(roomId: string | null | undefined): UseSoundboardResult {
  const client = getMatrixClientOrNull();
  const myId = client?.userId() ?? null;
  const enabled = useAtomValue(soundboardEnabledAtom);
  const ui = useAtomValue(callUiAtom);
  const spaceGraph = useAtomValue(spaceGraphAtom);
  const personalContent = useAccountData(SOUNDBOARD_DATA_TYPE);
  const legacyPersonalContent = useAccountData(legacyTypeOf(SOUNDBOARD_DATA_TYPE));
  const [revision, setRevision] = useState(0);
  const [room, setRoom] = useState<SoundboardClip[]>([]);
  const [access, setAccess] = useState<SoundboardAccess>('ok');

  const personal = useMemo<SoundboardClip[]>(
    () =>
      parsePersonalBoard(personalContent, legacyPersonalContent).map((s) => ({
        ...s,
        source: 'personal' as const,
      })),
    [personalContent, legacyPersonalContent]
  );

  useEffect(() => subscribeRoomSoundboardData(() => setRevision((n) => n + 1)), []);

  // Opening the soundboard looks at the room again; a change by someone else shows after 30 seconds.
  useEffect(() => {
    if (!client || !roomId) return;
    void loadRoomSoundboardData(client, roomId, true).catch(() => {});
  }, [client, roomId]);

  useEffect(() => {
    if (!client || !roomId) {
      setRoom([]);
      setAccess('ok');
      return undefined;
    }
    let cancelled = false;
    void loadRoomClips(client, spaceGraph, roomId)
      .then((clips) => !cancelled && setRoom(clips))
      .catch(() => {});
    if (myId) {
      void evaluateSoundboardAccess(client, spaceGraph, roomId, myId)
        .then((verdict) => !cancelled && setAccess(verdict))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [client, roomId, spaceGraph, myId, revision]);

  const canManageRoom = useMemo(
    () =>
      !!roomId &&
      !!myId &&
      canManageSoundboard(getCachedRoomSoundboardData(roomId), myId, SOUNDBOARD_DATA_TYPE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId, myId, revision]
  );
  const canPlay =
    enabled && access === 'ok' && !!roomId && ui.roomId === roomId && ui.phase === 'joined';

  const play = useCallback(
    (clip: SoundboardClip) =>
      roomId ? playSoundboard(roomId, clip) : Promise.resolve('not-in-call' as const),
    [roomId]
  );

  const addSound = useCallback<UseSoundboardResult['addSound']>(
    async (target, file, meta, validated) => {
      const c = requireClient();
      if (target === 'room') {
        if (!roomId) throw new SoundboardError('forbidden');
        const data = await loadRoomSoundboardData(c, roomId, true);
        if (!c.userId() || !canManageSoundboard(data, c.userId()!)) {
          throw new SoundboardError('forbidden');
        }
        if (data.board.length >= SOUNDBOARD_MAX_SOUNDS) throw new SoundboardError('limit');
      } else if ((await readPersonalBoard(c)).length >= SOUNDBOARD_MAX_SOUNDS) {
        throw new SoundboardError('limit');
      }
      const sound = await uploadSoundFile(c, file, meta, validated);
      // Read again after the upload: the board may have changed meanwhile.
      if (target === 'room' && roomId) {
        const data = await loadRoomSoundboardData(c, roomId, true);
        await writeRoomBoard(c, roomId, [...data.board, sound]);
      } else {
        await writePersonalBoard(c, [...(await readPersonalBoard(c)), sound]);
      }
      return sound;
    },
    [roomId]
  );

  const updateBoard = useCallback(
    async (clip: SoundboardClip, change: (sounds: SoundboardSound[]) => SoundboardSound[]) => {
      const c = requireClient();
      if (clip.source === 'personal') {
        await writePersonalBoard(c, change(await readPersonalBoard(c)));
      } else if (clip.source === 'room' && clip.originRoomId) {
        const data = await loadRoomSoundboardData(c, clip.originRoomId, true);
        await writeRoomBoard(c, clip.originRoomId, change(data.board));
      } else {
        throw new SoundboardError('forbidden');
      }
    },
    []
  );

  const editSound = useCallback<UseSoundboardResult['editSound']>(
    (clip, patch) =>
      updateBoard(clip, (sounds) =>
        sounds.map((s) => {
          if (s.id !== clip.id) return s;
          const next = { ...s };
          if (patch.name !== undefined) next.name = cleanSoundName(patch.name) || s.name;
          if (patch.emoji !== undefined) next.emoji = patch.emoji.trim().slice(0, 16) || undefined;
          if (patch.volume !== undefined) next.volume = Math.min(1, Math.max(0, patch.volume));
          return next;
        })
      ),
    [updateBoard]
  );

  const removeSound = useCallback<UseSoundboardResult['removeSound']>(
    (clip) => updateBoard(clip, (sounds) => sounds.filter((s) => s.id !== clip.id)),
    [updateBoard]
  );

  return {
    enabled,
    builtIn: BUILT_IN_CLIPS,
    personal,
    room,
    access,
    canPlay,
    canManageRoom,
    play,
    addSound,
    editSound,
    removeSound,
  };
}
