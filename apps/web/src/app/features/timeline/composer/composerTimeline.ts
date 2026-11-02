import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { RoomTimeline, TimelineKind, WizardClient } from '@wizardchat/core';

export interface ComposerTimeline {
  roomId: string;
  threadId: string | null;
  getTimeline: () => Promise<RoomTimeline>;
}

export const ComposerTimelineContext = createContext<ComposerTimeline | null>(null);

function kindOf(threadId: string | null | undefined): TimelineKind {
  return threadId ? { type: 'thread', rootEventId: threadId } : { type: 'main' };
}

export function useSendTimeline(
  client: WizardClient,
  roomId: string,
  threadId: string | null | undefined,
  provided?: RoomTimeline | null,
  eager = true
): { timeline: RoomTimeline | null; getTimeline: () => Promise<RoomTimeline> } {
  const key = `${roomId}|${threadId ?? ''}`;
  const external = provided !== undefined;
  const ownRef = useRef<{ key: string; promise: Promise<RoomTimeline> } | null>(null);
  const [own, setOwn] = useState<{ key: string; timeline: RoomTimeline } | null>(null);
  const waitersRef = useRef<((timeline: RoomTimeline) => void)[]>([]);

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
    if (provided) waitersRef.current.splice(0).forEach((resolve) => resolve(provided));
  }, [provided]);

  const getTimeline = useCallback((): Promise<RoomTimeline> => {
    if (provided) return Promise.resolve(provided);
    if (provided === null) {
      return new Promise((resolve) => waitersRef.current.push(resolve));
    }
    return ensureOwn();
  }, [provided, ensureOwn]);

  const timeline = external ? (provided ?? null) : own?.key === key ? own.timeline : null;
  return { timeline, getTimeline };
}

export function useComposerTimeline(
  client: WizardClient,
  roomId: string,
  threadId: string | null | undefined
): () => Promise<RoomTimeline> {
  const context = useContext(ComposerTimelineContext);
  const matches = context?.roomId === roomId && context.threadId === (threadId ?? null);
  const { getTimeline } = useSendTimeline(client, roomId, threadId, undefined, false);
  return matches ? context.getTimeline : getTimeline;
}
