import { useState, useMemo, useCallback } from 'react';
import { HOME_ORDER_EVENT, SPACE_ORDER_EVENT, getHomeOrder, sortByHomeOrder } from './roomOrder';
import { useAtomValue } from 'jotai';
import { pinnedSubSpacesAtom } from '@/app/store/atoms/rooms';
import { elementCallRoomIdAtom } from '@/app/store/atoms/elementCall';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { useSyncReady } from '@/app/hooks/useSync';
import { useThrottle } from '@/app/hooks/useThrottle';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import {
  formatUserId,
  isSpace,
  isDmRoom,
  isVoiceRoom,
  roomState,
  getSpaceChildEvents,
} from '@/util/matrix';
import { getRoomUnreadCount, roomHasUnreadMention } from '@/util/mentions';

export interface RoomEntry {
  room: Room;
  roomId: string;
  name: string;
  avatarMxc: string | null;
  unreadCount: number;
  hasNotif: boolean;
  inviterUserId: string | null;
  inviterDisplayName: string | null;
  hasVoiceRoom: boolean;
}

export function buildRoomEntry(room: Room, client: MatrixClient): RoomEntry {
  const hasVoiceRoom = isVoiceRoom(room);
  const isInvite = room.getMyMembership() === 'invite';

  let inviterUserId: string | null = null;
  let inviterDisplayName: string | null = null;
  if (isInvite) {
    const myId = client.getUserId() ?? '';
    const memberEvent = roomState(room).getStateEvents('m.room.member', myId);
    const ev = Array.isArray(memberEvent) ? memberEvent[0] : memberEvent;
    if (ev) {
      const senderId = ev.getSender() ?? null;
      inviterUserId = senderId;
      if (senderId) {
        const inviterUser = client.getUser(senderId);
        inviterDisplayName = inviterUser?.displayName ?? formatUserId(senderId) ?? null;
      }
    }
  }

  return {
    room,
    roomId: room.roomId,
    name: room.name ?? room.roomId,
    avatarMxc: room.getMxcAvatarUrl?.() ?? null,
    unreadCount: getRoomUnreadCount(client, room),
    hasNotif: roomHasUnreadMention(client, room),
    inviterUserId,
    inviterDisplayName,
    hasVoiceRoom,
  };
}

export function useRooms() {
  const client = getMatrixClientOrNull();
  const loading = !useSyncReady();

  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((n) => n + 1), []);
  const throttledBump = useThrottle(bump, 200);

  const rooms = useMemo((): RoomEntry[] => {
    if (!client) return [];
    const rooms = client.getRooms();

    const entries = rooms
      .filter((room) => {
        const membership = room.getMyMembership();
        if (membership !== 'join') return false;
        if (isSpace(room)) return false;
        if (roomState(room).getStateEvents('m.room.tombstone', '')) return false;
        if (isDmRoom(room, client)) return false;

        // Home: rooms not in any space.
        const allSpaces = rooms.filter(isSpace);
        return !allSpaces.some((sp) =>
          getSpaceChildEvents(sp).some((e) => e.getStateKey() === room.roomId)
        );
      })
      .map((room) => buildRoomEntry(room, client));
    return sortByHomeOrder(
      entries,
      getHomeOrder(client),
      (e) => e.roomId,
      (e) => e.name
    );
  }, [client, revision]);

  const handleStateEvent = useCallback(
    (_event: MatrixEvent) => {
      bump();
    },
    [bump]
  );

  const handleTimelineEvent = useCallback(
    (_event: MatrixEvent) => {
      throttledBump();
    },
    [throttledBump]
  );

  useMatrixEvent(client, 'Room', bump);
  useMatrixEvent(client, 'accountData', (event: MatrixEvent) => {
    if (event.getType() === HOME_ORDER_EVENT) bump();
  });
  useMatrixEvent(client, 'Room.timeline', handleTimelineEvent);
  useMatrixEvent(client, 'Room.myMembership', bump);
  useMatrixEvent(client, 'RoomState.events', handleStateEvent);
  useMatrixEvent(client, 'Room.receipt', throttledBump);
  useMatrixEvent(client, 'Room.UnreadNotifications', throttledBump);
  useMatrixEvent(client, 'Event.decrypted', throttledBump);
  useMatrixEvent(client, 'sync', bump);

  return { rooms, loading };
}

export interface SpaceEntry {
  room: Room;
  roomId: string;
  name: string;
  avatarMxc: string | null;
  unreadCount: number;
  hasNotif: boolean;
  hasMention: boolean;
  hasCall: boolean;
}

export interface SpacesData {
  spaces: SpaceEntry[];
  homeHasNotif: boolean;
  homeHasMention: boolean;
  dmsHasNotif: boolean;
  dmsHasMention: boolean;
  homeHasCall: boolean;
  dmsHasCall: boolean;
}

