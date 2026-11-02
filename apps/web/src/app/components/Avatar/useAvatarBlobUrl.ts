import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useMediaBlobUrl } from './useMediaBlobUrl';

export function useAvatarBlobUrl(
  mxcUrl: string | undefined | null,
  client: MatrixClient | null | undefined
) {
  const { src, refetch } = useMediaBlobUrl(client, mxcUrl, {
    width: 64,
    height: 64,
    resizeMethod: 'crop',
  });
  return { data: src, refetch };
}
