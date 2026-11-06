import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { RoomSettings } from '@wizardchat/core';
import { canSendState, queryKeys, useUserId } from '@/app/data';
import { getMatrixClientOrNull } from '@/client/initMatrix';

/**
 * What local state knows of several rooms' settings (power levels, creators, join rule), without a
 * request per room. A room that is not known yet is missing from the map.
 */
export function useLocalRoomSettings(
  roomIds: readonly string[]
): ReadonlyMap<string, RoomSettings> {
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
    const map = new Map<string, RoomSettings>();
    queries.forEach((q, i) => {
      if (q.data) map.set(roomIds[i], q.data);
    });
    return map;
    // `signature` stands for the loaded answers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

/**
 * The rooms among `roomIds` in which the user may send a state event of `type`, from what local
 * state knows. Used by lists that offer an action on many rooms at once.
 */
export function useRoomsWhereCanSendState(
  roomIds: readonly string[],
  type: string
): ReadonlySet<string> {
  const userId = useUserId();
  const settings = useLocalRoomSettings(roomIds);
  return useMemo(() => {
    const allowed = new Set<string>();
    for (const [roomId, room] of settings) {
      if (canSendState(room, userId, type)) allowed.add(roomId);
    }
    return allowed;
  }, [settings, userId, type]);
}
