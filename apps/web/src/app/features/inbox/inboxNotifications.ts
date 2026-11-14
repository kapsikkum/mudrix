import type { ServerNotification } from '@wizardchat/core';

/** Unread notifications the server keeps, counted per room */
export function unreadCountsByRoom(
  notifications: readonly ServerNotification[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notifications) {
    if (!n.read) counts.set(n.roomId, (counts.get(n.roomId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Unread mentions per room, the room's own count or the server's when higher. The room's count
 * only sees messages loaded since start; the server also counts older ones. Rooms with none are left out.
 */
export function mergeMentionCounts(
  rooms: readonly { id: string; unreadMentions: number }[],
  serverCounts: ReadonlyMap<string, number>
): Map<string, number> {
  const merged = new Map<string, number>();
  for (const room of rooms) {
    const count = Math.max(room.unreadMentions, serverCounts.get(room.id) ?? 0);
    if (count > 0) merged.set(room.id, count);
  }
  return merged;
}

/** Rooms with unread thread replies, as the server's notifications show them */
export function roomsWithUnreadThreads(notifications: readonly ServerNotification[]): Set<string> {
  return new Set(
    notifications.filter((n) => !n.read && n.threadRootId != null).map((n) => n.roomId)
  );
}

/** The busiest rooms, plus any room with unread thread replies beyond them, busiest first */
export function threadCandidates<T extends { id: string; lastActivity: number | null }>(
  rooms: readonly T[],
  unreadThreadRoomIds: ReadonlySet<string>,
  busiestCount: number
): T[] {
  const sorted = [...rooms].sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
  return sorted.filter((room, i) => i < busiestCount || unreadThreadRoomIds.has(room.id));
}
