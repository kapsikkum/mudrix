import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WizardClient as MatrixClient } from '@wizardchat/core';

/**
 * When `userId` last joined `room` (ms since epoch). Returns null when unknown.
 */
export function getMemberSince(room: unknown, userId: string): number | null {
  if (!room || typeof room !== 'object') return null;
  const r = room as Record<string, unknown>;
  let best: number | null = null;

  const consider = (ev: unknown) => {
    if (!ev || typeof ev !== 'object') return;
    const e = ev as Record<string, unknown>;
    const type = typeof e.getType === 'function' ? (e.getType as () => string)() : e.type;
    const stateKey =
      typeof e.getStateKey === 'function' ? (e.getStateKey as () => string)() : e.state_key;
    if (type !== 'm.room.member' || stateKey !== userId) return;
    const content = (
      typeof e.getContent === 'function'
        ? (e.getContent as () => Record<string, unknown>)()
        : e.content
    ) as Record<string, unknown> | undefined;
    if (content?.membership !== 'join') return;
    const prevContent = (
      typeof e.getPrevContent === 'function'
        ? (e.getPrevContent as () => Record<string, unknown>)()
        : e.prev_content
    ) as Record<string, unknown> | undefined;
    if (prevContent?.membership === 'join') return;
    const ts = typeof e.getTs === 'function' ? (e.getTs as () => number)() : e.origin_server_ts;
    if (typeof ts === 'number' && ts > 0 && (best === null || ts > best)) best = ts;
  };

  try {
    if (typeof r.getLiveTimeline === 'function') {
      const timeline = (r.getLiveTimeline as () => { getEvents?: () => unknown[] })() ?? {};
      const events = timeline.getEvents?.() ?? [];
      for (const ev of events) consider(ev);
    }
  } catch {
    // ignore
  }

  return best;
}

export function useMemberSince(
  client: MatrixClient | null | undefined,
  roomId: string | null | undefined,
  userId: string,
  room?: unknown
): number | null {
  const syncSince = useMemo(() => getMemberSince(room, userId), [room, userId]);

  const { data } = useQuery<number | null>({
    queryKey: ['member-since', roomId, userId],
    queryFn: async () => {
      if (syncSince !== null) return syncSince;
      if (!client || !roomId) return null;
      const session = client.session();
      if (!session?.accessToken || !session?.homeserverUrl) return null;
      const base = session.homeserverUrl.replace(/\/+$/, '');
      try {
        const res = await fetch(
          `${base}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members`,
          {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }
        );
        if (!res.ok) return null;
        const json = (await res.json()) as { chunk?: Array<Record<string, unknown>> };
        const ev = json.chunk?.find(
          (e) =>
            e.state_key === userId &&
            e.type === 'm.room.member' &&
            (e.content as Record<string, unknown> | undefined)?.membership === 'join'
        );
        if (ev && typeof ev.origin_server_ts === 'number') {
          return ev.origin_server_ts;
        }
      } catch {
        // ignore
      }
      return null;
    },
    enabled: syncSince === null && !!client && !!roomId,
    staleTime: 5 * 60_000,
  });

  return syncSince ?? data ?? null;
}
