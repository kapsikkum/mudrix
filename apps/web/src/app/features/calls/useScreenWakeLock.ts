import { useEffect } from 'react';

export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const desktop = window.desktopAPI?.setKeepAwake;
    if (desktop) {
      desktop(true).catch(() => undefined);
      return () => void desktop(false).catch(() => undefined);
    }
    if (!('wakeLock' in navigator)) return undefined;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) next.release().catch(() => undefined);
        else lock = next;
      } catch {
        // Refused, e.g. low battery or a policy; the call still works
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => undefined);
    };
  }, [active]);
}
