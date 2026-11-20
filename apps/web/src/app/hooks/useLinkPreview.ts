import { useQuery } from '@tanstack/react-query';
import type { UrlPreview, MudrixClient } from '@mudrix/core';
import { checkPublicHttpsUrl } from '@/util/integrationFetch';

/** Whether the homeserver may be asked to fetch this link for a preview. */
export function isPreviewableUrl(url: string | null | undefined): url is string {
  return !!url && checkPublicHttpsUrl(url).ok;
}

export function useLinkPreview(
  client: MudrixClient | null,
  url: string | null,
  isEncrypted: boolean
): { data: UrlPreview | null | undefined; isLoading: boolean } {
  // Never let a message point the homeserver at http, an IP or a name on the local network.
  const previewUrl = isPreviewableUrl(url) ? url : null;
  const enabled = !!client && !!previewUrl && !isEncrypted;

  const { data, isLoading } = useQuery<UrlPreview | null>({
    queryKey: ['linkPreview', previewUrl],
    queryFn: async () => {
      if (!client || !previewUrl) return null;
      try {
        return await client.urlPreview(previewUrl);
      } catch {
        return null;
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });

  // Never expose cached data for encrypted rooms
  return { data: enabled ? data : undefined, isLoading: enabled ? isLoading : false };
}
