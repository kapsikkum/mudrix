import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { MudrixClient } from '@mudrix/core';
import { spaceGraphAtom } from '@/app/data';
import { callSessionAtom, callUiAtom } from '@/app/store/atoms/call';
import {
  soundboardEnabledAtom,
  soundboardMutedUsersAtom,
  soundboardVolumeAtom,
} from '@/app/store/atoms/settings';
import { boardRoomIds, evaluateSoundboardAccess, loadRoomSoundboardData } from './boards';
import { stopAllSoundboard } from './playback';
import { addSoundboardPlaying, removeSoundboardPlaying } from './playing';
import { receiveSoundboardPlay, resetSoundboardReceiver } from './receive';
import { soundboardRuntime } from './runtime';
import { soundboardEmoji } from '@/call/soundboard';
import { typeAndLegacy } from '@/util/namespace';
import { SOUNDBOARD_PLAY_EVENT_TYPE } from './types';

/** How far a sender's clock may be ahead of ours before its presses look older than the call. */
const CLOCK_SKEW_MS = 5_000;
/** A press the standard topic did not carry a length for stays on screen this long. */
const CHIP_FALLBACK_MS = 5_000;

/**
 * Keeps the soundboard working during a call: mount it once, next to the other call hooks (it is in
 * CallLayer). It keeps the plain functions (`playSoundboard`, `isSoundboardMuted`, ...) in step with
 * the session and configures the call's player for the standard topic (volume, per-person mute,
 * whether the sender may play here, and the "playing" chips).
 *
 * The old Mudrix topic and room events are still read for clients up to 26.12.4, which send presses
 * there and nowhere else.
 *
 * Everything is best effort: any failure is logged and the call carries on.
 */
export function useSoundboardReceiver(client: MudrixClient | null): void {
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
  const clientRef = useRef(client);
  clientRef.current = client;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef = useRef(mutedUsers);
  mutedRef.current = mutedUsers;

  soundboardRuntime.mounted = true;
  soundboardRuntime.client = client;
  soundboardRuntime.enabled = enabled;
  soundboardRuntime.volume = volume;
  soundboardRuntime.mutedUsers = new Set(mutedUsers);
  soundboardRuntime.deafened = ui.isDeafened;
  soundboardRuntime.callRoomId = callRoomId;
  soundboardRuntime.setMutedUsers = setMutedUsers;
  soundboardRuntime.spaceGraph = spaceGraph;
  soundboardRuntime.play =
    session && callRoomId
      ? (sound) => session.playSound(sound.url, sound.shortcode, sound.emoji, sound)
      : null;

  useEffect(
    () => () => {
      soundboardRuntime.mounted = false;
      soundboardRuntime.callRoomId = null;
      soundboardRuntime.setMutedUsers = null;
      soundboardRuntime.play = null;
      stopAllSoundboard();
    },
    []
  );

  // The call's own player: what it may hear, at what volume, and what to show in the call's UI.
  useEffect(() => {
    if (!session) return undefined;
    session.soundboardEnabled = () => enabledRef.current;
    session.soundboardVolume = () => Math.min(100, Math.max(0, volumeRef.current)) / 100;
    session.soundboardMuted = (userId) => mutedRef.current.includes(userId);
    session.soundboardAllowed = async (userId) => {
      const roomId = soundboardRuntime.callRoomId;
      const current = clientRef.current;
      if (!roomId || !current) return false;
      if (!session.getSnapshot().participants.some((p) => p.connected && p.userId === userId)) {
        return false;
      }
      return (
        (await evaluateSoundboardAccess(current, spaceGraphRef.current, roomId, userId)) === 'ok'
      );
    };
    session.onSoundboardPlay = (senderId, key, sound) => {
      addSoundboardPlaying({
        key: `media:${senderId}:${key}`,
        senderId,
        soundId: sound.url,
        name: sound.name || sound.shortcode?.replace(/_/g, ' ') || 'Sound',
        emoji: soundboardEmoji(sound.shortcode, sound.emoji),
        startedAt: Date.now(),
        durationMs:
          sound.durationMs && sound.durationMs > 0
            ? Math.min(sound.durationMs, 15_000)
            : CHIP_FALLBACK_MS,
      });
    };
    session.onSoundboardEnd = (senderId, key) =>
      removeSoundboardPlaying(`media:${senderId}:${key}`);
    return () => {
      session.soundboardEnabled = () => false;
      session.soundboardVolume = () => 0;
      session.soundboardMuted = () => false;
      session.soundboardAllowed = null;
      session.onSoundboardPlay = null;
      session.onSoundboardEnd = null;
      session.stopSounds();
    };
  }, [session]);

  // Stop what is playing when it should no longer be heard.
  useEffect(() => {
    if (!callRoomId || !enabled || ui.isDeafened || volume <= 0) {
      stopAllSoundboard();
      session?.stopSounds();
    }
  }, [callRoomId, enabled, ui.isDeafened, volume, session]);

  // Know what the room and its spaces say before the first press.
  useEffect(() => {
    if (!client || !callRoomId || !enabled) return undefined;
    // Once is enough: the state store follows changes by itself.
    for (const id of boardRoomIds(spaceGraphRef.current, callRoomId)) {
      void loadRoomSoundboardData(client, id).catch(() => {});
    }
    return undefined;
  }, [client, callRoomId, enabled]);

  // Clients up to 26.12.4: presses on their own topic and as room events.
  useEffect(() => {
    if (!client || !session || !callRoomId || session.roomId !== callRoomId) return undefined;
    resetSoundboardReceiver();
    const inCall = (userId: string) =>
      session.getSnapshot().participants.some((p) => p.connected && p.userId === userId);

    const stop = session.onData((topic, payload, from) => {
      if (!typeAndLegacy(SOUNDBOARD_PLAY_EVENT_TYPE).includes(topic)) return;
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
    };
  }, [client, session, callRoomId]);
}
