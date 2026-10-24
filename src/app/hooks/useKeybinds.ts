import { useAtom, useAtomValue } from 'jotai';
import { keybindsAtom } from '@/app/store/atoms';
import { elementCallEmbedAtom } from '@/app/store/atoms/elementCall';
import { keyTargets } from '@/app/plugins/call/usePushToTalk';
import { useEffect, useCallback, useRef } from 'react';

export function useVoiceKeybinds(
  isInVoiceCall: boolean,
  handlers: {
    toggleMute: () => void;
    toggleDeafen: () => void;
    toggleVideo: () => void;
    disconnect: () => void;
  }
) {
  const [keybinds] = useAtom(keybindsAtom);
  const embed = useAtomValue(elementCallEmbedAtom);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isInVoiceCall) return;
      // Skip if capturing keybind
      if ((e.target as Element)?.classList?.contains('keybind-input')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (keybinds.toggleMute && key === keybinds.toggleMute) {
        e.preventDefault();
        handlersRef.current.toggleMute();
      } else if (keybinds.toggleDeafen && key === keybinds.toggleDeafen) {
        e.preventDefault();
        handlersRef.current.toggleDeafen();
      } else if (keybinds.toggleVideo && key === keybinds.toggleVideo) {
        e.preventDefault();
        handlersRef.current.toggleVideo();
      } else if (keybinds.disconnect && key === keybinds.disconnect) {
        e.preventDefault();
        handlersRef.current.disconnect();
      }
    },
    [isInVoiceCall, keybinds]
  );

  useEffect(() => {
    const targets = keyTargets(embed);
    for (const target of targets) target.addEventListener('keydown', handleKeyDown);
    return () => {
      for (const target of targets) target.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, embed]);
}
