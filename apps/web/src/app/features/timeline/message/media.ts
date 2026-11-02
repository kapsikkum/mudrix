import type { MediaInfo, WizardClient } from '@wizardchat/core';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import { getCachedBlobUrl } from './mediaCache';

export function getMediaBlobUrl(
  mxcUrl: string,
  client: WizardClient,
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

export function getMediaAnimates(media: MediaInfo | null | undefined): boolean {
  return media?.isAnimated ?? false;
}
