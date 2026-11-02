import { useMemo } from 'react';
import { getDefaultStore } from 'jotai';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { RoomSummary as CoreRoomSummary, SpaceNode, WizardClient } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import {
  childrenOf,
  knockedRoomIdsAtom,
  roomsByIdAtom,
  spaceGraphAtom,
  useAllRooms,
  useKnockedRoomIds,
  useRoomDetails,
  useSpaceGraph,
} from '@/app/data';
import {
  fetchSpaceHierarchyLevel,
  findCachedSummary,
  resolveSpaceChildren,
  spaceHierarchyQueryKey,
  summaryIsSpace,
  useJoinedSpaceInfo,
  useSpaceHierarchyMap,
  type JoinedSpaceInfo,
  type RoomSummary,
} from '@/app/features/space/spaceHierarchy';

export interface SpaceRoomEntry {
  room: CoreRoomSummary | null;
  roomId: string;
  name: string;
  avatarMxc: string | null;
  topic: string | null;
  memberCount: number;
  isJoined: boolean;
  isKnocking: boolean;
  joinRule?: string;
  viaServers: string[];
  isSuggested?: boolean;
}

export interface SpaceSection {
  spaceId: string | null;
  spaceName: string;
  spaceAvatarMxc: string | null;
  categoryKey: string;
  isJoined: boolean;
  isSuggested?: boolean;
  viaServers: string[];
  memberCount?: number;
  rooms: SpaceRoomEntry[];
  roomsLoaded: boolean;
}

interface LocalState {
  roomsById: Map<string, CoreRoomSummary>;
  knocked: ReadonlySet<string>;
  graph: SpaceNode[];
  spaceInfo?: Map<string, JoinedSpaceInfo>;
}

const isJoinedSpace = (graph: SpaceNode[], id: string) => graph.some((s) => s.spaceId === id);

function buildRoomEntryFromSummary(
  childId: string,
  viaServers: string[],
  summaryMap: Map<string, RoomSummary>,
  local: LocalState,
  unknownLabel: string,
  isSuggested?: boolean
): SpaceRoomEntry | null {
  const room = local.roomsById.get(childId);

  if (room && !room.isInvite) {
    if (room.isTombstoned) return null;
    return {
      room,
      roomId: childId,
      name: room.name ?? unknownLabel,
      avatarMxc: room.avatarUrl ?? null,
      topic: room.topic,
      memberCount: room.memberCount,
      isJoined: true,
      isKnocking: false,
      viaServers,
      isSuggested,
    };
  }

  if (local.knocked.has(childId)) {
    const summary = summaryMap.get(childId);
    return {
      room: null,
      roomId: childId,
      name: summary?.name ?? unknownLabel,
      avatarMxc: summary?.avatar_url ?? null,
      topic: null,
      memberCount: 0,
      isJoined: false,
      isKnocking: true,
      viaServers,
      isSuggested: isSuggested ?? summary?.suggested,
    };
  }

  const summary = summaryMap.get(childId);
  if (!summary) return null;

  const joinRule = summary.join_rule;
  if (
    joinRule !== 'public' &&
    joinRule !== 'knock' &&
    joinRule !== 'restricted' &&
    joinRule !== 'knock_restricted'
  ) {
    return null;
  }

  return {
    room: room ?? null,
    roomId: childId,
    name: summary.name ?? room?.name ?? unknownLabel,
    avatarMxc: summary.avatar_url ?? room?.avatarUrl ?? null,
    topic: summary.topic ?? null,
    memberCount: summary.num_joined_members,
    isJoined: false,
    isKnocking: false,
    joinRule,
    viaServers,
    isSuggested: isSuggested ?? summary.suggested,
  };
}

