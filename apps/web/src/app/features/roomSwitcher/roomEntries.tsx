import { useMemo } from 'react';
import { useAllJoinedSpaces, useAllRooms } from '@/app/data';
import { formatUserId } from '@/util/matrix';
import { getRoomUnreadCount, roomHasUnreadMention } from '@/util/mentions';
import * as css from './RoomSwitcher.css';

export type RoomKind = 'room' | 'dm' | 'space';

export type RoomEntry = {
  roomId: string;
  name: string;
  kind: RoomKind;
  isVoice: boolean;
  avatarMxc: string | null;
  unread: number;
  highlight: boolean;
  lastActiveTs: number;
};

export function useRoomEntries(): RoomEntry[] {
  const rooms = useAllRooms();
  const spaces = useAllJoinedSpaces();

  return useMemo(() => {
    const entries: RoomEntry[] = [];
    for (const room of rooms) {
      if (room.isInvite || room.isSpace || room.isTombstoned) continue;
      const dm = room.isDirect;
      const partnerId = dm ? room.dmUserId : null;
      const name = dm
        ? room.dmUserName || (partnerId ? formatUserId(partnerId) : room.name || '(unknown)')
        : room.name || '(unknown)';
      entries.push({
        roomId: room.id,
        name,
        kind: dm ? 'dm' : 'room',
        isVoice: room.isVoice,
        avatarMxc: dm ? room.dmUserAvatar : room.avatarUrl,
        unread: getRoomUnreadCount(room),
        highlight: roomHasUnreadMention(room),
        lastActiveTs: room.lastActivity ?? 0,
      });
    }
    for (const space of spaces) {
      entries.push({
        roomId: space.id,
        name: space.name || '(unknown)',
        kind: 'space',
        isVoice: false,
        avatarMxc: space.avatarUrl,
        unread: 0,
        highlight: false,
        lastActiveTs: 0,
      });
    }
    return entries;
  }, [rooms, spaces]);
}

export function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let cursor = 0;
  let idx: number;
  while ((idx = lower.indexOf(q, cursor)) !== -1) {
    if (idx > cursor) parts.push({ text: text.slice(cursor, idx), highlighted: false });
    parts.push({ text: text.slice(idx, idx + q.length), highlighted: true });
    cursor = idx + q.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false });
  return (
    <>
      {parts.map((p, i) =>
        p.highlighted ? (
          <mark key={i} className={css.highlight}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}
