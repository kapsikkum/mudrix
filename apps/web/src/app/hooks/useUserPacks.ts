import { useEffect, useMemo, useState } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAccountData, useAllRooms } from '@/app/data';
import {
  EMOTE_ROOMS_STABLE,
  EMOTE_ROOMS_UNSTABLE,
  ROOM_PACK_TYPES,
  USER_PACK,
  mergePackImages,
  mergePackInfo,
  parsePackInfo,
} from '@/app/features/settings/emojis/imagePackTypes';

const DEFAULT_USAGE: PackUsage[] = ['emoticon', 'sticker'];

export type PackUsage = 'emoticon' | 'sticker';

export interface UserPackImage {
  url: string;
  usage: string[];
  body?: string;
  mimetype?: string;
  info?: Record<string, unknown>;
}

export interface UserPackData {
  displayName: string;
  usage: PackUsage[];
  images: Record<string, UserPackImage>;
}

export interface RoomPackSummary {
  roomId: string;
  stateKey: string;
  displayName: string;
  usage: PackUsage[];
  avatarMxc: string | undefined;
  attribution?: string;
}

type PackContent = Record<string, unknown>;

const packListeners = new Set<() => void>();

const STATE_TTL_MS = 5 * 60_000;
let stateRequests = new WeakMap<
  MatrixClient,
  Map<string, { at: number; events: Promise<[string, string, PackContent][]> }>
>();

function stateEvents(
  client: MatrixClient,
  roomId: string,
  types: readonly string[]
): Promise<[string, string, PackContent][]> {
  let byKey = stateRequests.get(client);
  if (!byKey) {
    byKey = new Map();
    stateRequests.set(client, byKey);
  }
  const key = `${roomId}\n${types.join('\n')}`;
  const hit = byKey.get(key);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit.events;
  const events = client.stateEventsOfTypes(roomId, [...types]) as Promise<
    [string, string, PackContent][]
  >;
  const entry = { at: Date.now(), events };
  byKey.set(key, entry);
  events.catch(() => {
    if (byKey.get(key) === entry) byKey.delete(key);
  });
  return events;
}

export function invalidateImagePacks(): void {
  stateRequests = new WeakMap();
  packListeners.forEach((listener) => listener());
}

export function usePackRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => setRevision((n) => n + 1);
    packListeners.add(listener);
    return () => {
      packListeners.delete(listener);
    };
  }, []);
  return revision;
}

function isMeaningfulPackContent(content: PackContent | undefined): boolean {
  if (!content || typeof content !== 'object') return false;
  const pack = content.pack;
  if (pack && typeof pack === 'object' && Object.keys(pack as PackContent).length > 0) {
    return true;
  }
  const images = content.images;
  return !!images && typeof images === 'object' && Object.keys(images).length > 0;
}

export async function readRoomPackContents(
  client: MatrixClient,
  roomId: string
): Promise<Map<string, PackContent[]>> {
  const byStateKey = new Map<string, PackContent[]>();
  const events = await stateEvents(client, roomId, ROOM_PACK_TYPES).catch(() => []);
  for (const type of ROOM_PACK_TYPES) {
    for (const [eventType, stateKey, content] of events) {
      if (eventType !== type) continue;
      const list = byStateKey.get(stateKey);
      if (list) list.push(content);
      else byStateKey.set(stateKey, [content]);
    }
  }
  for (const [stateKey, contents] of byStateKey) {
    if (!contents.some(isMeaningfulPackContent)) byStateKey.delete(stateKey);
  }
  return byStateKey;
}

export async function canonicalParents(client: MatrixClient, roomId: string): Promise<string[]> {
  const parents = await stateEvents(client, roomId, ['m.space.parent']).catch(() => []);
  return parents.filter(([, , content]) => !!content?.canonical).map(([, stateKey]) => stateKey);
}

function summarizeRoomPack(
  roomId: string,
  stateKey: string,
  contents: PackContent[]
): RoomPackSummary | null {
  const info = mergePackInfo(...contents);
  const images = mergePackImages(...contents);
  const firstImage = images[0];
  return {
    roomId,
    stateKey,
    displayName: info.displayName || stateKey,
    usage: info.usage && info.usage.length > 0 ? parseUsage(info.usage) : DEFAULT_USAGE,
    avatarMxc: info.avatarUrl || firstImage?.url,
    attribution: info.attribution,
  };
}

