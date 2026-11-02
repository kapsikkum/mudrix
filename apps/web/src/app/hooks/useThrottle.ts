import { useRef, useCallback, useEffect } from 'react';

export function useThrottle<T extends (...args: unknown[]) => void>(fn: T, delay = 200): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgsRef = useRef<unknown[]>([]);
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;

  const throttled = useCallback(
    (...args: unknown[]) => {
      latestArgsRef.current = args;
      if (timerRef.current !== null) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...latestArgsRef.current);
      }, delay);
    },
    [delay]
  ) as unknown as T;

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  return throttled;
}
