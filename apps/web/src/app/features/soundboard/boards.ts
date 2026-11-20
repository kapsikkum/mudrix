import type {
  MudrixClient,
  SoundPack,
  SpaceNode,
  SoundboardSound as CoreSound,
} from '@mudrix/core';
import { canSendState, parentSpacesOf, powerLevelOf } from '@/app/data';
import {
  getMudrixRoomState,
  loadMudrixRoomState,
  setMudrixRoomState,
  subscribeMudrixRoomState,
} from '@/app/features/space/mudrixRoomState';
import type { MudrixRoomState } from '@/app/features/space/mudrixStateEntries';
import { normalizeMimetype } from './builtIn';
import {
  DEFAULT_SOUNDBOARD_ROOM_SETTINGS,
  SOUNDBOARD_SETTINGS_TYPE,
  type SoundboardClip,
  type SoundboardRoomSettings,
} from './types';

/** The clips the panel shows, split the way it lists them. */
export interface SoundboardClips {
  builtIn: SoundboardClip[];
  personal: SoundboardClip[];
  room: SoundboardClip[];
}

/** The core's built-in pack has no display names; these are the ones the UI shows. */
const BUILT_IN_NAMES: Record<string, string> = {
  applause: 'Applause',
  laugh: 'Laughter',
  rimshot: 'Ba-dum-tss',
  drumroll: 'Drum roll',
  tada: 'Ta-da',
  airhorn: 'Air horn',
  crickets: 'Crickets',
  sad_trombone: 'Sad trombone',
};

function clipOf(
  pack: SoundPack,
  sound: CoreSound,
  source: SoundboardClip['source']
): SoundboardClip {
  return {
    id: sound.shortcode,
    name:
      sound.body?.trim() ||
      (pack.source === 'builtIn' ? BUILT_IN_NAMES[sound.shortcode] : undefined) ||
      sound.shortcode,
    emoji: sound.emoji ?? undefined,
    url: sound.url,
    mimetype: normalizeMimetype(sound.mimetype) ?? 'audio/mpeg',
    durationMs: sound.durationMs ?? 0,
    size: sound.size ?? 0,
    source,
    originRoomId: pack.roomId ?? undefined,
    packStateKey: pack.stateKey ?? undefined,
    packName: pack.name ?? undefined,
    packAttribution: pack.attribution ?? undefined,
  };
}

/**
 * Maps the core's packs onto the panel's clip lists: the built-in pack, the person's own pack, and
 * every room, space and favourited pack that applies in the call's room (each keeps its origin so
 * an edit goes back to the right pack).
 */
export function packsToClips(packs: SoundPack[]): SoundboardClips {
  const clips: SoundboardClips = { builtIn: [], personal: [], room: [] };
  for (const pack of packs) {
    if (pack.source === 'frequent') continue;
    if (pack.source === 'builtIn') {
      clips.builtIn.push(...pack.sounds.map((sound) => clipOf(pack, sound, 'builtIn')));
      continue;
    }
    if (pack.source === 'mine') {
      clips.personal.push(...pack.sounds.map((sound) => clipOf(pack, sound, 'personal')));
      continue;
    }
    clips.room.push(...pack.sounds.map((sound) => clipOf(pack, sound, 'room')));
  }
  return clips;
}

/** The built-in, personal and room/space packs that apply in `roomId`. */
export async function loadSoundboardPacks(
  client: MudrixClient,
  roomId: string | null | undefined
): Promise<SoundPack[]> {
  return client.soundboardPacks(roomId ?? null);
}

// ---- Room settings (ours, not part of MSC4577) ----------------------------------------------

/** What a room or space says about the soundboard, with who may do what in it. */
export interface RoomSoundboardData {
  /** The room's own setting, or null when it never set one. */
  settings: SoundboardRoomSettings | null;
  /** The room's `m.room.power_levels` content and creators, for the checks below. */
  powerLevels: Record<string, unknown> | undefined;
  creators: string[];
}

/** The power levels and creators last seen for a room (power levels are read from local state). */
const permissions = new Map<
  string,
  { powerLevels: Record<string, unknown> | undefined; creators: string[] }
>();

