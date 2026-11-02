import type { RoomSummary } from '@wizardchat/core';

export interface RoomUnreadState {
  count: number;
  hasMention: boolean;
}

/** Unread count as the core counts it (notifying messages after the read marker), or 1 when marked unread */
export function getRoomUnreadState(room: RoomSummary): RoomUnreadState {
  const count = room.unreadNotifications || (room.markedUnread ? 1 : 0);
  return { count, hasMention: room.unreadMentions > 0 };
}

export function getRoomUnreadCount(room: RoomSummary): number {
  return getRoomUnreadState(room).count;
}

export function roomHasUnreadMention(room: RoomSummary): boolean {
  return room.unreadMentions > 0;
}
