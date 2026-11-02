import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { formatUserId } from '@/util/matrix';

export type InviteKind = 'room' | 'dm' | 'space';

export interface Invite {
  roomId: string;
  name: string;
  avatarMxc: string | null;
  kind: InviteKind;
  inviterUserId: string | null;
  inviterDisplayName: string | null;
  ts: number | null;
}

export function useInvites(): Invite[] {
  const rooms = useAllRooms();
  const invited = useMemo(() => rooms.filter((room) => room.isInvite), [rooms]);

  const inviters = useQueries({
    queries: invited.map((room) => ({
      queryKey: ['inviteInfo', room.id],
      queryFn: () => getMatrixClientOrNull()!.inviteInfo(room.id),
      enabled: !!getMatrixClientOrNull(),
      staleTime: Infinity,
    })),
  });

  return useMemo(
    () =>
      invited
        .map((room, i): Invite => {
          const info = inviters[i]?.data;
          const inviterUserId = info?.inviterId ?? null;
          return {
            roomId: room.id,
            name: room.name ?? room.id,
            avatarMxc: room.avatarUrl,
            kind: room.isSpace ? 'space' : room.isDirect ? 'dm' : 'room',
            inviterUserId,
            inviterDisplayName:
              info?.inviterName ?? (inviterUserId ? formatUserId(inviterUserId) : null),
            ts: info?.timestamp ?? null,
          };
        })
        .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)),
    [invited, inviters]
  );
}