export function useSpaces() {
  const client = getMatrixClientOrNull();
  const pinnedSubSpacesArr = useAtomValue(pinnedSubSpacesAtom);
  const callRoomId = useAtomValue(elementCallRoomIdAtom);

  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((n) => n + 1), []);
  const throttledBump = useThrottle(bump, 200);

  const data = useMemo((): SpacesData => {
    const pinnedSubSpaces = new Set(pinnedSubSpacesArr);
    if (!client) {
      return {
        spaces: [],
        homeHasNotif: false,
        homeHasMention: false,
        dmsHasNotif: false,
        dmsHasMention: false,
        homeHasCall: false,
        dmsHasCall: false,
      };
    }
    const allRooms = client.getRooms();

    const spaceRooms = allRooms.filter((r) => r.isSpaceRoom() && r.getMyMembership() === 'join');

    const childSpaceIds = new Set<string>();
    for (const sp of spaceRooms) {
      for (const ev of getSpaceChildEvents(sp)) {
        const childId = ev.getStateKey();
        if (!childId) continue;
        const childRoom = client.getRoom(childId);
        if (childRoom?.isSpaceRoom()) childSpaceIds.add(childId);
      }
    }

    const aggregateUnread = (
      spaceId: string,
      visited = new Set<string>()
    ): { unreadCount: number; hasNotif: boolean; hasMention: boolean; hasCall: boolean } => {
      if (visited.has(spaceId))
        return { unreadCount: 0, hasNotif: false, hasMention: false, hasCall: false };
      visited.add(spaceId);
      const space = client.getRoom(spaceId);
      if (!space) return { unreadCount: 0, hasNotif: false, hasMention: false, hasCall: false };
      const childEvents = getSpaceChildEvents(space);
      let unreadCount = 0;
      let hasNotif = false;
      let hasMention = false;
      let hasCall = false;
      for (const ev of childEvents) {
        const childId = ev.getStateKey();
        if (!childId) continue;
        const child = client.getRoom(childId);
        if (!child) continue;
        if (child.getMyMembership() !== 'join') continue;
        if (child.isSpaceRoom()) {
          const sub = aggregateUnread(childId, visited);
          unreadCount += sub.unreadCount;
          if (sub.hasNotif) hasNotif = true;
          if (sub.hasMention) hasMention = true;
          if (sub.hasCall) hasCall = true;
        } else {
          if (isDmRoom(child, client)) continue;
          if (roomState(child).getStateEvents('m.room.tombstone', '')) continue;
          if (childId === callRoomId) hasCall = true;
          const childUnread = getRoomUnreadCount(client, child);
          unreadCount += childUnread;
          if (childUnread > 0) hasNotif = true;
          if (roomHasUnreadMention(client, child)) hasMention = true;
        }
      }
      return { unreadCount, hasNotif: hasNotif || hasMention, hasMention, hasCall };
    };

    const spaces: SpaceEntry[] = spaceRooms
      .filter((space) => !childSpaceIds.has(space.roomId) || pinnedSubSpaces.has(space.roomId))
      .map((space) => {
        const { unreadCount, hasNotif, hasMention, hasCall } = aggregateUnread(space.roomId);
        return {
          room: space,
          roomId: space.roomId,
          name: space.name ?? space.roomId,
          avatarMxc: space.getMxcAvatarUrl?.() ?? null,
          unreadCount,
          hasNotif,
          hasMention,
          hasCall,
        };
      });

    const isTombstoned = (room: Room) => !!roomState(room).getStateEvents('m.room.tombstone', '');

    // Home: rooms not in any space, not DMs
    const homeRooms = allRooms.filter((room) => {
      const membership = room.getMyMembership();
      if (membership !== 'join') return false;
      if (room.isSpaceRoom() || isDmRoom(room, client)) return false;
      if (isTombstoned(room)) return false;
      return !spaceRooms.some((sp) =>
        getSpaceChildEvents(sp).some((e) => e.getStateKey() === room.roomId)
      );
    });
    const homeHasMention = homeRooms.some((r) => roomHasUnreadMention(client, r));
    const homeHasNotif = homeHasMention || homeRooms.some((r) => getRoomUnreadCount(client, r) > 0);
    const homeHasCall = homeRooms.some((r) => r.roomId === callRoomId);

    // DMs
    const dmRooms = allRooms.filter(
      (room) =>
        room.getMyMembership() === 'join' &&
        !room.isSpaceRoom() &&
        isDmRoom(room, client) &&
        !isTombstoned(room)
    );
    const dmsHasMention = dmRooms.some((r) => roomHasUnreadMention(client, r));
    const dmsHasNotif = dmsHasMention || dmRooms.some((r) => getRoomUnreadCount(client, r) > 0);
    const dmsHasCall = dmRooms.some((r) => r.roomId === callRoomId);

    return {
      spaces,
      homeHasNotif,
      homeHasMention,
      dmsHasNotif,
      dmsHasMention,
      homeHasCall,
      dmsHasCall,
    };
  }, [client, pinnedSubSpacesArr, callRoomId, revision]);

  useMatrixEvent(client, 'Room', bump);
  useMatrixEvent(client, 'Room.accountData', (event: MatrixEvent) => {
    if (event.getType() === SPACE_ORDER_EVENT) bump();
  });
  useMatrixEvent(client, 'Room.myMembership', bump);
  useMatrixEvent(client, 'RoomState.events', bump);
  useMatrixEvent(client, 'Room.receipt', throttledBump);
  useMatrixEvent(client, 'Room.UnreadNotifications', throttledBump);
  useMatrixEvent(client, 'Event.decrypted', throttledBump);
  useMatrixEvent(client, 'sync', bump);

  return data;
}
