import { useAtom } from 'jotai';
import { keybindsAtom } from '@/app/store/atoms';
import { matchesComboDown, parseCombo } from '@/app/features/keyboardShortcuts/keyCombo';
import { useEffect, useCallback, useRef } from 'react';

export function useVoiceKeybinds(
  isInVoiceCall: boolean,
  handlers: {
    toggleMute: () => void;
    toggleDeafen: () => void;
  }
) {
  const [keybinds] = useAtom(keybindsAtom);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isInVoiceCall) return;
      // Skip if capturing keybind
      if ((e.target as Element)?.classList?.contains('keybind-input')) return;
      if (e.repeat) return;
      const actions = ['toggleMute', 'toggleDeafen'] as const;
      const action = actions.find((a) => matchesComboDown(e, parseCombo(keybinds[a])));
      if (!action) return;
      e.preventDefault();
      handlersRef.current[action]();
    },
    [isInVoiceCall, keybinds]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
