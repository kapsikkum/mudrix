import { useMemo } from 'react';
import type { RoomSummary, SpaceNode } from '@wizardchat/core';
import { childrenOf, useAllRooms, useSpaceGraph } from '@/app/data';
import { isDmRoom } from '@/util/matrix';
import { getRoomUnreadCount, roomHasUnreadMention } from '@/util/mentions';
import { buildRoomEntry, type RoomEntry } from './useRooms';
import {
  resolveSpaceChildren,
  useJoinedSpaceInfo,
  useSpaceHierarchyMap,
} from '@/app/features/space/spaceHierarchy';

export interface HierarchySpaceItem {
  kind: 'space';
  roomId: string;
  categoryKey: string;
  name: string;
  avatarMxc: string | null;
  hasNotif: boolean;
  hasMention: boolean;
  isRoot: boolean;
  depth: number;
}

export interface HierarchyRoomItem {
  kind: 'room';
  roomId: string;
  parentSpaceId: string;
  categoryKey: string;
  entry: RoomEntry;
  depth: number;
}

export type HierarchyItem = HierarchySpaceItem | HierarchyRoomItem;

const EMPTY_FAVOURITES: ReadonlySet<string> = new Set<string>();

function spaceUnreadState(
  spaceId: string,
  graph: SpaceNode[],
  roomsById: Map<string, RoomSummary>,
  exclude: ReadonlySet<string>,
  visited = new Set<string>()
): { hasNotif: boolean; hasMention: boolean } {
  if (visited.has(spaceId)) return { hasNotif: false, hasMention: false };
  visited.add(spaceId);
  if (!graph.some((s) => s.spaceId === spaceId)) return { hasNotif: false, hasMention: false };

  let hasNotif = false;
  let hasMention = false;

  for (const { roomId: childId } of childrenOf(graph, spaceId)) {
    // Descend into local sub-spaces too, so nested sections aggregate unread.
    if (graph.some((s) => s.spaceId === childId)) {
      const sub = spaceUnreadState(childId, graph, roomsById, exclude, visited);
      if (sub.hasNotif) hasNotif = true;
      if (sub.hasMention) hasMention = true;
    } else {
      const child = roomsById.get(childId);
      if (!child || child.isInvite) continue;
      // Favourited rooms are rendered in their own section, so their unread
      // must not also light up the ancestor space header.
      if (exclude.has(childId)) continue;
      if (isDmRoom(child)) continue;
      if (child.isTombstoned) continue;
      if (getRoomUnreadCount(child) > 0) hasNotif = true;
      if (roomHasUnreadMention(child)) hasMention = true;
    }
    if (hasNotif && hasMention) return { hasNotif, hasMention };
  }

  return { hasNotif: hasNotif || hasMention, hasMention };
}

interface SubspaceNode {
  header: HierarchySpaceItem;
  rooms: HierarchyRoomItem[];
  spaces: SubspaceNode[];
}

interface BuiltSubtree {
  rooms: HierarchyRoomItem[];
  spaces: SubspaceNode[];
  claimed: Set<string>;
  activeChain: boolean;
}

