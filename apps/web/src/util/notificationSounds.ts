import { isVoiceSoundEnabled } from '@/app/features/voice/voiceSounds';
/**
 * Sound packs: a set of sounds for messages, calls and voice rooms. The files live in
 * `packages/sounds/raw` (flat, shared with the native apps) and are served at /assets/sounds/.
 * A pack that lacks a sound uses the app's own (voice sounds) or the default pack's (calls).
 */
export type NotificationSoundKind = 'message' | 'mention' | 'ring' | 'ringback' | 'callend';
export type VoiceSoundKind =
  | 'mute'
  | 'unmute'
  | 'camera-on'
  | 'camera-off'
  | 'join'
  | 'leave'
  | 'moved'
  | 'watch-together-start';
export type SoundKind = NotificationSoundKind | VoiceSoundKind;

/** Pack groups, in the order the picker lists them. */
export const SOUND_PACK_CATEGORIES = ['mudrix', 'clients'] as const;
export type SoundPackCategory = (typeof SOUND_PACK_CATEGORIES)[number];

export interface SoundPack {
  id: string;
  name: string;
  /** Where the pack is listed in the picker. */
  category: SoundPackCategory;
  /** Sound kind to file name in packages/sounds/raw; a kind left out falls back (see below). */
  files: Partial<Record<SoundKind, string>> & { message: string };
}

export const SOUND_KINDS: readonly SoundKind[] = [
  'message',
  'mention',
  'ring',
  'ringback',
  'callend',
  'mute',
  'unmute',
  'camera-on',
  'camera-off',
  'join',
  'leave',
  'moved',
  'watch-together-start',
];

/** Sounds the picker lists: every kind that something in the app plays. */
export const PLAYED_SOUND_KINDS: readonly SoundKind[] = SOUND_KINDS;

/** Kinds the "Notification sounds" switch silences; the rest are feedback for what you just did. */
const GATED_KINDS: ReadonlySet<SoundKind> = new Set([
  'message',
  'mention',
  'ring',
  'ringback',
  'callend',
  'join',
  'leave',
]);

export const DEFAULT_SOUND_PACK = 'megadrive2';

const fileKind = (kind: SoundKind) => kind.replace(/-/g, '_');

/** A pack made for Mudrix: every sound, ring and ringback as WAV (they loop), the rest MP3. */
function mudrixPack(id: string, name: string): SoundPack {
  const files: Partial<Record<SoundKind, string>> = {};
  for (const kind of SOUND_KINDS) {
    const ext = kind === 'ring' || kind === 'ringback' ? 'wav' : 'mp3';
    files[kind] = `snd_${id}_${fileKind(kind)}.${ext}`;
  }
  return { id, name, category: 'mudrix', files: files as SoundPack['files'] };
}

/** A pack copied from another client: only the sounds it has. */
function clientPack(id: string, name: string, files: Record<string, string>): SoundPack {
  const out: Partial<Record<SoundKind, string>> = {};
  for (const [kind, file] of Object.entries(files)) {
    out[kind as SoundKind] =
      file === 'alert.wav' ? file : `snd_${id}_${fileKind(kind as SoundKind)}.${file}`;
  }
  return { id, name, category: 'clients', files: out as SoundPack['files'] };
}

export const SOUND_PACKS: readonly SoundPack[] = [
  mudrixPack('bloop', 'Bloop'),
  mudrixPack('glass', 'Glass'),
  mudrixPack('warm', 'Warm'),
  mudrixPack('megadrive', 'Slap'),
  mudrixPack('nes', 'Overworld'),
  mudrixPack('megadrive2', 'Velvet'),
  mudrixPack('nes2', 'Shuffle'),
  mudrixPack('sms', 'Chirp'),
  // The base's own alert is the message sound of the WizardChat pack
  clientPack('wizardchat', 'WizardChat', { message: 'alert.wav' }),
  clientPack('element', 'Element', {
    message: 'mp3',
    ring: 'mp3',
    ringback: 'mp3',
    callend: 'mp3',
  }),
  clientPack('cinny', 'Cinny', { message: 'ogg', mention: 'ogg' }),
  clientPack('fluffychat', 'FluffyChat', {
    message: 'mp3',
    mention: 'mp3',
    ring: 'mp3',
    callend: 'mp3',
  }),
  clientPack('commet', 'Commet', { message: 'ogg', callend: 'ogg' }),
  clientPack('lightning', 'Lightning', { message: 'wav', mention: 'wav' }),
];

