import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { presenceOverrideAtom, presenceMapAtom, ownCustomStatusAtom } from '@/app/store/atoms';
import { useSyncReady } from './useSync';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5min
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'focus'] as const;

type PresenceValue = 'online' | 'unavailable' | 'offline';

export function usePresenceSender(client: WizardClient | null | undefined): void {
  const customStatus = useAtomValue(ownCustomStatusAtom);
  const statusText = customStatus?.text ?? '';
  const statusTextRef = useRef(statusText);
  statusTextRef.current = statusText;
  const override = useAtomValue(presenceOverrideAtom);
  const setPresenceMap = useSetAtom(presenceMapAtom);

  const syncReady = useSyncReady();

  const overrideRef = useRef(override);
  useEffect(() => {
    overrideRef.current = override;
  });

  const isIdleRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendPresence = (c: WizardClient, state: PresenceValue) => {
    // A PUT without status_msg clears it, so always send the current one (none while invisible)
    const statusMsg = state === 'offline' ? '' : statusTextRef.current;
    c.setPresence(state, statusMsg).catch(() => {});
  };

  // Update UI everywhere (member list, profile popups, etc.) immediately,
  // not just after the next sync round-trip.
  const applyOwn = useCallback(
    (c: WizardClient, state: PresenceValue) => {
      sendPresence(c, state);
      const ownId = c.userId();
      if (ownId) {
        setPresenceMap((prev) => (prev[ownId] === state ? prev : { ...prev, [ownId]: state }));
      }
    },
    [setPresenceMap]
  );

  useEffect(() => {
    if (!client) return;

    const clearIdleTimer = () => {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const scheduleIdle = () => {
      clearIdleTimer();
      idleTimerRef.current = setTimeout(() => {
        if (!isIdleRef.current && overrideRef.current === 'auto') {
          isIdleRef.current = true;
          applyOwn(client, 'unavailable');
        }
      }, IDLE_TIMEOUT_MS);
    };

    const onActivity = () => {
      if (overrideRef.current !== 'auto') return;
      clearIdleTimer();
      if (isIdleRef.current) {
        isIdleRef.current = false;
        applyOwn(client, 'online');
      }
      scheduleIdle();
    };

    scheduleIdle();

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }

    return () => {
      clearIdleTimer();
      isIdleRef.current = false;
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
    };
  }, [client, applyOwn]);

  useEffect(() => {
    if (!client || !syncReady) return;

    if (override !== 'auto') {
      clearTimeout(idleTimerRef.current ?? undefined);
      idleTimerRef.current = null;
      isIdleRef.current = false;
      applyOwn(client, override);
    } else {
      applyOwn(client, isIdleRef.current ? 'unavailable' : 'online');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, syncReady, override, statusText]);
}