async function summarizeRoomPacks(
  client: MatrixClient,
  roomId: string
): Promise<RoomPackSummary[]> {
  const result: RoomPackSummary[] = [];
  for (const [stateKey, contents] of await readRoomPackContents(client, roomId)) {
    const summary = summarizeRoomPack(roomId, stateKey, contents);
    if (summary) result.push(summary);
  }
  return result;
}

function parseUsage(raw: unknown): PackUsage[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter((u): u is PackUsage => u === 'emoticon' || u === 'sticker');
  }
  return DEFAULT_USAGE;
}

function parsePackImages(content: PackContent): Record<string, UserPackImage> {
  const imagesRaw = content.images as PackContent | undefined;
  if (!imagesRaw) return {};
  const images: Record<string, UserPackImage> = {};
  for (const [shortcode, imgRaw] of Object.entries(imagesRaw)) {
    const img = imgRaw as PackContent;
    if (img && typeof img.url === 'string') {
      images[shortcode] = {
        url: img.url,
        usage: parseUsage(img.usage),
        body: typeof img.body === 'string' ? img.body : undefined,
        mimetype: typeof img.mimetype === 'string' ? img.mimetype : undefined,
        info: img.info && typeof img.info === 'object' ? (img.info as PackContent) : undefined,
      };
    }
  }
  return images;
}

export function parseUserPack(content: PackContent | null | undefined): UserPackData | null {
  if (!content) return null;
  const info = parsePackInfo(content);
  const displayName =
    info.displayName && info.displayName.length > 0 ? info.displayName : 'personal';
  const usage = info.usage ? parseUsage(info.usage) : DEFAULT_USAGE;
  return { displayName, usage, images: parsePackImages(content) };
}

export function mergeSubscriptionRooms(
  ...contents: (PackContent | null | undefined)[]
): Record<string, PackContent> {
  const merged: Record<string, PackContent> = {};
  for (const content of contents) {
    const rooms = content?.rooms as Record<string, PackContent> | undefined;
    if (!rooms) continue;
    for (const [roomId, stateKeys] of Object.entries(rooms)) {
      if (!stateKeys || typeof stateKeys !== 'object') continue;
      const existing = merged[roomId] ?? {};
      merged[roomId] = { ...existing, ...stateKeys };
    }
  }
  return merged;
}

interface FavoritePack {
  summary: RoomPackSummary;
  contents: PackContent[];
}

export async function readFavoritePacks(
  client: MatrixClient,
  rooms: Record<string, PackContent>
): Promise<FavoritePack[]> {
  if (Object.keys(rooms).length === 0) return [];

  const result: FavoritePack[] = [];
  for (const [roomId, stateKeys] of Object.entries(rooms)) {
    const byStateKey = await readRoomPackContents(client, roomId);
    for (const [sk] of Object.entries(stateKeys)) {
      const contents = byStateKey.get(sk);
      if (!contents || contents.length === 0) continue;
      const summary = summarizeRoomPack(roomId, sk, contents);
      if (summary) result.push({ summary, contents });
    }
  }
  return result.sort((a, b) => a.summary.displayName.localeCompare(b.summary.displayName));
}

export function useSubscribedPackRooms(): Record<string, PackContent> {
  const unstable = useAccountData(EMOTE_ROOMS_UNSTABLE);
  const stable = useAccountData(EMOTE_ROOMS_STABLE);
  return useMemo(() => mergeSubscriptionRooms(unstable, stable), [unstable, stable]);
}

export function useUserPack(client: MatrixClient | null): UserPackData | null {
  const content = useAccountData(USER_PACK);
  return useMemo(() => (client ? parseUserPack(content) : null), [client, content]);
}

export function useFavoritePacks(client: MatrixClient | null): RoomPackSummary[] {
  const rooms = useSubscribedPackRooms();
  const revision = usePackRevision();
  const [packs, setPacks] = useState<RoomPackSummary[]>([]);

  useEffect(() => {
    if (!client) {
      setPacks([]);
      return;
    }
    let cancelled = false;
    void readFavoritePacks(client, rooms).then((list) => {
      if (!cancelled) setPacks(list.map((p) => p.summary));
    });
    return () => {
      cancelled = true;
    };
  }, [client, rooms, revision]);

  return packs;
}

