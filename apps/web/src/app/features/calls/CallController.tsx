import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useTranslation } from 'react-i18next';
import { CallMedia, type CallSnapshot } from '@/call/media';
import {
  callRtcOverrideDomainAtom,
  callDevicesAtom,
  callVolumesAtom,
  callUserAudioAtom,
  callActionsAtom,
  callIsVoiceRoomAtom,
  callUiAtom,
  callSessionAtom,
  pendingCallRoomIdAtom,
  leavingCallRoomIdAtom,
  pushToTalkModeAtom,
  showNonVideoParticipantsAtom,
  showOwnScreenShareAtom,
  type CallPresentation,
} from '@/app/store/atoms/call';
import { currentRoomIdAtom } from '@/app/store/atoms/rooms';
import {
  deafenedAtom,
  micMutedAtom,
  noiseSuppressionAtom,
  echoCancellationAtom,
  autoGainControlAtom,
  preferencesAtom,
  DEFAULT_PREFERENCES,
  type Preferences,
} from '@/app/store/atoms/settings';
import { useToast } from '@/app/hooks/useToast';
import { playVoiceSound, type VoiceSound } from '@/app/features/voice/voiceSounds';
import { loopSoundKind, playSoundKind } from '@/util/notificationSounds';
import { usePushToTalk } from '@/app/features/calls/usePushToTalk';
import { useScreenWakeLock } from './useScreenWakeLock';
import { AloneNotice } from './AloneNotice';
import { getMatrixClientOrNull, onSessionEnd } from '@/client/initMatrix';

const LEAVE_CONFIRM_TIMEOUT_MS = 30_000;

