import { useMemo } from 'react';
import { useAllRooms, useJoinedSpaces } from '@/app/data';

/** Names of the joined rooms and spaces by ID */
export function useRoomNames(): Map<string, string> {
  const rooms = useAllRooms();
  const spaces = useJoinedSpaces();
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const room of rooms) if (room.name) names.set(room.id, room.name);
    for (const space of spaces) if (space.name) names.set(space.id, space.name);
    return names;
  }, [rooms, spaces]);
}