export async function saveUserPack(client: MatrixClient, pack: UserPackData): Promise<void> {
  const imageContent: Record<string, Partial<UserPackImage> & { url: string }> = {};
  for (const [shortcode, img] of Object.entries(pack.images)) {
    const image: Partial<UserPackImage> & { url: string } = {
      url: img.url,
      body: img.body ?? shortcode,
    };
    if (pack.usage.length > 0) image.usage = pack.usage;
    if (img.mimetype) image.mimetype = img.mimetype;
    imageContent[shortcode] = image;
  }
  await client.setAccountData(USER_PACK, {
    pack: { display_name: pack.displayName, usage: pack.usage },
    images: imageContent,
  });
}

export async function saveFavoritePacks(
  client: MatrixClient,
  favorites: RoomPackSummary[]
): Promise<void> {
  const rooms: Record<string, PackContent> = {};
  for (const fav of favorites) {
    const roomToState = rooms[fav.roomId] ?? {};
    roomToState[fav.stateKey] = {};
    rooms[fav.roomId] = roomToState;
  }
  await Promise.all([
    client.setAccountData(EMOTE_ROOMS_UNSTABLE, { rooms }),
    client.setAccountData(EMOTE_ROOMS_STABLE, { rooms }),
  ]);
}

export async function getAllRoomsPacks(
  client: MatrixClient,
  roomIds: string[]
): Promise<RoomPackSummary[]> {
  const perRoom = await Promise.all(roomIds.map((id) => summarizeRoomPacks(client, id)));
  return perRoom.flat();
}

export function useAllRoomsPacks(client: MatrixClient | null): RoomPackSummary[] {
  const rooms = useAllRooms();
  const revision = usePackRevision();
  const roomIds = useMemo(
    () =>
      rooms
        .filter((r) => !r.isInvite)
        .map((r) => r.id)
        .join('\n'),
    [rooms]
  );
  const [packs, setPacks] = useState<RoomPackSummary[]>([]);

  useEffect(() => {
    if (!client) {
      setPacks([]);
      return;
    }
    let cancelled = false;
    void getAllRoomsPacks(client, roomIds ? roomIds.split('\n') : []).then((list) => {
      if (!cancelled) setPacks(list);
    });
    return () => {
      cancelled = true;
    };
  }, [client, roomIds, revision]);

  return packs;
}

// --- Cosmetic Packs -----------------------------------------------------------

export interface DecorationPackImage {
  id: string;
  shortcode: string;
  name: string;
  category: string;
  url: string;
  isCustom?: boolean;
}

export interface DecorationPackGroup {
  packName: string;
  category: string;
  decorations: DecorationPackImage[];
}

export function useDecorationPacks(client: MatrixClient | null): DecorationPackGroup[] {
  const userPack = useUserPack(client);
  return useMemo(() => {
    if (!userPack) return [];
    const items: DecorationPackImage[] = [];
    for (const [shortcode, img] of Object.entries(userPack.images)) {
      if (!img.url) continue;
      const usage = img.usage ?? userPack.usage;
      if (
        usage.includes('avatar_decoration' as PackUsage) ||
        usage.includes('profile_decoration' as PackUsage) ||
        usage.includes('avatar_frame' as PackUsage)
      ) {
        items.push({
          id: img.url,
          shortcode,
          name: img.body || shortcode,
          category: 'My Uploads',
          url: img.url,
          isCustom: true,
        });
      }
    }
    if (items.length === 0) return [];
    return [{ packName: 'My Uploads', category: 'My Uploads', decorations: items }];
  }, [userPack]);
}

export async function uploadUserDecoration(
  client: MatrixClient,
  file: File
): Promise<{ url: string; shortcode: string; name: string }> {
  const mimetype = file.type || 'image/png';
  const url = await client.uploadMedia(new Uint8Array(await file.arrayBuffer()), mimetype);
  const current = ((await client.cachedAccountData(USER_PACK)) as UserPackData | null) ?? {
    displayName: 'personal',
    usage: DEFAULT_USAGE,
    images: {},
  };
  const baseCode =
    file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'decoration';
  let shortcode = baseCode;
  let counter = 1;
  const currentImages = current.images ?? {};
  while (currentImages[shortcode]) {
    shortcode = `${baseCode}_${counter++}`;
  }
  const name = file.name.replace(/\.[^.]+$/, '');
  const updatedImages = {
    ...currentImages,
    [shortcode]: {
      url,
      usage: ['profile_decoration'],
      body: name,
      mimetype: file.type || 'image/png',
    },
  };
  await saveUserPack(client, {
    ...current,
    displayName: current.displayName || 'personal',
    usage: current.usage || DEFAULT_USAGE,
    images: updatedImages,
  });
  return { url, shortcode, name };
}

