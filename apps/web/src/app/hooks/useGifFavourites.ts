import { useCallback, useEffect, useState } from 'react';
import type { MudrixClient } from '@mudrix/core';
import { STORAGE_KEY_GIF_FAVOURITE_FILES, STORAGE_KEY_GIF_FAVOURITES } from '@/const/storageKeys';
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

/** Whether the account data still carries the file descriptors of older versions. */
function hasAccountDataFiles(content: unknown): boolean {
  return !!content && typeof content === 'object' && 'files' in content;
}

/** The descriptors that still belong to a favourited (and capped) URL list. */
function filesForUrls(urls: string[], files: GifFavouriteFiles): GifFavouriteFiles {
  const kept: GifFavouriteFiles = {};
  for (const url of urls.slice(0, GIF_FAVOURITES_CAP)) {
    const file = files[url];
    if (file) kept[url] = file;
  }
  return kept;
}

/**
 * Descriptors of encrypted favourite GIFs live on this device only: `files` in account data would
 * expose their decryption keys, as account data is not end-to-end encrypted.
 */
function readLocalFiles(): GifFavouriteFiles {
  try {
    const raw = localStorage.getItem(accountStorageKey(STORAGE_KEY_GIF_FAVOURITE_FILES));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const files: GifFavouriteFiles = {};
    for (const [url, file] of Object.entries(parsed as Record<string, unknown>)) {
      if (validUrl(url) && file && typeof file === 'object') files[url] = file;
    }
    return files;
  } catch {
    return {};
  }
}

function writeLocalFiles(files: GifFavouriteFiles): void {
  try {
    const key = accountStorageKey(STORAGE_KEY_GIF_FAVOURITE_FILES);
    if (Object.keys(files).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(files));
  } catch {
    // Storage being full or unavailable only loses the encrypted favourites' previews.
  }
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

function writeAccountFavourites(client: MudrixClient, urls: string[]): Promise<void> {
  // Never include `files`: account data is not end-to-end encrypted.
  return client.setAccountData(GIF_FAVOURITES_ACCOUNT_DATA, {
    urls: urls.slice(0, GIF_FAVOURITES_CAP),
  });
}

function writeFavourites(client: MudrixClient, state: GifFavouriteState): Promise<void> {
  const urls = state.urls.slice(0, GIF_FAVOURITES_CAP);
  writeLocalFiles(filesForUrls(urls, state.files));
  return writeAccountFavourites(client, urls);
}

/** Accounts whose encrypted GIF descriptors have already been moved off the account data. */
const migratedClients = new WeakSet<MudrixClient>();

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

  useEffect(() => {
    const parsed = parseFavourites(synced);
    // Older account data still carried descriptors; merge them with this device's copies for now.
    setState({
      urls: parsed.urls,
      files: filesForUrls(parsed.urls, { ...readLocalFiles(), ...parsed.files }),
    });
  }, [synced]);

  // Descriptors used to be written to the (unencrypted) account data. Move them to this device
  // once, then rewrite the event without them.
  useEffect(() => {
    if (!client || !syncReady || !hasAccountDataFiles(mudrixSynced)) return;
    if (migratedClients.has(client)) return;
    migratedClients.add(client);
    const parsed = parseFavourites(mudrixSynced);
    // The legacy merge may be writing at the same time: carry its URLs, so either write keeps them.
    const legacy = readLegacyFavourites();
    const urls = Array.from(new Set([...parsed.urls, ...legacy])).slice(0, GIF_FAVOURITES_CAP);
    writeLocalFiles(filesForUrls(urls, { ...readLocalFiles(), ...parsed.files }));
    void writeAccountFavourites(client, urls).catch(() => {});
  }, [client, syncReady, mudrixSynced]);

  // Favourites used to live in this browser only: merge them into the synced list once
  useEffect(() => {
    if (!client || !syncReady) return;
    const legacy = readLegacyFavourites();
    if (legacy.length === 0) return;
    void client
      .accountData(GIF_FAVOURITES_ACCOUNT_DATA)
      .then((existing) => {
        const current = parseFavourites(existing);
        const urls = Array.from(new Set([...current.urls, ...legacy])).slice(0, GIF_FAVOURITES_CAP);
        const merged: GifFavouriteState = {
          urls,
          files: filesForUrls(urls, { ...readLocalFiles(), ...current.files }),
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
      writeFavourites(client, next).catch(() => {
        setState(previous);
        writeLocalFiles(filesForUrls(previous.urls, previous.files));
      });
    },
    [client, state]
  );

  return { favourites: state.urls, files: state.files, toggleFavourite };
}
