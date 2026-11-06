import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { canSendState, queryKeys, useUserId } from '@/app/data';
import { getMatrixClientOrNull } from '@/client/initMatrix';

/**
 * The rooms among `roomIds` in which the user may send a state event of `type`, from what local
 * state knows (no request per room). Used by lists that offer an action on many rooms at once.
 */
export function useRoomsWhereCanSendState(
  roomIds: readonly string[],
  type: string
): ReadonlySet<string> {
  const userId = useUserId();
  const queries = useQueries({
    queries: roomIds.map((roomId) => ({
      queryKey: [...queryKeys.roomSettings(roomId), 'local'],
      queryFn: () => getMatrixClientOrNull()!.localRoomSettings(roomId),
      enabled: !!getMatrixClientOrNull(),
      staleTime: 30_000,
    })),
  });
  const signature = queries.map((q, i) => `${roomIds[i]}:${q.dataUpdatedAt}`).join('|');
  return useMemo(() => {
    const allowed = new Set<string>();
    queries.forEach((q, i) => {
      if (canSendState(q.data, userId, type)) allowed.add(roomIds[i]);
    });
    return allowed;
    // `signature` stands for the loaded answers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, userId, type]);
}
