import { useEffect, useMemo, useState } from 'react';
import {
  ClientEvent,
  EventType,
  RoomStateEvent,
  SyncState,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from 'matrix-js-sdk';
import { CallMembership, MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc';

// The room-wide call slot shared with Element Call / Element X
export const CALL_SLOT_DESCRIPTION = { application: 'm.call', id: 'ROOM' } as const;

export type CallMemberships = Map<string, CallMembership[]>;

function sameMemberships(a: CallMembership[] | undefined, b: CallMembership[]): boolean {
  if (a === b) return true;
  if (!a || a.length !== b.length) return false;
  return a.every((member, i) => CallMembership.equal(member, b[i]));
}

export function useCallMemberships(
  client: MatrixClient | null,
  roomIds: string[]
): CallMemberships {
  const roomIdsKey = useMemo(() => roomIds.join('|'), [roomIds]);
  const [memberships, setMemberships] = useState<CallMemberships>(new Map());

  useEffect(() => {
    if (!client) return;

    let active = true;
    const watched = new Set(roomIds);
    const rooms = roomIds.map((id) => client.getRoom(id)).filter((r): r is Room => r !== null);

    const generations = new Map<string, number>();
    const expiryTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    const scheduleExpiryRecompute = (roomId: string, members: CallMembership[]): void => {
      const existing = expiryTimeouts.get(roomId);
      if (existing) clearTimeout(existing);
      let soonest: number | undefined;
      for (const member of members) {
        const absoluteExpiry = member.getAbsoluteExpiry();
        if (absoluteExpiry === undefined) continue;
        const ms = absoluteExpiry - Date.now();
        if (soonest === undefined || ms < soonest) soonest = ms;
      }
      if (soonest === undefined) {
        expiryTimeouts.delete(roomId);
        return;
      }
      expiryTimeouts.set(
        roomId,
        setTimeout(() => recompute(roomId), Math.max(soonest, 1000))
      );
    };

    const recompute = (roomId: string): void => {
      if (!active || !watched.has(roomId)) return;
      const room = client.getRoom(roomId);
      if (!room) return;

      const generation = (generations.get(roomId) ?? 0) + 1;
      generations.set(roomId, generation);

      void MatrixRTCSession.sessionMembershipsForSlot(room, CALL_SLOT_DESCRIPTION)
        .then((members) => {
          if (!active || generations.get(roomId) !== generation) return;
          scheduleExpiryRecompute(roomId, members);
          setMemberships((prev) => {
            if (sameMemberships(prev.get(roomId), members)) return prev;
            const next = new Map(prev);
            next.set(roomId, members);
            return next;
          });
        })
        .catch(() => {});
    };

    const onStateEvent = (event: MatrixEvent): void => {
      if (event.getType() !== EventType.GroupCallMemberPrefix) return;
      const roomId = event.getRoomId();
      if (roomId) recompute(roomId);
    };

    const onMembers = (): void => {
      watched.forEach((roomId) => recompute(roomId));
    };

    const onSync = (state: SyncState): void => {
      if (
        state === SyncState.Prepared ||
        state === SyncState.Catchup ||
        state === SyncState.Syncing
      ) {
        watched.forEach((roomId) => recompute(roomId));
      }
    };

    client.on(ClientEvent.Sync, onSync);

    for (const room of rooms) {
      room.on(RoomStateEvent.Events, onStateEvent);
      room.on(RoomStateEvent.Members, onMembers);
      recompute(room.roomId);
    }

    setMemberships((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (!watched.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    return () => {
      active = false;
      client.off(ClientEvent.Sync, onSync);
      for (const room of rooms) {
        room.off(RoomStateEvent.Events, onStateEvent);
        room.off(RoomStateEvent.Members, onMembers);
      }
      for (const timeout of expiryTimeouts.values()) clearTimeout(timeout);
      expiryTimeouts.clear();
      generations.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, roomIdsKey]);

  return memberships;
}

export function uniqueMembers(members: CallMembership[]): CallMembership[] {
  const byUser = new Map<string, CallMembership>();
  for (const member of members) {
    if (member.isExpired()) continue;
    if (!byUser.has(member.userId)) byUser.set(member.userId, member);
  }
  return Array.from(byUser.values());
}
