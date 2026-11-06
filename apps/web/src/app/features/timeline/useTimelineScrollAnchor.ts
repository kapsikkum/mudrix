import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// Within this distance of the bottom the timeline counts as "pinned".
const PIN_THRESHOLD_PX = 16;
// A smooth scroll to the bottom keeps the pin alive for this long, unless the
// user touches the list in the meantime.
const SMOOTH_PIN_WINDOW_MS = 900;
// A remounted row keeps its last measured height as a min-height for this long
// while its async content (replies, previews, media) comes back.
const HEIGHT_HINT_TTL_MS = 1500;
const MAX_CACHED_ROWS = 1500;
const MIN_DELTA_PX = 0.5;

/** Attribute rows must carry so their measured height can be remembered across remounts. */
export const ROW_KEY_ATTR = 'data-row-key';

interface CachedRow {
  height: number;
  width: number;
}

export interface TimelineScrollAnchor {
  /**
   * Stable ref callback for every message row wrapper (give the element a
   * `data-row-key`). It observes the row's size so height changes can be
   * compensated, and seeds remounted rows with their last known height.
   */
  registerRow: (el: HTMLElement | null) => void | (() => void);
  /** Call whenever the timeline is deliberately scrolled to the bottom. */
  markPinned: (smooth?: boolean) => void;
}

/**
 * Keeps the timeline visually stable while content sizes settle.
 *
 * The timeline is a windowed (not height-virtualised) list: every rendered row is
 * real DOM with its true height, but row heights still change after first paint
 * (images and previews loading, replies being fetched, decryption finishing).
 * Native scroll anchoring is disabled on the container (overflow-anchor: none)
 * because the paginator restores scroll itself, so this hook provides it:
 *
 * - while the user is pinned to the bottom of the live timeline, any growth keeps
 *   the bottom in view;
 * - otherwise, when a row that is entirely above the viewport changes height,
 *   scrollTop is shifted by the same amount so the content being read stays put;
 * - measured heights are cached per row key so a remounted row starts at its
 *   previous height instead of collapsing and re-growing.
 *
 * Prepends are still handled by useVirtualPaginator's restore; the first
 * observation of a row never adjusts anything, so the two do not double-correct.
 */
