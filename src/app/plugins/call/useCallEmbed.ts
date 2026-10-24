import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { CallEmbed, type ElementCallThemeKind } from './index';
import { CallControlState } from './CallControlState';
import {
  callRtcOverrideDomainAtom,
  elementCallEmbedAtom,
  elementCallUiAtom,
} from '@/app/store/atoms/elementCall';
import type { ElementCallPresentation } from '@/app/store/atoms/elementCall';
import { themeAtom, deafenedAtom, micMutedAtom, type ThemeName } from '@/app/store/atoms/settings';
import { isDmRoom } from '@/util/matrix';
import { fetchMatrixRtcSupport } from '@/util/serverCapabilities';
import { useClientWidgetApiEvent } from './useClientWidgetApiEvent';
import { leaveCallEmbed } from './disposeAfterLeave';
import { useToast } from '@/app/hooks/useToast';
import { useTranslation } from 'react-i18next';
import { useElementCallContainer } from './CallEmbedProvider';
import { LIGHT_THEMES } from '@/theme/themeTokens';
import { playVoiceSound } from '@/app/features/voice/voiceSounds';

// The standard MatrixRTC slot used for room-wide calls
export const CALL_SLOT_DESCRIPTION = { application: 'm.call', id: 'ROOM' } as const;

export function getElementCallThemeKind(themeName: ThemeName): ElementCallThemeKind {
  return LIGHT_THEMES.has(themeName) ? 'light' : 'dark';
}

export async function hasOngoingCall(mx: MatrixClient, room: Room): Promise<boolean> {
  try {
    const memberships = await MatrixRTCSession.sessionMembershipsForSlot(
      room,
      CALL_SLOT_DESCRIPTION
    );
    const myId = mx.getUserId();
    return memberships.some((m) => m.userId !== myId);
  } catch {
    return false;
  }
}

export async function createCallEmbed(
  mx: MatrixClient,
  room: Room,
  opts: {
    voiceOnly?: boolean;
    themeKind: ElementCallThemeKind;
    container: HTMLElement;
    initialControlState?: CallControlState;
  }
): Promise<CallEmbed> {
  const ongoing = await hasOngoingCall(mx, room);
  const intent = CallEmbed.getIntent(isDmRoom(room, mx), ongoing, opts.voiceOnly);
  const widget = CallEmbed.getWidget(mx, room, intent, opts.themeKind);
  const controlState = opts.initialControlState ?? new CallControlState(true, false, true);

  return new CallEmbed(mx, room, widget, opts.container, controlState);
}

export function useStartElementCall() {
  const { t } = useTranslation();
  const theme = useAtomValue(themeAtom);
  const micMuted = useAtomValue(micMutedAtom);
  const deafened = useAtomValue(deafenedAtom);
  const overrideDomain = useAtomValue(callRtcOverrideDomainAtom);
  const setEmbed = useSetAtom(elementCallEmbedAtom);
  const setUi = useSetAtom(elementCallUiAtom);
  const setOverrideDomain = useSetAtom(callRtcOverrideDomainAtom);
  const toast = useToast();
  const { getContainer } = useElementCallContainer();

  const startCall = useCallback(
    async (
      room: Room,
      opts: { voiceOnly?: boolean; presentation?: ElementCallPresentation } = {}
    ) => {
      const runStart = async (): Promise<CallEmbed | undefined> => {
        const container = getContainer();
        if (!container) {
          toast.error(t('elementCall.embedUnavailable'));
          return undefined;
        }
        const presentation = opts.presentation ?? 'room';

        let toReplace: CallEmbed | null = null;
        setEmbed((prev) => {
          if (prev) {
            toReplace = prev;
            prev.iframe.style.display = 'none';
          }
          return null;
        });

        if (toReplace) {
          setUi((prev) => ({
            ...prev,
            roomId: null,
            phase: 'idle',
            incoming: null,
            presentation,
          }));
          await leaveCallEmbed(toReplace);
        } else {
          setUi((prev) => ({ ...prev, incoming: null, presentation }));
        }

        try {
          const embed = await createCallEmbed(room.client, room, {
            voiceOnly: opts.voiceOnly,
            themeKind: getElementCallThemeKind(theme),
            container,
            initialControlState: new CallControlState(!micMuted && !deafened, false, !deafened),
          });
          setEmbed(embed);
          setUi((prev) => ({
            ...prev,
            roomId: room.roomId,
            phase: 'joining',
            voiceOnly: !!opts.voiceOnly,
            isMuted: micMuted || deafened,
            isDeafened: deafened,
            isVideoMuted: true,
            isScreenSharing: false,
            isSpotlight: true,
            presentation,
          }));
          return embed;
        } catch (err) {
          toast.error(
            t('elementCall.startFailed', {
              error: err instanceof Error ? err.message : t('common.unknownError'),
            })
          );
          return undefined;
        }
      };

      const client = room.client;
      const domain = client.getDomain();
      if (overrideDomain !== domain && !(await fetchMatrixRtcSupport(client))) {
        toast.error(t('elementCall.homeserverUnsupported'), {
          duration: 10000,
          actionLabel: t('elementCall.tryAnyway'),
          onClick: () => {
            if (domain) setOverrideDomain(domain);
            void runStart();
          },
        });
        return undefined;
      }

      return runStart();
    },
    [
      theme,
      micMuted,
      deafened,
      overrideDomain,
      setEmbed,
      setUi,
      setOverrideDomain,
      toast,
      t,
      getContainer,
    ]
  );

  return startCall;
}

