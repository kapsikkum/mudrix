import type { MediaInfo, MudrixClient } from '@mudrix/core';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import { getCachedBlobUrl } from './mediaCache';

export function getMediaBlobUrl(
  mxcUrl: string,
  client: MudrixClient,
  setState: (url: string) => void
): string | null {
  if (!mxcUrl) return null;

  const cacheKey = `mxc:${mxcUrl}`;
  const cached = getCachedBlobUrl(cacheKey);
  if (cached) return cached;

  fetchMediaBlobUrl(mxcUrl, client, 1).then((url) => {
    if (url) setState(url);
  });
  return null;
}

export function plainMediaUrl(source: MediaInfo['source'] | null | undefined): string | null {
  return source && 'url' in source && typeof source.url === 'string' ? source.url : null;
}

export interface GifSourceRef {
  /** The mxc URL of the GIF on the homeserver */
  url: string;
  /** The encrypted file descriptor, when the media is encrypted */
  file?: unknown;
}

/**
 * What the favourite star needs to save a GIF: its mxc URL, and for encrypted media the file
 * descriptor, because the URL alone cannot be decrypted later.
 */
export function gifSourceRef(source: MediaInfo['source'] | null | undefined): GifSourceRef | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  if (typeof record.url === 'string') return { url: record.url };
  const file = record.file;
  if (file && typeof file === 'object') {
    const url = (file as Record<string, unknown>).url;
    if (typeof url === 'string') return { url, file };
  }
  return null;
}

export function getMediaAnimates(media: MediaInfo | null | undefined): boolean {
  return media?.isAnimated ?? false;
}
