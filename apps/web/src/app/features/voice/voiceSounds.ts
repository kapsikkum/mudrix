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

export function loopVoiceSound(type: VoiceSound): () => void {
  let audio: HTMLAudioElement | null = null;
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
