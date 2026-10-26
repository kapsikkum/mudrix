import { useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { callActionsAtom, callUiAtom } from '@/app/store/atoms/call';
import { currentRoomIdAtom, currentSpaceIdAtom } from '@/app/store/atoms/rooms';
import { sidebarViewAtom } from '@/app/store/atoms/ui';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { isDmRoom } from '@/util/matrix';

export function useReturnToCall(): () => void {
  const ui = useAtomValue(callUiAtom);
  const actions = useAtomValue(callActionsAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const [currentSpaceId] = useAtom(currentSpaceIdAtom);
  const [sidebarView] = useAtom(sidebarViewAtom);
  const navigate = useNavigate();

  return useCallback(() => {
    const roomId = ui.roomId;
    if (!roomId) return;
    if (currentRoomId !== roomId) {
      const client = getMatrixClientOrNull();
      const room = client?.getRoom(roomId);
      const path =
        room && client && isDmRoom(room, client)
          ? `/dm/${encodeURIComponent(roomId)}`
          : `/r/${encodeURIComponent(roomId)}`;
      navigate(path, { state: { sidebarView, currentSpaceId } });
    }
    actions?.setPresentation('room');
  }, [ui.roomId, currentRoomId, navigate, sidebarView, currentSpaceId, actions]);
}
