import { useCallback, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { RoomSummary } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { formatUserId } from '@/util/matrix';
import { roomHasUnreadMention } from '@/util/mentions';

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
  refresh: () => void;
}

function mentionRooms(rooms: RoomSummary[]): RoomSummary[] {
  return rooms.filter(
    (room) => !room.isInvite && !room.isSpace && !room.isTombstoned && roomHasUnreadMention(room)
  );
}

export function useMentions(enabled: boolean): UseMentionsResult {
  const rooms = useAllRooms();
  const queryClient = useQueryClient();
  const mentioned = useMemo(() => (enabled ? mentionRooms(rooms) : []), [enabled, rooms]);

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
    mentioned.forEach((room, i) => {
      const dmPartnerId = room.isDirect ? room.dmUserId : null;
      const kind: Mention['kind'] = dmPartnerId ? 'dm' : 'room';
      const roomName = dmPartnerId
        ? (room.dmUserName ?? formatUserId(dmPartnerId))
        : (room.name ?? room.id);
      const roomAvatarMxc = dmPartnerId ? room.dmUserAvatar : room.avatarUrl;
      for (const event of results[i]?.data ?? []) {
        list.push({
          eventId: event.eventId,
          roomId: room.id,
          roomName,
          roomAvatarMxc,
          senderId: event.sender,
          senderName: event.senderName || formatUserId(event.sender),
          ts: event.timestamp,
          kind,
        });
      }
    });
    return list.sort((a, b) => b.ts - a.ts).slice(0, MAX_MENTIONS);
  }, [mentioned, results]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['unreadMentions'] });
  }, [queryClient]);

  return { mentions, refresh };
}

export function useHasUnreadMentions(): boolean {
  const rooms = useAllRooms();
  return useMemo(() => mentionRooms(rooms).length > 0, [rooms]);
}
