import { useEffect, useRef } from 'react';
import { OPEN_LAYER } from '@/util/nativeApp';

interface SwipePanels {
  enabled: boolean;
  /** The sidebar is a drawer here (touch tablets), so a swipe from the left edge opens it. */
  leftDrawer: boolean;
  leftOpen: boolean;
  setLeftOpen: (open: boolean) => void;
  /** The members panel can be pulled in from the right (a room or space is open, no panel is). */
  canOpenRight: boolean;
  openRight: () => void;
  /** Another gesture (the edge swipe back) already owns the left edge. */
  leftEdgeOwned: boolean;
}

/** Marks what the swipe moves: `left` is the sidebar drawer, `right` any side panel. */
export const SWIPE_DRAWER_ATTR = 'data-swipe-drawer';
/** On the members panel: the one a swipe to the left pulls in. */
export const SWIPE_MEMBERS_ATTR = 'data-swipe-members';
/** Marks the scrim behind a drawer; the swipe fades its own in step with the finger and hides this one meanwhile. */
export const SWIPE_SCRIM_ATTR = 'data-swipe-scrim';

// Travel before a swipe locks to horizontal, how far from the screen edge it may start (the
// Android system back gesture owns those edges) and when releasing commits.
const LOCK_DISTANCE = 6;
const EDGE_GUARD = /Android/i.test(navigator.userAgent) ? 24 : 0;
const COMMIT_FRACTION = 0.35;
const FLICK_VELOCITY = 0.35; // px per ms
const FLICK_MIN_DISTANCE = 24;
const FAST_MS = 170;
const SETTLE_MS = 240;
const RUBBER = 0.15;
const SCRIM_CSS =
  'position:fixed;inset:0;z-index:4998;pointer-events:none;background:rgba(0,0,0,0.5);opacity:0;will-change:opacity';

const INTERACTIVE =
  'input, textarea, select, [contenteditable="true"], video, audio, [role="slider"], [data-no-swipe]';
const OVERLAYS = '[role="dialog"], [role="menu"], [data-popover], [data-emoji-picker]';

