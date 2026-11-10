import { useAtom, useAtomValue } from 'jotai';
import { callActionsAtom, callUiAtom } from '@/app/store/atoms/call';
import { deafenedAtom, micMutedAtom } from '@/app/store/atoms/settings';

export function useGlobalVoiceState() {
  const ui = useAtomValue(callUiAtom);
  const actions = useAtomValue(callActionsAtom);
  const [micMuted, setMicMuted] = useAtom(micMutedAtom);
  const [deafened, setDeafened] = useAtom(deafenedAtom);

  const joined = ui.phase === 'joined';
  // While joining, the call's media already exists and was created with the old preference
  const inCall = ui.roomId !== null && !!actions;
  const liveMicMuted = joined ? ui.isMuted : micMuted || deafened;
  const liveDeafened = joined ? ui.isDeafened : deafened;

  const toggleMic = () => {
    if (inCall) {
      actions.toggleMute();
      return;
    }
    if (liveMicMuted) {
      setMicMuted(false);
      setDeafened(false);
    } else {
      setMicMuted(true);
    }
  };

  const toggleDeafen = () => {
    if (inCall) actions.toggleDeafen();
    else setDeafened(!deafened);
  };

  return { micMuted: liveMicMuted, deafened: liveDeafened, toggleMic, toggleDeafen };
}
