import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { callActionsAtom, isInCallAtom } from '@/app/store/atoms/call';
import { roomsByIdAtom } from '@/app/data';
import { useConfirm } from '@/app/hooks/useConfirm';

export function useJoinVoiceRoom(client: WizardClient | null): (roomId: string) => Promise<void> {
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  const isInCall = useAtomValue(isInCallAtom);
  const startCall = useAtomValue(callActionsAtom)?.start;
  const roomsById = useAtomValue(roomsByIdAtom);

  return useCallback(
    async (roomId: string) => {
      if (!client || !startCall) return;
      if (!roomsById.has(roomId)) return;

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

      await startCall(roomId, { voiceOnly: true, presentation: 'room' });
    },
    [client, roomsById, isInCall, startCall, confirmDialog, t]
  );
}
