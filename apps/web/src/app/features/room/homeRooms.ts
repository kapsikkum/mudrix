import type { RoomSummary } from '@mudrix/core';
import { isDmRoom } from '@/util/matrix';

/**
 * Whether Home's room list shows a room: joined, still alive, not a space, not a direct message
 * and inside no joined space. The same rule (and order) as the old app's `useRooms` filter in
 * `mudrix-web/src/app/features/room/useRooms.ts`, so a direct message stays in Direct Messages
 * only — Home never lists it, even when it is also a child of a space.
 */
export function isHomeRoom(room: RoomSummary, inAnySpace: boolean): boolean {
  if (room.isInvite) return false;
  if (room.isSpace) return false;
  if (room.isTombstoned) return false;
  if (isDmRoom(room)) return false;
  return !inAnySpace;
}

/** Home's room list; `inAnySpace` answers "is this room a child of a joined space?" */
export function selectHomeRooms(
  rooms: readonly RoomSummary[],
  inAnySpace: (roomId: string) => boolean
): RoomSummary[] {
  return rooms.filter((room) => isHomeRoom(room, inAnySpace(room.id)));
}
