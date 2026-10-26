import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { Room } from 'matrix-js-sdk';
import type { CallSession, PreferredDevices } from 'wizardchat-rtc';
import {
  STORAGE_KEY_CALL_DEVICES,
  STORAGE_KEY_CALL_VOLUMES,
  STORAGE_KEY_SHARE_SCREEN_AUDIO,
  STORAGE_KEY_CALL_RTC_OVERRIDE,
  STORAGE_KEY_CALL_USER_AUDIO,
} from '@/const/storageKeys';
import { atomWithAccountStorage } from './accountStorage';
import { isVoiceRoom } from '@/util/matrix';
import { currentRoomIdAtom } from './rooms';
import { keybindsAtom, pushToTalkEnabledAtom } from './settings';

export type CallPhase = 'idle' | 'joining' | 'joined';

export type CallPresentation = 'hidden' | 'tile' | 'room' | 'fullscreen';

export type CallView = 'hidden' | 'docked' | 'tile' | 'fullscreen';

export interface IncomingCall {
  roomId: string;
  callerId: string;
  callerName: string;
  voiceOnly: boolean;
}

export interface CallUiState {
  roomId: string | null;
  phase: CallPhase;
  voiceOnly: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  isSpotlight: boolean;
  presentation: CallPresentation;
  incoming: IncomingCall | null;
}

export const CALL_INITIAL_STATE: CallUiState = {
  roomId: null,
  phase: 'idle',
  voiceOnly: false,
  isMuted: false,
  isDeafened: false,
  isVideoMuted: false,
  isScreenSharing: false,
  isSpotlight: true,
  presentation: 'hidden',
  incoming: null,
};

export const callUiAtom = atom<CallUiState>(CALL_INITIAL_STATE);

export const pendingCallRoomIdAtom = atom<string | null>(null);

// The running call (wizardchat-rtc engine)
export const callSessionAtom = atom<CallSession | null>(null);

export const callPanelAtom = atom<'reactions' | null>(null);

export const showNonVideoParticipantsAtom = atom(true);

export const showOwnScreenShareAtom = atom(true);

export interface CallUserAudio {
  volume: number;
  muted: boolean;
  streamVolume?: number;
}
export const callUserAudioAtom = atomWithAccountStorage<Record<string, CallUserAudio>>(
  STORAGE_KEY_CALL_USER_AUDIO,
  {}
);

export const callDevicesAtom = atomWithStorage<PreferredDevices>(STORAGE_KEY_CALL_DEVICES, {});

export interface CallVolumes {
  input: number;
  output: number;
}
export const callVolumesAtom = atomWithStorage<CallVolumes>(STORAGE_KEY_CALL_VOLUMES, {
  input: 1,
  output: 1,
});

export const shareScreenAudioAtom = atomWithStorage<boolean>(STORAGE_KEY_SHARE_SCREEN_AUDIO, true);

export const isInCallAtom = atom((get) => get(callUiAtom).roomId !== null);

export const callRoomIdAtom = atom((get) => get(callUiAtom).roomId);

export const callIsVoiceRoomAtom = atom((get) => {
  const room = get(callSessionAtom)?.matrixRoom;
  return !!room && isVoiceRoom(room);
});

export const callEffectiveViewAtom = atom<CallView>((get) => {
  const { roomId, presentation } = get(callUiAtom);
  if (roomId === null) return 'hidden';
  if (presentation === 'hidden') return 'hidden';
  if (presentation === 'tile') return 'tile';
  if (get(currentRoomIdAtom) !== roomId) return 'hidden';
  if (presentation === 'fullscreen') return 'fullscreen';
  return get(callIsVoiceRoomAtom) ? 'fullscreen' : 'docked';
});

export interface CallActions {
  start: (
    room: Room,
    opts?: { voiceOnly?: boolean; presentation?: CallPresentation }
  ) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  setMicrophone: (enabled: boolean) => void;
  toggleDeafen: () => void;
  toggleVideo: () => void;
  toggleScreenshare: () => void;
  setSpotlight: (spotlight: boolean) => void;
  openReactions: () => void;
  setPresentation: (presentation: CallPresentation) => void;
}

export const callActionsAtom = atom<CallActions | null>(null);

const sessionOverrideStorage = {
  getItem: (key: string, init: string | null) => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as string | null) : init;
    } catch {
      return init;
    }
  },
  setItem: (key: string, value: string | null) => {
    if (value === null) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  },
  removeItem: (key: string) => sessionStorage.removeItem(key),
};

export const callRtcOverrideDomainAtom = atomWithStorage<string | null>(
  STORAGE_KEY_CALL_RTC_OVERRIDE,
  null,
  sessionOverrideStorage
);

export interface CommandActions {
  placeCall?: (roomId: string) => Promise<void> | void;
  joinVoice?: (roomId: string) => Promise<void> | void;
  hangup?: () => void;
}

export const commandActionsAtom = atom<CommandActions | null>(null);

export const pushToTalkModeAtom = atom(
  (get) => get(pushToTalkEnabledAtom) && !!get(keybindsAtom).pushToTalk
);
export const pushToTalkHeldAtom = atom(false);
