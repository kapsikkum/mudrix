import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { RoomTimeline, TimelineKind, MudrixClient } from '@mudrix/core';

export interface ComposerTimeline {
  roomId: string;
  threadId: string | null;
  getTimeline: () => Promise<RoomTimeline>;
}

export const ComposerTimelineContext = createContext<ComposerTimeline | null>(null);

/** How long a send waits for a timeline the view has not linked yet before it gives up. */
const TIMELINE_WAIT_TIMEOUT_MS = 30_000;

interface TimelineWaiter {
  resolve: (timeline: RoomTimeline) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function timelineNotReadyError(): Error {
  return new Error('The room timeline is not ready yet');
}

function kindOf(threadId: string | null | undefined): TimelineKind {
  return threadId ? { type: 'thread', rootEventId: threadId } : { type: 'main' };
}

export function useSendTimeline(
  client: MudrixClient,
  roomId: string,
  threadId: string | null | undefined,
  provided?: RoomTimeline | null,
  eager = true
): { timeline: RoomTimeline | null; getTimeline: () => Promise<RoomTimeline> } {
  const key = `${roomId}|${threadId ?? ''}`;
  const external = provided !== undefined;
  const ownRef = useRef<{ key: string; promise: Promise<RoomTimeline> } | null>(null);
  const [own, setOwn] = useState<{ key: string; timeline: RoomTimeline } | null>(null);
  const waitersRef = useRef<TimelineWaiter[]>([]);

  const ensureOwn = useCallback(() => {
    if (ownRef.current?.key === key) return ownRef.current.promise;
    const promise = client.timelineOf(roomId, kindOf(threadId));
    const entry = { key, promise };
    ownRef.current = entry;
    promise.then(
      (timeline) => {
        if (ownRef.current === entry) setOwn({ key, timeline });
      },
      () => {
        if (ownRef.current === entry) ownRef.current = null;
      }
    );
    return promise;
  }, [client, key, roomId, threadId]);

  useEffect(() => {
    if (!external && eager) void ensureOwn().catch(() => {});
  }, [external, eager, ensureOwn]);

  useEffect(() => {
    if (!provided) return;
    const waiters = waitersRef.current.splice(0);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(provided);
    }
  }, [provided]);

  // A send that is still waiting when the composer goes away must not hang forever.
  useEffect(
    () => () => {
      const waiters = waitersRef.current.splice(0);
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(timelineNotReadyError());
      }
    },
    []
  );

  const getTimeline = useCallback((): Promise<RoomTimeline> => {
    if (provided) return Promise.resolve(provided);
    if (provided === null) {
      return new Promise<RoomTimeline>((resolve, reject) => {
        const waiter: TimelineWaiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            const index = waitersRef.current.indexOf(waiter);
            if (index >= 0) waitersRef.current.splice(index, 1);
            reject(timelineNotReadyError());
          }, TIMELINE_WAIT_TIMEOUT_MS),
        };
        waitersRef.current.push(waiter);
      });
    }
    return ensureOwn();
  }, [provided, ensureOwn]);

  const timeline = external ? (provided ?? null) : own?.key === key ? own.timeline : null;
  return { timeline, getTimeline };
}

export function useComposerTimeline(
  client: MudrixClient,
  roomId: string,
  threadId: string | null | undefined
): () => Promise<RoomTimeline> {
  const context = useContext(ComposerTimelineContext);
  const matches = context?.roomId === roomId && context.threadId === (threadId ?? null);
  const { getTimeline } = useSendTimeline(client, roomId, threadId, undefined, false);
  return matches ? context.getTimeline : getTimeline;
}
