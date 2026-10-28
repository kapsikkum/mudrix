export interface MediaTrackHandle {
  readonly sid?: string;
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element: HTMLMediaElement): HTMLMediaElement;
}

export type CallPhase = 'idle' | 'joining' | 'joined' | 'left' | 'error';

export type CallErrorKind = 'no-sfu' | 'auth' | 'connection' | 'membership' | 'unknown';

export interface LocalMediaState {
  microphone: boolean;
  camera: boolean;
  sound: boolean;
  screenshare: boolean;
}

export interface CallParticipant {
  id: string;
  userId: string;
  deviceId: string;
  isLocal: boolean;
  connected: boolean;
  speaking: boolean;
  audioMuted: boolean;
  cameraTrack: MediaTrackHandle | null;
  cameraShared: boolean;
  cameraHidden: boolean;
  screenTrack: MediaTrackHandle | null;
  screenShared: boolean;
  watchingScreen: boolean;
  screenAudio: boolean;
  streamVolume: number;
  handRaised: boolean;
  reaction: string | null;
  volume: number;
  locallyMuted: boolean;
}

export type RingState = 'ringing' | 'declined' | 'unanswered';

export interface CallSnapshot {
  phase: CallPhase;
  error: { kind: CallErrorKind; message: string } | null;
  roomId: string | null;
  encrypted: boolean;
  local: LocalMediaState;
  participants: CallParticipant[];
  ring: RingState | null;
  reconnecting: boolean;
}

export type CallDataListener = (topic: string, payload: unknown, from: string) => void;

export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

export type PreferredDevices = Partial<Record<DeviceKind, string>>;

export interface JoinOptions {
  voiceOnly: boolean;
  devices?: PreferredDevices;
  inputVolume?: number;
  outputVolume?: number;
  pushToTalk?: boolean;
  micEnabled: boolean;
  deafened: boolean;
  callIntent?: 'audio' | 'video';
  notificationType?: 'ring' | 'notification';
  encrypt?: boolean;
}
