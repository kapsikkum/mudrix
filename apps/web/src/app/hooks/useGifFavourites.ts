import { useCallback, useEffect, useState } from 'react';
import type { MudrixClient } from '@mudrix/core';
import { STORAGE_KEY_GIF_FAVOURITES } from '@/const/storageKeys';
import { accountStorageKey } from '@/const/accountStorage';
import { useAccountData, useSyncReady } from '@/app/data';
import { mudrixKey, upstreamKey } from '@/util/namespace';

export const GIF_FAVOURITES_CAP = 50;
const GIF_FAVOURITES_ACCOUNT_DATA = mudrixKey('gif_favourites');
/** Where the upstream base kept them, read until the first change writes the Mudrix event */
const UPSTREAM_GIF_FAVOURITES = upstreamKey('gif_favourites');

/** Encrypted media can only be shown again with its own key, so a favourite keeps the file descriptor too. */
export type GifFavouriteFiles = Record<string, unknown>;

export interface GifFavouriteState {
  urls: string[];
  files: GifFavouriteFiles;
}

function validUrl(url: unknown): url is string {
  return typeof url === 'string' && (/^https:\/\//.test(url) || /^mxc:\/\//.test(url));
}

export function parseFavourites(content: unknown): GifFavouriteState {
  if (!content || typeof content !== 'object') return { urls: [], files: {} };
  const record = content as Record<string, unknown>;
  const urls = Array.isArray(record.urls)
    ? Array.from(new Set(record.urls.filter(validUrl))).slice(0, GIF_FAVOURITES_CAP)
    : [];
  const files: GifFavouriteFiles = {};
  const stored = record.files;
  if (stored && typeof stored === 'object') {
    for (const url of urls) {
      const file = (stored as Record<string, unknown>)[url];
      if (file && typeof file === 'object') files[url] = file;
    }
  }
  return { urls, files };
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
    return parseFavourites({ urls }).urls;
  } catch {
    return [];
  }
}

function writeFavourites(client: MudrixClient, state: GifFavouriteState): Promise<void> {
  const files: GifFavouriteFiles = {};
  for (const url of state.urls) {
    const file = state.files[url];
    if (file) files[url] = file;
  }
  return client.setAccountData(GIF_FAVOURITES_ACCOUNT_DATA, {
    urls: state.urls.slice(0, GIF_FAVOURITES_CAP),
    ...(Object.keys(files).length ? { files } : {}),
  });
}

export function useGifFavourites(client: MudrixClient | null | undefined): {
  favourites: string[];
  /** The encrypted file descriptor of a favourite, when its media is encrypted */
  files: GifFavouriteFiles;
  toggleFavourite: (url: string, file?: unknown) => void;
} {
  const mudrixSynced = useAccountData(GIF_FAVOURITES_ACCOUNT_DATA);
  const upstreamSynced = useAccountData(UPSTREAM_GIF_FAVOURITES);
  const synced = mudrixSynced ?? upstreamSynced;
  const syncReady = useSyncReady();
  const [state, setState] = useState<GifFavouriteState>({ urls: [], files: {} });

  useEffect(() => setState(parseFavourites(synced)), [synced]);

  // Favourites used to live in this browser only: merge them into the synced list once
  useEffect(() => {
    if (!client || !syncReady) return;
    const legacy = readLegacyFavourites();
    if (legacy.length === 0) return;
    void client
      .accountData(GIF_FAVOURITES_ACCOUNT_DATA)
      .then((existing) => {
        const current = parseFavourites(existing);
        const merged: GifFavouriteState = {
          urls: Array.from(new Set([...current.urls, ...legacy])).slice(0, GIF_FAVOURITES_CAP),
          files: current.files,
        };
        setState(merged);
        return writeFavourites(client, merged);
      })
      .then(() => localStorage.removeItem(accountStorageKey(STORAGE_KEY_GIF_FAVOURITES)))
      .catch(() => {});
  }, [client, syncReady]);

  const toggleFavourite = useCallback(
    (url: string, file?: unknown) => {
      if (!client) return;
      const removing = state.urls.includes(url);
      const urls = removing
        ? state.urls.filter((u) => u !== url)
        : [url, ...state.urls].slice(0, GIF_FAVOURITES_CAP);
      const files: GifFavouriteFiles = {};
      for (const kept of urls) {
        if (kept === url) {
          if (!removing && file) files[kept] = file;
        } else if (state.files[kept]) {
          files[kept] = state.files[kept];
        }
      }
      const next: GifFavouriteState = { urls, files };
      const previous = state;
      setState(next);
      writeFavourites(client, next).catch(() => setState(previous));
    },
    [client, state]
  );

  return { favourites: state.urls, files: state.files, toggleFavourite };
}
