import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { Room } from 'matrix-js-sdk';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc';
import { CallSession, type CallSnapshot } from 'wizardchat-rtc';
import {
  callRtcOverrideDomainAtom,
  callDevicesAtom,
  callVolumesAtom,
  callUserAudioAtom,
  callActionsAtom,
  callUiAtom,
  callSessionAtom,
  callPanelAtom,
  pushToTalkModeAtom,
  showNonVideoParticipantsAtom,
  showOwnScreenShareAtom,
  type CallPresentation,
} from '@/app/store/atoms/call';
import { currentRoomIdAtom } from '@/app/store/atoms/rooms';
import { deafenedAtom, micMutedAtom } from '@/app/store/atoms/settings';
import { useToast } from '@/app/hooks/useToast';
import { fetchMatrixRtcSupport } from '@/util/serverCapabilities';
import { isDmRoom } from '@/util/matrix';
import { loopVoiceSound, playVoiceSound, type VoiceSound } from '@/app/features/voice/voiceSounds';
import { CALL_SLOT_DESCRIPTION } from '@/app/features/calls/useCallMemberships';
import { usePushToTalk } from '@/app/features/calls/usePushToTalk';
import { onSessionEnd } from '@/client/initMatrix';

const IDLE_UI = {
  roomId: null,
  phase: 'idle' as const,
  presentation: 'hidden' as const,
  isMuted: false,
  isDeafened: false,
  isVideoMuted: false,
  isScreenSharing: false,
  isSpotlight: true,
};

function playParticipantSounds(previous: CallSnapshot, snap: CallSnapshot): void {
  if (previous.ring !== snap.ring) {
    if (snap.ring === 'declined') playVoiceSound('call-declined');
    if (snap.ring === 'unanswered') playVoiceSound('call-no-answer');
  }

  const others = (s: CallSnapshot) =>
    new Set(s.participants.filter((p) => !p.isLocal).map((p) => p.userId));
  const before = others(previous);
  const after = others(snap);
  if ([...after].some((userId) => !before.has(userId))) playVoiceSound('call-join');
  else if ([...before].some((userId) => !after.has(userId))) playVoiceSound('call-leave');

  const old = new Map(previous.participants.map((p) => [p.id, p]));
  let sound: VoiceSound | null = null;
  for (const p of snap.participants) {
    const was = old.get(p.id);
    if (p.screenShared !== (was?.screenShared ?? false)) {
      sound = p.screenShared ? 'screenshare-start' : 'screenshare-stop';
    } else if (!p.isLocal && p.handRaised && !was?.handRaised) {
      sound ??= 'raise-hand';
    } else if (!p.isLocal && p.reaction && p.reaction !== was?.reaction) {
      sound ??= 'reaction';
    }
  }
  if (sound) playVoiceSound(sound);
}

