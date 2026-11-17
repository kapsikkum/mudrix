import { useAtom, useSetAtom } from 'jotai';
import { DEFAULT_KEYBINDS, globalKeyStatusAtom, keybindsAtom } from '@/app/store/atoms';
import {
  keybindCapture,
  matchesComboDown,
  parseCombo,
} from '@/app/features/keyboardShortcuts/keyCombo';
import { isEditableTarget } from '@/app/features/keyboardShortcuts/keyEvents';
import { useEffect, useCallback, useRef } from 'react';

const ACTIONS = [
  'toggleMute',
  'toggleDeafen',
  'toggleVideo',
  'disconnect',
  'toggleScreenShare',
] as const;
type Action = (typeof ACTIONS)[number];
// The ones the desktop app can also catch system-wide
const GLOBAL_ACTIONS = ['toggleMute', 'toggleDeafen', 'toggleScreenShare'] as const;
type GlobalAction = (typeof GLOBAL_ACTIONS)[number];

const isGlobalAction = (id: string): id is GlobalAction =>
  (GLOBAL_ACTIONS as readonly string[]).includes(id);
const capturingKeybind = (target: EventTarget | null) =>
  !!(target as Element | null)?.classList?.contains('keybind-input');

export function useVoiceKeybinds(
  isInVoiceCall: boolean,
  handlers: {
    toggleMute: () => void;
    toggleDeafen: () => void;
    toggleVideo: () => void;
    disconnect: () => void;
    toggleScreenShare: () => void;
  }
) {
  const [keybinds] = useAtom(keybindsAtom);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const global = useRef(new Set<Action>());
  const setStatus = useSetAtom(globalKeyStatusAtom);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isInVoiceCall) return;
      // A bare key (no Ctrl, Alt or Meta) is a letter being typed while a text field has focus.
      if (isEditableTarget(e) && !(e.ctrlKey || e.altKey || e.metaKey)) return;
      if (capturingKeybind(e.target)) return;
      if (e.repeat) return;
      const action = ACTIONS.find((a) => {
        const combo = keybinds[a] ?? DEFAULT_KEYBINDS[a] ?? '';
        return !!combo && matchesComboDown(e, parseCombo(combo));
      });
      if (!action) return;
      e.preventDefault();
      if (!global.current.has(action)) handlersRef.current[action]();
    },
    [isInVoiceCall, keybinds]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const { toggleMute, toggleDeafen } = keybinds;
  const toggleScreenShare = keybinds.toggleScreenShare ?? DEFAULT_KEYBINDS.toggleScreenShare ?? '';
  useEffect(() => {
    const desktop = window.desktopAPI;
    if (!isInVoiceCall || !desktop?.setGlobalKey || !desktop.onGlobalKey) return;
    const codes: Record<GlobalAction, string> = { toggleMute, toggleDeafen, toggleScreenShare };
    const active = global.current;
    let cancelled = false;
    const stop = desktop.onGlobalKey((id, down) => {
      if (down && isGlobalAction(id) && !keybindCapture.active) handlersRef.current[id]();
    });
    for (const action of GLOBAL_ACTIONS) {
      void desktop.setGlobalKey(action, codes[action] || null).then((status) => {
        if (cancelled || !codes[action]) return;
        if (status === 'active' || status === 'taken') active.add(action);
        setStatus((prev) => ({ ...prev, [action]: status }));
      });
    }
    return () => {
      cancelled = true;
      stop();
      for (const action of GLOBAL_ACTIONS) {
        active.delete(action);
        void desktop.setGlobalKey?.(action, null);
      }
      setStatus((prev) => {
        const next = { ...prev };
        for (const action of GLOBAL_ACTIONS) delete next[action];
        return next;
      });
    };
  }, [isInVoiceCall, toggleMute, toggleDeafen, toggleScreenShare, setStatus]);
}
