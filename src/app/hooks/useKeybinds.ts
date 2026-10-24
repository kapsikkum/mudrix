import { useAtom, useAtomValue } from 'jotai';
import { keybindsAtom } from '@/app/store/atoms';
import { elementCallEmbedAtom } from '@/app/store/atoms/elementCall';
import { keyTargets } from '@/app/plugins/call/usePushToTalk';
import { matchesComboDown, parseCombo } from '@/app/features/keyboardShortcuts/keyCombo';
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
      if (e.repeat) return;
      const actions = ['toggleMute', 'toggleDeafen', 'toggleVideo', 'disconnect'] as const;
      const action = actions.find((a) => matchesComboDown(e, parseCombo(keybinds[a])));
      if (!action) return;
      e.preventDefault();
      handlersRef.current[action]();
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