/** True when the touch began somewhere a sideways swipe means something else. */
function startsInSwipeBlocker(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  if (el?.closest(INTERACTIVE) || el?.closest(OVERLAYS)) return true;
  // Horizontally scrollable content (code blocks, galleries, carousels) keeps its own swipe.
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

function onScreen(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.left < window.innerWidth - 1 && rect.right > 1;
}

interface Target {
  el: HTMLElement;
  side: 'left' | 'right';
  from: 'open' | 'closed';
  width: number;
  /** The scrim that fades with the drag: a temporary one, standing in for the layout's own. */
  scrim: HTMLElement;
  /** The layout's own scrim for this panel (if mounted), hidden while the drag runs. */
  realScrim: HTMLElement | null;
}

/** Offset of the panel's closed position from its open one. */
const closedOffset = (t: Target) => (t.side === 'left' ? -t.width : t.width);

/** Where the panel sits for a finger travel of `dx`; past either end it only rubber-bands. */
function offsetFor(t: Target, dx: number): number {
  const closed = closedOffset(t);
  const raw = (t.from === 'open' ? 0 : closed) + dx;
  const lo = Math.min(0, closed);
  const hi = Math.max(0, closed);
  if (raw < lo) return lo + (raw - lo) * RUBBER;
  if (raw > hi) return hi + (raw - hi) * RUBBER;
  return raw;
}

/** 0 (closed) to 1 (open) for a finger travel of `dx`. */
const opennessFor = (t: Target, dx: number) =>
  Math.min(1, Math.max(0, 1 - Math.abs(offsetFor(t, dx)) / t.width));

/** Travel toward the other state (opening if closed, closing if open); negative is the wrong way. */
const progressFor = (t: Target, dx: number) =>
  (t.side === 'left') === (t.from === 'closed') ? dx : -dx;

const query = (selector: string) => document.querySelector<HTMLElement>(selector);

/**
 * Sideways swipes for the side panels on phones and touch tablets. A swipe to the left pulls the
 * members panel in from the right; a swipe to the right sends the topmost side panel away again; on
 * touch tablets a swipe to the right from the left edge pulls the sidebar drawer out and a swipe to
 * the left closes it. The panel follows the finger while it is held (and only rubber-bands past its
 * ends); a quick flick settles with the fast animation, a slow release finishes from where it was
 * let go.
 *
 * Performance: one passive `touchstart` and `touchend`, one `touchmove` that has to be active to
 * cancel scrolling, and nothing else. During a drag the panel's `transform` and the scrim's
 * `opacity` are written straight to the elements (no React state, no layout reads after the first
 * move: the width is measured once when the drag locks).
 */
export function useSwipePanels(opts: SwipePanels) {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    if (!opts.enabled) return undefined;
    let start: { x: number; y: number; t: number } | null = null;
    let lock: 'h' | 'v' | null = null;
    let target: Target | null = null;
    let replyRow: Element | null = null;

    const makeTarget = (el: HTMLElement, side: 'left' | 'right', from: 'open' | 'closed') => {
      // The layout's scrim pops in and out with the panel's state; a temporary one follows the finger.
      const realScrim = query(`[${SWIPE_SCRIM_ATTR}="${side}"]`);
      if (realScrim) realScrim.style.opacity = '0';
      const scrim = document.createElement('div');
      scrim.style.cssText = SCRIM_CSS;
      document.body.appendChild(scrim);
      return { el, side, from, width: el.offsetWidth, scrim, realScrim } satisfies Target;
    };

    const pickTarget = (dx: number): Target | null => {
      const o = ref.current;
      // A left swipe on a message row replies to it (the row runs that itself), so no panel.
      if (dx < 0 && replyRow) return null;
      const rights = Array.from(
        document.querySelectorAll<HTMLElement>(`[${SWIPE_DRAWER_ATTR}="right"]`)
      ).filter(onScreen);
      const leftEl = o.leftDrawer ? query(`[${SWIPE_DRAWER_ATTR}="left"]`) : null;
      if (dx > 0) {
        if (rights.length > 0) return makeTarget(rights[rights.length - 1], 'right', 'open');
        if (leftEl && !o.leftOpen) return makeTarget(leftEl, 'left', 'closed');
        return null;
      }
      if (leftEl && o.leftOpen) return makeTarget(leftEl, 'left', 'open');
      if (rights.length === 0 && o.canOpenRight) {
        const members = query(`[${SWIPE_MEMBERS_ATTR}]`);
        if (members) return makeTarget(members, 'right', 'closed');
      }
      return null;
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      lock = null;
      target = null;
      replyRow = null;
      if (e.touches.length !== 1) return;
      // A dialog, menu or the image viewer on top owns every gesture.
      if (document.querySelector(OPEN_LAYER)) return;
      const touch = e.touches[0];
      if (touch.clientX < EDGE_GUARD || touch.clientX > window.innerWidth - EDGE_GUARD) return;
      if (ref.current.leftEdgeOwned && touch.clientX <= 24) return;
      if (startsInSwipeBlocker(e.target)) return;
      start = { x: touch.clientX, y: touch.clientY, t: Date.now() };
      replyRow = e.target instanceof Element ? e.target.closest('[data-swipe-reply]') : null;
    };

    const onMove = (e: TouchEvent) => {
      if (!start || lock === 'v') return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!lock) {
        if (Math.abs(dx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.5) {
          lock = 'v';
          return;
        }
        lock = 'h';
        target = pickTarget(dx);
      }
      if (!target) return;
      // A sideways swipe must not also scroll the page behind it.
      if (e.cancelable) e.preventDefault();
      target.el.style.transition = 'none';
      target.el.style.transform = `translateX(${offsetFor(target, dx)}px)`;
      target.scrim.style.transition = 'none';
      target.scrim.style.opacity = String(opennessFor(target, dx));
    };

    const finish = (e: TouchEvent, cancelled: boolean) => {
      const t = target;
      const s = start;
      start = null;
      lock = null;
      target = null;
      replyRow = null;
      if (!t || !s) return;
      const dx = cancelled ? 0 : e.changedTouches[0].clientX - s.x;
      const elapsed = Math.max(1, Date.now() - s.t);
      const travelled = progressFor(t, dx);
      const flick = travelled > FLICK_MIN_DISTANCE && travelled / elapsed > FLICK_VELOCITY;
      const commit = travelled > t.width * COMMIT_FRACTION || flick;
      const open = t.from === 'closed' ? commit : !commit;
      const ms = flick ? FAST_MS : SETTLE_MS;

      // Animate to the settled end by hand, then hand the position back to the layout's classes
      // (which by then say the same thing).
      t.el.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      t.el.style.transform = `translateX(${open ? 0 : closedOffset(t)}px)`;
      window.setTimeout(() => {
        t.el.style.transition = '';
        t.el.style.transform = '';
      }, ms + 40);

      // The scrim fades to the same end; the layout's own scrim takes over once it has settled.
      t.scrim.style.transition = `opacity ${ms}ms ease`;
      t.scrim.style.opacity = open ? '1' : '0';
      const realScrim = () => query(`[${SWIPE_SCRIM_ATTR}="${t.side}"]`);
      window.setTimeout(() => {
        t.scrim.remove();
        const real = realScrim();
        if (real) real.style.opacity = '';
      }, ms + 40);

      if (!commit) {
        if (t.realScrim) t.realScrim.style.opacity = '';
        return;
      }
      // Opening or closing a panel puts the keyboard away.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const o = ref.current;
      if (t.side === 'left') o.setLeftOpen(t.from === 'closed');
      else if (t.from === 'closed') o.openRight();
      else {
        // The panel's own dismiss scrim knows how to close it (members, threads, chat).
        const dismiss = document.querySelectorAll<HTMLElement>(
          `[data-back-dismiss][${SWIPE_SCRIM_ATTR}="right"]`
        );
        dismiss[dismiss.length - 1]?.click();
      }
      if (open) {
        // A scrim that mounts now stays invisible until the temporary one is done.
        const hide = () => {
          const real = realScrim();
          if (real) real.style.opacity = '0';
        };
        queueMicrotask(hide);
        requestAnimationFrame(hide);
      }
    };

    const onEnd = (e: TouchEvent) => finish(e, false);
    const onCancel = (e: TouchEvent) => finish(e, true);

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [opts.enabled]);
}
