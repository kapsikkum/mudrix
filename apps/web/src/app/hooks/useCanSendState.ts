import { useCallback } from 'react';
import { canSendState as canSend, useRoomSettings, useUserId } from '@/app/data';

/** Whether the user may change a kind of room state, e.g. `m.room.name` */
export function useCanSendState(roomId: string | null | undefined): (type: string) => boolean {
  const { data: settings } = useRoomSettings(roomId);
  const userId = useUserId();
  return useCallback((type: string) => canSend(settings, userId, type), [settings, userId]);
}
