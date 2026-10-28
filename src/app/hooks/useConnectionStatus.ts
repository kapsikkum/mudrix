import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { connectionLostAtom, syncStateAtom } from '@/app/store/atoms';

const SHOW_DELAY_MS = 2000;

const DISCONNECTED_STATES = new Set(['RECONNECTING', 'ERROR', 'STOPPED']);
const CONNECTED_STATES = new Set(['PREPARED', 'SYNCING', 'CATCHUP']);

export function useConnectionStatusWatcher(): void {
  const syncState = useAtomValue(syncStateAtom);
  const setLost = useSetAtom(connectionLostAtom);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onLost = () => {
      if (showTimerRef.current) return;
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        setLost(true);
      }, SHOW_DELAY_MS);
    };
    const onRestored = () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
      setLost(false);
    };

    const syncConnected = !!syncState && CONNECTED_STATES.has(syncState);
    const onOnline = () => {
      if (syncConnected) onRestored();
    };

    if ((syncState && DISCONNECTED_STATES.has(syncState)) || !navigator.onLine) onLost();
    else if (syncConnected) onRestored();

    window.addEventListener('offline', onLost);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onLost);
      window.removeEventListener('online', onOnline);
    };
  }, [syncState, setLost]);

  useEffect(
    () => () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    },
    []
  );
}
