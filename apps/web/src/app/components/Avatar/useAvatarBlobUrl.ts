import type { MudrixClient as MatrixClient } from '@mudrix/core';
import { useMediaBlobUrl } from './useMediaBlobUrl';

export function useAvatarBlobUrl(
  mxcUrl: string | undefined | null,
  client: MatrixClient | null | undefined,
  pixels = 64
) {
  const { src, refetch } = useMediaBlobUrl(client, mxcUrl, {
    width: pixels,
    height: pixels,
    resizeMethod: 'crop',
  });
  return { data: src, refetch };
}
