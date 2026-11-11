import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { keybindsAtom } from '@/app/store/atoms';
import {
  callUiAtom,
  globalKeyStatusAtom,
  pushToTalkHeldAtom,
  pushToTalkModeAtom,
} from '@/app/store/atoms/call';
import {
  isComboKeyUp,
  keybindCapture,
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
  const setStatus = useSetAtom(globalKeyStatusAtom);
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
    const release = (immediate = false) => {
      if (!pressed) return;
      pressed = false;
      setHeld(false);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      if (immediate) {
        releaseTimer.current = null;
        send(false);
        return;
      }
      releaseTimer.current = setTimeout(() => {
        releaseTimer.current = null;
        send(false);
      }, RELEASE_DELAY_MS);
    };

    send(false);

    const desktop = window.desktopAPI;
    let cleanupGlobal: (() => void) | undefined;
    let useLocalKeys = true;
    if (desktop?.setGlobalKey && desktop.onGlobalKey) {
      cleanupGlobal = desktop.onGlobalKey((id, down) => {
        if (id !== 'pushToTalk') return;
        if (!down) release(true);
        else if (!keybindCapture.active) press();
      });
      void desktop.setGlobalKey('pushToTalk', keyCode).then((status) => {
        useLocalKeys = status !== 'active' && status !== 'taken';
        setStatus((prev) => ({ ...prev, pushToTalk: status }));
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
      void desktop?.setGlobalKey?.('pushToTalk', null);
      setStatus(({ pushToTalk: _, ...rest }) => rest);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
      setHeld(false);
    };
  }, [active, setTransmitting, keyCode, setHeld, setStatus]);
}
