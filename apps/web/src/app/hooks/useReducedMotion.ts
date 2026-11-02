import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { preferencesAtom, reducedMotionAtom } from '@/app/store/atoms';
import { useMediaQuery } from './useMediaQuery';

const REDUCE_MOTION_CLASS = 'reduce-motion';

export function useReducedMotion(): boolean {
  const preference = useAtomValue(reducedMotionAtom);
  const systemReduces = useMediaQuery('(prefers-reduced-motion: reduce)');
  return preference === 'system' ? systemReduces : preference === 'on';
}

export function scrollBehavior(): ScrollBehavior {
  return document.documentElement.classList.contains(REDUCE_MOTION_CLASS) ? 'auto' : 'smooth';
}

export function useReducedMotionSync(): void {
  const reduce = useReducedMotion();
  const setPreferences = useSetAtom(preferencesAtom);

  useEffect(() => {
    document.documentElement.classList.toggle(REDUCE_MOTION_CLASS, reduce);
    setPreferences((prev) => {
      if (prev.reducedMotionApplied === reduce) return prev;
      const autoplayGifs = prev.reducedMotionApplied == null ? prev.autoplayGifs : !reduce;
      return { ...prev, autoplayGifs, reducedMotionApplied: reduce };
    });
  }, [reduce, setPreferences]);
}
