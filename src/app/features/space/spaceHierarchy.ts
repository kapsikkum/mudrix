import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { EventType, type MatrixClient } from 'matrix-js-sdk';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { useThrottle } from '@/app/hooks/useThrottle';
import { getSpaceChildEvents } from '@/util/matrix';
import { compareSpaceChildren } from '@/app/features/room/roomOrder';
import { accountStorageKey } from '@/const/accountStorage';

export interface RoomSummary {
  room_id: string;
  name?: string;
  avatar_url?: string;
  topic?: string;
  num_joined_members: number;
  join_rule?: string;
  room_type?: string;
  suggested?: boolean;
  via?: string[];
  children_state?: {
    state_key?: string;
    origin_server_ts?: number;
    content?: { suggested?: boolean; via?: string[]; order?: string };
  }[];
}

export function summaryIsSpace(s: RoomSummary | undefined): boolean {
  return s?.room_type === 'm.space';
}

export interface SpaceChildRef {
  roomId: string;
  via: string[];
  suggested: boolean;
  order?: string;
  ts: number;
}

export function resolveSpaceChildren(
  nodeId: string,
  client: MatrixClient,
  serverMap: Map<string, RoomSummary>
): SpaceChildRef[] {
  const local = client.getRoom(nodeId);
  const localEvents = getSpaceChildEvents(local);

  if (localEvents.length > 0) {
    const out: SpaceChildRef[] = [];
    const seen = new Set<string>();
    for (const ev of localEvents) {
      const roomId = ev.getStateKey();
      if (!roomId || roomId === nodeId || seen.has(roomId)) continue;
      seen.add(roomId);
      const content = ev.getContent() as Record<string, unknown> | undefined;
      const via = Array.isArray(content?.['via']) ? (content['via'] as string[]) : [];
      out.push({
        roomId,
        via,
        suggested: content?.['suggested'] === true,
        order: typeof content?.['order'] === 'string' ? content['order'] : undefined,
        ts: ev.getTs(),
      });
    }
    return out.sort(compareSpaceChildren);
  }

  const rels = serverMap.get(nodeId)?.children_state ?? [];
  const out: SpaceChildRef[] = [];
  const seen = new Set<string>();
  for (const rel of rels) {
    const roomId = rel.state_key;
    if (!roomId || roomId === nodeId || seen.has(roomId)) continue;
    seen.add(roomId);
    const via = rel.content?.via ?? [];
    if (via.length === 0) continue;
    out.push({
      roomId,
      via,
      suggested: rel.content?.suggested === true,
      order: rel.content?.order,
      ts: rel.origin_server_ts ?? 0,
    });
  }
  return out.sort(compareSpaceChildren);
}

const HIERARCHY_PAGE_LIMIT = 100;
const HIERARCHY_MAX_AUTO_PAGES = 50;

export async function fetchSpaceHierarchyLevel(
  spaceId: string,
  client: MatrixClient,
  maxDepth = 1,
  pageCap = HIERARCHY_MAX_AUTO_PAGES
): Promise<Map<string, RoomSummary>> {
  const map = new Map<string, RoomSummary>();
  let from: string | undefined = undefined;
  let lastError: unknown;
  let page = 0;

  for (; page < pageCap; page++) {
    try {
      const result = await client.getRoomHierarchy(
        spaceId,
        HIERARCHY_PAGE_LIMIT,
        maxDepth,
        false,
        from
      );
      for (const r of result.rooms) {
        map.set(r.room_id, r as RoomSummary);
      }
      for (const r of result.rooms) {
        const children = (r as RoomSummary).children_state;
        if (!children) continue;
        for (const rel of children) {
          if (!rel.state_key) continue;
          const child = map.get(rel.state_key);
          if (!child) continue;
          if (rel.content?.suggested) {
            map.set(rel.state_key, { ...child, suggested: true });
          }
          if (rel.content?.via?.length) {
            const cur = map.get(rel.state_key)!;
            map.set(rel.state_key, { ...cur, via: rel.content.via });
          }
        }
      }
      if (!result.next_batch) break;
      from = result.next_batch;
    } catch (err) {
      lastError = err;
      break;
    }
  }

  if (lastError) {
    if (map.size === 0) throw lastError;
    console.warn('[space-hierarchy] response truncated', from, lastError);
  } else if (page >= pageCap) {
    console.warn('[space-hierarchy] hit page cap', pageCap, map.size, 'rooms');
  }

  return map;
}

const HIERARCHY_STALE_MS = 60_000;
const HIERARCHY_GC_MS = 300_000;
const EMPTY_MAP: Map<string, RoomSummary> = new Map();

export const spaceHierarchyQueryKey = (spaceId: string | null) => ['space-hierarchy', spaceId];

const PERSIST_KEY = 'wz_space_hierarchy';
const PERSIST_MAX_SPACES = 40;
type PersistedHierarchies = Record<string, { ts: number; rooms: RoomSummary[] }>;

function readPersistedAll(): PersistedHierarchies {
  try {
    return (JSON.parse(localStorage.getItem(accountStorageKey(PERSIST_KEY)) ?? '{}') ??
      {}) as PersistedHierarchies;
  } catch {
    return {};
  }
}

