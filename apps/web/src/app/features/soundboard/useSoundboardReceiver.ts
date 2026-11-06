import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { spaceGraphAtom } from '@/app/data';
import { callSessionAtom, callUiAtom } from '@/app/store/atoms/call';
import {
  soundboardEnabledAtom,
  soundboardMutedUsersAtom,
  soundboardVolumeAtom,
} from '@/app/store/atoms/settings';
import { boardRoomIds, loadRoomSoundboardData } from './boards';
import { stopAllSoundboard } from './playback';
import { receiveSoundboardPlay, resetSoundboardReceiver } from './receive';
import { soundboardRuntime } from './runtime';
import { typeAndLegacy } from '@/util/namespace';
import { SOUNDBOARD_PLAY_EVENT_TYPE, type SoundboardPlayContent } from './types';

/** How long what a room says about the soundboard is trusted before it is asked again. */
const REFRESH_MS = 30_000;
/** How far a sender's clock may be ahead of ours before its presses look older than the call. */
const CLOCK_SKEW_MS = 5_000;

/**
 * Keeps the soundboard working during a call: mount it once, next to the other call hooks (it is in
 * CallLayer). It keeps the plain functions (`playSoundboard`, `isSoundboardMuted`, ...) in step with
 * the session, sends presses to the call and plays other people's. A press travels as a message on
 * the call's data channel, which every Mudrix in the call hears at once, and as a room event of the
 * same type, which this hook also listens for (`watchRoomEvents`) so a press from a client that
 * cannot send on the data channel is heard too.
 *
 * Everything is best effort: any failure is logged and the call carries on.
 */
export function useSoundboardReceiver(client: WizardClient | null): void {
  const ui = useAtomValue(callUiAtom);
  const session = useAtomValue(callSessionAtom);
  const enabled = useAtomValue(soundboardEnabledAtom);
  const volume = useAtomValue(soundboardVolumeAtom);
  const mutedUsers = useAtomValue(soundboardMutedUsersAtom);
  const setMutedUsers = useSetAtom(soundboardMutedUsersAtom);
  const spaceGraph = useAtomValue(spaceGraphAtom);

  const callRoomId = ui.phase === 'joined' ? ui.roomId : null;
  const spaceGraphRef = useRef(spaceGraph);
  spaceGraphRef.current = spaceGraph;

  soundboardRuntime.mounted = true;
  soundboardRuntime.client = client;
  soundboardRuntime.enabled = enabled;
  soundboardRuntime.volume = volume;
  soundboardRuntime.mutedUsers = new Set(mutedUsers);
  soundboardRuntime.deafened = ui.isDeafened;
  soundboardRuntime.callRoomId = callRoomId;
  soundboardRuntime.setMutedUsers = setMutedUsers;
  soundboardRuntime.spaceGraph = spaceGraph;
  useEffect(
    () => () => {
      soundboardRuntime.mounted = false;
      soundboardRuntime.callRoomId = null;
      soundboardRuntime.setMutedUsers = null;
      soundboardRuntime.send = null;
      stopAllSoundboard();
    },
    []
  );

  // Stop what is playing when it should no longer be heard.
  useEffect(() => {
    if (!callRoomId || !enabled || ui.isDeafened) stopAllSoundboard();
  }, [callRoomId, enabled, ui.isDeafened]);

  // Know what the room and its spaces say before the first press.
  useEffect(() => {
    if (!client || !callRoomId || !enabled) return undefined;
    const warm = () => {
      for (const id of boardRoomIds(spaceGraphRef.current, callRoomId)) {
        void loadRoomSoundboardData(client, id, true).catch(() => {});
      }
    };
    warm();
    const timer = window.setInterval(warm, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [client, callRoomId, enabled]);

  useEffect(() => {
    if (!client || !session || !callRoomId || session.roomId !== callRoomId) return undefined;
    resetSoundboardReceiver();
    const inCall = (userId: string) =>
      session.getSnapshot().participants.some((p) => p.connected && p.userId === userId);

    soundboardRuntime.send = (content: SoundboardPlayContent) => {
      session
        .sendData(SOUNDBOARD_PLAY_EVENT_TYPE, content)
        .catch((err) => console.warn('[soundboard] could not send to the call', err));
      client
        .sendEvent(callRoomId, SOUNDBOARD_PLAY_EVENT_TYPE, content as never)
        .catch((err) => console.warn('[soundboard] could not send a play event', err));
    };
    const stop = session.onData((topic, payload, from) => {
      if (topic !== SOUNDBOARD_PLAY_EVENT_TYPE) return;
      const sender = session.getSnapshot().participants.find((p) => p.identity === from)?.userId;
      if (sender) void receiveSoundboardPlay(callRoomId, sender, payload, inCall);
    });
    // Clients that cannot send on the call's data channel send the press as a room event only.
    const startedAt = Date.now();
    const events = client.watchRoomEvents(
      [...typeAndLegacy(SOUNDBOARD_PLAY_EVENT_TYPE)],
      ({ roomId, sender, content, originServerTs }) => {
        // Sync replays recent history: only presses made while we are in the call
        if (roomId !== callRoomId || originServerTs < startedAt - CLOCK_SKEW_MS) return;
        void receiveSoundboardPlay(callRoomId, sender, content, inCall, 'room');
      }
    );
    return () => {
      stop();
      events.cancel();
      soundboardRuntime.send = null;
    };
  }, [client, session, callRoomId]);
}