function sanitizeSettings(raw: unknown): SoundboardRoomSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const enabled = typeof c.enabled === 'boolean' ? c.enabled : null;
  const level =
    typeof c.minPowerLevel === 'number' && Number.isFinite(c.minPowerLevel)
      ? c.minPowerLevel
      : null;
  if (enabled === null && level === null) return null;
  return {
    enabled: enabled ?? DEFAULT_SOUNDBOARD_ROOM_SETTINGS.enabled,
    minPowerLevel: level ?? DEFAULT_SOUNDBOARD_ROOM_SETTINGS.minPowerLevel,
  };
}

function dataFrom(roomId: string, state: MudrixRoomState | null): RoomSoundboardData | undefined {
  const perms = permissions.get(roomId);
  if (!state && !perms) return undefined;
  return {
    settings: sanitizeSettings(state?.get(SOUNDBOARD_SETTINGS_TYPE)),
    powerLevels: perms?.powerLevels,
    creators: perms?.creators ?? [],
  };
}

/**
 * The room's settings and power levels. The state comes from the Mudrix state store, which the
 * core's events keep current, so there is nothing to refresh; `force` is accepted for callers that
 * used to ask for a fresh read.
 */
export async function loadRoomSoundboardData(
  client: MudrixClient,
  roomId: string,
  _force = false
): Promise<RoomSoundboardData> {
  const [state, room] = await Promise.all([
    loadMudrixRoomState(roomId),
    client.localRoomSettings(roomId).catch(() => null),
  ]);
  if (room) {
    permissions.set(roomId, {
      powerLevels: room.powerLevels as Record<string, unknown> | undefined,
      creators: room.creators ?? [],
    });
  }
  return dataFrom(roomId, state) ?? { settings: null, powerLevels: undefined, creators: [] };
}

/** What is known about a room without asking (undefined before the first load). */
export function getCachedRoomSoundboardData(roomId: string): RoomSoundboardData | undefined {
  return dataFrom(roomId, getMudrixRoomState(roomId));
}

/** Calls `listener` whenever any room's Mudrix state changed; returns the unsubscribe. */
export function subscribeRoomSoundboardData(listener: () => void): () => void {
  return subscribeMudrixRoomState(listener);
}

/** Whether `userId` may send a state event of `type` in the room (its board packs or its settings). */
export function canManageSoundboard(
  data: RoomSoundboardData | undefined,
  userId: string,
  type: string
): boolean {
  if (!data?.powerLevels) return false;
  return canSendState(
    { powerLevels: data.powerLevels, creators: data.creators } as Parameters<
      typeof canSendState
    >[0],
    userId,
    type
  );
}

export async function writeRoomSoundboardSettings(
  client: MudrixClient,
  roomId: string,
  settings: SoundboardRoomSettings
): Promise<void> {
  await setMudrixRoomState(client, roomId, SOUNDBOARD_SETTINGS_TYPE, {
    enabled: settings.enabled,
    minPowerLevel: settings.minPowerLevel,
  });
}

/** Rooms whose soundboards apply in `roomId`: its parent spaces first, then the room itself. */
export function boardRoomIds(spaceGraph: SpaceNode[], roomId: string): string[] {
  return [...parentSpacesOf(spaceGraph, roomId), roomId];
}

export type SoundboardAccess = 'ok' | 'room-disabled' | 'forbidden';

/**
 * Whether `userId` may play soundboard clips in the call in `roomId`: the room and every space it
 * is in must have the soundboard enabled (a setting that was never made counts as enabled), and the
 * person needs the highest "who can play" level among them. Levels are checked against the person's
 * power level in the room that set them (falling back to their level in the call room).
 */
export async function evaluateSoundboardAccess(
  client: MudrixClient,
  spaceGraph: SpaceNode[],
  roomId: string,
  userId: string
): Promise<SoundboardAccess> {
  const ids = boardRoomIds(spaceGraph, roomId);
  const all = await Promise.all(ids.map((id) => loadRoomSoundboardData(client, id)));
  const levelIn = (data: RoomSoundboardData): number | null =>
    data.powerLevels ? powerLevelOf(data.powerLevels, userId, data.creators) : null;
  const roomLevel = levelIn(all[all.length - 1]) ?? 0;
  let verdict: SoundboardAccess = 'ok';
  all.forEach((data) => {
    const settings = data.settings;
    if (!settings) return;
    if (verdict === 'room-disabled') return;
    if (!settings.enabled) {
      verdict = 'room-disabled';
      return;
    }
    if ((levelIn(data) ?? roomLevel) < settings.minPowerLevel) verdict = 'forbidden';
  });
  return verdict;
}
