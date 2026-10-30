import { useCallback, useEffect, useState } from 'react';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { STORAGE_KEY_GIF_FAVOURITES } from '@/const/storageKeys';
import { accountStorageKey } from '@/const/accountStorage';
import { useMatrixEvent } from './useMatrixEvent';

export const GIF_FAVOURITES_CAP = 50;
const GIF_FAVOURITES_ACCOUNT_DATA = 'org.wizardchat.gif_favourites';

type WritableAccountDataEventKey = Parameters<MatrixClient['setAccountData']>[0];
type AccountDataEventKey = Parameters<MatrixClient['getAccountData']>[0];

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
        | Record<string, { url?: string }>
        | undefined;
      return images?.downsized?.url ?? images?.original?.url ?? images?.fixed_width?.url ?? '';
    });
    return parseFavourites({ urls });
  } catch {
    return [];
  }
}

function readFavourites(client: MatrixClient | null | undefined): string[] {
  return parseFavourites(
    client?.getAccountData(GIF_FAVOURITES_ACCOUNT_DATA as AccountDataEventKey)?.getContent()
  );
}

function writeFavourites(client: MatrixClient, urls: string[]): Promise<unknown> {
  return client.setAccountData(GIF_FAVOURITES_ACCOUNT_DATA as WritableAccountDataEventKey, {
    urls: urls.slice(0, GIF_FAVOURITES_CAP),
  });
}

export function useGifFavourites(client: MatrixClient | null | undefined): {
  favourites: string[];
  toggleFavourite: (url: string) => void;
} {
  const [favourites, setFavourites] = useState<string[]>(() => readFavourites(client));

  useEffect(() => {
    setFavourites(readFavourites(client));
    if (!client?.isInitialSyncComplete()) return;
    const legacy = readLegacyFavourites();
    if (legacy.length === 0) return;
    const existing = readFavourites(client);
    const merged = Array.from(new Set([...existing, ...legacy])).slice(0, GIF_FAVOURITES_CAP);
    setFavourites(merged);
    writeFavourites(client, merged)
      .then(() => localStorage.removeItem(accountStorageKey(STORAGE_KEY_GIF_FAVOURITES)))
      .catch(() => {});
  }, [client]);

  useMatrixEvent(client, 'accountData', (event: MatrixEvent) => {
    if (event.getType() !== GIF_FAVOURITES_ACCOUNT_DATA) return;
    setFavourites(parseFavourites(event.getContent()));
  });

  const toggleFavourite = useCallback(
    (url: string) => {
      if (!client) return;
      const current = readFavourites(client);
      const next = current.includes(url)
        ? current.filter((u) => u !== url)
        : [url, ...current].slice(0, GIF_FAVOURITES_CAP);
      const previous = favourites;
      setFavourites(next);
      writeFavourites(client, next).catch(() => setFavourites(previous));
    },
    [client, favourites]
  );

  return { favourites, toggleFavourite };
}
