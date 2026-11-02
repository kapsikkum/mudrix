import type { RoomSummary } from '@wizardchat/core';
import { useRoom } from '@/app/data';

/** The room as it is now, or null while it isn't known (yet) */
export function useLiveRoom(roomId: string | undefined): RoomSummary | null {
  return useRoom(roomId);
}
