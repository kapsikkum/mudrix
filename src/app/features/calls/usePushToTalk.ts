import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { keybindsAtom } from '@/app/store/atoms';
import { callUiAtom, pushToTalkHeldAtom, pushToTalkModeAtom } from '@/app/store/atoms/call';
import {
  isComboKeyUp,
  matchesComboDown,
  parseCombo,
} from '@/app/features/keyboardShortcuts/keyCombo';

const RELEASE_DELAY_MS = 120;

export function usePushToTalk(setTransmitting: ((on: boolean) => unknown) | null): void {
  const mode = useAtomValue(pushToTalkModeAtom);
  const keyCode = useAtomValue(keybindsAtom).pushToTalk ?? '';
  const joined = useAtomValue(callUiAtom).phase === 'joined';
  const active = mode && !!setTransmitting && joined;
  const setHeld = useSetAtom(pushToTalkHeldAtom);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !setTransmitting) return;
    const send = (on: boolean) => void setTransmitting(on);
    let pressed = false;

    const press = () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
      if (pressed) return;
      pressed = true;
      setHeld(true);
      send(true);
    };
    const release = () => {
      if (!pressed) return;
      pressed = false;
      setHeld(false);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = setTimeout(() => {
        releaseTimer.current = null;
        send(false);
      }, RELEASE_DELAY_MS);
    };

    send(false);

    const desktop = window.electronAPI;
    let cleanupGlobal: (() => void) | undefined;
    let useLocalKeys = true;
    if (desktop?.setPushToTalkKey && desktop.onPushToTalk) {
      cleanupGlobal = desktop.onPushToTalk((down) => (down ? press() : release()));
      void desktop.setPushToTalkKey(keyCode).then((status) => {
        useLocalKeys = status !== 'active';
      });
    }

    const combo = parseCombo(keyCode);
    const onKeyDown = (e: KeyboardEvent) => {
      if (useLocalKeys && matchesComboDown(e, combo)) press();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (useLocalKeys && isComboKeyUp(e, combo)) release();
    };
    const onBlur = () => {
      if (!useLocalKeys) return;
      setTimeout(() => {
        if (!document.hasFocus()) release();
      }, 0);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      cleanupGlobal?.();
      void desktop?.setPushToTalkKey?.(null);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
      setHeld(false);
    };
  }, [active, setTransmitting, keyCode, setHeld]);
}