export function useSpaceHierarchy(
  spaceId: string | null,
  exclude: ReadonlySet<string> = EMPTY_FAVOURITES,
  /** Keep categories (sub-spaces) that hold no rooms yet, so they can be filled and managed */
  includeEmpty = false
): HierarchyItem[] {
  const allRooms = useAllRooms();
  const graph = useSpaceGraph();
  const { map: serverMap } = useSpaceHierarchyMap(spaceId);

  const joinedSpaceIds = useMemo(() => graph.map((s) => s.spaceId), [graph]);
  const spaceInfo = useJoinedSpaceInfo(joinedSpaceIds);

  return useMemo((): HierarchyItem[] => {
    if (!spaceId) return [];
    const roomsById = new Map(allRooms.map((r) => [r.id, r]));
    const joinedSpaces = new Set(joinedSpaceIds);

    const isSpace = (id: string): boolean => {
      const summ = serverMap.get(id);
      if (summ?.room_type === 'm.space') return true;
      return joinedSpaces.has(id) || roomsById.get(id)?.isSpace === true;
    };

    const childIds = (nodeId: string): string[] =>
      resolveSpaceChildren(nodeId, graph, nodeId === spaceId ? serverMap : undefined).map(
        (c) => c.roomId
      );

    const makeRoom = (
      room: RoomSummary,
      parentSpaceId: string,
      catKey: string,
      depth: number
    ): HierarchyRoomItem => ({
      kind: 'room',
      roomId: room.id,
      parentSpaceId,
      categoryKey: catKey,
      entry: buildRoomEntry(room),
      depth,
    });

    const buildTree = (
      nodeId: string,
      depth: number,
      catPrefix: string,
      ancestorsJoined: boolean
    ): BuiltSubtree => {
      const children = childIds(nodeId);
      const activeChain = ancestorsJoined && joinedSpaces.has(nodeId);

      const childSubtrees: Array<{ id: string; catKey: string; sub: BuiltSubtree }> = [];
      const claimed = new Set<string>();
      for (const childId of children) {
        if (!isSpace(childId)) continue;
        const sub = buildTree(childId, depth + 1, `${catPrefix}::${childId}`, activeChain);
        for (const id of sub.claimed) claimed.add(id);
        childSubtrees.push({ id: childId, catKey: `${catPrefix}::${childId}`, sub });
      }

      const spaces: SubspaceNode[] = [];
      for (const { id, catKey, sub } of childSubtrees) {
        const local = spaceInfo.get(id);
        const hasContent = sub.rooms.length > 0 || sub.spaces.length > 0;
        if (!(sub.activeChain && (hasContent || includeEmpty))) continue;
        const summ = serverMap.get(id);
        const unread = spaceUnreadState(id, graph, roomsById, exclude);
        spaces.push({
          header: {
            kind: 'space',
            roomId: id,
            categoryKey: catKey,
            name: local?.name ?? summ?.name ?? id,
            avatarMxc: local?.avatarUrl ?? summ?.avatar_url ?? null,
            hasNotif: unread.hasNotif,
            hasMention: unread.hasMention,
            isRoot: false,
            depth: depth + 1,
          },
          rooms: sub.activeChain ? sub.rooms : [],
          spaces: sub.spaces,
        });
      }

      const rooms: HierarchyRoomItem[] = [];
      for (const childId of children) {
        if (isSpace(childId)) continue;
        if (claimed.has(childId)) continue;
        const local = roomsById.get(childId);
        if (!local) continue;
        if (local.isInvite) continue;
        if (local.isTombstoned) continue;
        if (isDmRoom(local)) continue;
        if (!activeChain) continue;
        claimed.add(childId);
        rooms.push(makeRoom(local, nodeId, catPrefix, depth + 1));
      }

      return { rooms, spaces, claimed, activeChain };
    };

    const rootCategoryKey = `${spaceId}::${spaceId}`;
    const tree = buildTree(spaceId, 0, rootCategoryKey, true);

    const result: HierarchyItem[] = [];

    const emitSpaces = (sections: SubspaceNode[]) => {
      for (const section of sections) {
        result.push(section.header);
        for (const room of section.rooms) result.push(room);
        emitSpaces(section.spaces);
      }
    };

    if (tree.rooms.length > 0 || includeEmpty) {
      const rootUnread = spaceUnreadState(spaceId, graph, roomsById, exclude);
      const root = spaceInfo.get(spaceId);
      result.push({
        kind: 'space',
        roomId: spaceId,
        categoryKey: rootCategoryKey,
        name: root?.name ?? spaceId,
        avatarMxc: root?.avatarUrl ?? null,
        hasNotif: rootUnread.hasNotif,
        hasMention: rootUnread.hasMention,
        isRoot: true,
        depth: 0,
      });
      for (const room of tree.rooms) result.push(room);
    }

    emitSpaces(tree.spaces);

    return result;
  }, [allRooms, graph, joinedSpaceIds, spaceInfo, spaceId, exclude, serverMap, includeEmpty]);
}