export function useElementCallJoined(embed: CallEmbed | null): boolean {
  const [joined, setJoined] = useState(false);
  const setUi = useSetAtom(elementCallUiAtom);

  useClientWidgetApiEvent(
    embed?.call,
    `action:io.element.join`,
    useCallback(() => {
      setJoined(true);
      setUi((prev) => ({ ...prev, phase: 'joined' }));
    }, [setJoined, setUi])
  );

  useEffect(() => {
    if (!embed) {
      setJoined(false);
    }
  }, [embed]);

  return joined;
}

export function useElementCallHangup(embed: CallEmbed | null) {
  const setEmbed = useSetAtom(elementCallEmbedAtom);
  const setUi = useSetAtom(elementCallUiAtom);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leftRef = useRef(false);

  const embedRef = useRef(embed);
  useEffect(() => {
    embedRef.current = embed;
  }, [embed]);

  const clearFallback = useCallback(() => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  const resetUi = useCallback(() => {
    setUi((prev) => ({
      ...prev,
      roomId: null,
      phase: 'idle',
      presentation: 'hidden',
      isMuted: false,
      isDeafened: false,
      isVideoMuted: false,
      isScreenSharing: false,
      isSpotlight: true,
    }));
  }, [setUi]);

  const teardown = useCallback(() => {
    const isCurrent = embedRef.current === embed;
    if (isCurrent && leftRef.current) return;
    clearFallback();
    if (isCurrent) {
      leftRef.current = true;
    }
    embed?.dispose();
    if (isCurrent) {
      setEmbed(null);
      resetUi();
    }
  }, [embed, setEmbed, resetUi, clearFallback]);

  useEffect(() => {
    leftRef.current = false;
    clearFallback();
  }, [embed, clearFallback]);

  const hangup = useCallback(() => {
    if (leftRef.current) return;
    if (!embed) {
      resetUi();
      return;
    }
    embed.hangup();
    resetUi();
    clearFallback();
    fallbackRef.current = setTimeout(() => {
      fallbackRef.current = null;
      teardown();
    }, 10000);
  }, [embed, clearFallback, teardown, resetUi]);

  useClientWidgetApiEvent(
    embed?.call,
    `action:im.vector.hangup`,
    useCallback(() => {
      clearFallback();
      fallbackRef.current = setTimeout(() => {
        fallbackRef.current = null;
        teardown();
      }, 10000);
    }, [clearFallback, teardown])
  );

  useClientWidgetApiEvent(
    embed?.call,
    `action:io.element.close`,
    useCallback(() => {
      teardown();
    }, [teardown])
  );

  useEffect(() => clearFallback, [clearFallback]);

  return hangup;
}

export function useElementCallControls(embed: CallEmbed | null) {
  const setUi = useSetAtom(elementCallUiAtom);
  const prevMicRef = useRef<boolean | null>(null);
  const prevVideoRef = useRef<boolean | null>(null);

  useEffect(() => {
    prevMicRef.current = null;
    prevVideoRef.current = null;
    if (!embed) return;
    const unsub = embed.control.onState((state) => {
      if (prevMicRef.current !== null && prevMicRef.current !== state.microphone) {
        playVoiceSound(state.microphone ? 'unmute' : 'mute');
      }
      prevMicRef.current = state.microphone;
      if (prevVideoRef.current !== null && prevVideoRef.current !== state.video) {
        playVoiceSound(state.video ? 'camera-on' : 'camera-off');
      }
      prevVideoRef.current = state.video;
      setUi((prev) => ({
        ...prev,
        isMuted: !state.microphone,
        isDeafened: !state.sound,
        isVideoMuted: !state.video,
        isScreenSharing: state.screenshare,
        isSpotlight: state.spotlight,
      }));
    });
    return unsub;
  }, [embed, setUi]);

  const toggleMute = useCallback(() => {
    embed?.control.toggleMicrophone();
  }, [embed]);

  const toggleDeafen = useCallback(() => {
    embed?.control.toggleSound();
  }, [embed]);

  const toggleVideo = useCallback(() => {
    embed?.control.toggleVideo();
  }, [embed]);

  const toggleScreenshare = useCallback(() => {
    embed?.control.toggleScreenshare();
  }, [embed]);

  const setSpotlight = useCallback(
    (spotlight: boolean) => {
      embed?.control.setSpotlight(spotlight);
    },
    [embed]
  );

  const openReactions = useCallback(() => {
    embed?.control.openReactions();
  }, [embed]);

  const openSettings = useCallback(() => {
    embed?.control.openSettings();
  }, [embed]);

  return {
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenshare,
    setSpotlight,
    openReactions,
    openSettings,
  };
}
