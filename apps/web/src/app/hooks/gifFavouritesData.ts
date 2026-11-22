// Framework-free GIF-favourite persistence + migration logic. Kept separate from the React hook
// so node:test can exercise the read/migration path with an injected Storage (see tests/).
//
// Descriptors (the EncryptedFile with the decryption key/iv) must never be written to account
// data: account data is not end-to-end encrypted. They live on this device, keyed per account,
// in localStorage. `gif_favourites` account data holds only the urls. Old (pre-d45aa7c8)
// account data still carries a `files` map; it is read as a compatibility fallback and copied
// onto this device, never written back.

export const GIF_FAVOURITES_CAP = 50;

export type GifFavouriteFiles = Record<string, unknown>;

export interface GifFavouriteState {
  urls: string[];
  files: GifFavouriteFiles;
}

/** The small part of the Web Storage API this module needs; injectable for tests. */
export interface FavouriteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function validUrl(url: unknown): url is string {
  return typeof url === 'string' && (/^https:\/\//.test(url) || /^mxc:\/\//.test(url));
}

/** urls + (legacy) descriptors from a single account-data event. */
export function parseFavourites(content: unknown): GifFavouriteState {
  if (!content || typeof content !== 'object') return { urls: [], files: {} };
  const record = content as Record<string, unknown>;
  const urls = Array.isArray(record.urls)
    ? Array.from(new Set(record.urls.filter(validUrl))).slice(0, GIF_FAVOURITES_CAP)
    : [];
  const files: GifFavouriteFiles = {};
  const stored = record.files;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    // Keep any descriptor keyed by a usable url, even when the `urls` list and the `files` map
    // have drifted apart (older builds rewrote one without the other). filesForUrls narrows this
    // back to the favourites actually shown, so no stale descriptor is ever displayed.
    for (const [url, file] of Object.entries(stored as Record<string, unknown>)) {
      if (validUrl(url) && file && typeof file === 'object') files[url] = file;
    }
  }
  return { urls, files };
}

/** Whether an account-data event is still in the old `files`-carrying format. */
export function hasAccountDataFiles(content: unknown): boolean {
  return !!content && typeof content === 'object' && 'files' in content;
}

/** The descriptors that still belong to the (capped) favourited URL list. */
export function filesForUrls(urls: string[], files: GifFavouriteFiles): GifFavouriteFiles {
  const kept: GifFavouriteFiles = {};
  for (const url of urls.slice(0, GIF_FAVOURITES_CAP)) {
    const file = files[url];
    if (file) kept[url] = file;
  }
  return kept;
}

/**
 * Read this device's descriptors. Descriptors may sit under more than one account-scoped key
 * (e.g. an earlier build wrote them before the active account id was known); read every one the
 * caller passes so a scoped migration can never strand the only copy of a decryption key.
 * `keys` are already built by the caller (primary key first).
 */
export function readLocalFiles(storage: FavouriteStorage, keys: string[]): GifFavouriteFiles {
  const files: GifFavouriteFiles = {};
  for (const key of keys) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      for (const [url, file] of Object.entries(parsed as Record<string, unknown>)) {
        if (validUrl(url) && file && typeof file === 'object' && !files[url]) files[url] = file;
      }
    } catch {
      // A broken or unreadable key must not hide the descriptors kept under the others.
    }
  }
  return files;
}

/** Persist descriptors to this device. Returns false when storage is unavailable or full. */
export function writeLocalFiles(
  storage: FavouriteStorage,
  key: string,
  files: GifFavouriteFiles
): boolean {
  try {
    if (Object.keys(files).length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(files));
    return true;
  } catch {
    return false;
  }
}

/** Favourites saved by the very old browser-only builds, read until they are merged into account data. */
export function readLegacyFavourites(storage: FavouriteStorage, legacyKey: string): string[] {
  try {
    const raw = storage.getItem(legacyKey);
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

/** Merge favourite urls from every account-data event (current + legacy upstream) and old local lists. */
export function mergeUrls(contents: unknown[], legacyUrls: string[] = []): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (list: string[]) => {
    for (const u of list) {
      if (validUrl(u) && !seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
  };
  for (const content of contents) add(parseFavourites(content).urls);
  add(legacyUrls);
  return urls.slice(0, GIF_FAVOURITES_CAP);
}

/**
 * Merge descriptors from this device and every account-data event. The per-device copy wins;
 * legacy account-data `files` fill the gaps (they are the only synced copy of pre-d45aa7c8 keys).
 */
export function mergeDescriptors(
  contents: unknown[],
  localFiles: GifFavouriteFiles
): GifFavouriteFiles {
  const merged: GifFavouriteFiles = { ...localFiles };
  for (const content of contents) {
    for (const [url, file] of Object.entries(parseFavourites(content).files)) {
      if (!merged[url]) merged[url] = file;
    }
  }
  return merged;
}

/**
 * Everything the picker needs, resolved at once from all sources. This is the read path: it is
 * robust to partial migration state (account data with or without `files`, local store with or
 * without descriptors) and does not depend on the destructive migration having finished.
 */
export function resolveFavourites(
  contents: unknown[],
  localFiles: GifFavouriteFiles,
  legacyUrls: string[] = []
): GifFavouriteState {
  const urls = mergeUrls(contents, legacyUrls);
  return { urls, files: filesForUrls(urls, mergeDescriptors(contents, localFiles)) };
}

/** Descriptors still only in account data, to copy onto this device before any cleanup. */
export function descriptorsToCapture(
  contents: unknown[],
  localFiles: GifFavouriteFiles,
  urls: string[]
): GifFavouriteFiles {
  const merged = filesForUrls(urls, mergeDescriptors(contents, {}));
  const toCapture: GifFavouriteFiles = {};
  for (const [url, file] of Object.entries(merged)) {
    if (JSON.stringify(localFiles[url]) !== JSON.stringify(file)) toCapture[url] = file;
  }
  return toCapture;
}

/** The only shape ever written to `gif_favourites` account data: urls, never `files`. */
export function accountDataContent(urls: string[]): { urls: string[] } {
  return { urls: urls.slice(0, GIF_FAVOURITES_CAP) };
}
