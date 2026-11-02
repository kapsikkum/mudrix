import { useEffect, useState } from 'react';

const COARSE_QUERY = '(pointer: coarse)';

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(COARSE_QUERY).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(COARSE_QUERY);
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches);
    setCoarse(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return coarse;
}
