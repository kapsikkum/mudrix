import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { IncomingCall as CoreIncomingCall, WizardClient } from '@wizardchat/core';
import { roomsByIdAtom } from '@/app/data';
import { callActionsAtom, callUiAtom, type IncomingCall } from '@/app/store/atoms/call';
import { notificationBannersAtom } from '@/app/store/atoms/settings';
import { closeBrowserNotification, showBrowserNotification } from '@/app/hooks/useNotifications';
import { formatUserId, isDmRoom } from '@/util/matrix';
import { loopVoiceSound } from '@/app/features/voice/voiceSounds';

const ringTag = (roomId: string) => `ring:${roomId}`;

export function useIncomingCall(client: WizardClient | null) {
  const { t } = useTranslation();
  const store = useStore();
  const setUi = useSetAtom(callUiAtom);
  const callActions = useAtomValue(callActionsAtom);

  const ui = useAtomValue(callUiAtom);
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const tRef = useRef(t);
  tRef.current = t;

  const ringing = !!ui.incoming?.ring;
  useEffect(() => {
    if (!ringing) return undefined;
    return loopVoiceSound('ringtone');
  }, [ringing]);

  const incomingRoomId = ui.incoming?.roomId ?? null;
  useEffect(() => {
    if (!incomingRoomId) return undefined;
    return () => {
      window.desktopAPI?.requestAttention?.(false);
      void closeBrowserNotification(ringTag(incomingRoomId));
    };
  }, [incomingRoomId]);

  const dismiss = useCallback(() => {
    setUi((prev) => ({ ...prev, incoming: null }));
  }, [setUi]);

  const decline = useCallback(() => {
    const incoming = uiRef.current.incoming;
    dismiss();
    if (!client || !incoming?.ring) return;
    void client.declineCall(incoming.roomId, incoming.eventId).catch(() => {});
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

    const notify = (call: CoreIncomingCall, title: string, tag?: string) => {
      if (!store.get(notificationBannersAtom)) return;
      const room = store.get(roomsByIdAtom).get(call.roomId);
      if (room?.notificationMode === 'mute') return;
      const body = tRef.current(
        call.intent === 'audio' ? 'timeline.voiceCall' : 'timeline.videoCall'
      );
      void showBrowserNotification(
        title,
        body,
        `/dm/${encodeURIComponent(call.roomId)}`,
        undefined,
        tag
      );
    };

    const subscription = client.watchIncomingCalls((event) => {
      const { call } = event;
      const callerName = call.senderName ?? formatUserId(call.sender);

      if (event.type === 'ended') {
        if (uiRef.current.incoming?.roomId === call.roomId) dismiss();
        if (call.ring && (event.reason === 'callerLeft' || event.reason === 'expired'))
          notify(call, tRef.current('call.missedFrom', { name: callerName }));
        return;
      }

      const shown = uiRef.current.incoming;
      if (shown && shown.roomId !== call.roomId) return;
      if (uiRef.current.roomId === call.roomId) return;
      const room = store.get(roomsByIdAtom).get(call.roomId);
      if (!room) return;

      setUi((prev) => ({
        ...prev,
        incoming: {
          roomId: call.roomId,
          eventId: call.eventId,
          callerId: call.sender,
          callerName,
          voiceOnly: call.intent === 'audio',
          ring: call.ring,
          roomName: isDmRoom(room) ? null : (call.roomName ?? room.name),
        },
      }));
      if (!shown && !document.hasFocus()) {
        window.desktopAPI?.requestAttention?.(true);
        notify(call, tRef.current('call.isCalling', { name: callerName }), ringTag(call.roomId));
      }
    });

    return () => subscription.cancel();
  }, [client, dismiss, setUi, store]);

  return { accept, dismiss, decline };
}
