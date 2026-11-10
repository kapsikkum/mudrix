import { STORAGE_KEY_PREFERENCES } from '@/const/storageKeys';

/**
 * Call sounds the sound packs do not replace (those are in util/notificationSounds). They are
 * the app's own and play at a fixed volume.
 */
const SOUND_MAP = {
  deafen: '/assets/sounds/deafen.wav',
  undeafen: '/assets/sounds/undeafen.wav',
  'raise-hand': '/assets/sounds/raise_hand.wav',
  'screenshare-start': '/assets/sounds/screenshare_start.wav',
  'screenshare-stop': '/assets/sounds/screenshare_stop.wav',
  reaction: '/assets/sounds/reaction.wav',
  'call-declined': '/assets/sounds/call_declined.wav',
  'call-no-answer': '/assets/sounds/call_no_answer.wav',
} as const;

export type VoiceSound = keyof typeof SOUND_MAP;

export const VOICE_SOUND_TOGGLES = {
  mute: ['mute', 'unmute'],
  deafen: ['deafen', 'undeafen'],
  camera: ['camera-on', 'camera-off'],
  screenshare: ['screenshare-start', 'screenshare-stop'],
  join: ['call-join', 'join'],
  leave: ['call-leave', 'leave'],
  ringtone: ['ringtone', 'ring'],
  ringback: ['ringback'],
  callEnded: ['call-declined', 'call-no-answer', 'callend'],
  raiseHand: ['raise-hand'],
  reaction: ['reaction'],
  watchTogether: ['watch-together-start'],
} as const satisfies Record<string, readonly string[]>;

export type VoiceSoundToggle = keyof typeof VOICE_SOUND_TOGGLES;

// Covers both the fixed sounds here and the pack sounds in util/notificationSounds
const TOGGLE_OF = new Map<string, VoiceSoundToggle>(
  Object.entries(VOICE_SOUND_TOGGLES).flatMap(([toggle, sounds]) =>
    sounds.map((sound) => [sound, toggle as VoiceSoundToggle] as const)
  )
);

export function isVoiceSoundEnabled(type: string): boolean {
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
  if (!isVoiceSoundEnabled(type)) return;
  try {
    const audio = new Audio(SOUND_MAP[type]);
    audio.volume = VOLUME;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}
