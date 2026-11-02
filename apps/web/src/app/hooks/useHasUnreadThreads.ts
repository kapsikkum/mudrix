import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ThreadInfo } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useRoom } from '@/app/data';
import { threadLastSeenAtom } from '@/app/store/atoms';

export function isThreadInfoUnread(
  info: Pick<ThreadInfo, 'rootEventId' | 'latestSender' | 'latestTimestamp'> & {
    latestEventId?: string | null;
  },
  myUserId: string | null | undefined,
  lastSeen: Record<string, string>
): boolean {
  if (!info.latestSender || info.latestSender === myUserId) return false;
  const seenValue = lastSeen[info.rootEventId];
  if (info.latestEventId && seenValue === info.latestEventId) return false;
  const latest = info.latestTimestamp ?? 0;
  const seen = Number(seenValue ?? 0);
  return Number.isFinite(seen) ? latest > seen : false;
}

export function useRoomThreads(roomId: string | null | undefined): ThreadInfo[] {
  const client = getMatrixClientOrNull();
  const activity = useRoom(roomId)?.lastActivity ?? null;
  const { data } = useQuery<ThreadInfo[]>({
    queryKey: ['roomThreads', roomId ?? '', activity],
    queryFn: async () => (await client!.threads(roomId!, false)).threads,
    enabled: !!client && !!roomId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return data ?? [];
}

export function useHasUnreadThreads(roomId: string | null | undefined): boolean {
  const myUserId = getMatrixClientOrNull()?.userId();
  const threadLastSeen = useAtomValue(threadLastSeenAtom);
  const threads = useRoomThreads(roomId);

  return useMemo(
    () => threads.some((thread) => isThreadInfoUnread(thread, myUserId, threadLastSeen)),
    [threads, myUserId, threadLastSeen]
  );
}
