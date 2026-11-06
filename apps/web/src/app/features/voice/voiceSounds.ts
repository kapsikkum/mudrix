import { STORAGE_KEY_PREFERENCES } from '@/const/storageKeys';

const SOUND_MAP = {
  mute: '/assets/sounds/mute.wav',
  unmute: '/assets/sounds/unmute.wav',
  deafen: '/assets/sounds/deafen.wav',
  undeafen: '/assets/sounds/undeafen.wav',
  'camera-on': '/assets/sounds/camera_on.wav',
  'camera-off': '/assets/sounds/camera_off.wav',
  alert: '/assets/sounds/alert.wav',
  'call-join': '/assets/sounds/call_join.wav',
  'call-leave': '/assets/sounds/call_leave.wav',
  'raise-hand': '/assets/sounds/raise_hand.wav',
  'screenshare-start': '/assets/sounds/screenshare_start.wav',
  'screenshare-stop': '/assets/sounds/screenshare_stop.wav',
  reaction: '/assets/sounds/reaction.wav',
  'call-declined': '/assets/sounds/call_declined.wav',
  'call-no-answer': '/assets/sounds/call_no_answer.wav',
  ringback: '/assets/sounds/ringback.wav',
  ringtone: '/assets/sounds/ringtone.wav',
  'watch-together-start': '/assets/sounds/watch_together_start.wav',
} as const;

export type VoiceSound = keyof typeof SOUND_MAP;

export const VOICE_SOUND_TOGGLES = {
  mute: ['mute', 'unmute'],
  deafen: ['deafen', 'undeafen'],
  camera: ['camera-on', 'camera-off'],
  screenshare: ['screenshare-start', 'screenshare-stop'],
  join: ['call-join'],
  leave: ['call-leave'],
  ringtone: ['ringtone'],
  ringback: ['ringback'],
  callEnded: ['call-declined', 'call-no-answer'],
  raiseHand: ['raise-hand'],
  reaction: ['reaction'],
  watchTogether: ['watch-together-start'],
} as const satisfies Record<string, readonly VoiceSound[]>;

export type VoiceSoundToggle = keyof typeof VOICE_SOUND_TOGGLES;

const TOGGLE_OF = new Map<VoiceSound, VoiceSoundToggle>(
  Object.entries(VOICE_SOUND_TOGGLES).flatMap(([toggle, sounds]) =>
    sounds.map((sound) => [sound, toggle as VoiceSoundToggle] as const)
  )
);

function isEnabled(type: VoiceSound): boolean {
  const toggle = TOGGLE_OF.get(type);
  if (!toggle) return true;
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}') as {
      voiceSounds?: Partial<Record<VoiceSoundToggle, boolean>>;
    };
    return prefs.voiceSounds?.[toggle] !== false;
  } catch {
    return true;
  }
}

const VOLUME = 0.5;

export function playVoiceSound(type: VoiceSound): void {
  if (!isEnabled(type)) return;
  try {
    const audio = new Audio(SOUND_MAP[type]);
    audio.volume = VOLUME;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

export function loopVoiceSound(type: VoiceSound): () => void {
  let audio: HTMLAudioElement | null = null;
  if (!isEnabled(type)) return () => {};
  try {
    audio = new Audio(SOUND_MAP[type]);
    audio.loop = true;
    audio.volume = VOLUME;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
  return () => {
    audio?.pause();
    audio = null;
  };
}
