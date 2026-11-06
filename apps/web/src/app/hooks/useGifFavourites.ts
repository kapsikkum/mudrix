import { useCallback, useEffect, useState } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { STORAGE_KEY_GIF_FAVOURITES } from '@/const/storageKeys';
import { accountStorageKey } from '@/const/accountStorage';
import { useAccountData, useSyncReady } from '@/app/data';
import { mudrixKey, wizardchatKey } from '@/util/namespace';

export const GIF_FAVOURITES_CAP = 50;
const GIF_FAVOURITES_ACCOUNT_DATA = mudrixKey('gif_favourites');
/** Where the WizardChat base kept them, read until the first change writes the Mudrix event */
const WIZARDCHAT_GIF_FAVOURITES = wizardchatKey('gif_favourites');

function parseFavourites(content: unknown): string[] {
  if (!content || typeof content !== 'object') return [];
  const urls = (content as Record<string, unknown>).urls;
  if (!Array.isArray(urls)) return [];
  const valid = urls.filter(
    (url): url is string => typeof url === 'string' && /^https:\/\//.test(url)
  );
  return Array.from(new Set(valid)).slice(0, GIF_FAVOURITES_CAP);
}

function readLegacyFavourites(): string[] {
  try {
    const raw = localStorage.getItem(accountStorageKey(STORAGE_KEY_GIF_FAVOURITES));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const urls = parsed.map((entry) => {
      if (typeof entry === 'string') return entry;
      const images = (entry as Record<string, unknown> | null)?.images as
        Record<string, { url?: string }> | undefined;
      return images?.downsized?.url ?? images?.original?.url ?? images?.fixed_width?.url ?? '';
    });
    return parseFavourites({ urls });
  } catch {
    return [];
  }
}

function writeFavourites(client: WizardClient, urls: string[]): Promise<void> {
  return client.setAccountData(GIF_FAVOURITES_ACCOUNT_DATA, {
    urls: urls.slice(0, GIF_FAVOURITES_CAP),
  });
}

export function useGifFavourites(client: WizardClient | null | undefined): {
  favourites: string[];
  toggleFavourite: (url: string) => void;
} {
  const mudrixSynced = useAccountData(GIF_FAVOURITES_ACCOUNT_DATA);
  const wizardchatSynced = useAccountData(WIZARDCHAT_GIF_FAVOURITES);
  const synced = mudrixSynced ?? wizardchatSynced;
  const syncReady = useSyncReady();
  const [favourites, setFavourites] = useState<string[]>([]);

  useEffect(() => setFavourites(parseFavourites(synced)), [synced]);

  // Favourites used to live in this browser only: merge them into the synced list once
  useEffect(() => {
    if (!client || !syncReady) return;
    const legacy = readLegacyFavourites();
    if (legacy.length === 0) return;
    void client
      .accountData(GIF_FAVOURITES_ACCOUNT_DATA)
      .then((existing) => {
        const merged = Array.from(new Set([...parseFavourites(existing), ...legacy])).slice(
          0,
          GIF_FAVOURITES_CAP
        );
        setFavourites(merged);
        return writeFavourites(client, merged);
      })
      .then(() => localStorage.removeItem(accountStorageKey(STORAGE_KEY_GIF_FAVOURITES)))
      .catch(() => {});
  }, [client, syncReady]);

  const toggleFavourite = useCallback(
    (url: string) => {
      if (!client) return;
      const next = favourites.includes(url)
        ? favourites.filter((u) => u !== url)
        : [url, ...favourites].slice(0, GIF_FAVOURITES_CAP);
      const previous = favourites;
      setFavourites(next);
      writeFavourites(client, next).catch(() => setFavourites(previous));
    },
    [client, favourites]
  );

  return { favourites, toggleFavourite };
}
