import { useMemo } from 'react';
import type { RoomSummary } from '@wizardchat/core';
import { getMatrixClient } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { formatUserId } from '@/util/matrix';
import { getRoomUnreadCount, roomHasUnreadMention } from '@/util/mentions';

export interface DmEntry {
  room: RoomSummary;
  roomId: string;
  partnerId: string;
  partnerName: string;
  partnerAvatarMxc: string | null;
  unreadCount: number;
  hasNotif: boolean;
}

/** Joined direct chats, most recently active first */
export function useDms(): DmEntry[] {
  const rooms = useAllRooms();
  return useMemo(
    () =>
      rooms
        .filter((r) => r.isDirect && !r.isInvite && !r.isSpace && !r.isTombstoned)
        .map((room) => ({
          room,
          roomId: room.id,
          partnerId: room.dmUserId ?? '',
          partnerName: room.dmUserName ?? formatUserId(room.dmUserId ?? room.id),
          partnerAvatarMxc: room.dmUserAvatar,
          unreadCount: getRoomUnreadCount(room),
          hasNotif: roomHasUnreadMention(room),
        }))
        .sort((a, b) => {
          const at = a.room.lastActivity ?? 0;
          const bt = b.room.lastActivity ?? 0;
          if (at !== bt) return bt - at;
          return a.partnerName.localeCompare(b.partnerName);
        }),
    [rooms]
  );
}

/** Opens the existing direct chat with a user, or starts one; resolves to its room id */
export function startDm(userId: string): Promise<string> {
  return getMatrixClient().startDm(userId);
}
