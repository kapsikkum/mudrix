import { useCallback, useEffect, useState } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { fetchMediaBlobUrl, mediaBlobCacheKey } from './fetchMediaBlobUrl';
import { deleteCachedBlobUrl, getCachedBlobUrl } from '@/app/features/timeline/message/mediaCache';

export interface MediaBlobOptions {
  width?: number;
  height?: number;
  resizeMethod?: string;
  enabled?: boolean;
  queue?: boolean;
}

export interface MediaBlobResult {
  src: string | undefined;
  refetch: () => void;
}

function resolveInitialSrc(
  mxcUrl: string | undefined | null,
  cacheKey: string | null
): string | undefined {
  if (!mxcUrl) return undefined;
  if (!mxcUrl.startsWith('mxc://')) return undefined;
  return cacheKey ? (getCachedBlobUrl(cacheKey) ?? undefined) : undefined;
}

export function useMediaBlobUrl(
  client: MatrixClient | null | undefined,
  mxcUrl: string | undefined | null,
  options: MediaBlobOptions = {}
): MediaBlobResult {
  const { width, height, resizeMethod, enabled = true } = options;
  const isMxc = !!mxcUrl && mxcUrl.startsWith('mxc://');
  const cacheKey = isMxc ? mediaBlobCacheKey(mxcUrl as string, width, height, resizeMethod) : null;

  const [state, setState] = useState<{ key: string | null; src: string | undefined }>(() => ({
    key: cacheKey,
    src: resolveInitialSrc(mxcUrl, cacheKey),
  }));
  const [nonce, setNonce] = useState(0);

  if (state.key !== cacheKey) {
    setState({ key: cacheKey, src: resolveInitialSrc(mxcUrl, cacheKey) });
  }

  useEffect(() => {
    if (!mxcUrl || !client || !isMxc || !cacheKey || !enabled) return;
    if (getCachedBlobUrl(cacheKey)) return;

    let alive = true;
    fetchMediaBlobUrl(mxcUrl, client, 2, width, height, resizeMethod).then((url) => {
      if (alive && url) {
        setState((prev) => (prev.key === cacheKey ? { key: prev.key, src: url } : prev));
      }
    });
    return () => {
      alive = false;
    };
  }, [mxcUrl, client, isMxc, cacheKey, width, height, resizeMethod, enabled, nonce]);

  const refetch = useCallback(() => {
    if (cacheKey) deleteCachedBlobUrl(cacheKey);
    setNonce((n) => n + 1);
  }, [cacheKey]);

  return { src: state.src, refetch };
}