export interface NotificationSoundSettings {
  /** Whether the "Notification sounds" switch is on. */
  enabled: boolean;
  /** Pack id used for sounds without an override. */
  pack: string;
  /** Per-sound pack id or 'off'; a missing kind follows `pack`. */
  overrides: Partial<Record<SoundKind, string>>;
  /** 0-100 */
  volume: number;
}

/** The packs as picker options, grouped under `groupLabel(category)` in category order. */
export function soundPackOptions(groupLabel: (category: SoundPackCategory) => string) {
  return SOUND_PACK_CATEGORIES.flatMap((category) =>
    SOUND_PACKS.filter((p) => p.category === category).map((p) => ({
      value: p.id,
      label: p.name,
      group: groupLabel(category),
    }))
  );
}

/** A removed or unknown pack id (e.g. one saved by another version) reads as the default pack. */
export function getSoundPack(id: string | undefined): SoundPack {
  return (
    SOUND_PACKS.find((p) => p.id === id) ??
    SOUND_PACKS.find((p) => p.id === DEFAULT_SOUND_PACK) ??
    SOUND_PACKS[0]
  );
}

const soundUrl = (file: string) => `/assets/sounds/${file}`;

let outputDeviceId = '';
type SinkTarget = { setSinkId?: (id: string) => Promise<void> };

/** Send an audio element to the chosen speaker. Never throws. */
export function routeToOutput(audio: HTMLAudioElement): void {
  if (!outputDeviceId) return;
  try {
    (audio as unknown as SinkTarget).setSinkId?.(outputDeviceId)?.catch(() => {});
  } catch {
    // unsupported
  }
}

/** Route the app's own sounds to a speaker; '' is the system default. */
export function setSoundOutputDevice(deviceId: string): void {
  outputDeviceId = deviceId;
  if (loopContext) applyContextSink(loopContext);
}

function applyContextSink(ctx: AudioContext): void {
  try {
    (ctx as unknown as SinkTarget).setSinkId?.(outputDeviceId)?.catch(() => {});
  } catch {
    // unsupported
  }
}

/** The app's own sounds, used when a pack does not replace a voice sound. */
const BUILTIN_VOICE_SOUNDS: Partial<Record<VoiceSoundKind, string>> = {
  mute: 'mute.wav',
  unmute: 'unmute.wav',
  'camera-on': 'camera_on.wav',
  'camera-off': 'camera_off.wav',
  join: 'call_join.wav',
  leave: 'call_leave.wav',
  'watch-together-start': 'watch_together_start.wav',
};

/**
 * URL of a sound for a pack. Messages and mentions fall back to the pack's message sound; call
 * sounds (a ringtone is no message sound) to the default pack's file; voice sounds to the app's own.
 */
export function getSoundUrl(packId: string | undefined, kind: SoundKind): string | null {
  const pack = getSoundPack(packId);
  const own = pack.files[kind];
  if (own) return soundUrl(own);
  if (kind === 'mention') return soundUrl(pack.files.message);
  if (kind === 'ring' || kind === 'ringback' || kind === 'callend') {
    const fallback = getSoundPack(DEFAULT_SOUND_PACK).files[kind];
    return fallback ? soundUrl(fallback) : null;
  }
  const builtin = BUILTIN_VOICE_SOUNDS[kind as VoiceSoundKind];
  return builtin ? soundUrl(builtin) : null;
}

/**
 * Pack that should play for a sound: its override if set, else the main pack. null means the
 * sound is off.
 */
export function resolveSoundPack(
  kind: SoundKind,
  mainPack: string,
  overrides: Partial<Record<SoundKind, string>>
): string | null {
  const chosen = overrides[kind];
  if (chosen === 'off') return null;
  // An override naming a removed pack counts as unset, and a removed main pack reads as the default.
  const override = SOUND_PACKS.some((p) => p.id === chosen) ? chosen : undefined;
  return getSoundPack(override ?? mainPack).id;
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(100, Math.max(0, volume)) / 100;
}

/** Volume of the sounds that answer something you did (mute, joining, ...), whatever the slider says. */
const FEEDBACK_VOLUME = 0.5;

