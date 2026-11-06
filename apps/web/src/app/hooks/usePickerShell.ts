import { useEffect, type RefObject } from 'react';
import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { useMediaQuery } from './useMediaQuery';
import { useSwipeDownDismiss } from './useSwipeDownDismiss';

/** Calls `onClose` for a mouse press outside `ref` or the Escape key, while `enabled`. */
export function useOutsideDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [ref, onClose, enabled]);
}

/**
 * On phones (`PANEL_OVERLAY_QUERY`) a picker is a bottom drawer that a drag down closes (when
 * `swipe`). Returns whether the drawer layout is active.
 */
export function usePickerDrawer(
  sheetRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  swipe = true
): boolean {
  const drawer = useMediaQuery(PANEL_OVERLAY_QUERY);
  useSwipeDownDismiss({ enabled: drawer && swipe, sheetRef, onClose });
  return drawer;
}