export function CallController() {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const session = useAtomValue(callSessionAtom);
  const setSession = useSetAtom(callSessionAtom);
  const setUi = useSetAtom(callUiAtom);
  const setActions = useSetAtom(callActionsAtom);
  const setPanel = useSetAtom(callPanelAtom);
  const setOverrideDomain = useSetAtom(callRtcOverrideDomainAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const resetUi = useCallback(() => {
    setUi((prev) => ({ ...prev, ...IDLE_UI }));
    setPanel(null);
  }, [setUi, setPanel]);

  const start = useCallback(
    async (room: Room, opts: { voiceOnly?: boolean; presentation?: CallPresentation } = {}) => {
      const runStart = async () => {
        const presentation = opts.presentation ?? 'room';
        const previous = sessionRef.current;
        if (previous) {
          setSession(null);
          setUi((prev) => ({ ...prev, roomId: null, phase: 'idle', incoming: null, presentation }));
          await previous.leave();
        } else {
          setUi((prev) => ({ ...prev, incoming: null, presentation }));
        }

        const micMuted = store.get(micMutedAtom);
        const deafened = store.get(deafenedAtom);
        const voiceOnly = !!opts.voiceOnly;
        const next = new CallSession(room.client, room);
        for (const [userId, audio] of Object.entries(store.get(callUserAudioAtom))) {
          next.setUserVolume(userId, audio.volume);
          next.setUserMuted(userId, audio.muted);
          if (audio.streamVolume !== undefined) next.setStreamVolume(userId, audio.streamVolume);
        }
        setSession(next);
        store.set(showNonVideoParticipantsAtom, true);
        store.set(showOwnScreenShareAtom, true);
        setUi((prev) => ({
          ...prev,
          roomId: room.roomId,
          phase: 'joining',
          voiceOnly,
          isMuted: micMuted || deafened,
          isDeafened: deafened,
          isVideoMuted: true,
          isScreenSharing: false,
          // Discord starts in grid view
          isSpotlight: false,
          presentation,
        }));

        const ongoing =
          (await MatrixRTCSession.sessionMembershipsForSlot(room, CALL_SLOT_DESCRIPTION)).length >
          0;
        const notificationType = ongoing
          ? undefined
          : isDmRoom(room, room.client)
            ? ('ring' as const)
            : ('notification' as const);

        try {
          await next.join({
            voiceOnly,
            micEnabled: !micMuted,
            deafened,
            devices: store.get(callDevicesAtom),
            inputVolume: store.get(callVolumesAtom).input,
            pushToTalk: store.get(pushToTalkModeAtom),
            outputVolume: store.get(callVolumesAtom).output,
            callIntent: voiceOnly ? 'audio' : 'video',
            notificationType,
          });
        } catch {
          // Reported through the session snapshot (phase 'error')
        }
      };

      const client = room.client;
      const domain = client.getDomain();
      const overrideDomain = store.get(callRtcOverrideDomainAtom);
      if (overrideDomain !== domain && !(await fetchMatrixRtcSupport(client))) {
        toast.error(t('call.homeserverUnsupported'), {
          duration: 10000,
          actionLabel: t('call.tryAnyway'),
          onClick: () => {
            if (domain) setOverrideDomain(domain);
            void runStart();
          },
        });
        return;
      }
      await runStart();
    },
    [store, setSession, setUi, setOverrideDomain, toast, t]
  );

  const pushToTalkMode = useAtomValue(pushToTalkModeAtom);
  useEffect(() => {
    session?.setPushToTalk(pushToTalkMode);
  }, [session, pushToTalkMode]);

  useEffect(() => {
    if (!session) return;
    let previous: CallSnapshot | null = null;
    let stopRingback: (() => void) | null = null;
    const sync = () => {
      const snap = session.getSnapshot();
      if (snap.ring === 'ringing' && snap.phase !== 'left' && snap.phase !== 'error') {
        stopRingback ??= loopVoiceSound('ringback');
      } else if (stopRingback) {
        stopRingback();
        stopRingback = null;
      }
      if (snap.phase === 'error' || snap.phase === 'left') {
        if (snap.phase === 'error' && snap.error) {
          toast.error(
            snap.error.kind === 'no-sfu'
              ? t('call.noSfu')
              : t('call.startFailed', { error: snap.error.message })
          );
        }
        if (sessionRef.current === session) {
          setSession(null);
          resetUi();
        }
        return;
      }
      if (previous?.phase !== 'joined' && snap.phase === 'joined') playVoiceSound('call-join');
      if (previous?.phase === 'joined' && snap.phase === 'joined') {
        playParticipantSounds(previous, snap);
        if (previous.local.sound !== snap.local.sound) {
          playVoiceSound(snap.local.sound ? 'undeafen' : 'deafen');
        } else if (previous.local.microphone !== snap.local.microphone) {
          playVoiceSound(snap.local.microphone ? 'unmute' : 'mute');
        }
        if (previous.local.camera !== snap.local.camera) {
          playVoiceSound(snap.local.camera ? 'camera-on' : 'camera-off');
        }
      }
      previous = snap;
      setUi((prev) =>
        prev.roomId !== snap.roomId
          ? prev
          : {
              ...prev,
              phase: snap.phase === 'joined' ? 'joined' : 'joining',
              isMuted: !snap.local.microphone,
              isDeafened: !snap.local.sound,
              isVideoMuted: !snap.local.camera,
              isScreenSharing: snap.local.screenshare,
            }
      );
    };
    sync();
    const unsubscribe = session.subscribe(sync);
    return () => {
      unsubscribe();
      stopRingback?.();
    };
  }, [session, setSession, setUi, resetUi, toast, t]);

  const hangup = useCallback(() => {
    const current = sessionRef.current;
    if (current) playVoiceSound('call-leave');
    setSession(null);
    resetUi();
    void current?.leave();
  }, [setSession, resetUi]);

  const run = useCallback(
    (action: (s: CallSession, snap: CallSnapshot) => Promise<void>) => {
      const current = sessionRef.current;
      if (!current) return;
      action(current, current.getSnapshot()).catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : String(err))
      );
    },
    [toast]
  );

  const setMicrophone = useCallback(
    (enabled: boolean) => run((s) => s.setMicrophone(enabled)),
    [run]
  );
  const setTransmitting = useCallback((on: boolean) => {
    sessionRef.current?.setTransmitting(on);
  }, []);
  const toggleMute = useCallback(
    () =>
      run((s, snap) => {
        const enable = !snap.local.microphone;
        store.set(micMutedAtom, !enable);
        if (enable && !snap.local.sound) store.set(deafenedAtom, false); // unmuting undeafens
        return s.setMicrophone(enable);
      }),
    [run, store]
  );
  const toggleDeafen = useCallback(
    () =>
      run(async (s, snap) => {
        const deafen = snap.local.sound;
        store.set(deafenedAtom, deafen);
        await s.setDeafened(deafen);
        if (!deafen && !store.get(micMutedAtom)) await s.setMicrophone(true);
      }),
    [run, store]
  );
  const toggleVideo = useCallback(() => run((s, snap) => s.setCamera(!snap.local.camera)), [run]);
  const toggleScreenshare = useCallback(
    () => run((s, snap) => s.setScreenShare(!snap.local.screenshare)),
    [run]
  );
  const setSpotlight = useCallback(
    (spotlight: boolean) => setUi((prev) => ({ ...prev, isSpotlight: spotlight })),
    [setUi]
  );
  const openReactions = useCallback(
    () => setPanel((p) => (p === 'reactions' ? null : 'reactions')),
    [setPanel]
  );
  const setPresentation = useCallback(
    (presentation: CallPresentation) => setUi((prev) => ({ ...prev, presentation })),
    [setUi]
  );

  usePushToTalk(session ? setTransmitting : null);

  const roomId = useAtomValue(callUiAtom).roomId;
  useEffect(() => {
    if (roomId === null || currentRoomId === roomId) return;
    setUi((prev) =>
      prev.presentation === 'fullscreen' ? { ...prev, presentation: 'room' } : prev
    );
  }, [roomId, currentRoomId, setUi]);

  useEffect(() => {
    setActions({
      start,
      hangup,
      toggleMute,
      setMicrophone,
      toggleDeafen,
      toggleVideo,
      toggleScreenshare,
      setSpotlight,
      openReactions,
      setPresentation,
    });
    return () => setActions(null);
  }, [
    start,
    hangup,
    toggleMute,
    setMicrophone,
    toggleDeafen,
    toggleVideo,
    toggleScreenshare,
    setSpotlight,
    openReactions,
    setPresentation,
    setActions,
  ]);

  useEffect(
    () =>
      onSessionEnd(async () => {
        const current = sessionRef.current;
        if (!current) return;
        setSession(null);
        resetUi();
        await current.leave();
      }),
    [setSession, resetUi]
  );

  useEffect(() => {
    const onUnload = () => void sessionRef.current?.leave();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  return null;
}
