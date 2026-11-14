import { useCallback, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { RoomSummary, ServerNotification } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { formatUserId } from '@/util/matrix';
import { mergeMentionCounts, unreadCountsByRoom } from './inboxNotifications';
import { useServerNotifications } from './useServerNotifications';

const MAX_MENTIONS = 50;
const MAX_PER_ROOM = 15;

export interface Mention {
  eventId: string;
  roomId: string;
  roomName: string;
  roomAvatarMxc: string | null;
  senderId: string;
  senderName: string;
  ts: number;
  kind: 'room' | 'dm';
}

export interface UseMentionsResult {
  mentions: Mention[];
  /** Rooms with unread mentions, the server's counts included */
  mentionRoomIds: string[];
  refresh: () => void;
}

/** Rooms with unread mentions, the room's own count or the server's, whichever is higher */
function mentionedRooms(rooms: RoomSummary[], highlights: ServerNotification[]): RoomSummary[] {
  const joined = rooms.filter((room) => !room.isInvite && !room.isSpace && !room.isTombstoned);
  const counts = mergeMentionCounts(joined, unreadCountsByRoom(highlights));
  return joined.filter((room) => counts.has(room.id));
}

function roomLabel(room: RoomSummary): Pick<Mention, 'kind' | 'roomName' | 'roomAvatarMxc'> {
  const dmPartnerId = room.isDirect ? room.dmUserId : null;
  return {
    kind: dmPartnerId ? 'dm' : 'room',
    roomName: dmPartnerId ? (room.dmUserName ?? formatUserId(dmPartnerId)) : (room.name ?? room.id),
    roomAvatarMxc: dmPartnerId ? room.dmUserAvatar : room.avatarUrl,
  };
}

export function useMentions(enabled: boolean): UseMentionsResult {
  const rooms = useAllRooms();
  const queryClient = useQueryClient();
  const server = useServerNotifications(enabled).data;
  const mentioned = useMemo(
    () => (enabled ? mentionedRooms(rooms, server?.highlights ?? []) : []),
    [enabled, rooms, server]
  );

  const results = useQueries({
    queries: mentioned.map((room) => ({
      queryKey: ['unreadMentions', room.id, room.unreadMentions, room.lastActivity],
      queryFn: () => getMatrixClientOrNull()!.unreadMentions(room.id, MAX_PER_ROOM),
      enabled: !!getMatrixClientOrNull(),
      staleTime: Infinity,
    })),
  });

  const mentions = useMemo((): Mention[] => {
    const list: Mention[] = [];
    const seen = new Set<string>();
    const labels = new Map<string, ReturnType<typeof roomLabel>>();
    mentioned.forEach((room, i) => {
      const label = roomLabel(room);
      labels.set(room.id, label);
      for (const event of results[i]?.data ?? []) {
        seen.add(event.eventId);
        list.push({
          eventId: event.eventId,
          roomId: room.id,
          ...label,
          senderId: event.sender,
          senderName: event.senderName || formatUserId(event.sender),
          ts: event.timestamp,
        });
      }
    });
    // Older mentions in rooms whose messages are not loaded only the server knows about
    for (const n of server?.highlights ?? []) {
      const label = labels.get(n.roomId);
      if (n.read || n.threadRootId != null || !label || seen.has(n.eventId)) continue;
      seen.add(n.eventId);
      list.push({
        eventId: n.eventId,
        roomId: n.roomId,
        ...label,
        senderId: n.sender,
        senderName: formatUserId(n.sender),
        ts: n.timestamp,
      });
    }
    return list.sort((a, b) => b.ts - a.ts).slice(0, MAX_MENTIONS);
  }, [mentioned, results, server]);

  const mentionRoomIds = useMemo(() => mentioned.map((room) => room.id), [mentioned]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['unreadMentions'] });
    void queryClient.invalidateQueries({ queryKey: ['serverNotifications'] });
  }, [queryClient]);

  return { mentions, mentionRoomIds, refresh };
}

export function useHasUnreadMentions(): boolean {
  const rooms = useAllRooms();
  const server = useServerNotifications().data;
  return useMemo(() => mentionedRooms(rooms, server?.highlights ?? []).length > 0, [rooms, server]);
}
