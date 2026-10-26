import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  ClientEvent,
  EventType,
  MatrixEventEvent,
  RelationType,
  RoomStateEvent,
} from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { CALL_SLOT_DESCRIPTION } from '@/app/features/calls/useCallMemberships';
import { callActionsAtom, callUiAtom, type IncomingCall } from '@/app/store/atoms/call';
import { getMemberDisplayName, isDmRoom } from '@/util/matrix';
import { loopVoiceSound } from '@/app/features/voice/voiceSounds';

const RING_TIMEOUT_MS = 45_000;

export function useIncomingCall(client: MatrixClient | null) {
  const setUi = useSetAtom(callUiAtom);
  const callActions = useAtomValue(callActionsAtom);

  const uiRef = useRef({
    roomId: null as string | null,
    incoming: null as null | { roomId: string },
  });
  const ui = useAtomValue(callUiAtom);
  uiRef.current = ui;

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const ringing = !!ui.incoming;
  useEffect(() => {
    if (!ringing) return undefined;
    return loopVoiceSound('ringtone');
  }, [ringing]);

  const dismiss = useCallback(() => {
    clearTimer();
    setUi((prev) => ({ ...prev, incoming: null }));
  }, [clearTimer, setUi]);

  const decline = useCallback(() => {
    const incoming = uiRef.current.incoming as IncomingCall | null;
    dismiss();
    const room = incoming && client?.getRoom(incoming.roomId);
    if (!room || !incoming) return;
    const notification = [...room.getLiveTimeline().getEvents()].reverse().find((ev) => {
      if (ev.getType() !== EventType.RTCNotification || ev.getSender() !== incoming.callerId) {
        return false;
      }
      const { sender_ts: sentTs, lifetime } = ev.getContent<{
        sender_ts?: number;
        lifetime?: number;
      }>();
      return Date.now() - (sentTs ?? ev.getTs()) < (lifetime ?? 30000);
    });
    const eventId = notification?.getId();
    if (!eventId) return;
    void client
      ?.sendEvent(room.roomId, EventType.RTCDecline, {
        'm.relates_to': { rel_type: RelationType.Reference, event_id: eventId },
      } as never)
      .catch(() => {});
  }, [client, dismiss]);

  const accept = useCallback(
    async (incoming: IncomingCall) => {
      if (!client) return;
      const room = client.getRoom(incoming.roomId);
      if (!room) return;
      await callActions?.start(room, { voiceOnly: incoming.voiceOnly, presentation: 'room' });
    },
    [client, callActions]
  );

  useEffect(() => {
    if (!client) return undefined;

    const handleEvent = async (ev: MatrixEvent) => {
      if (ev.getType() !== EventType.GroupCallMemberPrefix) return;

      const roomId = ev.getRoomId();
      const sender = ev.getSender();
      if (!roomId || !sender) return;
      if (sender === client.getUserId()) return;

      if (uiRef.current.roomId === roomId || uiRef.current.incoming) return;

      const room = client.getRoom(roomId);
      if (!room) return;
      if (!isDmRoom(room, client)) return;

      const memberships = await MatrixRTCSession.sessionMembershipsForSlot(
        room,
        CALL_SLOT_DESCRIPTION
      );
      const ringing = memberships.find(
        (m) =>
          m.userId === sender &&
          !m.isExpired() &&
          m.createdTs() > Date.now() - RING_TIMEOUT_MS &&
          (m.callIntent === 'ring' || m.callIntent === 'video' || m.callIntent === 'audio')
      );
      if (!ringing) return;

      const callerName = getMemberDisplayName(sender, client, roomId);
      setUi((prev) => ({
        ...prev,
        incoming: {
          roomId,
          callerId: sender,
          callerName,
          voiceOnly: ringing.callIntent === 'audio',
        },
      }));

      clearTimer();
      dismissTimerRef.current = setTimeout(dismiss, RING_TIMEOUT_MS);
    };

    client.on(ClientEvent.Event, handleEvent);
    client.on(MatrixEventEvent.Decrypted, handleEvent);
    client.on(RoomStateEvent.Events, handleEvent);
    return () => {
      client.off(ClientEvent.Event, handleEvent);
      client.off(MatrixEventEvent.Decrypted, handleEvent);
      client.off(RoomStateEvent.Events, handleEvent);
    };
  }, [client, clearTimer, dismiss, setUi]);

  return { accept, dismiss, decline };
}
