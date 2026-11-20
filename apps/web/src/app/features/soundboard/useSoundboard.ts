import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { MudrixClient, SoundPack, SoundboardSound as CoreSound } from '@mudrix/core';
import { spaceGraphAtom } from '@/app/data';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { callUiAtom } from '@/app/store/atoms/call';
import { soundboardEnabledAtom } from '@/app/store/atoms/settings';
import {
  canManageSoundboard,
  evaluateSoundboardAccess,
  getCachedRoomSoundboardData,
  loadRoomSoundboardData,
  loadSoundboardPacks,
  packsToClips,
  subscribeRoomSoundboardData,
  type SoundboardAccess,
} from './boards';
import { playSoundboard } from './play';
import {
  SOUNDBOARD_MAX_SOUNDS,
  SOUNDBOARD_PACK_TYPE,
  SoundboardError,
  type PlaySoundboardResult,
  type SoundboardClip,
} from './types';
import {
  cleanSoundName,
  uniqueShortcode,
  uploadSoundFile,
  type ValidatedSoundFile,
} from './upload';

export type SoundboardTarget = 'personal' | 'room';

export interface SoundboardClipPatch {
  name?: string;
  /** '' removes the emoji. */
  emoji?: string;
}

export interface UseSoundboardResult {
  /** The "Enable soundboard" device preference. When false, hide the soundboard UI. */
  enabled: boolean;
  /** The core's built-in pack. Always available, never stored by the room. */
  builtIn: SoundboardClip[];
  /** The signed-in user's own clips (standard account data). */
  personal: SoundboardClip[];
  /** Clips of this room, the spaces it is in, and packs favourited elsewhere; each has `originRoomId`. */
  room: SoundboardClip[];
  /** Whether this room/space allows the soundboard and lets us play ('room-disabled' | 'forbidden' otherwise). */
  access: SoundboardAccess;
  /** enabled, connected to a call in this room, and allowed here. */
  canPlay: boolean;
  /** Whether we may add/edit/remove clips on this room's packs (needs the power level to send state). */
  canManageRoom: boolean;
  /** Plays a clip here and sends it to the call. See playSoundboard for the result values. */
  play: (clip: SoundboardClip) => Promise<PlaySoundboardResult>;
  /**
   * Validates (a supported audio type, at most 512 KB and 5 s), uploads through the core and saves
   * a new clip on the personal pack or this room's pack. Rejects with SoundboardError (see `code`).
   */
  addSound: (
    target: SoundboardTarget,
    file: File,
    meta: { name: string; emoji?: string },
    validated?: ValidatedSoundFile
  ) => Promise<void>;
  /** Changes a personal or room clip's name or emoji (a built-in clip cannot be edited). */
  editSound: (clip: SoundboardClip, patch: SoundboardClipPatch) => Promise<void>;
  /** Removes a personal or room clip from its pack (the uploaded file stays on the server). */
  removeSound: (clip: SoundboardClip) => Promise<void>;
}

/** The name a room's first pack gets when someone adds a sound there. */
const ROOM_PACK_NAME = 'Sounds';

/** Account data that changes the packs: the personal pack, the built-ins and the favourites. */
const PACK_ACCOUNT_TYPES = [
  'moe.crafty.soundboard',
  'org.wizardchat.soundboard_defaults',
  'moe.crafty.soundboard_rooms',
];

function requireClient(): MudrixClient {
  const client = getMatrixClientOrNull();
  if (!client) throw new SoundboardError('offline');
  return client;
}

function packNameOf(pack: SoundPack): string {
  return pack.name ?? '';
}

async function savePack(client: MudrixClient, pack: SoundPack, sounds: CoreSound[]): Promise<void> {
  try {
    if (pack.source === 'mine') {
      await client.saveSoundPack(null, '', packNameOf(pack), pack.attribution, sounds);
      return;
    }
    if (!pack.roomId || !pack.stateKey) throw new SoundboardError('forbidden');
    await client.saveSoundPack(
      pack.roomId,
      pack.stateKey,
      packNameOf(pack),
      pack.attribution,
      sounds
    );
  } catch (err) {
    if (err instanceof SoundboardError) throw err;
    throw new SoundboardError('save', err instanceof Error ? err.message : undefined);
  }
}