export async function deleteUserDecoration(
  client: MatrixClient,
  urlOrShortcode: string
): Promise<void> {
  const current = (await client.cachedAccountData(USER_PACK)) as UserPackData | null;
  if (!current?.images) return;
  const newImages = { ...current.images };
  for (const [shortcode, img] of Object.entries(newImages)) {
    if (img.url === urlOrShortcode || shortcode === urlOrShortcode) {
      delete newImages[shortcode];
    }
  }
  await saveUserPack(client, { ...current, images: newImages });
}

export interface EffectPackImage {
  id: string;
  shortcode: string;
  name: string;
  category: string;
  url: string;
  isCustom?: boolean;
}

export interface EffectPackGroup {
  packName: string;
  category: string;
  effects: EffectPackImage[];
}

export function useEffectPacks(client: MatrixClient | null): EffectPackGroup[] {
  const userPack = useUserPack(client);
  return useMemo(() => {
    if (!userPack) return [];
    const items: EffectPackImage[] = [];
    for (const [shortcode, img] of Object.entries(userPack.images)) {
      if (!img.url) continue;
      const usage = img.usage ?? userPack.usage;
      if (usage.includes('profile_effect' as PackUsage)) {
        items.push({
          id: img.url,
          shortcode,
          name: img.body || shortcode,
          category: 'My Uploads',
          url: img.url,
          isCustom: true,
        });
      }
    }
    if (items.length === 0) return [];
    return [{ packName: 'My Uploads', category: 'My Uploads', effects: items }];
  }, [userPack]);
}

export async function uploadUserEffect(
  client: MatrixClient,
  file: File
): Promise<{ url: string; shortcode: string; name: string }> {
  const mimetype = file.type || 'image/png';
  const url = await client.uploadMedia(new Uint8Array(await file.arrayBuffer()), mimetype);
  const current = ((await client.cachedAccountData(USER_PACK)) as UserPackData | null) ?? {
    displayName: 'personal',
    usage: DEFAULT_USAGE,
    images: {},
  };
  const baseCode =
    file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'effect';
  let shortcode = baseCode;
  let counter = 1;
  const currentImages = current.images ?? {};
  while (currentImages[shortcode]) {
    shortcode = `${baseCode}_${counter++}`;
  }
  const name = file.name.replace(/\.[^.]+$/, '');
  const updatedImages = {
    ...currentImages,
    [shortcode]: {
      url,
      usage: ['profile_effect'],
      body: name,
      mimetype: file.type || 'image/png',
    },
  };
  await saveUserPack(client, {
    ...current,
    displayName: current.displayName || 'personal',
    usage: current.usage || DEFAULT_USAGE,
    images: updatedImages,
  });
  return { url, shortcode, name };
}

export async function deleteUserEffect(
  client: MatrixClient,
  urlOrShortcode: string
): Promise<void> {
  await deleteUserDecoration(client, urlOrShortcode);
}

export interface NameplatePackImage {
  id: string;
  shortcode: string;
  name: string;
  category: string;
  url: string;
  palette?: string;
  isCustom?: boolean;
}

export interface NameplatePackGroup {
  packName: string;
  category: string;
  nameplates: NameplatePackImage[];
}

export function useNameplatePacks(client: MatrixClient | null): NameplatePackGroup[] {
  const userPack = useUserPack(client);
  return useMemo(() => {
    if (!userPack) return [];
    const items: NameplatePackImage[] = [];
    for (const [shortcode, img] of Object.entries(userPack.images)) {
      if (!img.url) continue;
      const usage = img.usage ?? userPack.usage;
      if (usage.includes('nameplate' as PackUsage)) {
        const info = (img.info || {}) as Record<string, unknown>;
        items.push({
          id: img.url,
          shortcode,
          name: img.body || shortcode,
          category: 'My Uploads',
          url: img.url,
          palette: typeof info.palette === 'string' ? info.palette : undefined,
          isCustom: true,
        });
      }
    }
    if (items.length === 0) return [];
    return [{ packName: 'My Uploads', category: 'My Uploads', nameplates: items }];
  }, [userPack]);
}