function splitLevel(
  parentId: string,
  summaryMap: Map<string, RoomSummary>,
  local: LocalState,
  unknownLabel: string
): { rooms: SpaceRoomEntry[]; subSpaces: SpaceSection[] } {
  const rooms: SpaceRoomEntry[] = [];
  const subSpaces: SpaceSection[] = [];

  for (const { roomId: childId, via, suggested } of resolveSpaceChildren(
    parentId,
    local.graph,
    summaryMap
  )) {
    const summ = summaryMap.get(childId);
    const joined = isJoinedSpace(local.graph, childId);
    const isSubSpace = joined || (summ != null ? summaryIsSpace(summ) : false);

    if (isSubSpace) {
      const info = local.spaceInfo?.get(childId);
      subSpaces.push({
        spaceId: childId,
        spaceName: info?.name ?? summ?.name ?? unknownLabel,
        spaceAvatarMxc: info?.avatarUrl ?? summ?.avatar_url ?? null,
        categoryKey: `${parentId}::${childId}`,
        isJoined: joined,
        isSuggested: suggested || summ?.suggested,
        viaServers: via.length > 0 ? via : (summ?.via ?? []),
        memberCount: summ?.num_joined_members ?? info?.memberCount ?? 0,
        rooms: [],
        roomsLoaded: false,
      });
      continue;
    }

    const entry = buildRoomEntryFromSummary(
      childId,
      via.length > 0 ? via : (summ?.via ?? []),
      summaryMap,
      local,
      unknownLabel,
      suggested || summ?.suggested
    );
    if (entry) rooms.push(entry);
  }

  return { rooms, subSpaces };
}

export function splitHierarchyLevel(
  parentId: string,
  summaryMap: Map<string, RoomSummary>,
  _client: WizardClient,
  unknownLabel: string
): { rooms: SpaceRoomEntry[]; subSpaces: SpaceSection[] } {
  const store = getDefaultStore();
  return splitLevel(
    parentId,
    summaryMap,
    {
      roomsById: store.get(roomsByIdAtom),
      knocked: store.get(knockedRoomIdsAtom),
      graph: store.get(spaceGraphAtom),
    },
    unknownLabel
  );
}

