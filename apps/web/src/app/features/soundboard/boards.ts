import type { SpaceNode, WizardClient } from '@wizardchat/core';
import { canSendState, parentSpacesOf, powerLevelOf } from '@/app/data';
import { legacyTypeOf } from '@/util/namespace';
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
  SOUNDBOARD_DATA_TYPE,
  SOUNDBOARD_MAX_DURATION_MS,
  SOUNDBOARD_MAX_NAME_LENGTH,
  SOUNDBOARD_MAX_SIZE_BYTES,
  SOUNDBOARD_MAX_SOUNDS,
  SOUNDBOARD_SETTINGS_TYPE,
  SoundboardError,
  type SoundboardClip,
  type SoundboardRoomSettings,
  type SoundboardSound,
} from './types';

function clamp01(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/** Keeps only well-formed clips with an allowed type, size and length; never throws. */
export function parseBoard(raw: unknown): SoundboardSound[] {
  const list = (raw as { sounds?: unknown } | null | undefined)?.sounds;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: SoundboardSound[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const s = entry as Record<string, unknown>;
    const mimetype = normalizeMimetype(typeof s.mimetype === 'string' ? s.mimetype : '');
    if (typeof s.id !== 'string' || !s.id || seen.has(s.id)) continue;
    if (typeof s.name !== 'string' || !s.name) continue;
    if (typeof s.url !== 'string' || !s.url.startsWith('mxc://') || !mimetype) continue;
    const durationMs = typeof s.durationMs === 'number' ? s.durationMs : NaN;
    const size = typeof s.size === 'number' ? s.size : NaN;
    if (!Number.isFinite(durationMs) || durationMs <= 0) continue;
    if (!Number.isFinite(size) || size < 0) continue;
    seen.add(s.id);
    out.push({
      id: s.id,
      name: s.name.slice(0, SOUNDBOARD_MAX_NAME_LENGTH),
      emoji: typeof s.emoji === 'string' && s.emoji ? s.emoji.slice(0, 16) : undefined,
      url: s.url,
      mimetype,
      durationMs: Math.min(durationMs, SOUNDBOARD_MAX_DURATION_MS),
      size: Math.min(size, SOUNDBOARD_MAX_SIZE_BYTES * 2),
      volume: clamp01(s.volume, 1),
    });
  }
  return out.slice(0, SOUNDBOARD_MAX_SOUNDS);
}

// ---- Personal board (account data) ----------------------------------------------------------

/** The personal board from its account data: the current name wins, the earlier Mudrix one fills in. */
export function parsePersonalBoard(current: unknown, legacy?: unknown): SoundboardSound[] {
  const board = parseBoard(current);
  return board.length > 0 || current ? board : parseBoard(legacy);
}

/** The personal board as stored now, read again just before a change so nothing is overwritten. */
export async function readPersonalBoard(client: WizardClient): Promise<SoundboardSound[]> {
  const [current, legacy] = await Promise.all([
    client.cachedAccountData(SOUNDBOARD_DATA_TYPE).catch(() => null),
    client.cachedAccountData(legacyTypeOf(SOUNDBOARD_DATA_TYPE)).catch(() => null),
  ]);
  return parsePersonalBoard(current, legacy);
}

export async function writePersonalBoard(
  client: WizardClient,
  sounds: SoundboardSound[]
): Promise<void> {
  try {
    await client.setAccountData(SOUNDBOARD_DATA_TYPE, { sounds });
  } catch (err) {
    throw new SoundboardError('save', err instanceof Error ? err.message : undefined);
  }
}

// ---- Room and space boards (state events) ---------------------------------------------------

/** What a room or space says about the soundboard, with who may do what in it. */
export interface RoomSoundboardData {
  board: SoundboardSound[];
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
    board: parseBoard(state?.get(SOUNDBOARD_DATA_TYPE)),
    settings: sanitizeSettings(state?.get(SOUNDBOARD_SETTINGS_TYPE)),
    powerLevels: perms?.powerLevels,
    creators: perms?.creators ?? [],
  };
}

/**
 * The room's board, settings and power levels. The board and settings come from the Mudrix state
 * store, which the core's events keep current, so there is nothing to refresh; `force` is accepted
 * for callers that used to ask for a fresh read.
 */
export async function loadRoomSoundboardData(
  client: WizardClient,
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
  return (
    dataFrom(roomId, state) ?? { board: [], settings: null, powerLevels: undefined, creators: [] }
  );
}

/** What is known about a room without asking (undefined before the first load). */
export function getCachedRoomSoundboardData(roomId: string): RoomSoundboardData | undefined {
  return dataFrom(roomId, getMudrixRoomState(roomId));
}

/** Calls `listener` whenever any room's Mudrix state changed; returns the unsubscribe. */
export function subscribeRoomSoundboardData(listener: () => void): () => void {
  return subscribeMudrixRoomState(listener);
}

/** Whether `userId` may send the room's soundboard state (change its board or its settings). */
export function canManageSoundboard(
  data: RoomSoundboardData | undefined,
  userId: string,
  type: string = SOUNDBOARD_DATA_TYPE
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

export async function writeRoomBoard(
  client: WizardClient,
  roomId: string,
  sounds: SoundboardSound[]
): Promise<void> {
  const myId = client.userId();
  const data = await loadRoomSoundboardData(client, roomId);
  if (!myId || !canManageSoundboard(data, myId)) throw new SoundboardError('forbidden');
  try {
    await setMudrixRoomState(client, roomId, SOUNDBOARD_DATA_TYPE, { sounds });
  } catch (err) {
    throw new SoundboardError('save', err instanceof Error ? err.message : undefined);
  }
}

export async function writeRoomSoundboardSettings(
  client: WizardClient,
  roomId: string,
  settings: SoundboardRoomSettings
): Promise<void> {
  await setMudrixRoomState(client, roomId, SOUNDBOARD_SETTINGS_TYPE, {
    enabled: settings.enabled,
    minPowerLevel: settings.minPowerLevel,
  });
}

/** Rooms whose boards apply in `roomId`: its parent spaces first, then the room itself. */
export function boardRoomIds(spaceGraph: SpaceNode[], roomId: string): string[] {
  return [...parentSpacesOf(spaceGraph, roomId), roomId];
}

/** Every room/space board that applies in `roomId`, as clips (a space's clips are shared with its rooms). */
export async function loadRoomClips(
  client: WizardClient,
  spaceGraph: SpaceNode[],
  roomId: string
): Promise<SoundboardClip[]> {
  const clips: SoundboardClip[] = [];
  const ids = boardRoomIds(spaceGraph, roomId);
  const all = await Promise.all(ids.map((id) => loadRoomSoundboardData(client, id)));
  ids.forEach((originRoomId, i) => {
    for (const sound of all[i].board) {
      // The same id in a space and its room: the room's own clip wins (it comes last).
      const existing = clips.findIndex((c) => c.id === sound.id);
      if (existing >= 0) clips.splice(existing, 1);
      clips.push({ ...sound, source: 'room', originRoomId });
    }
  });
  return clips;
}

export type SoundboardAccess = 'ok' | 'room-disabled' | 'forbidden';

/**
 * Whether `userId` may play soundboard clips in the call in `roomId`: the room and every space it
 * is in must have the soundboard enabled (a setting that was never made counts as enabled), and the
 * person needs the highest "who can play" level among them. Levels are checked against the person's
 * power level in the room that set them (falling back to their level in the call room).
 */
export async function evaluateSoundboardAccess(
  client: WizardClient,
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
