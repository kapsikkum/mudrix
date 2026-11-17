import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMatrixClient } from '@/client/initMatrix';
import { formatUserId } from '@/util/matrix';

export interface ProfileData {
  displayName: string;
  avatarUrl: string | null;
  userId: string;
}

/** The own profile, with save and avatar removal */
export function useProfile(_client?: unknown) {
  const qc = useQueryClient();
  const client = getMatrixClient();
  const userId = client.userId() ?? '';
  const key = ['ownProfile', userId];

  const { data: profile } = useQuery<ProfileData>({
    queryKey: key,
    queryFn: async () => {
      const own = await client.ownProfile();
      return {
        displayName: own.displayName ?? formatUserId(userId),
        avatarUrl: own.avatarUrl,
        userId,
      };
    },
    staleTime: 60_000,
  });

  const { mutateAsync: saveProfile } = useMutation({
    mutationFn: async ({
      displayName,
      avatarFile,
    }: {
      displayName?: string;
      avatarFile?: File;
    }) => {
      const ops: Promise<unknown>[] = [];
      if (displayName !== undefined) ops.push(client.setDisplayName(displayName));
      if (avatarFile) {
        const bytes = new Uint8Array(await avatarFile.arrayBuffer());
        ops.push(client.setAvatar(bytes, avatarFile.type || 'image/png'));
      }
      await Promise.all(ops);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const { mutateAsync: removeAvatar } = useMutation({
    mutationFn: () => client.removeAvatar(),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { profile, saveProfile, removeAvatar };
}