function readPersisted(spaceId: string): { ts: number; map: Map<string, RoomSummary> } | null {
  const entry = readPersistedAll()[spaceId];
  if (!entry || !Array.isArray(entry.rooms)) return null;
  return { ts: entry.ts, map: new Map(entry.rooms.map((r) => [r.room_id, r])) };
}

function persist(spaceId: string, map: Map<string, RoomSummary>): void {
  const all = readPersistedAll();
  all[spaceId] = { ts: Date.now(), rooms: [...map.values()] };
  const newest = Object.entries(all)
    .sort(([, a], [, b]) => b.ts - a.ts)
    .slice(0, PERSIST_MAX_SPACES);
  try {
    localStorage.setItem(
      accountStorageKey(PERSIST_KEY),
      JSON.stringify(Object.fromEntries(newest))
    );
  } catch {
    // Storage full: the in-memory cache still works
  }
}

export function getCachedSpaceHierarchy(
  queryClient: QueryClient,
  spaceId: string
): Map<string, RoomSummary> | undefined {
  const queryKey = spaceHierarchyQueryKey(spaceId);
  const cached = queryClient.getQueryData<Map<string, RoomSummary>>(queryKey);
  if (cached) return cached;
  const stored = readPersisted(spaceId);
  if (!stored) return undefined;
  queryClient.setQueryData(queryKey, stored.map, { updatedAt: stored.ts });
  return stored.map;
}

async function fetchAndPersist(
  client: MatrixClient,
  spaceId: string
): Promise<Map<string, RoomSummary>> {
  const map = await fetchSpaceHierarchyLevel(spaceId, client, 1);
  persist(spaceId, map);
  return map;
}

export function loadSpaceHierarchy(
  queryClient: QueryClient,
  client: MatrixClient,
  spaceId: string,
  opts: { force?: boolean } = {}
): Promise<Map<string, RoomSummary>> {
  getCachedSpaceHierarchy(queryClient, spaceId);
  return queryClient.fetchQuery({
    queryKey: spaceHierarchyQueryKey(spaceId),
    queryFn: () => fetchAndPersist(client, spaceId),
    staleTime: opts.force ? 0 : HIERARCHY_STALE_MS,
    gcTime: HIERARCHY_GC_MS,
    retry: 1,
  });
}

const PREFETCH_CONCURRENCY = 2;

export function prefetchSpaceHierarchies(
  queryClient: QueryClient,
  client: MatrixClient,
  spaceIds: string[]
): void {
  const queue = spaceIds.filter((id) => {
    const state = queryClient.getQueryState(spaceHierarchyQueryKey(id));
    const fresh = !!state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < HIERARCHY_STALE_MS;
    return !fresh && state?.fetchStatus !== 'fetching';
  });
  const next = (): Promise<void> => {
    const id = queue.shift();
    if (!id) return Promise.resolve();
    return loadSpaceHierarchy(queryClient, client, id)
      .catch(() => {})
      .then(next);
  };
  for (let i = 0; i < PREFETCH_CONCURRENCY; i++) void next();
}

export interface SpaceHierarchySnapshot {
  map: Map<string, RoomSummary>;
  isLoading: boolean;
  error: Error | null;
}

export function useSpaceHierarchyMap(spaceId: string | null): SpaceHierarchySnapshot {
  const client = getMatrixClientOrNull();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: spaceHierarchyQueryKey(spaceId),
    queryFn: () => {
      if (!client) throw new Error('no client');
      return fetchAndPersist(client, spaceId!);
    },
    initialData: () => (spaceId ? readPersisted(spaceId)?.map : undefined),
    initialDataUpdatedAt: () => (spaceId ? readPersisted(spaceId)?.ts : undefined),
    staleTime: HIERARCHY_STALE_MS,
    gcTime: HIERARCHY_GC_MS,
    retry: 1,
    enabled: !!client && !!spaceId,
  });

  const fullyLoaded = !!query.data && !query.isFetching;
  useEffect(() => {
    if (!fullyLoaded || !client || !query.data) return;
    const subSpaceIds = [...query.data.values()]
      .filter((r) => summaryIsSpace(r) && r.room_id !== spaceId)
      .map((r) => r.room_id);
    if (subSpaceIds.length > 0) prefetchSpaceHierarchies(queryClient, client, subSpaceIds);
  }, [fullyLoaded, query.data, client, queryClient, spaceId]);

  const invalidate = useCallback(() => {
    if (!spaceId) return;
    void queryClient.invalidateQueries({ queryKey: spaceHierarchyQueryKey(spaceId) });
  }, [queryClient, spaceId]);

  const throttledInvalidate = useThrottle(invalidate, 500);

  const handleSpaceChildChange = useCallback(
    (
      event: { getType?: () => string },
      _state: unknown,
      _prev: unknown,
      room: { roomId?: string }
    ) => {
      if (event?.getType?.() !== EventType.SpaceChild) return;
      if (room?.roomId !== spaceId) return;
      throttledInvalidate();
    },
    [throttledInvalidate, spaceId]
  );

  useMatrixEvent(client ?? null, 'RoomState.events', handleSpaceChildChange);

  return useMemo(
    () => ({
      map: query.data ?? EMPTY_MAP,
      isLoading: query.isLoading,
      error:
        query.error instanceof Error
          ? query.error
          : query.error
            ? new Error(String(query.error))
            : null,
    }),
    [query.data, query.isLoading, query.error]
  );
}
