import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import type { MatrixClient } from 'matrix-js-sdk';
import { callActionsAtom, isInCallAtom } from '@/app/store/atoms/call';
import { useConfirm } from '@/app/hooks/useConfirm';

export function useJoinVoiceRoom(client: MatrixClient | null): (roomId: string) => Promise<void> {
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  const isInCall = useAtomValue(isInCallAtom);
  const startCall = useAtomValue(callActionsAtom)?.start;

  return useCallback(
    async (roomId: string) => {
      if (!client || !startCall) return;
      const room = client.getRoom(roomId);
      if (!room) return;

      if (isInCall) {
        const confirmed = await confirmDialog({
          title: t('room.switchVoiceRoom'),
          message: t('room.switchVoiceRoomMessage'),
          confirmLabel: t('room.switch'),
          cancelLabel: t('common.cancel'),
          cancelPrimary: true,
        });
        if (!confirmed) return;
      }

      await startCall(room, { voiceOnly: true, presentation: 'room' });
    },
    [client, isInCall, startCall, confirmDialog, t]
  );
}
