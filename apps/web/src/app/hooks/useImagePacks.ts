import { useState, useEffect, createContext, useContext, createElement } from 'react';
import type { ReactNode } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAccountData } from '@/app/data';
import { USER_PACK } from '@/app/features/settings/emojis/imagePackTypes';
import {
  canonicalParents,
  readRoomPackContents,
  usePackRevision,
  useSubscribedPackRooms,
} from '@/app/hooks/useUserPacks';

export interface ImagePackImage {
  url: string;
  usage: string[];
  body?: string;
  mimetype?: string;
  info?: Record<string, unknown>;
  packName: string;
}

type PackContent = Record<string, unknown>;

function extractPacks(
  packs: { stateKey: string; content: PackContent }[],
  existing: Map<string, ImagePackImage>
): void {
  for (const { stateKey, content } of packs) {
    const packLevel = content?.pack as PackContent | undefined;
    const packUsage = Array.isArray(packLevel?.usage) ? (packLevel!.usage as string[]) : null;
    const packName = (packLevel?.display_name as string | undefined) || stateKey || '';

    const images = content?.images as
      | Record<
          string,
          {
            url: string;
            usage?: string[];
            body?: string;
            mimetype?: string;
            info?: Record<string, unknown>;
          }
        >
      | undefined;
    if (!images) continue;

    for (const [shortcode, img] of Object.entries(images)) {
      if (!img?.url || existing.has(shortcode)) continue;

      const imgUsageRaw = Array.isArray(img.usage) ? img.usage : null;
      const effectiveUsage =
        imgUsageRaw && imgUsageRaw.length > 0
          ? imgUsageRaw
          : packUsage && packUsage.length > 0
            ? packUsage
            : ['emoticon', 'sticker'];

      existing.set(shortcode, {
        url: img.url,
        usage: effectiveUsage,
        body: img.body,
        mimetype: img.mimetype,
        info: img.info,
        packName,
      });
    }
  }
}

function roomPacks(byStateKey: Map<string, PackContent[]>, only?: PackContent) {
  const result: { stateKey: string; content: PackContent }[] = [];
  for (const [stateKey, contents] of byStateKey) {
    if (only && !(stateKey in only)) continue;
    for (const content of contents) result.push({ stateKey, content });
  }
  return result;
}

async function extractSpacePacks(
  roomId: string,
  client: MatrixClient,
  existing: Map<string, ImagePackImage>,
  visited: Set<string>,
  depth: number,
  maxDepth = 5
): Promise<void> {
  if (depth > maxDepth) return;

  for (const parentRoomId of await canonicalParents(client, roomId)) {
    if (!parentRoomId || visited.has(parentRoomId)) continue;
    visited.add(parentRoomId);

    extractPacks(roomPacks(await readRoomPackContents(client, parentRoomId)), existing);

    await extractSpacePacks(parentRoomId, client, existing, visited, depth + 1, maxDepth);
  }
}

async function loadImagePacks(
  client: MatrixClient,
  roomId: string,
  subscribedRooms: Record<string, PackContent>,
  userPack: PackContent | null
): Promise<Map<string, ImagePackImage>> {
  const result = new Map<string, ImagePackImage>();

  try {
    for (const [rid, stateKeys] of Object.entries(subscribedRooms)) {
      extractPacks(roomPacks(await readRoomPackContents(client, rid), stateKeys), result);
    }
  } catch {
    /* noop */
  }

  if (userPack) extractPacks([{ stateKey: '', content: userPack }], result);

  extractPacks(roomPacks(await readRoomPackContents(client, roomId)), result);

  const visited = new Set<string>([roomId]);
  await extractSpacePacks(roomId, client, result, visited, 1);

  return result;
}

export function useImagePacks(
  client: MatrixClient | null,
  roomId: string | null
): Map<string, ImagePackImage> {
  const subscribedRooms = useSubscribedPackRooms();
  const userPack = useAccountData(USER_PACK);
  const revision = usePackRevision();
  const [packs, setPacks] = useState<Map<string, ImagePackImage>>(() => new Map());

  useEffect(() => {
    if (!client || !roomId) {
      setPacks(new Map());
      return;
    }
    let cancelled = false;
    void loadImagePacks(client, roomId, subscribedRooms, userPack)
      .then((result) => {
        if (!cancelled) setPacks(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, roomId, subscribedRooms, userPack, revision]);

  return packs;
}

const ImagePacksContext = createContext<Map<string, ImagePackImage>>(new Map());

export function ImagePacksProvider({
  client,
  roomId,
  children,
}: {
  client: MatrixClient | null;
  roomId: string | null;
  children: ReactNode;
}) {
  const packs = useImagePacks(client, roomId);
  return createElement(ImagePacksContext.Provider, { value: packs }, children);
}

export function useImagePacksContext(): Map<string, ImagePackImage> {
  return useContext(ImagePacksContext);
}
