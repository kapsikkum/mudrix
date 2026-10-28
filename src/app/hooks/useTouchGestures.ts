import { useEffect, useRef, type RefObject } from 'react';
import { navigateBack } from '@/util/nativeApp';

const EDGE_WIDTH = 24;
const LONG_PRESS_MS = 450;
const MOVE_SLOP = 10;
const SWIPE_TRIGGER = 64;
const SWIPE_MAX = 96;
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function haptic() {
  navigator.vibrate?.(10);
}

export function useLongPressContextMenu(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let startX = 0;
    let startY = 0;
    let touching = false;
    let fired = false;
    let suppressUntil = 0;

    const cancel = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const onStart = (e: TouchEvent) => {
      cancel();
      touching = true;
      fired = false;
      if (e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (!target || target.closest(EDITABLE)) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(() => {
        timer = undefined;
        fired = true;
        window.getSelection()?.removeAllRanges();
        haptic();
        target.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: startX,
            clientY: startY,
          })
        );
      }, LONG_PRESS_MS);
    };

    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > MOVE_SLOP) cancel();
    };

    const onEnd = (e: TouchEvent) => {
      cancel();
      touching = e.touches.length > 0;
      if (fired) {
        if (e.cancelable) e.preventDefault();
        fired = false;
        suppressUntil = Date.now() + 500;
      }
    };

    const onNativeContextMenu = (e: MouseEvent) => {
      if (!e.isTrusted || (e.target as Element | null)?.closest?.(EDITABLE)) return;
      if (touching || Date.now() < suppressUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: false });
    document.addEventListener('touchcancel', onEnd);
    document.addEventListener('contextmenu', onNativeContextMenu, true);
    return () => {
      cancel();
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      document.removeEventListener('contextmenu', onNativeContextMenu, true);
    };
  }, [enabled]);
}

export function useEdgeSwipeBack(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      start =
        e.touches.length === 1 && touch.clientX <= EDGE_WIDTH
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      start = null;
      if (dx > SWIPE_TRIGGER && dy < dx / 2) navigateBack();
    };
    const onCancel = () => {
      start = null;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled]);
}

export function useSwipeToReply(
  rowRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  iconRef: RefObject<HTMLElement | null>,
  onSwipe: () => void,
  enabled: boolean
) {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  useEffect(() => {
    const row = rowRef.current;
    if (!row || !enabled) return;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let mode: 'pending' | 'swipe' | null = null;

    const apply = (x: number, animate: boolean) => {
      const content = contentRef.current;
      const icon = iconRef.current;
      const transition = animate ? 'transform 0.2s ease, opacity 0.2s ease' : '';
      if (content) {
        content.style.transition = transition;
        content.style.transform = x ? `translateX(${x}px)` : '';
      }
      if (icon) {
        const progress = Math.min(1, x / SWIPE_TRIGGER);
        icon.style.transition = transition;
        icon.style.opacity = String(progress);
        icon.style.transform = `translateY(-50%) scale(${0.6 + progress * 0.4})`;
      }
    };

    const onStart = (e: TouchEvent) => {
      mode = null;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const target = e.target as Element | null;
      if (touch.clientX <= EDGE_WIDTH || target?.closest(`pre, ${EDITABLE}, [data-no-swipe]`))
        return;
      startX = touch.clientX;
      startY = touch.clientY;
      dx = 0;
      mode = 'pending';
    };

    const onMove = (e: TouchEvent) => {
      if (!mode) return;
      const touch = e.touches[0];
      const mx = touch.clientX - startX;
      const my = touch.clientY - startY;
      if (mode === 'pending') {
        if (Math.abs(my) > MOVE_SLOP && Math.abs(my) >= Math.abs(mx)) {
          mode = null;
          return;
        }
        if (mx > MOVE_SLOP && mx > Math.abs(my) * 1.5) mode = 'swipe';
        else return;
      }
      if (e.cancelable) e.preventDefault();
      const next = Math.min(SWIPE_MAX, Math.max(0, mx - MOVE_SLOP));
      if (dx < SWIPE_TRIGGER && next >= SWIPE_TRIGGER) haptic();
      dx = next;
      apply(dx, false);
    };

    const onEnd = () => {
      if (mode === 'swipe') {
        if (dx >= SWIPE_TRIGGER) onSwipeRef.current();
        apply(0, true);
      }
      mode = null;
    };

    row.addEventListener('touchstart', onStart, { passive: true });
    row.addEventListener('touchmove', onMove, { passive: false });
    row.addEventListener('touchend', onEnd);
    row.addEventListener('touchcancel', onEnd);
    return () => {
      row.removeEventListener('touchstart', onStart);
      row.removeEventListener('touchmove', onMove);
      row.removeEventListener('touchend', onEnd);
      row.removeEventListener('touchcancel', onEnd);
      apply(0, false);
    };
  }, [rowRef, contentRef, iconRef, enabled]);
}
