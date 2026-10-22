import { useCallback, useEffect } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import {
  currentRoomIdAtom,
  currentSpaceIdAtom,
  favouriteRoomsAtom,
  lastRoomByContextAtom,
  sidebarViewAtom,
} from '@/app/store/atoms';
import type { SidebarView } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { isDmRoom, roomState, getSpaceChildEvents } from '@/util/matrix';

const OVERVIEW = 'overview';

export interface ContextNavState {
  sidebarView: SidebarView;
  currentSpaceId: string | null;
  keepDrawer?: boolean;
}

function contextKey(view: SidebarView, spaceId: string | null): string | null {
  if (view === 'space') return spaceId;
  return view;
}

function isTombstoned(room: Room): boolean {
  return !!roomState(room).getStateEvents('m.room.tombstone', '');
}

function childIds(space: Room): string[] {
  return getSpaceChildEvents(space)
    .map((e) => e.getStateKey())
    .filter((id): id is string => !!id && id !== space.roomId);
}

function joinedSpace(client: MatrixClient, id: string): Room | null {
  const room = client.getRoom(id);
  return room?.isSpaceRoom() && room.getMyMembership() === 'join' ? room : null;
}

function spaceRooms(client: MatrixClient, spaceId: string): Room[][] {
  const levels: Room[][] = [];
  const visited = new Set<string>([spaceId]);
  let queue = [spaceId];
  while (queue.length > 0) {
    const level: Room[] = [];
    const next: string[] = [];
    for (const id of queue) {
      const space = joinedSpace(client, id);
      if (!space) continue;
      for (const childId of childIds(space)) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        const child = client.getRoom(childId);
        if (!child || child.getMyMembership() !== 'join') continue;
        if (child.isSpaceRoom()) next.push(childId);
        else if (!isDmRoom(child, client) && !isTombstoned(child)) level.push(child);
      }
    }
    if (level.length > 0) levels.push(level);
    queue = next;
  }
  return levels;
}

function isInAnySpace(client: MatrixClient, roomId: string): boolean {
  return client
    .getRooms()
    .some((r) => r.isSpaceRoom() && r.getMyMembership() === 'join' && childIds(r).includes(roomId));
}

function isRememberable(client: MatrixClient, key: string, roomId: string): boolean {
  const room = client.getRoom(roomId);
  if (!room || room.getMyMembership() !== 'join' || isTombstoned(room) || room.isSpaceRoom()) {
    return false;
  }
  if (key === 'dms') return isDmRoom(room, client);
  if (isDmRoom(room, client)) return false;
  if (key === 'home') return !isInAnySpace(client, roomId);
  return spaceRooms(client, key).some((level) => level.some((r) => r.roomId === roomId));
}

function firstInListOrder(rooms: Room[], favourites: ReadonlySet<string>): Room | undefined {
  return [...rooms].sort((a, b) => {
    const fav = Number(favourites.has(b.roomId)) - Number(favourites.has(a.roomId));
    return fav || a.name.localeCompare(b.name);
  })[0];
}

function roomPath(client: MatrixClient, roomId: string): string {
  const room = client.getRoom(roomId);
  const isDm = !!room && isDmRoom(room, client);
  return `/${isDm ? 'dm' : 'r'}/${encodeURIComponent(roomId)}`;
}

function resolveTarget(
  client: MatrixClient,
  view: SidebarView,
  spaceId: string | null,
  lastRooms: Record<string, string>,
  favourites: ReadonlySet<string>
): string {
  const key = contextKey(view, spaceId);
  const remembered = key ? lastRooms[key] : undefined;

  if (view === 'space' && spaceId) {
    if (remembered === OVERVIEW) return `/space/${encodeURIComponent(spaceId)}`;
    if (remembered && isRememberable(client, spaceId, remembered)) {
      return roomPath(client, remembered);
    }
    // Top-level rooms before sub-space rooms
    for (const level of spaceRooms(client, spaceId)) {
      const first = firstInListOrder(level, favourites);
      if (first) return roomPath(client, first.roomId);
    }
    return `/space/${encodeURIComponent(spaceId)}`;
  }

  if (remembered && key && isRememberable(client, key, remembered)) {
    return roomPath(client, remembered);
  }

  if (view === 'home') {
    const homeRooms = client.getRooms().filter((r) => isRememberable(client, 'home', r.roomId));
    const first = firstInListOrder(homeRooms, favourites);
    if (first) return roomPath(client, first.roomId);
  }

  if (view === 'dms') {
    const latest = client
      .getRooms()
      .filter((r) => isRememberable(client, 'dms', r.roomId))
      .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp())[0];
    if (latest) return roomPath(client, latest.roomId);
  }

  return '/';
}

export function useRecordLastRoom() {
  const client = getMatrixClientOrNull();
  const location = useLocation();
  const sidebarView = useAtomValue(sidebarViewAtom);
  const currentSpaceId = useAtomValue(currentSpaceIdAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const setLastRooms = useSetAtom(lastRoomByContextAtom);

  useEffect(() => {
    if (!client) return;
    const key = contextKey(sidebarView, currentSpaceId);
    if (!key) return;

    let value: string | null = null;
    const overviewMatch = location.pathname.match(/^\/space\/(.+)/);
    if (overviewMatch) {
      if (decodeURIComponent(overviewMatch[1]) === key) value = OVERVIEW;
    } else if (currentRoomId && isRememberable(client, key, currentRoomId)) {
      value = currentRoomId;
    }
    if (!value) return;

    const stored = value;
    setLastRooms((prev) => (prev[key] === stored ? prev : { ...prev, [key]: stored }));
  }, [client, location.pathname, sidebarView, currentSpaceId, currentRoomId, setLastRooms]);
}

export function useSwitchContext() {
  const navigate = useNavigate();
  const store = useStore();

  return useCallback(
    (view: SidebarView, spaceId: string | null) => {
      const client = getMatrixClientOrNull();
      const state: ContextNavState = {
        sidebarView: view,
        currentSpaceId: spaceId,
        keepDrawer: true,
      };
      if (!client) {
        navigate('/', { state });
        return;
      }
      const target = resolveTarget(
        client,
        view,
        spaceId,
        store.get(lastRoomByContextAtom),
        store.get(favouriteRoomsAtom)
      );
      navigate(target, { state });
    },
    [navigate, store]
  );
}
