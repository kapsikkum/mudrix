import { useCallback, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  elementCallEmbedAtom,
  elementCallActionsAtom,
  elementCallUiAtom,
} from '@/app/store/atoms/elementCall';
import type { ElementCallPresentation } from '@/app/store/atoms/elementCall';
import { currentRoomIdAtom } from '@/app/store/atoms/rooms';
import {
  useStartElementCall,
  useElementCallHangup,
  useElementCallControls,
  useElementCallJoined,
} from '@/app/plugins/call/useCallEmbed';
import { usePushToTalk } from '@/app/plugins/call/usePushToTalk';

export function ElementCallController() {
  const embed = useAtomValue(elementCallEmbedAtom);
  const setActions = useSetAtom(elementCallActionsAtom);
  const setUi = useSetAtom(elementCallUiAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);

  const start = useStartElementCall();
  const hangup = useElementCallHangup(embed);
  const {
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenshare,
    setSpotlight,
    openReactions,
    openSettings,
  } = useElementCallControls(embed);
  useElementCallJoined(embed);
  usePushToTalk(embed);

  const setPresentation = useCallback(
    (presentation: ElementCallPresentation) => {
      setUi((prev) => ({ ...prev, presentation }));
    },
    [setUi]
  );

  const roomId = useAtomValue(elementCallUiAtom).roomId;
  useEffect(() => {
    if (roomId === null || currentRoomId === roomId) return;
    setUi((prev) =>
      prev.presentation === 'fullscreen' ? { ...prev, presentation: 'room' } : prev
    );
  }, [roomId, currentRoomId, setUi]);

  useEffect(() => {
    setActions({
      start,
      hangup,
      toggleMute,
      toggleDeafen,
      toggleVideo,
      toggleScreenshare,
      setSpotlight,
      openReactions,
      openSettings,
      setPresentation,
    });
    return () => setActions(null);
  }, [
    start,
    hangup,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenshare,
    setSpotlight,
    openReactions,
    openSettings,
    setPresentation,
    setActions,
  ]);

  return null;
}
