import { useQuery } from '@tanstack/react-query';
import type { UrlPreview, WizardClient } from '@wizardchat/core';

export function useLinkPreview(
  client: WizardClient | null,
  url: string | null,
  isEncrypted: boolean
): { data: UrlPreview | null | undefined; isLoading: boolean } {
  const enabled = !!client && !!url && !isEncrypted;

  const { data, isLoading } = useQuery<UrlPreview | null>({
    queryKey: ['linkPreview', url],
    queryFn: async () => {
      try {
        return await client!.urlPreview(url!);
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
