import { useCallback, useEffect, useRef, useState } from 'react';

type Listener = (inView: boolean) => void;

const listeners = new WeakMap<Element, Listener>();
let sharedObserver: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!sharedObserver) {
    // One observer for every tile: cheaper than hundreds of observers in a big grid.
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
      },
      { rootMargin: '240px' }
    );
  }
  return sharedObserver;
}

/**
 * Tracks whether an element is within ~240px of the viewport (clipped by scroll containers, so it
 * works inside modals). Attach the returned ref callback to the element. Where
 * IntersectionObserver is missing it reports `true` so content still loads.
 */
export function useInView<T extends Element = HTMLElement>(): [(node: T | null) => void, boolean] {
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  const nodeRef = useRef<T | null>(null);

  const setRef = useCallback((node: T | null) => {
    const observer = getObserver();
    const prev = nodeRef.current;
    if (prev && prev !== node) {
      observer?.unobserve(prev);
      listeners.delete(prev);
    }
    nodeRef.current = node;
    if (node && observer) {
      listeners.set(node, setInView);
      observer.observe(node);
    }
  }, []);

  useEffect(() => {
    // Re-attach after a StrictMode simulated unmount (ref callbacks are not re-run).
    const node = nodeRef.current;
    const observer = getObserver();
    if (node && observer && !listeners.has(node)) {
      listeners.set(node, setInView);
      observer.observe(node);
    }
    return () => {
      const current = nodeRef.current;
      if (current) {
        sharedObserver?.unobserve(current);
        listeners.delete(current);
      }
    };
  }, []);

  return [setRef, inView];
}
