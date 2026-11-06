import { useCallback, useEffect, useRef, useState } from 'react';
import { motionReduced } from '@/app/util/elastic';
import { sectionFlash } from './Settings.css';

export interface SubSection {
  id: number;
  label: string;
}

/** A heading's name: `data-subsection` when it has one (its text carries badges, say), else its text. */
const sectionLabel = (el: HTMLElement) => (el.dataset.subsection ?? el.textContent ?? '').trim();

/** Space kept above a heading when it is scrolled to, under the sticky page title. */
const SCROLL_GAP = 12;

/**
 * The headings of the page being shown (every `h3`, and anything marked `data-subsection`, in the scroller), for a sidebar list of its
 * sections: which one is at the top as the page scrolls, and a way to scroll to one. Pages change
 * after they open (data loads, sections appear), so the list follows the DOM. The scroller is an
 * element in state, not a ref, because the dialog that holds it mounts after the first render.
 */
export function useSubSections(
  scroller: HTMLElement | null,
  page: string
): {
  sections: SubSection[];
  activeId: number | null;
  scrollTo: (id: number) => void;
} {
  const headings = useRef<HTMLElement[]>([]);
  /** The section that was clicked, kept marked until the person scrolls by hand. */
  const pinned = useRef<number | null>(null);
  const [sections, setSections] = useState<SubSection[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  // Only a page title that stays put (position: sticky) covers the top of the scroller.
  const stickyOffset = useCallback(() => {
    const title = scroller?.querySelector('h2');
    const sticky = !!title && getComputedStyle(title).position === 'sticky';
    return (sticky ? title.getBoundingClientRect().height : 0) + SCROLL_GAP;
  }, [scroller]);

  const updateActive = useCallback(() => {
    const list = headings.current;
    if (!scroller || list.length === 0) {
      setActiveId(null);
      return;
    }
    if (pinned.current !== null) {
      setActiveId(pinned.current);
      return;
    }
    const top = scroller.getBoundingClientRect().top + stickyOffset() + 4;
    let current = 0;
    list.forEach((el, i) => {
      if (el.getBoundingClientRect().top <= top) current = i;
    });
    // At the very bottom the last section wins even when it is too short to reach the top.
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      current = list.length - 1;
    }
    setActiveId(current);
  }, [scroller, stickyOffset]);

  useEffect(() => {
    if (!scroller) {
      headings.current = [];
      setSections([]);
      setActiveId(null);
      return undefined;
    }
    scroller.scrollTop = 0;
    pinned.current = null;
    let frame = 0;
    const scan = () => {
      frame = 0;
      // A heading inside a dialog opened from the page (not the one holding it) is not a section.
      const own = scroller.closest('[role="dialog"]');
      const found = Array.from(
        scroller.querySelectorAll<HTMLElement>('h3, [data-subsection]')
      ).filter((el) => el.closest('[role="dialog"]') === own && sectionLabel(el) !== '');
      headings.current = found;
      const next = found.map((el, id) => ({ id, label: sectionLabel(el) }));
      setSections((prev) =>
        prev.length === next.length && prev.every((p, i) => p.label === next[i].label) ? prev : next
      );
      updateActive();
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(scan);
    };
    scan();
    const observer = new MutationObserver(schedule);
    observer.observe(scroller, { childList: true, subtree: true, characterData: true });
    scroller.addEventListener('scroll', updateActive, { passive: true });
    // Scrolling by hand takes over again from a clicked section.
    const release = () => {
      pinned.current = null;
    };
    const releaseEvents = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;
    releaseEvents.forEach((name) => scroller.addEventListener(name, release, { passive: true }));
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', updateActive);
      releaseEvents.forEach((name) => scroller.removeEventListener(name, release));
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scroller, page, updateActive]);

  const scrollTo = useCallback(
    (id: number) => {
      const el = headings.current[id];
      if (!scroller || !el) return;
      const delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      scroller.scrollTo({
        top: scroller.scrollTop + delta - stickyOffset(),
        behavior: motionReduced() ? 'auto' : 'smooth',
      });
      pinned.current = id;
      setActiveId(id);
      // Flash the heading so the eye finds where the jump landed.
      el.classList.remove(sectionFlash);
      void el.offsetWidth;
      el.classList.add(sectionFlash);
      el.addEventListener('animationend', () => el.classList.remove(sectionFlash), { once: true });
    },
    [scroller, stickyOffset]
  );

  return { sections, activeId, scrollTo };
}
