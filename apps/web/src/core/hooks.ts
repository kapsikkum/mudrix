import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RoomTimeline,
  TimelineEntry,
  TimelineKind,
  TypingUser,
  WizardClient,
} from '@wizardchat/core';
import { applyDiffs } from './listDiff';

const PAGE = 30;
const MAIN: TimelineKind = { type: 'main' };

/** The live timeline of a room (or one of its threads, or its pinned messages) */
export function useTimeline(
  client: WizardClient,
  roomId: string,
  kind: TimelineKind = MAIN,
  enabled = true
) {
  const kindKey = JSON.stringify(kind);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [atStart, setAtStart] = useState(false);
  const [loading, setLoading] = useState(false);
  const timelineRef = useRef<RoomTimeline | null>(null);
  const [timeline, setTimeline] = useState<RoomTimeline | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: { cancel(): void } | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    setEntries([]);
    setAtStart(false);
    if (!enabled) return;

    const connect = async () => {
      try {
        const t = await client.timelineOf(roomId, JSON.parse(kindKey) as TimelineKind);
        if (cancelled) return;
        timelineRef.current = t;
        setTimeline(t);
        subscription = t.watch((diffs) => setEntries((list) => applyDiffs(list, diffs)));
        setLoading(true);
        const atStartResult = await t.paginateBack(PAGE).catch(() => false);
        if (cancelled) return;
        setAtStart(atStartResult);
        setLoading(false);
      } catch {
        if (cancelled) return;
        retryTimer = setTimeout(connect, 400);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      subscription?.cancel();
      timelineRef.current = null;
      setTimeline(null);
    };
  }, [client, roomId, kindKey, enabled]);

  const loadOlder = useCallback(async () => {
    const timeline = timelineRef.current;
    if (!timeline || loading || atStart) return;
    setLoading(true);
    setAtStart(await timeline.paginateBack(PAGE).catch(() => false));
    setLoading(false);
  }, [loading, atStart]);

  return { entries, atStart, loading, loadOlder, timeline };
}

/** Other users typing in the room, while the timeline is open */
export function useTypingUsers(timeline: RoomTimeline | null) {
  const [users, setUsers] = useState<TypingUser[]>([]);
  useEffect(() => {
    setUsers([]);
    if (!timeline) return;
    const subscription = timeline.watchTyping(setUsers);
    return () => subscription.cancel();
  }, [timeline]);
  return users;
}