const KINDS_AT_SLIDER_VOLUME: ReadonlySet<SoundKind> = new Set([
  'message',
  'mention',
  'ring',
  'ringback',
  'callend',
]);

let active: NotificationSoundSettings = {
  enabled: true,
  pack: DEFAULT_SOUND_PACK,
  overrides: {},
  volume: 70,
};

/** The settings the sounds played from code (calls, voice) follow; kept current by a hook. */
export function setActiveSoundSettings(settings: NotificationSoundSettings): void {
  active = settings;
}

function kindVolume(kind: SoundKind, volume: number): number {
  return KINDS_AT_SLIDER_VOLUME.has(kind) ? clampVolume(volume) : FEEDBACK_VOLUME;
}

function playUrl(url: string, volume: number): void {
  try {
    const audio = new Audio(url);
    audio.volume = volume;
    routeToOutput(audio);
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

/** The URL and volume a sound would play with now, or null when it is off. */
function activeSound(kind: SoundKind): { url: string; volume: number } | null {
  if (GATED_KINDS.has(kind) && !active.enabled) return null;
  // The per-sound switches in Settings > Voice & Video
  if (!isVoiceSoundEnabled(kind)) return null;
  const pack = resolveSoundPack(kind, active.pack, active.overrides);
  if (!pack) return null;
  const url = getSoundUrl(pack, kind);
  return url ? { url, volume: kindVolume(kind, active.volume) } : null;
}

let current: HTMLAudioElement | null = null;

/** Play the notification sound for an incoming message (a mention, DM or invite is `priority`). */
export function playNotificationSoundFor(priority: boolean): void {
  const sound = activeSound(priority ? 'mention' : 'message');
  if (!sound) return;
  try {
    current?.pause();
    const audio = new Audio(sound.url);
    audio.volume = sound.volume;
    routeToOutput(audio);
    current = audio;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

/** Play a call or voice sound once, as the settings say. Own audio element, so messages do not cut it. */
export function playSoundKind(kind: SoundKind): void {
  const sound = activeSound(kind);
  if (sound) playUrl(sound.url, sound.volume);
}

/** Play any sound of any pack once (settings preview). Ring and ringback play a single pass. */
export function previewSound(kind: SoundKind, packId: string, volume: number): void {
  const url = getSoundUrl(packId, kind);
  if (url) playUrl(url, kindVolume(kind, volume));
}

/**
 * Loop a call sound (ring / ringback) until the returned stop function is called; null when it is
 * off. Web Audio rather than <audio loop>: an element pauses for a moment every time it wraps
 * round, and a buffer source loops on the exact sample.
 */
export function loopSoundKind(kind: 'ring' | 'ringback'): (() => void) | null {
  const sound = activeSound(kind);
  if (!sound) return null;
  const { url, volume } = sound;
  const ctx = getLoopContext();
  if (!ctx) return startElementLoop(url, volume);

  let stopped = false;
  let source: AudioBufferSourceNode | null = null;
  let fallbackStop: (() => void) | null = null;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(ctx.destination);
  ctx.resume().catch(() => {});
  loadLoopBuffer(ctx, url).then(
    (buffer) => {
      if (stopped) return;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
    },
    () => {
      if (!stopped) fallbackStop = startElementLoop(url, volume);
    }
  );
  return () => {
    stopped = true;
    try {
      source?.stop();
    } catch {
      // never started
    }
    source?.disconnect();
    gain.disconnect();
    fallbackStop?.();
  };
}

let loopContext: AudioContext | null = null;
const loopBuffers = new Map<string, Promise<AudioBuffer>>();

function getLoopContext(): AudioContext | null {
  if (loopContext) return loopContext;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    loopContext = new Ctor();
  } catch {
    return null;
  }
  if (outputDeviceId) applyContextSink(loopContext);
  return loopContext;
}

function loadLoopBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  let pending = loopBuffers.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    // A failed load is not remembered, so the next ring tries again.
    pending.catch(() => loopBuffers.delete(url));
    loopBuffers.set(url, pending);
  }
  return pending;
}

function startElementLoop(url: string, volume: number): () => void {
  let audio: HTMLAudioElement | null = null;
  try {
    audio = new Audio(url);
    audio.loop = true;
    audio.volume = volume;
    routeToOutput(audio);
    audio.play().catch(() => {});
  } catch {
    audio = null;
  }
  return () => {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  };
}
