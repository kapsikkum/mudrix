import { useMemo } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';
import { useExtendedProfile, useExtendedProfileMutations } from '@/app/hooks/useExtendedProfile';

interface BannerState {
  mxc: string | null;
  canModify: boolean;
}

/** Profile banner for `userId`, backed by the shared extended-profile query. */
export function useUserBanner(client: MatrixClient | null, userId: string | null) {
  const { data: fields } = useExtendedProfile(client, userId);
  const { saveBannerFile, removeBannerField } = useExtendedProfileMutations(client);

  const banner = useMemo<BannerState | undefined>(() => {
    if (!client || !userId) return undefined;
    return { mxc: fields?.bannerMxc ?? null, canModify: userId === client.userId() };
  }, [client, userId, fields?.bannerMxc]);

  const saveBanner = ({ file }: { userId: string; file: File }) => saveBannerFile(file);
  const removeBanner = (_args: { userId: string }) => removeBannerField();

  return { banner, saveBanner, removeBanner };
}

export function useUserBannerBlob(client: MatrixClient | null, mxc: string | null | undefined) {
  const { src, refetch } = useMediaBlobUrl(client, mxc, {
    width: 800,
    height: 260,
    resizeMethod: 'scale',
  });
  return { data: src, refetch };
}
