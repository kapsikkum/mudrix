import { STORAGE_KEY_PREFERENCES } from '@/const/storageKeys';
import { publicUrl } from '@/util/publicUrl';
import { playSoundKind } from '@/util/notificationSounds';

/**
 * Sounds the sound packs do not replace (those are in util/notificationSounds): a call ending
 * without a connection has no pack file, so the app's own plays.
 */
const SOUND_MAP = {
  'call-declined': publicUrl('assets/sounds/call_declined.wav'),
  'call-no-answer': publicUrl('assets/sounds/call_no_answer.wav'),
} as const;

/**
 * Call and voice sounds a pack replaces. These play through the chosen pack (`playSoundKind`), so
 * the per-sound pack options and volume apply; a client pack falls back to the app's own file.
 */
const PACK_SOUNDS = {
  deafen: 'deafen',
  undeafen: 'undeafen',
  'raise-hand': 'raise-hand',
  'screenshare-start': 'screenshare-start',
  'screenshare-stop': 'screenshare-stop',
  reaction: 'reaction',
} as const;

type PackSound = keyof typeof PACK_SOUNDS;

export type VoiceSound = keyof typeof SOUND_MAP | PackSound;

const isPackSound = (type: VoiceSound): type is PackSound => type in PACK_SOUNDS;

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
  if (isPackSound(type)) {
    playSoundKind(PACK_SOUNDS[type]);
    return;
  }
  try {
    const audio = new Audio(SOUND_MAP[type]);
    audio.volume = VOLUME;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}
