import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { keybindsAtom, pushToTalkEnabledAtom } from '@/app/store/atoms';
import { elementCallUiAtom } from '@/app/store/atoms/elementCall';
import type { CallEmbed } from './CallEmbed';

const RELEASE_DELAY_MS = 120;

export function keyTargets(embed: CallEmbed | null): Window[] {
  const targets: Window[] = [window];
  const callWindow = embed?.iframe.contentWindow;
  if (callWindow) targets.push(callWindow);
  return targets;
}

export function usePushToTalk(embed: CallEmbed | null): void {
  const enabled = useAtomValue(pushToTalkEnabledAtom);
  const keyCode = useAtomValue(keybindsAtom).pushToTalk ?? '';
  const joined = useAtomValue(elementCallUiAtom).phase === 'joined';
  const active = enabled && !!keyCode && !!embed && joined;
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !embed) return;
    const control = embed.control;
    let pressed = false;

    const press = () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
      if (pressed) return;
      pressed = true;
      void control.setMicrophone(true);
    };
    const release = () => {
      if (!pressed) return;
      pressed = false;
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = setTimeout(() => {
        releaseTimer.current = null;
        void control.setMicrophone(false);
      }, RELEASE_DELAY_MS);
    };

    void control.setMicrophone(false);

    const desktop = window.electronAPI;
    let cleanupGlobal: (() => void) | undefined;
    let useLocalKeys = true;
    if (desktop?.setPushToTalkKey && desktop.onPushToTalk) {
      cleanupGlobal = desktop.onPushToTalk((down) => (down ? press() : release()));
      void desktop.setPushToTalkKey(keyCode).then((status) => {
        useLocalKeys = status !== 'active';
      });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (useLocalKeys && e.code === keyCode) press();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (useLocalKeys && e.code === keyCode) release();
    };
    const onBlur = () => {
      if (!useLocalKeys) return;
      setTimeout(() => {
        if (!document.hasFocus()) release();
      }, 0);
    };

    const targets = keyTargets(embed);
    for (const target of targets) {
      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      target.addEventListener('blur', onBlur);
    }

    return () => {
      for (const target of targets) {
        target.removeEventListener('keydown', onKeyDown);
        target.removeEventListener('keyup', onKeyUp);
        target.removeEventListener('blur', onBlur);
      }
      cleanupGlobal?.();
      void desktop?.setPushToTalkKey?.(null);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    };
  }, [active, embed, keyCode]);
}
