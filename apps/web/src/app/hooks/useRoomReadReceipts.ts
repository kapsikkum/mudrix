import { useCallback, useRef } from 'react';
import { useAtomValue } from 'jotai';
import type { RoomTimeline, WizardClient } from '@wizardchat/core';
import { sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import { markRoomAsRead } from '@/app/pages/client/markAsRead';

export function useRoomReadReceipts(
  client: WizardClient,
  roomId: string,
  timeline?: RoomTimeline | null,
  latestEventId?: string | null
): () => void {
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const lastEventIdRef = useRef<string | null>(null);
  const latestRef = useRef(latestEventId);
  latestRef.current = latestEventId;

  return useCallback(() => {
    if (!document.hasFocus()) return;
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
