import { useMemo, useCallback, useState } from 'react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { useThrottle } from '@/app/hooks/useThrottle';
import { isDmRoom, roomState, getSpaceChildEvents } from '@/util/matrix';
import { getRoomUnreadCount, roomHasUnreadMention } from '@/util/mentions';
import { buildRoomEntry, type RoomEntry } from './useRooms';
import { resolveSpaceChildren, useSpaceHierarchyMap } from '@/app/features/space/spaceHierarchy';

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
  client: NonNullable<ReturnType<typeof getMatrixClientOrNull>>,
  exclude: ReadonlySet<string>,
  visited = new Set<string>()
): { hasNotif: boolean; hasMention: boolean } {
  if (visited.has(spaceId)) return { hasNotif: false, hasMention: false };
  visited.add(spaceId);
  const space = client.getRoom(spaceId);
  if (!space) return { hasNotif: false, hasMention: false };

  let hasNotif = false;
  let hasMention = false;

  for (const ev of getSpaceChildEvents(space)) {
    const childId = ev.getStateKey();
    if (!childId) continue;
    const child = client.getRoom(childId);
    if (!child) continue;
    if (child.getMyMembership() !== 'join') continue;

    // Descend into local sub-spaces too, so nested sections aggregate unread.
    if (child.isSpaceRoom()) {
      const sub = spaceUnreadState(childId, client, exclude, visited);
      if (sub.hasNotif) hasNotif = true;
      if (sub.hasMention) hasMention = true;
    } else {
      // Favourited rooms are rendered in their own section, so their unread
      // must not also light up the ancestor space header.
      if (exclude.has(childId)) continue;
      if (isDmRoom(child, client)) continue;
      if (roomState(child).getStateEvents('m.room.tombstone', '')) continue;
      if (getRoomUnreadCount(client, child) > 0) hasNotif = true;
      if (roomHasUnreadMention(client, child)) hasMention = true;
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
  exclude: ReadonlySet<string> = EMPTY_FAVOURITES
): HierarchyItem[] {
  const client = getMatrixClientOrNull();
  const { map: serverMap } = useSpaceHierarchyMap(spaceId);

  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((n) => n + 1), []);
  const throttledBump = useThrottle(bump, 200);

  const items = useMemo((): HierarchyItem[] => {
    void revision;
    if (!client || !spaceId) return [];

    const isSpace = (id: string): boolean => {
      const summ = serverMap.get(id);
      if (summ?.room_type === 'm.space') return true;
      return client.getRoom(id)?.isSpaceRoom() === true;
    };

    const childIds = (nodeId: string): string[] =>
      resolveSpaceChildren(nodeId, client, serverMap).map((c) => c.roomId);

    const makeRoom = (
      roomId: string,
      parentSpaceId: string,
      catKey: string,
      depth: number
    ): HierarchyRoomItem => {
      const room = client.getRoom(roomId)!;
      return {
        kind: 'room',
        roomId,
        parentSpaceId,
        categoryKey: catKey,
        entry: buildRoomEntry(room, client),
        depth,
      };
    };

    const buildTree = (
      nodeId: string,
      depth: number,
      catPrefix: string,
      ancestorsJoined: boolean
    ): BuiltSubtree => {
      const children = childIds(nodeId);
      const nodeLocal = client.getRoom(nodeId);
      const activeChain = ancestorsJoined && nodeLocal?.getMyMembership() === 'join';

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
        const local = client.getRoom(id);
        const hasContent = sub.rooms.length > 0 || sub.spaces.length > 0;
        if (!(sub.activeChain && hasContent)) continue;
        const summ = serverMap.get(id);
        const unread = spaceUnreadState(id, client, exclude);
        spaces.push({
          header: {
            kind: 'space',
            roomId: id,
            categoryKey: catKey,
            name: local?.name ?? summ?.name ?? id,
            avatarMxc: local?.getMxcAvatarUrl?.() ?? summ?.avatar_url ?? null,
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
        const local = client.getRoom(childId);
        if (!local) continue;
        const membership = local.getMyMembership();
        if (membership !== 'join') continue;
        if (roomState(local).getStateEvents('m.room.tombstone', '')) continue;
        if (isDmRoom(local, client)) continue;
        if (!activeChain) continue;
        claimed.add(childId);
        rooms.push(makeRoom(childId, nodeId, catPrefix, depth + 1));
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

    if (tree.rooms.length > 0) {
      const rootUnread = spaceUnreadState(spaceId, client, exclude);
      result.push({
        kind: 'space',
        roomId: spaceId,
        categoryKey: rootCategoryKey,
        name: client.getRoom(spaceId)?.name ?? spaceId,
        avatarMxc: client.getRoom(spaceId)?.getMxcAvatarUrl?.() ?? null,
        hasNotif: rootUnread.hasNotif,
        hasMention: rootUnread.hasMention,
        isRoot: true,
        depth: 0,
      });
      for (const room of tree.rooms) result.push(room);
    }

    emitSpaces(tree.spaces);

    return result;
  }, [client, spaceId, exclude, serverMap, revision]);

  const handleStateEvent = useCallback(
    (_event: { getType?: () => string }) => {
      bump();
    },
    [bump]
  );

  const handleTimelineEvent = useCallback(
    (_event: { getType?: () => string }) => {
      throttledBump();
    },
    [throttledBump]
  );

  useMatrixEvent(client, 'Room', bump);
  useMatrixEvent(client, 'Room.timeline', handleTimelineEvent);
  useMatrixEvent(client, 'Room.myMembership', bump);
  useMatrixEvent(client, 'RoomState.events', handleStateEvent);
  useMatrixEvent(client, 'Room.receipt', throttledBump);
  useMatrixEvent(client, 'Room.UnreadNotifications', throttledBump);
  useMatrixEvent(client, 'Event.decrypted', throttledBump);
  useMatrixEvent(client, 'sync', bump);

  return items;
}
