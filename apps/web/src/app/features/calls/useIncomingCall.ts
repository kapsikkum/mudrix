import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { roomsByIdAtom } from '@/app/data';
import { callActionsAtom, callUiAtom, type IncomingCall } from '@/app/store/atoms/call';
import { formatUserId, isDmRoom } from '@/util/matrix';
import { loopSoundKind } from '@/util/notificationSounds';

const RING_TIMEOUT_MS = 45_000;

export function useIncomingCall(client: WizardClient | null) {
  const store = useStore();
  const setUi = useSetAtom(callUiAtom);
  const callActions = useAtomValue(callActionsAtom);

  const uiRef = useRef({
    roomId: null as string | null,
    incoming: null as null | { roomId: string },
  });
  const ui = useAtomValue(callUiAtom);
  uiRef.current = ui;

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventIdRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const ringing = !!ui.incoming;
  useEffect(() => {
    if (!ringing) return undefined;
    return loopSoundKind('ring') ?? undefined;
  }, [ringing]);

  const dismiss = useCallback(() => {
    clearTimer();
    setUi((prev) => ({ ...prev, incoming: null }));
  }, [clearTimer, setUi]);

  const decline = useCallback(() => {
    const incoming = uiRef.current.incoming as IncomingCall | null;
    const eventId = eventIdRef.current;
    dismiss();
    if (!client || !incoming || !eventId) return;
    void client.declineCall(incoming.roomId, eventId).catch(() => {});
  }, [client, dismiss]);

  const accept = useCallback(
    async (incoming: IncomingCall) => {
      if (!client) return;
      if (!store.get(roomsByIdAtom).has(incoming.roomId)) return;
      await callActions?.start(incoming.roomId, {
        voiceOnly: incoming.voiceOnly,
        presentation: 'room',
      });
    },
    [client, callActions, store]
  );

  useEffect(() => {
    if (!client) return undefined;

    // The core only reports rings whose caller is in the call: ring events, or a caller's
    // fresh membership in a direct chat
    const subscription = client.watchIncomingCalls((call) => {
      const { roomId, sender } = call;
      if (!call.ring || sender === client.userId()) return;

      const incoming = uiRef.current.incoming as IncomingCall | null;
      if (incoming) {
        if (incoming.roomId === roomId && incoming.callerId === sender && call.eventId)
          eventIdRef.current = call.eventId;
        return;
      }
      if (uiRef.current.roomId === roomId) return;

      const room = store.get(roomsByIdAtom).get(roomId);
      if (!room) return;
      if (!isDmRoom(room)) return;

      eventIdRef.current = call.eventId || null;
      setUi((prev) => ({
        ...prev,
        incoming: {
          roomId,
          callerId: sender,
          callerName: call.senderName ?? formatUserId(sender),
          voiceOnly: call.intent === 'audio',
        },
      }));

      clearTimer();
      dismissTimerRef.current = setTimeout(dismiss, RING_TIMEOUT_MS);
    });
    const handledElsewhere = client.watchCallsHandledElsewhere((roomId) => {
      if (uiRef.current.incoming?.roomId === roomId) dismiss();
    });

    return () => {
      subscription.cancel();
      handledElsewhere.cancel();
    };
  }, [client, clearTimer, dismiss, setUi, store]);

  // Stop ringing once the caller is no longer in the call
  const incomingRoom = ui.incoming?.roomId ?? null;
  const incomingCaller = (ui.incoming as IncomingCall | null)?.callerId ?? null;
  useEffect(() => {
    if (!client || !incomingRoom || !incomingCaller) return undefined;
    const subscription = client.watchCallMembers(incomingRoom, (members) => {
      if (!members.some((m) => m.userId === incomingCaller)) dismiss();
    });
    return () => subscription.cancel();
  }, [client, incomingRoom, incomingCaller, dismiss]);

  return { accept, dismiss, decline };
}
