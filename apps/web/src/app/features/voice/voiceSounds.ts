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

const VOLUME = 0.5;

export function playVoiceSound(type: VoiceSound): void {
  try {
    const audio = new Audio(SOUND_MAP[type]);
    audio.volume = VOLUME;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}
