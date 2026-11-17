import {
  mergePackImageMap,
  mergePackInfo,
  type PackImage,
} from '@/app/features/settings/emojis/imagePackTypes';

export type CosmeticKind = 'decoration' | 'effect' | 'nameplate' | 'profile_frame';

/** The cosmetic kinds, in the order their subscriptions are listed. */
export const COSMETIC_KINDS: readonly CosmeticKind[] = [
  'decoration',
  'effect',
  'nameplate',
  'profile_frame',
];

const DECORATION_USAGE = ['avatar_decoration', 'profile_decoration', 'avatar_frame'];

export function cosmeticKindOf(usage: readonly string[]): CosmeticKind | null {
  if (usage.includes('profile_frame')) return 'profile_frame';
  if (usage.includes('nameplate')) return 'nameplate';
  if (usage.includes('profile_effect')) return 'effect';
  if (DECORATION_USAGE.some((u) => usage.includes(u))) return 'decoration';
  return null;
}

export interface CosmeticFramePiece {
  layer?: 'back' | 'front';
  pos: string;
  url: string;
}

export interface CosmeticPackItem {
  shortcode: string;
  name: string;
  url: string;
  kind: CosmeticKind;
  palette?: string;
  pieces?: CosmeticFramePiece[];
}

export interface CosmeticPack {
  roomId: string | null;
  stateKey: string;
  displayName: string;
  attribution?: string;
  items: CosmeticPackItem[];
}

const DEFAULT_USAGE = ['emoticon', 'sticker'];
const FRAME_POSITIONS = new Set(['top', 'bottom', 'center']);

const isMxc = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('mxc://');

function parsePieces(raw: unknown): CosmeticFramePiece[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const pieces: CosmeticFramePiece[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const { url, pos, layer } = item as { url?: unknown; pos?: unknown; layer?: unknown };
    if (!isMxc(url) || typeof pos !== 'string' || !FRAME_POSITIONS.has(pos)) continue;
    pieces.push({ url, pos, ...(layer === 'back' || layer === 'front' ? { layer } : {}) });
  }
  return pieces.length > 0 ? pieces : undefined;
}

function itemOf(
  shortcode: string,
  image: PackImage,
  packUsage: readonly string[]
): CosmeticPackItem | null {
  if (!isMxc(image.url)) return null;
  const usage = image.usage && image.usage.length > 0 ? image.usage : packUsage;
  const kind = cosmeticKindOf(usage);
  if (!kind) return null;
  const info = (image.info ?? {}) as Record<string, unknown>;
  const item: CosmeticPackItem = {
    shortcode,
    name: image.body || shortcode,
    url: image.url,
    kind,
  };
  if (typeof info.palette === 'string') item.palette = info.palette;
  const pieces = parsePieces(info.pieces);
  if (pieces) item.pieces = pieces;
  return item;
}

export function parseCosmeticPack(
  roomId: string | null,
  stateKey: string,
  contents: (Record<string, unknown> | undefined)[]
): CosmeticPack | null {
  const info = mergePackInfo(...contents);
  const packUsage = info.usage && info.usage.length > 0 ? info.usage : DEFAULT_USAGE;
  const items: CosmeticPackItem[] = [];
  for (const [shortcode, image] of Object.entries(mergePackImageMap(...contents))) {
    const item = itemOf(shortcode, image, packUsage);
    if (item) items.push(item);
  }
  if (items.length === 0) return null;
  return {
    roomId,
    stateKey,
    displayName: info.displayName || stateKey,
    ...(info.attribution ? { attribution: info.attribution } : {}),
    items,
  };
}

export function parseCosmeticPacks(
  roomId: string,
  byStateKey: Map<string, Record<string, unknown>[]>
): CosmeticPack[] {
  const packs: CosmeticPack[] = [];
  for (const [stateKey, contents] of byStateKey) {
    const pack = parseCosmeticPack(roomId, stateKey, contents);
    if (pack) packs.push(pack);
  }
  return packs;
}

