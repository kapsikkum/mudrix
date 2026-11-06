import { useAtom } from 'jotai';
import { keybindsAtom } from '@/app/store/atoms';
import { matchesComboDown, parseCombo } from '@/app/features/keyboardShortcuts/keyCombo';
import { isEditableTarget } from '@/app/features/keyboardShortcuts/keyEvents';
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
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isInVoiceCall) return;
      // A bare key (no Ctrl, Alt or Meta) is a letter being typed while a text field has focus.
      if (isEditableTarget(e) && !(e.ctrlKey || e.altKey || e.metaKey)) return;
      // Skip if capturing keybind
      if ((e.target as Element)?.classList?.contains('keybind-input')) return;
      if (e.repeat) return;
      const actions = ['toggleMute', 'toggleDeafen', 'toggleVideo', 'disconnect'] as const;
      const action = actions.find((a) => {
        const combo = keybinds[a];
        return !!combo && matchesComboDown(e, parseCombo(combo));
      });
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
