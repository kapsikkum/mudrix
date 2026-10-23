import { useState, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import type { MatrixClient, Room, MatrixEvent } from 'matrix-js-sdk';
import { RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import { isTimelineRenderedEvent } from '@/app/hooks/useTimeline';
import { getLinkedTimelines, getLiveTimeline } from '@/util/timeline';

export interface ReceiptUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  ts: number;
}

function getEffectiveEventId(receiptEventId: string, events: MatrixEvent[]): string | null {
  // Only anchor to events we actually have loaded. Receipts pointing anywhere
  // else (e.g. not-yet-loaded or thread-only targets) are dropped from the
  // main timeline's receipt map.
  const receiptIndex = events.findIndex((e) => e.getId() === receiptEventId);
  if (receiptIndex === -1) {
    return null;
  }
  if (isTimelineRenderedEvent(events[receiptIndex])) {
    return receiptEventId;
  }
  for (let i = receiptIndex - 1; i >= 0; i--) {
    const ev = events[i];
    if (isTimelineRenderedEvent(ev)) {
      return ev.getId() ?? null;
    }
  }
  return null;
}

function buildMap(room: Room, myId: string): Map<string, ReceiptUser[]> {
  const map = new Map<string, ReceiptUser[]>();

  const events = getLinkedTimelines(getLiveTimeline(room)).flatMap((tl) => tl.getEvents());

  for (const member of room.getJoinedMembers()) {
    if (member.userId === myId) continue;

    const receipt = room.getReadReceiptForUserId(member.userId);
    if (!receipt?.eventId) continue;

    const targetEventId = getEffectiveEventId(receipt.eventId, events);
    if (!targetEventId) continue;

    const user: ReceiptUser = {
      userId: member.userId,
      displayName: member.name ?? member.userId,
      avatarUrl: member.getMxcAvatarUrl() ?? null,
      ts: receipt.data.ts ?? 0,
    };

    const existing = map.get(targetEventId) ?? [];
    existing.push(user);
    map.set(targetEventId, existing);
  }

  for (const users of map.values()) {
    users.sort((a, b) => b.ts - a.ts);
  }

  return map;
}

export function useRoomReceipts(
  client: MatrixClient,
  room: Room | null
): Map<string, ReceiptUser[]> {
  const myId = client.getUserId() ?? '';
  const enabled = useAtomValue(sendReadReceiptsAtom);

  const [receiptMap, setReceiptMap] = useState<Map<string, ReceiptUser[]>>(() =>
    room && enabled ? buildMap(room, myId) : new Map()
  );

  useEffect(() => {
    if (!room || !enabled) {
      setReceiptMap(new Map());
      return;
    }

    const rebuild = () => {
      setReceiptMap((prev) => {
        const next = buildMap(room, myId);
        // Reuse previous array references where the set of readers is identical,
        // so React.memo on <Message> can bail out with default shallow equality.
        for (const [eventId, users] of next) {
          const prevUsers = prev.get(eventId);
          if (prevUsers && prevUsers.length === users.length) {
            const nextIds = new Set(users.map((u) => u.userId));
            if (prevUsers.every((u) => nextIds.has(u.userId))) {
              next.set(eventId, prevUsers);
            }
          }
        }
        return next;
      });
    };

    setReceiptMap(buildMap(room, myId));

    room.on(RoomEvent.Receipt, rebuild);
    room.on(RoomEvent.Timeline, rebuild);
    room.on(RoomEvent.TimelineReset, rebuild);
    room.on(RoomStateEvent.Members, rebuild);
    room.on(RoomStateEvent.Events, rebuild);

    const t1 = window.setTimeout(rebuild, 100);
    const t2 = window.setTimeout(rebuild, 400);

    return () => {
      room.off(RoomEvent.Receipt, rebuild);
      room.off(RoomEvent.Timeline, rebuild);
      room.off(RoomEvent.TimelineReset, rebuild);
      room.off(RoomStateEvent.Members, rebuild);
      room.off(RoomStateEvent.Events, rebuild);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [room, myId, enabled]);

  return receiptMap;
}
