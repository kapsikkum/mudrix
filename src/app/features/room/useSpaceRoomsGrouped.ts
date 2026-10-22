import { useState, useCallback, useEffect, useRef } from 'react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { roomState } from '@/util/matrix';
import { type Room } from 'matrix-js-sdk';
import {
  resolveSpaceChildren,
  summaryIsSpace,
  useSpaceHierarchyMap,
  type RoomSummary,
} from '@/app/features/space/spaceHierarchy';

export interface SpaceRoomEntry {
  room: Room | null;
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

function buildRoomEntryFromSummary(
  childId: string,
  viaServers: string[],
  summaryMap: Map<string, RoomSummary>,
  client: NonNullable<ReturnType<typeof getMatrixClientOrNull>>,
  unknownLabel: string,
  isSuggested?: boolean
): SpaceRoomEntry | null {
  const room = client.getRoom(childId);

  if (room) {
    const membership = room.getMyMembership();
    if (membership === 'leave' || membership === 'ban') return null;
    if (roomState(room).getStateEvents('m.room.tombstone', '')) return null;

    const topicEv = roomState(room).getStateEvents('m.room.topic', '');
    const topic = (topicEv?.getContent()?.topic as string | undefined) ?? null;

    if (membership === 'join') {
      return {
        room,
        roomId: childId,
        name: room.name ?? unknownLabel,
        avatarMxc: room.getMxcAvatarUrl?.() ?? null,
        topic,
        memberCount: room.getJoinedMembers().length,
        isJoined: true,
        isKnocking: false,
        viaServers,
        isSuggested,
      };
    }

    if (membership === 'knock') {
      return {
        room,
        roomId: childId,
        name: room.name ?? unknownLabel,
        avatarMxc: room.getMxcAvatarUrl?.() ?? null,
        topic: null,
        memberCount: 0,
        isJoined: false,
        isKnocking: true,
        viaServers,
        isSuggested,
      };
    }

    const ruleEv = roomState(room).getStateEvents('m.room.join_rules', '');
    const ruleContent = ruleEv?.getContent() as
      | { join_rule?: string; allow?: { room_id: string; type: string }[] }
      | undefined;
    const joinRule = ruleContent?.join_rule;

    if (joinRule === 'public' || joinRule === 'knock') {
      return {
        room,
        roomId: childId,
        name: room.name ?? unknownLabel,
        avatarMxc: room.getMxcAvatarUrl?.() ?? null,
        topic,
        memberCount: 0,
        isJoined: false,
        isKnocking: false,
        joinRule,
        viaServers,
        isSuggested,
      };
    }

    if (joinRule === 'restricted' || joinRule === 'knock_restricted') {
      const allowed = ruleContent?.allow ?? [];
      const myId = client.getUserId() ?? '';
      const accessible = allowed.some((a) => {
        if (a.type !== 'm.room_membership') return false;
        const allowRoom = client.getRoom(a.room_id);
        return allowRoom?.getMember(myId)?.membership === 'join';
      });
      if (accessible) {
        return {
          room,
          roomId: childId,
          name: room.name ?? unknownLabel,
          avatarMxc: room.getMxcAvatarUrl?.() ?? null,
          topic,
          memberCount: 0,
          isJoined: false,
          isKnocking: false,
          joinRule,
          viaServers,
          isSuggested,
        };
      }
    }

    return null;
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
    room: null,
    roomId: childId,
    name: summary.name ?? unknownLabel,
    avatarMxc: summary.avatar_url ?? null,
    topic: summary.topic ?? null,
    memberCount: summary.num_joined_members,
    isJoined: false,
    isKnocking: false,
    joinRule,
    viaServers,
    isSuggested: isSuggested ?? summary.suggested,
  };
}

export function splitHierarchyLevel(
  parentId: string,
  summaryMap: Map<string, RoomSummary>,
  client: NonNullable<ReturnType<typeof getMatrixClientOrNull>>,
  unknownLabel: string
): { rooms: SpaceRoomEntry[]; subSpaces: SpaceSection[] } {
  const rooms: SpaceRoomEntry[] = [];
  const subSpaces: SpaceSection[] = [];

  for (const { roomId: childId, via, suggested } of resolveSpaceChildren(
    parentId,
    client,
    summaryMap
  )) {
    const summ = summaryMap.get(childId);
    const localRoom = client.getRoom(childId);
    const isSubSpace =
      localRoom?.isSpaceRoom() === true || (summ != null ? summaryIsSpace(summ) : false);

    if (isSubSpace) {
      const membership = localRoom?.getMyMembership() ?? 'leave';
      subSpaces.push({
        spaceId: childId,
        spaceName: localRoom?.name ?? summ?.name ?? unknownLabel,
        spaceAvatarMxc: localRoom?.getMxcAvatarUrl?.() ?? summ?.avatar_url ?? null,
        categoryKey: `${parentId}::${childId}`,
        isJoined: membership === 'join',
        isSuggested: suggested || summ?.suggested,
        viaServers: via.length > 0 ? via : (summ?.via ?? []),
        memberCount: summ?.num_joined_members ?? localRoom?.getJoinedMemberCount?.() ?? 0,
        rooms: [],
        roomsLoaded: false,
      });
      continue;
    }

    const entry = buildRoomEntryFromSummary(
      childId,
      via.length > 0 ? via : (summ?.via ?? []),
      summaryMap,
      client,
      unknownLabel,
      suggested || summ?.suggested
    );
    if (entry) rooms.push(entry);
  }

  return { rooms, subSpaces };
}

export function useSpaceRoomsGrouped(spaceId: string, unknownLabel = 'Unknown') {
  const client = getMatrixClientOrNull();
  const { map: rootSummaryMap, isLoading, error } = useSpaceHierarchyMap(spaceId);

  const rootSummaryRef = useRef<Map<string, RoomSummary>>(rootSummaryMap);
  rootSummaryRef.current = rootSummaryMap;

  const build = useCallback((): SpaceSection[] => {
    if (!client) return [];
    const space = client.getRoom(spaceId);
    const rootSummary = rootSummaryRef.current;
    const spaceSummary = rootSummary.get(spaceId);
    if (!space && !spaceSummary) return [];

    const seenRoot = new Set<string>();
    const addedRoomIds = new Set<string>();
    const directRoomEntries: SpaceRoomEntry[] = [];
    const subSpaceSections: SpaceSection[] = [];
    const subSpaceRoomIds = new Set<string>();
    const visited = new Set<string>();
    const claimUnder = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      for (const { roomId: childId } of resolveSpaceChildren(nodeId, client, rootSummary)) {
        const childSumm = rootSummary.get(childId);
        if (childSumm && summaryIsSpace(childSumm)) {
          claimUnder(childId);
        } else {
          subSpaceRoomIds.add(childId);
        }
      }
    };
    for (const { roomId: childId } of resolveSpaceChildren(spaceId, client, rootSummary)) {
      const childSumm = rootSummary.get(childId);
      if (childSumm && summaryIsSpace(childSumm)) claimUnder(childId);
    }

    for (const { roomId: childId, via: viaServers, suggested } of resolveSpaceChildren(
      spaceId,
      client,
      rootSummary
    )) {
      if (seenRoot.has(childId)) continue;
      seenRoot.add(childId);

      const isSuggested = suggested;
      const localRoom = client.getRoom(childId);
      const rootSumm = rootSummary.get(childId);
      const isSpaceChild =
        localRoom?.isSpaceRoom() === true || (rootSumm != null ? summaryIsSpace(rootSumm) : false);

      if (isSpaceChild) {
        const membership = localRoom?.getMyMembership() ?? 'leave';
        const isJoined = membership === 'join';

        subSpaceSections.push({
          spaceId: childId,
          spaceName: localRoom?.name ?? rootSumm?.name ?? unknownLabel,
          spaceAvatarMxc: localRoom?.getMxcAvatarUrl?.() ?? rootSumm?.avatar_url ?? null,
          categoryKey: `${spaceId}::${childId}`,
          isJoined,
          isSuggested: isSuggested || rootSumm?.suggested,
          viaServers,
          memberCount: rootSumm?.num_joined_members ?? localRoom?.getJoinedMemberCount?.() ?? 0,
          rooms: [],
          roomsLoaded: false,
        });
      } else {
        // Skip rooms that belong to a sub-space — they must not appear in the root section
        if (subSpaceRoomIds.has(childId)) continue;
        addedRoomIds.add(childId);
        const entry = buildRoomEntryFromSummary(
          childId,
          viaServers,
          rootSummary,
          client,
          unknownLabel,
          isSuggested || rootSumm?.suggested
        );
        if (entry) directRoomEntries.push(entry);
      }
    }

    const rootChildren = new Set(
      resolveSpaceChildren(spaceId, client, rootSummary).map((c) => c.roomId)
    );
    const isDirectChild = (id: string): boolean =>
      rootChildren.size === 0 ? true : rootChildren.has(id);

    // Discover sub-spaces found only in the server hierarchy fetch
    for (const [summId, summ] of rootSummary) {
      if (seenRoot.has(summId) || summId === spaceId) continue;
      if (!summaryIsSpace(summ)) continue;
      const localRoom = client.getRoom(summId);
      const membership = localRoom?.getMyMembership() ?? 'leave';
      subSpaceSections.push({
        spaceId: summId,
        spaceName: localRoom?.name ?? summ.name ?? unknownLabel,
        spaceAvatarMxc: localRoom?.getMxcAvatarUrl?.() ?? summ.avatar_url ?? null,
        categoryKey: `${spaceId}::${summId}`,
        isJoined: membership === 'join',
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
      if (client.getRoom(summId)) continue;
      const entry = buildRoomEntryFromSummary(
        summId,
        summ.via ?? [],
        rootSummary,
        client,
        unknownLabel,
        summ.suggested
      );
      if (entry) directRoomEntries.push(entry);
    }

    return [
      {
        spaceId: null,
        spaceName: space?.name ?? spaceSummary?.name ?? spaceId,
        spaceAvatarMxc: space?.getMxcAvatarUrl?.() ?? spaceSummary?.avatar_url ?? null,
        categoryKey: `${spaceId}::root`,
        isJoined: space !== null,
        viaServers: [],
        memberCount:
          rootSummary.get(spaceId)?.num_joined_members ?? space?.getJoinedMemberCount?.() ?? 0,
        rooms: directRoomEntries,
        roomsLoaded: true,
      },
      ...subSpaceSections,
    ];
  }, [client, spaceId, unknownLabel]);

  const [sections, setSections] = useState<SpaceSection[]>(build);

  const buildRef = useRef(build);
  buildRef.current = build;
  const refresh = useCallback(() => setSections(buildRef.current()), []);

  useEffect(() => {
    setSections(buildRef.current());
  }, [spaceId]);

  useEffect(() => {
    if (rootSummaryMap.size > 0) {
      setSections(buildRef.current());
    }
  }, [rootSummaryMap]);

  useMatrixEvent(client, 'Room', refresh);
  useMatrixEvent(client, 'RoomState.events', refresh);
  useMatrixEvent(client, 'sync', refresh);

  return {
    sections,
    isLoading,
    error,
    spaceSummary: rootSummaryRef.current.get(spaceId),
  };
}