/**
 * Everything the soundboard UI needs for the call in `roomId`: the three clip lists from the core's
 * packs, whether the user can play, and add/edit/remove. Room state changes reload the packs; the
 * personal pack follows its account data.
 */
export function useSoundboard(roomId: string | null | undefined): UseSoundboardResult {
  const client = getMatrixClientOrNull();
  const myId = client?.userId() ?? null;
  const enabled = useAtomValue(soundboardEnabledAtom);
  const ui = useAtomValue(callUiAtom);
  const spaceGraph = useAtomValue(spaceGraphAtom);
  const [packs, setPacks] = useState<SoundPack[]>([]);
  const [revision, setRevision] = useState(0);
  const [access, setAccess] = useState<SoundboardAccess>('ok');
  const packsRef = useRef(packs);
  packsRef.current = packs;

  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  // Account data has no state-store subscription of its own; room packs are state events.
  useEffect(() => {
    if (!client) return undefined;
    const subscriptions = [
      ...PACK_ACCOUNT_TYPES.map((type) => client.watchAccountData(type, refresh)),
      client.watchStateEvents([SOUNDBOARD_PACK_TYPE], refresh),
    ];
    const unsubscribe = subscribeRoomSoundboardData(refresh);
    return () => {
      unsubscribe();
      for (const subscription of subscriptions) subscription.cancel();
    };
  }, [client, refresh]);

  useEffect(() => {
    if (!client) {
      setPacks([]);
      return undefined;
    }
    let cancelled = false;
    loadSoundboardPacks(client, roomId)
      .then((loaded) => {
        if (!cancelled) setPacks(loaded);
      })
      .catch((err) => {
        console.warn('[soundboard] could not load the packs', err);
        if (!cancelled) setPacks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, roomId, spaceGraph, revision]);

  useEffect(() => {
    if (!client || !roomId) {
      setAccess('ok');
      return undefined;
    }
    let cancelled = false;
    void loadRoomSoundboardData(client, roomId).catch(() => {});
    if (myId) {
      void evaluateSoundboardAccess(client, spaceGraph, roomId, myId)
        .then((verdict) => {
          if (!cancelled) setAccess(verdict);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [client, roomId, spaceGraph, myId, revision]);

  const clips = useMemo(() => packsToClips(packs), [packs]);

  const canManageRoom = (() => {
    if (!roomId || !myId) return false;
    // The core answers for a pack that exists; before the room has one, its power levels do.
    if (packs.some((pack) => pack.source === 'room' && pack.roomId === roomId && pack.canEdit)) {
      return true;
    }
    const data = getCachedRoomSoundboardData(roomId);
    return canManageSoundboard(data, myId, SOUNDBOARD_PACK_TYPE);
  })();

  const canPlay =
    enabled && access === 'ok' && !!roomId && ui.roomId === roomId && ui.phase === 'joined';

  const play = useCallback(
    (clip: SoundboardClip) =>
      roomId ? playSoundboard(roomId, clip) : Promise.resolve('not-in-call' as const),
    [roomId]
  );

  const packForClip = useCallback(
    async (c: MudrixClient, clip: SoundboardClip): Promise<SoundPack> => {
      if (clip.source === 'personal') return c.mySounds();
      const known = packsRef.current.find(
        (pack) =>
          pack.roomId === clip.originRoomId &&
          (!clip.packStateKey || pack.stateKey === clip.packStateKey)
      );
      if (known) return known;
      if (!clip.originRoomId) throw new SoundboardError('forbidden');
      const room = await c.roomSoundPacks(clip.originRoomId);
      const pack = room.packs.find(
        (candidate) => !clip.packStateKey || candidate.stateKey === clip.packStateKey
      );
      if (!pack) throw new SoundboardError('forbidden');
      return pack;
    },
    []
  );

  const addSound = useCallback<UseSoundboardResult['addSound']>(
    async (target, file, meta, validated) => {
      const c = requireClient();
      if (target === 'personal') {
        const pack = await c.mySounds();
        if (pack.sounds.length >= SOUNDBOARD_MAX_SOUNDS) throw new SoundboardError('limit');
        const uploaded = await uploadSoundFile(c, file, meta, validated);
        // Read again after the upload: the board may have changed meanwhile.
        const latest = await c.mySounds();
        if (latest.sounds.length >= SOUNDBOARD_MAX_SOUNDS) throw new SoundboardError('limit');
        const shortcode = uniqueShortcode(
          meta.name || uploaded.body || 'sound',
          latest.sounds.map((sound) => sound.shortcode)
        );
        await savePack(c, latest, [...latest.sounds, { ...uploaded, shortcode }]);
        refresh();
        return;
      }

      if (!roomId) throw new SoundboardError('forbidden');
      const room = await c.roomSoundPacks(roomId);
      if (!room.canEdit) throw new SoundboardError('forbidden');
      const pack = room.packs.find((candidate) => candidate.canEdit) ?? null;
      const sounds = pack?.sounds ?? [];
      if (sounds.length >= SOUNDBOARD_MAX_SOUNDS) throw new SoundboardError('limit');
      const uploaded = await uploadSoundFile(c, file, meta, validated);
      const stateKey = pack?.stateKey ?? (await c.createSoundPack(roomId, ROOM_PACK_NAME));
      // Read again after the upload: the pack may have changed meanwhile.
      const latestRoom = await c.roomSoundPacks(roomId);
      const latest = latestRoom.packs.find((candidate) => candidate.stateKey === stateKey) ?? null;
      const latestSounds = latest?.sounds ?? [];
      if (latestSounds.length >= SOUNDBOARD_MAX_SOUNDS) throw new SoundboardError('limit');
      const shortcode = uniqueShortcode(
        meta.name || uploaded.body || 'sound',
        latestSounds.map((sound) => sound.shortcode)
      );
      try {
        await c.saveSoundPack(
          roomId,
          stateKey,
          latest?.name ?? pack?.name ?? ROOM_PACK_NAME,
          latest?.attribution ?? pack?.attribution,
          [...latestSounds, { ...uploaded, shortcode }]
        );
      } catch (err) {
        throw new SoundboardError('save', err instanceof Error ? err.message : undefined);
      }
      refresh();
    },
    [roomId, refresh]
  );

  const editSound = useCallback<UseSoundboardResult['editSound']>(
    async (clip, patch) => {
      const c = requireClient();
      const pack = await packForClip(c, clip);
      if (!pack.canEdit) throw new SoundboardError('forbidden');
      await savePack(
        c,
        pack,
        pack.sounds.map((sound) => {
          if (sound.shortcode !== clip.id) return sound;
          const next = { ...sound };
          if (patch.name !== undefined) next.body = cleanSoundName(patch.name) || sound.body;
          if (patch.emoji !== undefined) next.emoji = patch.emoji.trim().slice(0, 16) || null;
          return next;
        })
      );
      refresh();
    },
    [packForClip, refresh]
  );

  const removeSound = useCallback<UseSoundboardResult['removeSound']>(
    async (clip) => {
      const c = requireClient();
      const pack = await packForClip(c, clip);
      if (!pack.canEdit) throw new SoundboardError('forbidden');
      const remaining = pack.sounds.filter((sound) => sound.shortcode !== clip.id);
      if (!remaining.length && pack.source !== 'mine' && pack.roomId && pack.stateKey) {
        try {
          await c.deleteSoundPack(pack.roomId, pack.stateKey);
        } catch (err) {
          throw new SoundboardError('save', err instanceof Error ? err.message : undefined);
        }
      } else {
        await savePack(c, pack, remaining);
      }
      refresh();
    },
    [packForClip, refresh]
  );

  return {
    enabled,
    builtIn: clips.builtIn,
    personal: clips.personal,
    room: clips.room,
    access,
    canPlay,
    canManageRoom,
    play,
    addSound,
    editSound,
    removeSound,
  };
}
