import type { MatrixClient } from 'matrix-js-sdk';
import { getCachedBlobUrl, setCachedBlobUrl } from '@/app/features/timeline/message/mediaCache';
import { mxcUrlToHttp } from '@/util/matrix/mxcUrl';
import { getSafeMimeType } from '@/util/safeMimeType';

function isMxcUrl(url: string): boolean {
  return url.startsWith('mxc://');
}

const inFlightFetches = new Map<string, Promise<string | null>>();

export function mediaBlobCacheKey(
  mxcUrl: string,
  width?: number,
  height?: number,
  resizeMethod?: string
): string {
  if (!width && !height) return `mxc:${mxcUrl}`;
  return `mxc:${mxcUrl}:${width ?? ''}x${height ?? ''}:${resizeMethod ?? 'scale'}`;
}

export async function fetchMediaBlobUrl(
  mxcUrl: string,
  client: MatrixClient,
  retries = 2,
  width?: number,
  height?: number,
  resizeMethod?: string
): Promise<string | null> {
  if (!isMxcUrl(mxcUrl)) return null;

  const cacheKey = mediaBlobCacheKey(mxcUrl, width, height, resizeMethod);
  const cached = getCachedBlobUrl(cacheKey);
  if (cached) return cached;

  if (cacheKey !== `mxc:${mxcUrl}`) {
    const fullSize = getCachedBlobUrl(`mxc:${mxcUrl}`);
    if (fullSize) return fullSize;
  }

  const httpUrl = mxcUrlToHttp(
    client,
    mxcUrl,
    width,
    height,
    resizeMethod ?? 'scale',
    false,
    true,
    true
  );
  if (!httpUrl) return null;

  const pending = inFlightFetches.get(cacheKey);
  if (pending) {
    return pending;
  }

  const fetchPromise = (async (): Promise<string | null> => {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(httpUrl, {
          headers: { Authorization: `Bearer ${client.getAccessToken()}` },
        });
        if (!res.ok) {
          if (i < retries) {
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
            continue;
          }
          return null;
        }
        // Never trust the uploaded content type: an SVG/HTML blob opened in a tab would run as the app
        const raw = await res.blob();
        const blob = new Blob([raw], { type: getSafeMimeType(raw.type) });
        const blobUrl = URL.createObjectURL(blob);
        setCachedBlobUrl(cacheKey, blobUrl, blob.type);
        return blobUrl;
      } catch {
        if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
    return null;
  })();

  inFlightFetches.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightFetches.delete(cacheKey);
  }
}
