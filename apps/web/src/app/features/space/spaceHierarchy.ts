import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { SpaceChild, SpaceNode, WizardClient } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllJoinedSpaces, useSpaceGraph } from '@/app/data';
import { useThrottle } from '@/app/hooks/useThrottle';
import { compareSpaceChildren } from '@/app/features/room/roomOrder';
import { accountStorageKey } from '@/const/accountStorage';

export interface RoomSummary {
  room_id: string;
  name?: string;
  avatar_url?: string;
  topic?: string;
  canonical_alias?: string;
  num_joined_members: number;
  join_rule?: string;
  room_type?: string;
  world_readable?: boolean;
  children_count?: number;
  suggested?: boolean;
  via?: string[];
}

export function summaryIsSpace(s: RoomSummary | undefined): boolean {
  return s?.room_type === 'm.space';
}

export function summaryFromSpaceChild(child: SpaceChild): RoomSummary {
  return {
    room_id: child.id,
    name: child.name || undefined,
    avatar_url: child.avatarUrl ?? undefined,
    topic: child.topic ?? undefined,
    canonical_alias: child.canonicalAlias ?? undefined,
    num_joined_members: child.memberCount,
    join_rule: child.joinRule ?? undefined,
    room_type: child.isSpace ? 'm.space' : undefined,
    world_readable: child.worldReadable,
    children_count: child.childrenCount,
    suggested: child.suggested,
    via: child.via,
  };
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
  graph: SpaceNode[],
  serverMap: Map<string, RoomSummary> | undefined
): SpaceChildRef[] {
  const local = graph.find((s) => s.spaceId === nodeId)?.children ?? [];

  if (local.length > 0) {
    const out: SpaceChildRef[] = [];
    const seen = new Set<string>();
    for (const child of local) {
      const roomId = child.roomId;
      if (!roomId || roomId === nodeId || seen.has(roomId)) continue;
      seen.add(roomId);
      out.push({
        roomId,
        via: child.via,
        suggested: child.suggested,
        order: child.order ?? undefined,
        ts: child.timestamp,
      });
    }
    return out.sort(compareSpaceChildren);
  }

  const out: SpaceChildRef[] = [];
  for (const summary of serverMap?.values() ?? []) {
    const roomId = summary.room_id;
    if (roomId === nodeId) continue;
    const via = summary.via ?? [];
    if (via.length === 0) continue;
    out.push({ roomId, via, suggested: summary.suggested === true, ts: 0 });
  }
  return out;
}

/** One level of the space's hierarchy, the space itself included; partial if a page failed */
export async function fetchSpaceHierarchyLevel(
  spaceId: string,
  client: WizardClient
): Promise<Map<string, RoomSummary>> {
  const { space, children, complete } = await client.spaceHierarchy(spaceId);
  if (!complete) console.warn('[space-hierarchy] response truncated', spaceId);
  return new Map(
    [...(space ? [space] : []), ...children].map((c) => [c.id, summaryFromSpaceChild(c)])
  );
}

const HIERARCHY_STALE_MS = 60_000;
const HIERARCHY_GC_MS = 300_000;
const EMPTY_MAP: Map<string, RoomSummary> = new Map();

export const spaceHierarchyQueryKey = (spaceId: string | null) => ['spaceChildren', spaceId];

const PERSIST_KEY = 'wz_space_children';
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

export function findCachedSummary(
  queryClient: QueryClient,
  roomId: string
): RoomSummary | undefined {
  for (const [, map] of queryClient.getQueriesData<Map<string, RoomSummary>>({
    queryKey: ['spaceChildren'],
  })) {
    const found = map?.get(roomId);
    if (found) return found;
  }
  return undefined;
}

async function fetchAndPersist(
  client: WizardClient,
  spaceId: string
): Promise<Map<string, RoomSummary>> {
  const map = await fetchSpaceHierarchyLevel(spaceId, client);
  persist(spaceId, map);
  return map;
}

export function loadSpaceHierarchy(
  queryClient: QueryClient,
  client: WizardClient,
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
  client: WizardClient,
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
  const graph = useSpaceGraph();

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

  const invalidate = useThrottle(() => {
    if (!spaceId) return;
    void queryClient.invalidateQueries({ queryKey: spaceHierarchyQueryKey(spaceId) });
  }, 500);

  const childrenKey = useMemo(() => {
    const node = graph.find((s) => s.spaceId === spaceId);
    return node
      ? node.children.map((c) => `${c.roomId}:${c.suggested}:${c.order ?? ''}`).join('|')
      : null;
  }, [graph, spaceId]);
  const lastChildren = useRef<{ spaceId: string | null; key: string | null } | null>(null);
  useEffect(() => {
    const before = lastChildren.current;
    lastChildren.current = { spaceId, key: childrenKey };
    if (!before || before.spaceId !== spaceId || before.key === childrenKey) return;
    invalidate();
  }, [spaceId, childrenKey, invalidate]);

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

export interface JoinedSpaceInfo {
  name: string | null;
  avatarUrl: string | null;
  topic: string | null;
  memberCount: number;
}

/** Name, picture, topic and members of joined spaces (subspaces too), live */
export function useJoinedSpaceInfo(spaceIds: string[]): Map<string, JoinedSpaceInfo> {
  const spaces = useAllJoinedSpaces();
  const key = [...new Set(spaceIds)].sort().join('|');
  return useMemo(() => {
    const wanted = new Set(key.split('|'));
    const map = new Map<string, JoinedSpaceInfo>();
    for (const s of spaces) {
      if (!wanted.has(s.id)) continue;
      map.set(s.id, {
        name: s.name || null,
        avatarUrl: s.avatarUrl,
        topic: s.topic,
        memberCount: s.memberCount,
      });
    }
    return map;
  }, [spaces, key]);
}
