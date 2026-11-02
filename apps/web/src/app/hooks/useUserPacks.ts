import { useEffect, useMemo, useState } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAccountData, useAllRooms } from '@/app/data';
import {
  EMOTE_ROOMS_STABLE,
  EMOTE_ROOMS_UNSTABLE,
  ROOM_PACK_TYPES,
  USER_PACK,
  mergePackImageMap,
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

export function invalidateImagePacks(): void {
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
  for (const type of ROOM_PACK_TYPES) {
    const events = await client.stateEventsOfType(roomId, type).catch(() => []);
    for (const [stateKey, content] of events) {
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
  const parents = await client.stateEventsOfType(roomId, 'm.space.parent').catch(() => []);
  return parents.filter(([, content]) => !!content?.canonical).map(([stateKey]) => stateKey);
}

export async function readRoomPackContentsWithAncestors(
  client: MatrixClient,
  roomId: string,
  visited: Set<string> = new Set([roomId]),
  depth = 1,
  maxDepth = 5
): Promise<Map<string, PackContent[]>> {
  const merged = await readRoomPackContents(client, roomId);
  if (depth > maxDepth) return merged;

  for (const parentRoomId of await canonicalParents(client, roomId)) {
    if (!parentRoomId || visited.has(parentRoomId)) continue;
    visited.add(parentRoomId);

    const parentPacks = await readRoomPackContentsWithAncestors(
      client,
      parentRoomId,
      visited,
      depth + 1,
      maxDepth
    );
    for (const [stateKey, contents] of parentPacks) {
      const existing = merged.get(stateKey);
      merged.set(stateKey, existing ? [...existing, ...contents] : contents);
    }
  }
  return merged;
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

export function useStickerPacks(client: MatrixClient | null): StickerPackGroup[] {
  const userPack = useUserPack(client);
  const rooms = useSubscribedPackRooms();
  const revision = usePackRevision();
  const [packs, setPacks] = useState<StickerPackGroup[]>([]);

  useEffect(() => {
    if (!client) {
      setPacks([]);
      return;
    }
    let cancelled = false;
    void getStickerPacks(client, userPack, rooms).then((list) => {
      if (!cancelled) setPacks(list);
    });
    return () => {
      cancelled = true;
    };
  }, [client, userPack, rooms, revision]);

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

export interface StickerPackGroup {
  packName: string;
  stickers: {
    shortcode: string;
    url: string;
    body?: string;
    mimetype?: string;
    info?: Record<string, unknown>;
  }[];
}

export async function getStickerPacks(
  client: MatrixClient,
  userPack: UserPackData | null,
  subscribedRooms: Record<string, PackContent>
): Promise<StickerPackGroup[]> {
  const groups = new Map<
    string,
    Map<string, { url: string; body?: string; mimetype?: string; info?: Record<string, unknown> }>
  >();
  const addImages = (
    packName: string,
    packUsage: PackUsage[],
    images: Record<string, UserPackImage>
  ) => {
    const list = groups.get(packName) ?? new Map();
    for (const [shortcode, img] of Object.entries(images)) {
      if (!img.url) continue;
      const effectiveUsage = img.usage.length > 0 ? img.usage : packUsage;
      if (!effectiveUsage.includes('sticker')) continue;
      if (list.has(shortcode)) continue;
      list.set(shortcode, {
        url: img.url,
        body: img.body,
        mimetype: img.mimetype,
        info: img.info,
      });
    }
    groups.set(packName, list);
  };

  if (userPack) {
    addImages(userPack.displayName, userPack.usage, userPack.images);
  }

  for (const { summary: fav, contents } of await readFavoritePacks(client, subscribedRooms)) {
    const images: Record<string, UserPackImage> = {};
    for (const [shortcode, img] of Object.entries(mergePackImageMap(...contents))) {
      images[shortcode] = {
        url: img.url,
        usage: parseUsage(img.usage),
        body: img.body,
        mimetype: img.mimetype,
        info: img.info,
      };
    }
    addImages(fav.displayName, fav.usage, images);
  }

  return Array.from(groups.entries())
    .map(([packName, stickerMap]) => ({
      packName,
      stickers: Array.from(stickerMap.entries())
        .map(([shortcode, s]) => ({ shortcode, ...s }))
        .sort((a, b) => a.shortcode.localeCompare(b.shortcode)),
    }))
    .sort((a, b) => a.packName.localeCompare(b.packName))
    .filter((g) => g.stickers.length > 0);
}