export async function uploadUserNameplate(
  client: MatrixClient,
  file: File,
  palette?: string
): Promise<{ url: string; shortcode: string; name: string }> {
  const mimetype = file.type || 'image/png';
  const url = await client.uploadMedia(new Uint8Array(await file.arrayBuffer()), mimetype);
  const current = ((await client.cachedAccountData(USER_PACK)) as UserPackData | null) ?? {
    displayName: 'personal',
    usage: DEFAULT_USAGE,
    images: {},
  };
  const baseCode =
    file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'nameplate';
  let shortcode = baseCode;
  let counter = 1;
  const currentImages = current.images ?? {};
  while (currentImages[shortcode]) {
    shortcode = `${baseCode}_${counter++}`;
  }
  const name = file.name.replace(/\.[^.]+$/, '');
  const updatedImages = {
    ...currentImages,
    [shortcode]: {
      url,
      usage: ['nameplate'],
      body: name,
      mimetype,
      info: palette ? { palette } : undefined,
    },
  };
  await saveUserPack(client, {
    ...current,
    displayName: current.displayName || 'personal',
    usage: current.usage || DEFAULT_USAGE,
    images: updatedImages,
  });
  return { url, shortcode, name };
}

export async function deleteUserNameplate(
  client: MatrixClient,
  urlOrShortcode: string
): Promise<void> {
  await deleteUserDecoration(client, urlOrShortcode);
}

export interface ProfileFramePiece {
  layer?: 'back' | 'front';
  pos: string;
  url: string;
}

export interface ProfileFramePackImage {
  id: string;
  shortcode: string;
  name: string;
  category: string;
  url: string;
  pieces?: ProfileFramePiece[];
  isCustom?: boolean;
}

export interface ProfileFramePackGroup {
  packName: string;
  category: string;
  frames: ProfileFramePackImage[];
}

export function useProfileFramePacks(client: MatrixClient | null): ProfileFramePackGroup[] {
  const userPack = useUserPack(client);
  return useMemo(() => {
    if (!userPack) return [];
    const items: ProfileFramePackImage[] = [];
    for (const [shortcode, img] of Object.entries(userPack.images)) {
      if (!img.url) continue;
      const usage = img.usage ?? userPack.usage;
      if (usage.includes('profile_frame' as PackUsage)) {
        const info = (img.info || {}) as Record<string, unknown>;
        items.push({
          id: img.url,
          shortcode,
          name: img.body || shortcode,
          category: 'My Uploads',
          url: img.url,
          pieces: Array.isArray(info.pieces) ? (info.pieces as ProfileFramePiece[]) : undefined,
          isCustom: true,
        });
      }
    }
    if (items.length === 0) return [];
    return [{ packName: 'My Uploads', category: 'My Uploads', frames: items }];
  }, [userPack]);
}

export async function uploadUserProfileFrame(
  client: MatrixClient,
  file: File
): Promise<{ url: string; shortcode: string; name: string }> {
  const mimetype = file.type || 'image/png';
  const url = await client.uploadMedia(new Uint8Array(await file.arrayBuffer()), mimetype);
  const current = ((await client.cachedAccountData(USER_PACK)) as UserPackData | null) ?? {
    displayName: 'personal',
    usage: DEFAULT_USAGE,
    images: {},
  };
  const baseCode =
    file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'frame';
  let shortcode = baseCode;
  let counter = 1;
  const currentImages = current.images ?? {};
  while (currentImages[shortcode]) {
    shortcode = `${baseCode}_${counter++}`;
  }
  const name = file.name.replace(/\.[^.]+$/, '');
  const updatedImages = {
    ...currentImages,
    [shortcode]: {
      url,
      usage: ['profile_frame'],
      body: name,
      mimetype,
    },
  };
  await saveUserPack(client, {
    ...current,
    displayName: current.displayName || 'personal',
    usage: current.usage || DEFAULT_USAGE,
    images: updatedImages,
  });
  return { url, shortcode, name };
}

export async function deleteUserProfileFrame(
  client: MatrixClient,
  urlOrShortcode: string
): Promise<void> {
  await deleteUserDecoration(client, urlOrShortcode);
}

export function lookupPackImage(
  _client: MatrixClient,
  _mxc: string
): { name: string; packName: string } | null {
  return null;
}

export function lookupEffectIntro(_client: MatrixClient, _mxc: string): string | null {
  return null;
}
