import { useState, useEffect, useMemo, createContext, useContext, createElement } from 'react';
import type { ReactNode } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAccountData } from '@/app/data';
import {
  USER_PACK,
  mergePackImageMap,
  mergePackInfo,
} from '@/app/features/settings/emojis/imagePackTypes';
import {
  canonicalParents,
  readRoomPackContents,
  usePackRevision,
  useSubscribedPackRooms,
} from '@/app/hooks/useUserPacks';

export interface ImagePackImage {
  shortcode: string;
  url: string;
  usage: string[];
  body?: string;
  mimetype?: string;
  info?: Record<string, unknown>;
  packName: string;
}

export interface ImagePack {
  id: string;
  name: string;
  images: ImagePackImage[];
}

type PackContent = Record<string, unknown>;

const DEFAULT_USAGE = ['emoticon', 'sticker'];
const MAX_SPACE_DEPTH = 5;

function toPack(id: string, fallbackName: string, contents: PackContent[]): ImagePack | null {
  const info = mergePackInfo(...contents);
  const name = info.displayName || fallbackName;
  const packUsage = info.usage && info.usage.length > 0 ? info.usage : DEFAULT_USAGE;
  const images = Object.entries(mergePackImageMap(...contents)).map(([shortcode, img]) => ({
    shortcode,
    url: img.url,
    usage: Array.isArray(img.usage) && img.usage.length > 0 ? img.usage : packUsage,
    body: img.body,
    mimetype: img.mimetype,
    info: img.info,
    packName: name,
  }));
  return images.length > 0 ? { id, name, images } : null;
}

async function roomPacks(
  client: MatrixClient,
  roomId: string,
  only?: PackContent
): Promise<ImagePack[]> {
  const packs: ImagePack[] = [];
  for (const [stateKey, contents] of await readRoomPackContents(client, roomId)) {
    if (only && !(stateKey in only)) continue;
    const pack = toPack(`${roomId}/${stateKey}`, stateKey, contents);
    if (pack) packs.push(pack);
  }
  return packs;
}

async function ancestorRooms(
  client: MatrixClient,
  roomId: string,
  visited: Set<string>,
  depth: number
): Promise<string[]> {
  if (depth > MAX_SPACE_DEPTH) return [];
  const parents = (await canonicalParents(client, roomId)).filter((id) => id && !visited.has(id));
  parents.forEach((id) => visited.add(id));
  const deeper = await Promise.all(
    parents.map((id) => ancestorRooms(client, id, visited, depth + 1))
  );
  return parents.flatMap((id, i) => [id, ...deeper[i]]);
}

async function loadRoomImagePacks(
  client: MatrixClient,
  roomId: string,
  subscribedRooms: Record<string, PackContent>,
  userPack: PackContent | null
): Promise<ImagePack[]> {
  const [favorites, own, ancestors] = await Promise.all([
    Promise.all(
      Object.entries(subscribedRooms).map(([id, stateKeys]) => roomPacks(client, id, stateKeys))
    ),
    roomPacks(client, roomId),
    ancestorRooms(client, roomId, new Set([roomId]), 1).then((ids) =>
      Promise.all(ids.map((id) => roomPacks(client, id)))
    ),
  ]);
  const user = userPack ? toPack('user', 'personal', [userPack]) : null;
  const seen = new Set<string>();
  return [...favorites.flat(), ...(user ? [user] : []), ...own, ...ancestors.flat()].filter(
    (pack) => !seen.has(pack.id) && !!seen.add(pack.id)
  );
}

const cache = new WeakMap<MatrixClient, Map<string, ImagePack[]>>();
const NO_PACKS: ImagePack[] = [];

function cached(client: MatrixClient, roomId: string): ImagePack[] | null {
  return cache.get(client)?.get(roomId) ?? null;
}

export function useRoomImagePacks(
  client: MatrixClient | null,
  roomId: string | null
): ImagePack[] | null {
  const subscribedRooms = useSubscribedPackRooms();
  const userPack = useAccountData(USER_PACK);
  const revision = usePackRevision();
  const [loaded, setLoaded] = useState<{ roomId: string; packs: ImagePack[] } | null>(null);

  useEffect(() => {
    if (!client || !roomId) return;
    let cancelled = false;
    void loadRoomImagePacks(client, roomId, subscribedRooms, userPack)
      .then((packs) => {
        let byRoom = cache.get(client);
        if (!byRoom) {
          byRoom = new Map();
          cache.set(client, byRoom);
        }
        byRoom.set(roomId, packs);
        return packs;
      })
      .catch(() => cached(client, roomId) ?? NO_PACKS)
      .then((packs) => {
        if (!cancelled) setLoaded({ roomId, packs });
      });
    return () => {
      cancelled = true;
    };
  }, [client, roomId, subscribedRooms, userPack, revision]);

  if (!client || !roomId) return NO_PACKS;
  return loaded?.roomId === roomId ? loaded.packs : cached(client, roomId);
}

const shortcodeMaps = new WeakMap<ImagePack[], Map<string, ImagePackImage>>();
const EMPTY_MAP: Map<string, ImagePackImage> = new Map();

function byShortcode(packs: ImagePack[]): Map<string, ImagePackImage> {
  let map = shortcodeMaps.get(packs);
  if (!map) {
    map = new Map();
    for (const pack of packs) {
      for (const image of pack.images) {
        if (!map.has(image.shortcode)) map.set(image.shortcode, image);
      }
    }
    shortcodeMaps.set(packs, map);
  }
  return map;
}

export interface ImagePacksState {
  packs: Map<string, ImagePackImage>;
  loading: boolean;
}

export function useImagePacks(client: MatrixClient | null, roomId: string | null): ImagePacksState {
  const packs = useRoomImagePacks(client, roomId);
  return useMemo(
    () => ({ packs: packs ? byShortcode(packs) : EMPTY_MAP, loading: packs === null }),
    [packs]
  );
}

const ImagePacksContext = createContext<Map<string, ImagePackImage>>(EMPTY_MAP);

export function ImagePacksProvider({
  client,
  roomId,
  children,
}: {
  client: MatrixClient | null;
  roomId: string | null;
  children: ReactNode;
}) {
  const { packs } = useImagePacks(client, roomId);
  return createElement(ImagePacksContext.Provider, { value: packs }, children);
}

export function useImagePacksContext(): Map<string, ImagePackImage> {
  return useContext(ImagePacksContext);
}
