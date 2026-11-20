import { useCallback, useRef } from 'react';
import { useAtomValue } from 'jotai';
import type { RoomTimeline, MudrixClient } from '@mudrix/core';
import { sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import { isAppFocused } from '@/bridge/windowActivity';
import { markRoomAsRead } from '@/app/pages/client/markAsRead';

export function useRoomReadReceipts(
  client: MudrixClient,
  roomId: string,
  timeline?: RoomTimeline | null,
  latestEventId?: string | null
): () => void {
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const lastEventIdRef = useRef<string | null>(null);
  const latestRef = useRef(latestEventId);
  latestRef.current = latestEventId;

  return useCallback(() => {
    // The shell answers this on desktop (see bridge/windowActivity).
    if (!isAppFocused()) return;
    const latest = latestRef.current;
    if (latest !== undefined) {
      if (!latest || latest === lastEventIdRef.current) return;
      lastEventIdRef.current = latest;
    }
    if (timeline) {
      timeline.markAsRead(!sendReadReceipts).catch(() => {});
    } else {
      void markRoomAsRead(client, roomId, sendReadReceipts);
    }
  }, [client, roomId, timeline, sendReadReceipts]);
}