export function packItemsOfKind(pack: CosmeticPack, kind: CosmeticKind): CosmeticPackItem[] {
  return pack.items.filter((item) => item.kind === kind);
}

/** Whether a stored cosmetic comes from a pack (media) rather than the built-in set. */
export function isPackCosmetic(value: unknown): boolean {
  if (isMxc(value)) return true;
  if (!value || typeof value !== 'object') return false;
  const record = value as { url?: unknown; pieces?: unknown };
  if (isMxc(record.url)) return true;
  return (
    Array.isArray(record.pieces) && record.pieces.some((p) => isMxc((p as { url?: unknown }).url))
  );
}

/** What to draw for a stored cosmetic: nothing for a pack item while packs are switched off. */
export function resolveCosmetic<T>(value: T | null | undefined, showPacks: boolean): T | null {
  if (!value) return null;
  return !showPacks && isPackCosmetic(value) ? null : value;
}

/** The profile value of a pack item, in the shape the profile cosmetics parsers read back. */
export function cosmeticValueOf(
  item: CosmeticPackItem
): string | { url: string; palette?: string } | { url: string; pieces: CosmeticFramePiece[] } {
  if (item.kind === 'nameplate' && item.palette) return { url: item.url, palette: item.palette };
  if (item.kind === 'profile_frame' && item.pieces && item.pieces.length > 0) {
    return { url: item.url, pieces: item.pieces };
  }
  return item.url;
}

export type PackSubscriptions = Record<string, Record<string, unknown>>;

export function mergeSubscriptions(
  ...contents: (Record<string, unknown> | null | undefined)[]
): PackSubscriptions {
  const merged: PackSubscriptions = {};
  for (const content of contents) {
    const rooms = content?.rooms as Record<string, Record<string, unknown>> | undefined;
    if (!rooms || typeof rooms !== 'object') continue;
    for (const [roomId, stateKeys] of Object.entries(rooms)) {
      if (!stateKeys || typeof stateKeys !== 'object') continue;
      merged[roomId] = { ...(merged[roomId] ?? {}), ...stateKeys };
    }
  }
  return merged;
}

export interface PackRef {
  roomId: string;
  stateKey: string;
}

export function subscriptionKey(roomId: string, stateKey: string): string {
  return `${roomId}/${stateKey}`;
}

export function isSubscribed(rooms: PackSubscriptions, roomId: string, stateKey: string): boolean {
  return !!rooms[roomId] && stateKey in rooms[roomId];
}

/** `rooms` with one pack subscribed or unsubscribed; rooms left without packs are dropped. */
export function withSubscription(
  rooms: PackSubscriptions,
  roomId: string,
  stateKey: string,
  subscribed: boolean
): PackSubscriptions {
  const next: PackSubscriptions = { ...rooms };
  const keys = { ...(next[roomId] ?? {}) };
  if (subscribed) keys[stateKey] = keys[stateKey] ?? {};
  else delete keys[stateKey];
  if (Object.keys(keys).length > 0) next[roomId] = keys;
  else delete next[roomId];
  return next;
}

/**
 * The subscription content for exactly `refs`, keeping the subscriptions of rooms `keepRoom`
 * says this client cannot read (left, or not synced yet) instead of dropping them on every save.
 */
export function subscriptionRooms(
  existing: PackSubscriptions,
  refs: readonly PackRef[],
  keepRoom: (roomId: string) => boolean = () => false
): PackSubscriptions {
  const rooms: PackSubscriptions = {};
  for (const [roomId, keys] of Object.entries(existing)) {
    if (keepRoom(roomId)) rooms[roomId] = keys;
  }
  for (const ref of refs) {
    rooms[ref.roomId] = { ...(rooms[ref.roomId] ?? {}), [ref.stateKey]: {} };
  }
  return rooms;
}

export function subscribedRefs(rooms: PackSubscriptions): PackRef[] {
  const refs: PackRef[] = [];
  for (const [roomId, keys] of Object.entries(rooms)) {
    for (const stateKey of Object.keys(keys)) refs.push({ roomId, stateKey });
  }
  return refs;
}