export function useTimelineScrollAnchor(
  scrollRef: RefObject<HTMLElement | null>,
  isLiveEnd: () => boolean,
  /** False while the scroll container is not mounted (e.g. invite placeholder). */
  active = true
): TimelineScrollAnchor {
  const isLiveEndRef = useRef(isLiveEnd);
  isLiveEndRef.current = isLiveEnd;

  const sizesRef = useRef(new WeakMap<Element, number>());
  const heightCacheRef = useRef(new Map<string, CachedRow>());
  const observerRef = useRef<ResizeObserver | null>(null);

  const pinnedRef = useRef(true);
  const lastUserInputRef = useRef(0);
  const smoothPinRef = useRef({ start: 0, until: 0 });

  const handleResize = useCallback(
    (entries: ResizeObserverEntry[]) => {
      const container = scrollRef.current;
      if (!container) return;

      const sizes = sizesRef.current;
      const cache = heightCacheRef.current;

      let containerResized = false;
      const rows: { el: HTMLElement; oldHeight: number; newHeight: number }[] = [];

      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (target === container) {
          containerResized = true;
          continue;
        }
        const newHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        const oldHeight = sizes.get(target);
        sizes.set(target, newHeight);

        const key = target.getAttribute(ROW_KEY_ATTR);
        if (key && newHeight > 0) {
          cache.delete(key);
          cache.set(key, { height: newHeight, width: container.clientWidth });
          if (cache.size > MAX_CACHED_ROWS) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
        }

        // The first observation only records a baseline.
        if (oldHeight === undefined) continue;
        if (Math.abs(newHeight - oldHeight) < MIN_DELTA_PX) continue;
        rows.push({ el: target, oldHeight, newHeight });
      }

      const pinned = pinnedRef.current;
      const liveEnd = isLiveEndRef.current();

      if (pinned && (liveEnd || containerResized)) {
        if (rows.length > 0 || containerResized) {
          container.scrollTop = container.scrollHeight - container.clientHeight;
        }
        return;
      }

      if (rows.length === 0) return;

      // Document order so each row's pre-change position can be derived by
      // removing the shifts caused by every row above it.
      rows.sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );

      const scrollTop = container.scrollTop;
      const containerTop = container.getBoundingClientRect().top;
      let cumulativeShift = 0;
      let adjustment = 0;
      for (const { el, oldHeight, newHeight } of rows) {
        const delta = newHeight - oldHeight;
        const top = el.getBoundingClientRect().top - containerTop + scrollTop;
        const previousBottom = top - cumulativeShift + oldHeight;
        // Only rows that were completely above the viewport push visible content.
        if (previousBottom <= scrollTop + 1) adjustment += delta;
        cumulativeShift += delta;
      }

      if (adjustment !== 0) {
        container.scrollTop = scrollTop + adjustment;
      }
    },
    [scrollRef]
  );

  const getObserver = useCallback(() => {
    if (!observerRef.current && typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver(handleResize);
    }
    return observerRef.current;
  }, [handleResize]);

  const registerRow = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return undefined;

      let hintTimer: ReturnType<typeof setTimeout> | undefined;
      const key = el.getAttribute(ROW_KEY_ATTR);
      const container = scrollRef.current;
      const cached = key ? heightCacheRef.current.get(key) : undefined;
      if (cached && container && Math.abs(cached.width - container.clientWidth) < 2) {
        el.style.minHeight = `${cached.height}px`;
        hintTimer = setTimeout(() => {
          el.style.minHeight = '';
        }, HEIGHT_HINT_TTL_MS);
      }

      getObserver()?.observe(el);
      return () => {
        if (hintTimer !== undefined) clearTimeout(hintTimer);
        observerRef.current?.unobserve(el);
        sizesRef.current.delete(el);
      };
    },
    [scrollRef, getObserver]
  );

  const markPinned = useCallback((smooth = false) => {
    pinnedRef.current = true;
    if (smooth) {
      const now = performance.now();
      smoothPinRef.current = { start: now, until: now + SMOOTH_PIN_WINDOW_MS };
    }
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!active || !container) return;

    let lastScrollTop = container.scrollTop;
    const onScroll = () => {
      const { scrollTop } = container;
      const movedUp = scrollTop < lastScrollTop - 1;
      lastScrollTop = scrollTop;
      const distance = container.scrollHeight - scrollTop - container.clientHeight;
      if (distance <= PIN_THRESHOLD_PX) {
        pinnedRef.current = true;
        return;
      }
      // Scroll events arrive a frame late: the one for a scroll to the bottom can be read after
      // rows below have grown (media laying out), which looks like being far from the bottom.
      // Only leave the bottom when the view actually moved up.
      if (!movedUp) return;
      const { start, until } = smoothPinRef.current;
      const now = performance.now();
      const smoothScrollInFlight = now < until && lastUserInputRef.current < start;
      if (!smoothScrollInFlight) pinnedRef.current = false;
    };
    const onUserInput = () => {
      lastUserInputRef.current = performance.now();
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', onUserInput, { passive: true });
    container.addEventListener('touchstart', onUserInput, { passive: true });
    container.addEventListener('pointerdown', onUserInput, { passive: true });
    container.addEventListener('keydown', onUserInput, { passive: true });

    const observer = getObserver();
    observer?.observe(container);

    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', onUserInput);
      container.removeEventListener('touchstart', onUserInput);
      container.removeEventListener('pointerdown', onUserInput);
      container.removeEventListener('keydown', onUserInput);
      observer?.disconnect();
      observerRef.current = null;
    };
  }, [scrollRef, getObserver, active]);

  return { registerRow, markPinned };
}
