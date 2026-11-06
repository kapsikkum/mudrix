import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useQueries } from '@tanstack/react-query';
import type { RoomSummary, ThreadInfo } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { isThreadInfoUnread } from '@/app/hooks/useHasUnreadThreads';
import { threadLastSeenAtom } from '@/app/store/atoms';

const MAX_THREADS = 50;
/** How many of the most recently active rooms get their thread list asked for. */
const FETCH_ROOMS = 25;

export interface InboxThread {
  room: RoomSummary;
  info: ThreadInfo;
  unread: boolean;
  /** When the thread last had activity. */
  ts: number;
}

export interface UseThreadsInboxResult {
  threads: InboxThread[];
  unreadCount: number;
}

/**
 * Threads you take part in, across the busiest joined rooms, newest activity first. Rooms are
 * asked for their threads only while `enabled` (the tab is showing) and again when they see new
 * activity.
 */
export function useThreadsInbox(enabled: boolean): UseThreadsInboxResult {
  const rooms = useAllRooms();
  const lastSeen = useAtomValue(threadLastSeenAtom);
  const myUserId = getMatrixClientOrNull()?.userId();

  const busiest = useMemo(
    () =>
      enabled
        ? rooms
            .filter((room) => !room.isInvite && !room.isSpace && !room.isTombstoned)
            .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
            .slice(0, FETCH_ROOMS)
        : [],
    [enabled, rooms]
  );

  const results = useQueries({
    queries: busiest.map((room) => ({
      queryKey: ['inboxThreads', room.id, room.lastActivity],
      queryFn: async () => (await getMatrixClientOrNull()!.threads(room.id, true)).threads,
      enabled: !!getMatrixClientOrNull(),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const threads = useMemo((): InboxThread[] => {
    const list: InboxThread[] = [];
    busiest.forEach((room, i) => {
      for (const info of results[i]?.data ?? []) {
        if (!info.participated) continue;
        list.push({
          room,
          info,
          unread: isThreadInfoUnread(info, myUserId, lastSeen),
          ts: info.latestTimestamp ?? info.timestamp,
        });
      }
    });
    return list.sort((a, b) => b.ts - a.ts).slice(0, MAX_THREADS);
  }, [busiest, results, myUserId, lastSeen]);

  return { threads, unreadCount: threads.filter((t) => t.unread).length };
}