function audioProcessingOf(prefs: Partial<Preferences>) {
  return {
    noiseSuppression: prefs.noiseSuppression ?? DEFAULT_PREFERENCES.noiseSuppression,
    echoCancellation: prefs.echoCancellation ?? DEFAULT_PREFERENCES.echoCancellation,
    autoGainControl: prefs.autoGainControl ?? DEFAULT_PREFERENCES.autoGainControl,
  };
}

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
  if ([...after].some((userId) => !before.has(userId))) playSoundKind('join');
  else if ([...before].some((userId) => !after.has(userId))) playSoundKind('leave');

  const old = new Map(previous.participants.map((p) => [p.identity, p]));
  let sound: VoiceSound | null = null;
  for (const p of snap.participants) {
    const was = old.get(p.identity);
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
  const setOverrideDomain = useSetAtom(callRtcOverrideDomainAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const resetUi = useCallback(() => {
    setUi((prev) => ({ ...prev, ...IDLE_UI }));
  }, [setUi]);

  const start = useCallback(
    async (
      roomId: string,
      opts: { voiceOnly?: boolean; presentation?: CallPresentation; ring?: boolean } = {}
    ) => {
      const client = getMatrixClientOrNull();
      if (!client) return;
      const runStart = async () => {
        playSoundKind('join');
        store.set(pendingCallRoomIdAtom, roomId);
        const presentation = opts.presentation ?? 'room';
        const previous = sessionRef.current;
        const previousRoomId = store.get(callUiAtom).roomId;
        store.set(
          leavingCallRoomIdAtom,
          previous && previousRoomId !== roomId ? previousRoomId : null
        );
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
        const next = new CallMedia(client, roomId);
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
          roomId,
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
        store.set(pendingCallRoomIdAtom, null);

        try {
          await next.join({
            video: !voiceOnly,
            microphone: !micMuted,
            deafened,
            devices: store.get(callDevicesAtom),
            audioProcessing: audioProcessingOf(store.get(preferencesAtom)),
            inputVolume: store.get(callVolumesAtom).input,
            pushToTalk: store.get(pushToTalkModeAtom),
            outputVolume: store.get(callVolumesAtom).output,
            ring: !!opts.ring,
          });
        } catch {
          // Reported through the session snapshot (phase 'error')
        }
      };

      const domain = client.userId()?.split(':').slice(1).join(':') || null;
      const overrideDomain = store.get(callRtcOverrideDomainAtom);
      store.set(pendingCallRoomIdAtom, roomId);
      const supported =
        overrideDomain === domain || (await client.rtcSupported().catch(() => false));
      if (!supported) {
        store.set(pendingCallRoomIdAtom, null);
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
        stopRingback ??= loopSoundKind('ringback');
      } else if (stopRingback) {
        stopRingback();
        stopRingback = null;
      }
      if (snap.phase === 'error' || snap.phase === 'left') {
        if (snap.phase === 'error' && snap.error) {
          toast.error(
            snap.errorKind === 'noSfu'
              ? t('call.noSfu')
              : t('call.startFailed', {
                  error:
                    snap.errorKind === 'auth'
                      ? t('call.errorAuth')
                      : snap.errorKind === 'membership'
                        ? t('call.errorMembership')
                        : snap.errorKind === 'connection'
                          ? t('call.errorConnection')
                          : snap.error,
                })
          );
        }
        if (sessionRef.current === session) {
          setSession(null);
          resetUi();
        }
        return;
      }
      if (previous?.phase === 'joined' && snap.phase === 'joined') {
        playParticipantSounds(previous, snap);
        if (previous.deafened !== snap.deafened) {
          playVoiceSound(snap.deafened ? 'deafen' : 'undeafen');
        } else if (previous.microphone !== snap.microphone) {
          playSoundKind(snap.microphone ? 'unmute' : 'mute');
        }
        if (previous.camera !== snap.camera) {
          playSoundKind(snap.camera ? 'camera-on' : 'camera-off');
        }
      }
      previous = snap;
      setUi((prev) =>
        prev.roomId !== snap.roomId
          ? prev
          : snap.phase !== 'joined'
            ? { ...prev, phase: 'joining' }
            : {
                ...prev,
                phase: 'joined',
                isMuted: !snap.microphone,
                isDeafened: snap.deafened,
                isVideoMuted: !snap.camera,
                isScreenSharing: snap.screenshare,
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
    // A voice channel says you left it; a call between people says it ended
    if (current) playSoundKind(store.get(callIsVoiceRoomAtom) ? 'leave' : 'callend');
    store.set(leavingCallRoomIdAtom, current ? store.get(callUiAtom).roomId : null);
    setSession(null);
    resetUi();
    void current?.leave();
  }, [setSession, resetUi, store]);

  const leavingRoomId = useAtomValue(leavingCallRoomIdAtom);
  useEffect(() => {
    if (!leavingRoomId) return;
    const timer = setTimeout(
      () => store.set(leavingCallRoomIdAtom, null),
      LEAVE_CONFIRM_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [leavingRoomId, store]);

  const run = useCallback(
    (action: (s: CallMedia, snap: CallSnapshot) => Promise<void>) => {
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
        // Until joined the snapshot has no microphone yet; the preferences say what join will do
        const joined = snap.phase === 'joined';
        const enable = joined
          ? !snap.microphone
          : store.get(micMutedAtom) || store.get(deafenedAtom);
        store.set(micMutedAtom, !enable);
        if (enable) store.set(deafenedAtom, false); // unmuting undeafens
        if (!joined)
          setUi((prev) => ({ ...prev, isMuted: !enable, isDeafened: !enable && prev.isDeafened }));
        return s.setMicrophone(enable);
      }),
    [run, store, setUi]
  );
  const toggleDeafen = useCallback(
    () =>
      run(async (s, snap) => {
        const joined = snap.phase === 'joined';
        const deafen = !(joined ? snap.deafened : store.get(deafenedAtom));
        store.set(deafenedAtom, deafen);
        if (!joined) {
          const muted = deafen || store.get(micMutedAtom);
          setUi((prev) => ({ ...prev, isMuted: muted, isDeafened: deafen }));
        }
        await s.setDeafened(deafen);
        if (!deafen && !store.get(micMutedAtom)) await s.setMicrophone(true);
      }),
    [run, store, setUi]
  );
  const toggleVideo = useCallback(() => run((s, snap) => s.setCamera(!snap.camera)), [run]);
  const toggleScreenshare = useCallback(
    () => run((s, snap) => s.setScreenShare(!snap.screenshare)),
    [run]
  );
  const setSpotlight = useCallback(
    (spotlight: boolean) => setUi((prev) => ({ ...prev, isSpotlight: spotlight })),
    [setUi]
  );
  const setPresentation = useCallback(
    (presentation: CallPresentation) => setUi((prev) => ({ ...prev, presentation })),
    [setUi]
  );

  usePushToTalk(session ? setTransmitting : null);
  useScreenWakeLock(!!session);

  // A change in Settings > Voice & Audio reaches the microphone of the running call
  const noiseSuppression = useAtomValue(noiseSuppressionAtom);
  const echoCancellation = useAtomValue(echoCancellationAtom);
  const autoGainControl = useAtomValue(autoGainControlAtom);
  useEffect(() => {
    void session?.setAudioProcessing({ noiseSuppression, echoCancellation, autoGainControl });
  }, [session, noiseSuppression, echoCancellation, autoGainControl]);

  const roomId = useAtomValue(callUiAtom).roomId;
  useEffect(() => {
    if (roomId === null || currentRoomId === roomId) return;
    setUi((prev) =>
      prev.presentation === 'fullscreen' ? { ...prev, presentation: 'room' } : prev
    );
  }, [roomId, currentRoomId, setUi]);

  // Coming back to the call's room docks a call that was minimised (by hand, or by following you
  // out of the room) back in.
  const previousRoomIdRef = useRef(currentRoomId);
  useEffect(() => {
    const previous = previousRoomIdRef.current;
    previousRoomIdRef.current = currentRoomId;
    if (roomId === null || currentRoomId !== roomId || previous === roomId) return;
    setUi((prev) => (prev.presentation === 'tile' ? { ...prev, presentation: 'room' } : prev));
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

  return <AloneNotice session={session} onLeave={hangup} />;
}
