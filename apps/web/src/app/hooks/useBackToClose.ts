import { useEffect, useRef } from 'react';

const MARKER = 'mxBackClose';

/**
 * Back-button bookkeeping, shared by every overlay.
 *
 * An open overlay owns one throwaway history entry (carrying `MARKER: <its id>`); popping it
 * closes the overlay. History changes are queued and run one at a time, because `history.back()`
 * only takes effect later: deciding whether to push or pop from a stale `history.state` is what
 * made overlays that mount already open (React StrictMode runs the effect twice) end up without an
 * entry, or pop one that was not theirs.
 */
interface Overlay {
  close: () => void;
}

/** Overlays that are open right now, by id. */
const live = new Map<string, Overlay>();
/** Ids that have an entry in the history, oldest first. Entries of overlays that closed while
 *  something else sat on top stay behind as stale entries that Back skips over. */
const pushed: string[] = [];

const queue: (() => void)[] = [];
let drainScheduled = false;
// A pop we started ourselves is under way; its popstate must not close anything.
let selfPopPending = false;
let selfPopTimer: number | undefined;

const topMarker = (): string | undefined => window.history.state?.[MARKER];

let seq = 0;
// Entries that survive a reload keep their marker; ids of a new page must never match them.
const SESSION = Math.random().toString(36).slice(2, 8);
const newId = () => `${SESSION}-${(seq += 1)}`;

function removePushed(id: string) {
  const at = pushed.lastIndexOf(id);
  if (at >= 0) pushed.splice(at, 1);
}

function schedule(op: () => void) {
  queue.push(op);
  if (drainScheduled || selfPopPending) return;
  drainScheduled = true;
  queueMicrotask(drain);
}

function drain() {
  drainScheduled = false;
  while (queue.length && !selfPopPending) queue.shift()?.();
}

/** Takes the top history entry off, then carries on with whatever was queued behind it. */
function popOwnEntry() {
  selfPopPending = true;
  window.clearTimeout(selfPopTimer);
  // popstate should always follow; if it never does, do not wedge the queue.
  selfPopTimer = window.setTimeout(endSelfPop, 400);
  window.history.back();
}

function endSelfPop() {
  window.clearTimeout(selfPopTimer);
  selfPopPending = false;
  drain();
}

function pushEntry(id: string) {
  window.history.pushState({ ...(window.history.state ?? {}), [MARKER]: id }, '');
  pushed.push(id);
}

function openOp(id: string) {
  if (!live.has(id)) return;
  if (topMarker() === id) {
    // The entry on top is already ours (mounted twice, or revived after sitting on top).
    if (!pushed.includes(id)) pushed.push(id);
    return;
  }
  pushEntry(id);
}

function releaseOp(id: string) {
  if (live.has(id)) return; // opened again before this ran
  if (topMarker() === id) {
    removePushed(id);
    popOwnEntry();
  }
  // Otherwise something else sits on top of our entry; it stays behind as a stale entry.
}

if (typeof window !== 'undefined') {
  // A reload on an overlay's entry leaves its marker behind with nothing to close.
  if (topMarker()) {
    const rest = { ...window.history.state };
    delete rest[MARKER];
    window.history.replaceState(rest, '');
  }
  // Capture phase, so this classifies a pop before the router or any other handler runs.
  window.addEventListener(
    'popstate',
    () => {
      if (selfPopPending) {
        endSelfPop();
        return;
      }
      const cur = topMarker();
      const top = pushed[pushed.length - 1];
      let closed = false;
      if (top !== undefined && top !== cur) {
        // Back took the topmost overlay's entry: close that overlay only.
        pushed.pop();
        const overlay = live.get(top);
        if (overlay) {
          closed = true;
          overlay.close();
        }
      }
      // Landed on a stale entry (its overlay is gone) without closing anything: keep going back.
      if (!closed && cur !== undefined && !live.has(cur)) {
        queue.unshift(popOwnEntry);
        if (!drainScheduled) {
          drainScheduled = true;
          queueMicrotask(drain);
        }
      }
    },
    true
  );
}

/**
 * Lets the Android back button / iOS swipe-back dismiss a transient overlay instead of
 * navigating away: while `active`, a throwaway history entry is pushed and popping it calls
 * `onClose`. If the overlay closes some other way, the entry is removed again.
 */
export function useBackToClose(active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // One id per mounted overlay, so a second effect run (StrictMode) finds its own entry.
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    idRef.current ??= newId();
    const id = idRef.current;
    live.set(id, { close: () => closeRef.current() });
    schedule(() => openOp(id));
    return () => {
      live.delete(id);
      schedule(() => releaseOp(id));
    };
  }, [active]);
}
