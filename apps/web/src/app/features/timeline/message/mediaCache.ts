import { getStoredUserId } from '@/const/accountStorage';

export function mediaCacheDbName(userId: string | null = getStoredUserId()): string {
  return `wz-media-cache-${userId ?? 'anon'}`;
}

const DB_VERSION = 2;
const DATA_STORE = 'decrypted-media';
const META_STORE = 'decrypted-media-meta';

interface CacheRecord {
  data: ArrayBuffer;
  mimeType: string;
}

interface MetaRecord {
  key: string;
  mimeType: string;
  size: number;
  lastAccess: number;
}

const MAX_CACHE_BYTES = 100 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 400;

// In-memory blob URL cache
const blobUrlCache = new Map<string, { blobUrl: string; mimeType: string }>();
const MAX_MEMORY_ENTRIES = 2000;

export function getCachedBlobUrl(key: string): string | null {
  const entry = blobUrlCache.get(key);
  if (!entry) return null;
  blobUrlCache.delete(key);
  blobUrlCache.set(key, entry);
  return entry.blobUrl;
}

export function setCachedBlobUrl(key: string, blobUrl: string, mimeType: string): void {
  const existing = blobUrlCache.get(key);
  if (existing) {
    URL.revokeObjectURL(existing.blobUrl);
  }
  if (blobUrlCache.size >= MAX_MEMORY_ENTRIES) {
    const lruKey = blobUrlCache.keys().next().value;
    if (lruKey !== undefined) {
      const evicted = blobUrlCache.get(lruKey);
      if (evicted) URL.revokeObjectURL(evicted.blobUrl);
      blobUrlCache.delete(lruKey);
    }
  }
  blobUrlCache.set(key, { blobUrl, mimeType });
}

export function deleteCachedBlobUrl(key: string, revoke = false): void {
  const existing = blobUrlCache.get(key);
  if (!existing) return;
  if (revoke) URL.revokeObjectURL(existing.blobUrl);
  blobUrlCache.delete(key);
}

let dbPromise: Promise<IDBDatabase> | null = null;
let openDbName: string | null = null;

export function clearMediaCache(): Promise<void> {
  for (const entry of blobUrlCache.values()) {
    URL.revokeObjectURL(entry.blobUrl);
  }
  blobUrlCache.clear();

  const pending = dbPromise;
  dbPromise = null;
  openDbName = null;
  if (!pending) return Promise.resolve();

  const close = pending.then((db) => db.close()).catch(() => {});
  return Promise.race([close, new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
}

function openDB(): Promise<IDBDatabase> {
  const name = mediaCacheDbName();
  if (dbPromise && openDbName === name) return dbPromise;
  if (dbPromise) {
    const previous = dbPromise;
    dbPromise = null;
    void previous.then((db) => db.close()).catch(() => {});
  }

  openDbName = name;
  dbPromise = openDb(name);
  return dbPromise;
}

function openDb(name: string): Promise<IDBDatabase> {
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of Array.from(db.objectStoreNames)) {
        db.deleteObjectStore(store);
      }
      db.createObjectStore(META_STORE, { keyPath: 'key' });
      db.createObjectStore(DATA_STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        if (openDbName === name) {
          dbPromise = null;
          openDbName = null;
        }
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    if (openDbName === name) {
      dbPromise = null;
      openDbName = null;
    }
    throw err;
  });

  return promise;
}

export function getMediaCacheKey(file: { url: string; iv: string }): string {
  return `enc:${file.url}:${file.iv}`;
}

export async function getCachedMedia(key: string): Promise<CacheRecord | null> {
  try {
    const db = await openDB();
    return await new Promise<CacheRecord | null>((resolve, reject) => {
      const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
      tx.onabort = () => reject(tx.error);

      const metaReq = tx.objectStore(META_STORE).get(key);
      metaReq.onerror = () => reject(metaReq.error);
      metaReq.onsuccess = () => {
        const meta = metaReq.result as MetaRecord | undefined;
        if (!meta) {
          resolve(null);
          return;
        }
        const dataReq = tx.objectStore(DATA_STORE).get(key);
        dataReq.onerror = () => reject(dataReq.error);
        dataReq.onsuccess = () => {
          const data = dataReq.result as ArrayBuffer | undefined;
          if (!data) {
            tx.objectStore(META_STORE).delete(key);
            resolve(null);
            return;
          }
          tx.objectStore(META_STORE).put({ ...meta, lastAccess: Date.now() });
          resolve({ data, mimeType: meta.mimeType });
        };
      };
    });
  } catch {
    return null;
  }
}

export async function setCachedMedia(
  key: string,
  data: ArrayBuffer,
  mimeType: string
): Promise<void> {
  if (data.byteLength > MAX_CACHE_BYTES) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
      const meta: MetaRecord = {
        key,
        mimeType,
        size: data.byteLength,
        lastAccess: Date.now(),
      };
      tx.objectStore(DATA_STORE).put(data, key);
      tx.objectStore(META_STORE).put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await enforceCacheLimits(db, key);
  } catch {
    // Non-critical - next access will re-download and re-decrypt
  }
}

async function enforceCacheLimits(db: IDBDatabase, keepKey: string): Promise<void> {
  const metas = await readAllMeta(db);

  let totalBytes = metas.reduce((sum, meta) => sum + (meta.size || 0), 0);
  if (metas.length <= MAX_CACHE_ENTRIES && totalBytes <= MAX_CACHE_BYTES) return;

  metas.sort((a, b) => a.lastAccess - b.lastAccess);
  const evict: string[] = [];
  for (const meta of metas) {
    if (evict.length + 1 >= metas.length) break;
    if (totalBytes <= MAX_CACHE_BYTES && metas.length - evict.length <= MAX_CACHE_ENTRIES) break;
    if (meta.key === keepKey) continue;
    evict.push(meta.key);
    totalBytes -= meta.size || 0;
  }
  if (evict.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
    for (const key of evict) {
      tx.objectStore(META_STORE).delete(key);
      tx.objectStore(DATA_STORE).delete(key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function readAllMeta(db: IDBDatabase): Promise<MetaRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const out: MetaRecord[] = [];
    const req = tx.objectStore(META_STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out.push(cursor.value as MetaRecord);
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}
