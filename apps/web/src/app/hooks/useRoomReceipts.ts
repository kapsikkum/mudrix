import { useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import type { TimelineEntry, WizardClient } from '@wizardchat/core';
import { useMembers } from '@/app/data';
import { sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import { formatUserId } from '@/util/matrix';
import { isReceiptAnchorEntry } from '@/app/hooks/useTimeline';
import { entryEventId } from '@/app/features/timeline/message/entry';

export interface ReceiptUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  ts: number;
}

function sameReaders(a: ReceiptUser[], b: ReceiptUser[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.userId !== y.userId || x.displayName !== y.displayName || x.avatarUrl !== y.avatarUrl)
      return false;
  }
  return true;
}

export function useRoomReceipts(
  client: WizardClient,
  roomId: string | null,
  entries: TimelineEntry[]
): Map<string, ReceiptUser[]> {
  const myId = client.userId() ?? '';
  const enabled = useAtomValue(sendReadReceiptsAtom);
  const { data: members } = useMembers(roomId);
  const prevRef = useRef(new Map<string, ReceiptUser[]>());

  return useMemo(() => {
    const map = new Map<string, ReceiptUser[]>();
    if (!enabled) {
      prevRef.current = map;
      return map;
    }
    const memberById = new Map((members ?? []).map((m) => [m.userId, m]));
    let anchor: string | null = null;
    for (const entry of entries) {
      if (entry.kind !== 'event') continue;
      if (isReceiptAnchorEntry(entry)) anchor = entryEventId(entry);
      if (!anchor || entry.readBy.length === 0) continue;
      const users = map.get(anchor) ?? [];
      for (const receipt of entry.readBy) {
        if (receipt.userId === myId) continue;
        const member = memberById.get(receipt.userId);
        if (members && (!member || member.isInvite)) continue;
        users.push({
          userId: receipt.userId,
          displayName: member?.displayName ?? formatUserId(receipt.userId),
          avatarUrl: member?.avatarUrl ?? null,
          ts: receipt.timestamp ?? 0,
        });
      }
      if (users.length > 0) map.set(anchor, users);
    }

    // Reuse previous array references where the set of readers is identical,
    // so React.memo on <Message> can bail out with default shallow equality.
    for (const [eventId, users] of map) {
      users.sort((a, b) => b.ts - a.ts);
      const prevUsers = prevRef.current.get(eventId);
      if (prevUsers && sameReaders(prevUsers, users)) map.set(eventId, prevUsers);
    }
    prevRef.current = map;
    return map;
  }, [entries, members, myId, enabled]);
}
