import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import type { MudrixClient, RoomTimeline } from '@mudrix/core';
import { sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import { decideReadReceipt, isServerEventId } from './readReceipt';

/** Anything on screen at the bottom of an open room gets read within a couple of seconds. */
const SAFETY_NET_MS = 2_000;
/** How close to the bottom counts as "at the bottom"; matches the timeline's stick-to-bottom. */
const AT_BOTTOM_PX = 4;

interface Options {
  client: MudrixClient;
  roomId: string;
  /** The live room timeline, or null when the view is parked on older history. */
  timeline: RoomTimeline | null;
  /** Newest event in the view the server knows about; null when the view has none. */
  latestEventId: string | null;
  /** The room still counts as unread on the server. */
  roomUnread: boolean;
  /** The scroll container, read at attempt time so a stale render can never mark read. */
  getScrollElement: () => HTMLElement | null;
  /** Whether the view reaches the live end (nothing newer is below it). */
  isAtLiveEnd: () => boolean;
}

interface LastSent {
  roomId: string;
  eventId: string;
  at: number;
}

/**
 * Sends the read receipt for the open room: when a new event arrives, on regaining focus, and as
 * a safety net while the room sits at the bottom. It never marks read while scrolled up, while the
 * tab is hidden or unfocused, or when the view is not at the live end.
 *
 * The returned callback is safe to call from any effect; it decides for itself whether a receipt
 * is due.
 */
export function useTimelineReadReceipts(options: Options): () => void {
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const lastSentRef = useRef<LastSent | null>(null);
  const latestRef = useRef(options.latestEventId);
  latestRef.current = options.latestEventId;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const send = useCallback(
    (eventId: string) => {
      const { client, roomId, timeline } = optionsRef.current;
      lastSentRef.current = { roomId, eventId, at: Date.now() };
      const sent = timeline
        ? timeline.markAsRead(!sendReadReceipts)
        : client.markRoomAsRead(roomId, !sendReadReceipts);
      void sent.catch(() => {
        // Let the next attempt (the safety net) try the same event again: a receipt that failed
        // must not be remembered as sent, or the room stays unread until it is reopened.
        if (lastSentRef.current?.roomId === roomId && lastSentRef.current.eventId === eventId) {
          lastSentRef.current = null;
        }
      });
    },
    [sendReadReceipts]
  );

  const attempt = useCallback(() => {
    const current = optionsRef.current;
    const latest = latestRef.current;
    const last = lastSentRef.current?.roomId === current.roomId ? lastSentRef.current : null;
    const scrollEl = current.getScrollElement();
    // Read the geometry instead of trusting a render-time flag: after opening a room scrolled to
    // an unread divider the flag can still say "bottom" for a frame.
    const atBottom = scrollEl
      ? scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight <= AT_BOTTOM_PX
      : true;
    const decision = decideReadReceipt({
      focused: document.hasFocus(),
      visible: document.visibilityState === 'visible',
      atBottom,
      atLiveEnd: current.isAtLiveEnd(),
      latestEventId: latest,
      lastSentEventId: last?.eventId ?? null,
      lastSentAt: last?.at ?? null,
      roomUnread: current.roomUnread,
      now: Date.now(),
    });
    if (!decision.send || !isServerEventId(latest)) return;
    send(latest);
  }, [send]);

  // Safety net: an event that arrived mid-render, a receipt that failed, or a late echo all get
  // another try without waiting for the next timeline update.
  useEffect(() => {
    const timer = window.setInterval(attempt, SAFETY_NET_MS);
    return () => window.clearInterval(timer);
  }, [attempt]);

  // Catch up on what arrived while the tab was in the background.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible') attempt();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [attempt]);

  return attempt;
}
