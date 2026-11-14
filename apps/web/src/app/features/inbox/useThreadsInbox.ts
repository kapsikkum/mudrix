import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useQueries } from '@tanstack/react-query';
import type { RoomSummary, ThreadInfo } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { isThreadInfoUnread } from '@/app/hooks/useHasUnreadThreads';
import { threadLastSeenAtom } from '@/app/store/atoms';
import { roomsWithUnreadThreads, threadCandidates } from './inboxNotifications';
import { useServerNotifications } from './useServerNotifications';

const MAX_THREADS = 50;
/** How many of the most recently active rooms get their thread list asked for, besides rooms with unread replies. */
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
 * Threads you take part in, across the busiest joined rooms and the rooms the server reports unread
 * thread replies in, newest activity first. Rooms are asked for their threads only while `enabled`
 * (the tab is showing) and again when they see new activity.
 */
export function useThreadsInbox(enabled: boolean): UseThreadsInboxResult {
  const rooms = useAllRooms();
  const lastSeen = useAtomValue(threadLastSeenAtom);
  const myUserId = getMatrixClientOrNull()?.userId();
  const server = useServerNotifications().data;
  const unreadThreadRoomIds = useMemo(() => roomsWithUnreadThreads(server?.all ?? []), [server]);

  const busiest = useMemo(
    () =>
      enabled
        ? threadCandidates(
            rooms.filter((room) => !room.isInvite && !room.isSpace && !room.isTombstoned),
            unreadThreadRoomIds,
            FETCH_ROOMS
          )
        : [],
    [enabled, rooms, unreadThreadRoomIds]
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