export function useSpaceRoomsGrouped(spaceId: string, unknownLabel = 'Unknown') {
  const client = getMatrixClientOrNull();
  const queryClient = useQueryClient();
  const allRooms = useAllRooms();
  const knocked = useKnockedRoomIds();
  const graph = useSpaceGraph();
  const { map: rootSummary, isLoading, error } = useSpaceHierarchyMap(spaceId);

  const isJoined = isJoinedSpace(graph, spaceId);
  const details = useRoomDetails(isJoined ? spaceId : null);

  const childSpaceIds = useMemo(
    () => [
      ...new Set(
        [...rootSummary.values()]
          .filter((r) => summaryIsSpace(r) && r.room_id !== spaceId)
          .map((r) => r.room_id)
          .concat(
            childrenOf(graph, spaceId)
              .filter((c) => isJoinedSpace(graph, c.roomId))
              .map((c) => c.roomId)
          )
      ),
    ],
    [rootSummary, graph, spaceId]
  );
  const spaceInfo = useJoinedSpaceInfo(childSpaceIds);
  const subMaps = useQueries({
    queries: childSpaceIds.map((id) => ({
      queryKey: spaceHierarchyQueryKey(id),
      queryFn: () => fetchSpaceHierarchyLevel(id, client!),
      enabled: false,
    })),
  });
  const subMapsKey = subMaps.map((q) => q.dataUpdatedAt).join('|');

  const sections = useMemo((): SpaceSection[] => {
    void subMapsKey;
    const local: LocalState = {
      roomsById: new Map(allRooms.map((r) => [r.id, r])),
      knocked,
      graph,
      spaceInfo,
    };
    const mapOf = (id: string): Map<string, RoomSummary> | undefined =>
      id === spaceId
        ? rootSummary
        : queryClient.getQueryData<Map<string, RoomSummary>>(spaceHierarchyQueryKey(id));
    const isSpaceId = (id: string): boolean => {
      if (isJoinedSpace(graph, id)) return true;
      const summ = rootSummary.get(id);
      return summ != null && summaryIsSpace(summ);
    };

    if (!isJoined && rootSummary.size === 0) return [];

    const seenRoot = new Set<string>();
    const addedRoomIds = new Set<string>();
    const directRoomEntries: SpaceRoomEntry[] = [];
    const subSpaceSections: SpaceSection[] = [];
    const subSpaceRoomIds = new Set<string>();
    const visited = new Set<string>();
    const claimUnder = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      for (const { roomId: childId } of resolveSpaceChildren(nodeId, graph, mapOf(nodeId))) {
        if (isSpaceId(childId)) {
          claimUnder(childId);
        } else {
          subSpaceRoomIds.add(childId);
        }
      }
    };
    const rootChildRefs = resolveSpaceChildren(spaceId, graph, rootSummary);
    for (const { roomId: childId } of rootChildRefs) {
      if (isSpaceId(childId)) claimUnder(childId);
    }

    for (const { roomId: childId, via: viaServers, suggested } of rootChildRefs) {
      if (seenRoot.has(childId)) continue;
      seenRoot.add(childId);

      const isSuggested = suggested;
      const rootSumm = rootSummary.get(childId);

      if (isSpaceId(childId)) {
        const info = spaceInfo.get(childId);
        subSpaceSections.push({
          spaceId: childId,
          spaceName: info?.name ?? rootSumm?.name ?? unknownLabel,
          spaceAvatarMxc: info?.avatarUrl ?? rootSumm?.avatar_url ?? null,
          categoryKey: `${spaceId}::${childId}`,
          isJoined: isJoinedSpace(graph, childId),
          isSuggested: isSuggested || rootSumm?.suggested,
          viaServers,
          memberCount: rootSumm?.num_joined_members ?? info?.memberCount ?? 0,
          rooms: [],
          roomsLoaded: false,
        });
      } else {
        // Skip rooms that belong to a sub-space - they must not appear in the root section
        if (subSpaceRoomIds.has(childId)) continue;
        addedRoomIds.add(childId);
        const entry = buildRoomEntryFromSummary(
          childId,
          viaServers,
          rootSummary,
          local,
          unknownLabel,
          isSuggested || rootSumm?.suggested
        );
        if (entry) directRoomEntries.push(entry);
      }
    }

    const rootChildren = new Set(rootChildRefs.map((c) => c.roomId));
    const isDirectChild = (id: string): boolean =>
      rootChildren.size === 0 ? true : rootChildren.has(id);

    // Discover sub-spaces found only in the server hierarchy fetch
    for (const [summId, summ] of rootSummary) {
      if (seenRoot.has(summId) || summId === spaceId) continue;
      if (!summaryIsSpace(summ)) continue;
      const info = spaceInfo.get(summId);
      subSpaceSections.push({
        spaceId: summId,
        spaceName: info?.name ?? summ.name ?? unknownLabel,
        spaceAvatarMxc: info?.avatarUrl ?? summ.avatar_url ?? null,
        categoryKey: `${spaceId}::${summId}`,
        isJoined: isJoinedSpace(graph, summId),
        isSuggested: summ.suggested,
        viaServers: summ.via ?? [],
        memberCount: summ.num_joined_members ?? 0,
        rooms: [],
        roomsLoaded: false,
      });
    }

    for (const [summId, summ] of rootSummary) {
      if (summId === spaceId) continue;
      if (!isDirectChild(summId)) continue;
      if (summaryIsSpace(summ)) continue;
      if (subSpaceRoomIds.has(summId)) continue;
      if (addedRoomIds.has(summId)) continue;
      if (local.roomsById.has(summId)) continue;
      const entry = buildRoomEntryFromSummary(
        summId,
        summ.via ?? [],
        rootSummary,
        local,
        unknownLabel,
        summ.suggested
      );
      if (entry) directRoomEntries.push(entry);
    }

    const cachedRoot = findCachedSummary(queryClient, spaceId);
    return [
      {
        spaceId: null,
        spaceName: details?.name ?? cachedRoot?.name ?? spaceId,
        spaceAvatarMxc: details?.avatarUrl ?? cachedRoot?.avatar_url ?? null,
        categoryKey: `${spaceId}::root`,
        isJoined,
        viaServers: [],
        memberCount: cachedRoot?.num_joined_members ?? details?.memberCount ?? 0,
        rooms: directRoomEntries,
        roomsLoaded: true,
      },
      ...subSpaceSections,
    ];
  }, [
    allRooms,
    knocked,
    graph,
    spaceInfo,
    rootSummary,
    subMapsKey,
    queryClient,
    spaceId,
    isJoined,
    details,
    unknownLabel,
  ]);

  const spaceSummary = useMemo((): RoomSummary | undefined => {
    const cached = findCachedSummary(queryClient, spaceId);
    if (details) {
      return {
        ...cached,
        room_id: spaceId,
        name: details.name ?? cached?.name,
        avatar_url: details.avatarUrl ?? cached?.avatar_url,
        topic: details.topic ?? cached?.topic,
        canonical_alias: details.canonicalAlias ?? cached?.canonical_alias,
        num_joined_members: details.memberCount,
        room_type: 'm.space',
      };
    }
    if (cached) return cached;
    if (!isLoading && !error && rootSummary.size > 0) {
      return { room_id: spaceId, num_joined_members: 0, room_type: 'm.space' };
    }
    return undefined;
  }, [queryClient, spaceId, details, isLoading, error, rootSummary]);

  return {
    sections,
    isLoading,
    error,
    spaceSummary,
  };
}
