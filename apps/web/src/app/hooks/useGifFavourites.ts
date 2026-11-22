import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MudrixClient } from '@mudrix/core';
import { STORAGE_KEY_GIF_FAVOURITE_FILES, STORAGE_KEY_GIF_FAVOURITES } from '@/const/storageKeys';
import { accountStorageKey } from '@/const/accountStorage';
import { useAccountData, useSyncReady } from '@/app/data';
import { mudrixKey, upstreamKey } from '@/util/namespace';
import {
  GIF_FAVOURITES_CAP,
  type GifFavouriteFiles,
  type FavouriteStorage,
  accountDataContent,
  descriptorsToCapture,
  filesForUrls,
  mergeDescriptors,
  readLegacyFavourites,
  readLocalFiles,
  resolveFavourites,
  writeLocalFiles,
} from './gifFavouritesData';

export { GIF_FAVOURITES_CAP } from './gifFavouritesData';
export type { GifFavouriteFiles, GifFavouriteState } from './gifFavouritesData';

const GIF_FAVOURITES_ACCOUNT_DATA = mudrixKey('gif_favourites');
/** Where the upstream base kept them; still read so old favourites are not lost. */
const UPSTREAM_GIF_FAVOURITES = upstreamKey('gif_favourites');

/** localStorage may be unavailable (private mode, desktop webview quirks); never let it throw. */
const storage: FavouriteStorage = {
  getItem: (key) => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      /* storage full or unavailable */
    }
  },
  removeItem: (key) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Every account-scoped key that may hold descriptors, primary key first. An older build wrote
 * descriptors before the active account id was known (or under a different scope); reading all
 * of them recovers the only copy of a key instead of leaving a favourite undecryptable.
 */
function localDescriptorKeys(primary: string): string[] {
  const keys = new Set<string>([primary]);
  try {
    if (typeof localStorage !== 'undefined') {
      const prefix = `${STORAGE_KEY_GIF_FAVOURITE_FILES}::`;
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(prefix)) keys.add(key);
      }
    }
  } catch {
    /* storage unavailable: the primary key is still enough */
  }
  return [...keys];
}

function writeAccountFavourites(client: MudrixClient, urls: string[]): Promise<void> {
  // Descriptors (decryption keys) must NEVER be written to account data: it is not E2EE.
  return client.setAccountData(GIF_FAVOURITES_ACCOUNT_DATA, accountDataContent(urls));
}

export function useGifFavourites(client: MudrixClient | null | undefined): {
  favourites: string[];
  /** The encrypted file descriptor of a favourite, when its media is encrypted */
  files: GifFavouriteFiles;
  toggleFavourite: (url: string, file?: unknown) => void;
} {
  const mudrixSynced = useAccountData(GIF_FAVOURITES_ACCOUNT_DATA);
  const upstreamSynced = useAccountData(UPSTREAM_GIF_FAVOURITES);
  const syncReady = useSyncReady();

  // Consult BOTH account-data events. The old code used `mudrix ?? upstream`, so descriptors kept
  // in the other event (or urls in one and files in the other) were invisible.
  const accountData = useMemo(() => [mudrixSynced, upstreamSynced], [mudrixSynced, upstreamSynced]);

  const filesKey = accountStorageKey(STORAGE_KEY_GIF_FAVOURITE_FILES);
  const legacyKey = accountStorageKey(STORAGE_KEY_GIF_FAVOURITES);
  const localKeys = useMemo(() => localDescriptorKeys(filesKey), [filesKey]);
  const legacyUrls = useMemo(
    () => readLegacyFavourites(storage, legacyKey),
    [legacyKey, syncReady]
  );

  // `urls` is the authoritative (and optimistic) list. Descriptors are derived separately below
  // so they are available synchronously, on the very same render the urls appear.
  const [urls, setUrls] = useState<string[]>(
    () => resolveFavourites(accountData, readLocalFiles(storage, localKeys), legacyUrls).urls
  );

  // Reconcile with account data as it loads/changes; drop any optimistic toggle once the write
  // has been echoed back. Descriptors are NOT cleared here: the synchronous read below always
  // re-derives them from every source, so a favourite is never shown as failed mid-migration.
  useEffect(() => {
    setUrls(resolveFavourites(accountData, readLocalFiles(storage, localKeys), legacyUrls).urls);
  }, [accountData, localKeys, legacyUrls]);

  /**
   * The read path, computed synchronously (no effect, no `syncReady` gate, no one-shot flag).
   * Descriptors come from this device's local store AND from the legacy `files` still present in
   * either account-data event. So a pre-d45aa7c8 favourite renders immediately, an already-
   * migrated favourite keeps rendering after account data was rewritten to urls-only, and no
   * favourite is shown as a broken image just because the migration has not settled yet.
   */
  const files = useMemo(
    () => filesForUrls(urls, mergeDescriptors(accountData, readLocalFiles(storage, localKeys))),
    [urls, accountData, localKeys]
  );

  /**
   * Migrate legacy descriptors onto this device, eagerly and idempotently. This is deliberately
   * NON-destructive: d45aa7c8 rewrote the shared account data to drop `files` in a fire-and-forget
   * effect, which stranded every other device that had not yet copied the keys locally (the
   * desktop symptom). We copy keys off account data here but leave the legacy `files` in place as
   * a synced fallback; the next explicit write (toggleFavourite) rewrites account data urls-only.
   */
  useEffect(() => {
    const toCapture = descriptorsToCapture(accountData, readLocalFiles(storage, localKeys), urls);
    if (Object.keys(toCapture).length === 0) return;
    const current = readLocalFiles(storage, localKeys);
    if (writeLocalFiles(storage, filesKey, { ...current, ...toCapture })) {
      // Captured. Nothing is written to account data here, so no key can be leaked or lost.
    }
  }, [accountData, localKeys, filesKey, urls]);

  // Favourites saved by very old browser-only builds: merge them into account data once.
  useEffect(() => {
    if (!client || !syncReady || legacyUrls.length === 0) return;
    void client
      .accountData(GIF_FAVOURITES_ACCOUNT_DATA)
      .then((existing) => {
        const merged = resolveFavourites(
          [existing, upstreamSynced],
          readLocalFiles(storage, localKeys),
          legacyUrls
        );
        setUrls(merged.urls);
        writeLocalFiles(storage, filesKey, merged.files);
        return writeAccountFavourites(client, merged.urls);
      })
      .then(() => storage.removeItem(legacyKey))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, syncReady, legacyKey]);

  const toggleFavourite = useCallback(
    (url: string, file?: unknown) => {
      if (!client) return;
      const removing = urls.includes(url);
      const nextUrls = removing
        ? urls.filter((u) => u !== url)
        : [url, ...urls].slice(0, GIF_FAVOURITES_CAP);

      const merged = mergeDescriptors(accountData, readLocalFiles(storage, localKeys));
      const nextFiles = filesForUrls(nextUrls, merged);
      if (!removing && file) nextFiles[url] = file;

      const previous = { urls, files: filesForUrls(urls, merged) };
      // Optimistic: update the list and persist the descriptor to this device immediately.
      setUrls(nextUrls);
      const persisted = writeLocalFiles(storage, filesKey, nextFiles);
      // Account data keeps only urls, never descriptors (no key leak).
      writeAccountFavourites(client, nextUrls).catch(() => {
        setUrls(previous.urls);
        if (persisted) writeLocalFiles(storage, filesKey, previous.files);
      });
    },
    [client, urls, accountData, localKeys, filesKey]
  );

  return { favourites: urls, files, toggleFavourite };
}
