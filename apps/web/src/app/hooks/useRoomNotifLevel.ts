import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { NotificationMode } from '@wizardchat/core';
import { roomNotifLevelAtom } from '@/app/store/atoms/notifications';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useRoom } from '@/app/data';
import type { NotifLevel } from './useNotifications';

export function toNotifLevel(mode: NotificationMode | null | undefined): NotifLevel {
  return mode ?? 'default';
}

export async function setNotifLevel(roomId: string, level: NotifLevel): Promise<void> {
  const client = getMatrixClientOrNull();
  if (!client) return;
  await client.setRoomNotificationMode(roomId, level === 'default' ? null : level);
}

export function useRoomNotifLevel(roomId: string) {
  const overrides = useAtomValue(roomNotifLevelAtom);
  const setOverrides = useSetAtom(roomNotifLevelAtom);
  const room = useRoom(roomId);
  const level: NotifLevel = overrides[roomId] ?? toNotifLevel(room?.notificationMode);

  const setLevel = useCallback(
    async (newLevel: NotifLevel) => {
      const previous = level;
      setOverrides((prev) => ({ ...prev, [roomId]: newLevel }));
      try {
        await setNotifLevel(roomId, newLevel);
      } catch {
        setOverrides((prev) => ({ ...prev, [roomId]: previous }));
      }
    },
    [roomId, level, setOverrides]
  );

  return { level, setLevel };
}
