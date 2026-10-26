import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { RoomEvent, ThreadEvent } from 'matrix-js-sdk';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { threadLastSeenAtom } from '@/app/store/atoms';
import { isThreadUnread } from '@/util/threads';

export function useHasUnreadThreads(roomId: string | null | undefined): boolean {
  const client = getMatrixClientOrNull();
  const threadLastSeen = useAtomValue(threadLastSeenAtom);
  const [hasUnread, setHasUnread] = useState(false);

  const room = useMemo(() => (client && roomId ? client.getRoom(roomId) : null), [client, roomId]);

  useEffect(() => {
    if (!room) {
      setHasUnread(false);
      return;
    }
    const recompute = () => {
      setHasUnread(room.getThreads().some((thread) => isThreadUnread(thread, threadLastSeen)));
    };
    recompute();
    room.on(ThreadEvent.New, recompute);
    room.on(ThreadEvent.Update, recompute);
    room.on(ThreadEvent.Delete, recompute);
    room.on(RoomEvent.Timeline, recompute);
    room.on(RoomEvent.Receipt, recompute);
    return () => {
      room.off(ThreadEvent.New, recompute);
      room.off(ThreadEvent.Update, recompute);
      room.off(ThreadEvent.Delete, recompute);
      room.off(RoomEvent.Timeline, recompute);
      room.off(RoomEvent.Receipt, recompute);
    };
  }, [room, threadLastSeen]);

  return hasUnread;
}
