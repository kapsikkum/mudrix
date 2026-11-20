import { mudrixKey } from '@/util/namespace';

/**
 * The call soundboard's wire format (MSC4577) and the player for the clips it carries.
 *
 * A press is a data-channel packet on `moe.crafty.soundboard` with `{ url, shortcode, emoji }`;
 * everyone in the call plays the clip from its `mxc://` URL locally, so each listener can silence
 * it separately from voice. Pack contents are not sent: rooms and people share packs as account
 * data and room state, and a press names only the clip.
 */
export const SOUNDBOARD_TOPIC = 'moe.crafty.soundboard';

/** Up to 26.12.4: Mudrix sent presses on this topic with a `{ sound: {...} }` payload. */
export const LEGACY_SOUNDBOARD_TOPIC = mudrixKey('soundboard.play');

/** The standard key for a clip's emoji, in a sound entry and in a press. */
export const SOUNDBOARD_EMOJI_KEY = 'org.wizardchat.emoji';

/** The shortest gap between two presses of one clip that the UI allows itself. */
export const SOUNDBOARD_COOLDOWN_MS = 1500;

const SOUNDBOARD_EMOJI: Record<string, string> = {
  applause: '👏',
  laugh: '😂',
  rimshot: '🥁',
  drumroll: '🪘',
  tada: '🎉',
  airhorn: '📯',
  crickets: '🦗',
  sad_trombone: '🎺',
};

const MAX_MESSAGE_BYTES = 1024;
const MAX_SHORTCODE_BYTES = 100;
const MAX_EMOJI_BYTES = 32;
const MAX_DURATION_S = 15;
const MIN_INTERVAL_MS = 400;
const MAX_PLAYING = 3;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesOf(text: string): number {
  return encoder.encode(text).byteLength;
}

/** The emoji to show for a press: the sender's, else the built-in one for the shortcode. */
export function soundboardEmoji(shortcode: string | undefined, emoji?: string | null): string {
  return emoji || (shortcode && SOUNDBOARD_EMOJI[shortcode]) || '🔊';
}

/** A press as the standard topic carries it. */
export interface SoundboardPlay {
  url: string;
  shortcode?: string;
  emoji?: string;
}

/** A press as Mudrix up to 26.12.4 sent it (on its own topic, data channel only). */
export interface LegacySoundboardPlay {
  url?: string;
  shortcode?: string;
  name?: string;
  emoji?: string;
  mimetype?: string;
  durationMs?: number;
  volume?: number;
}

/** The standard packet for a press; `emoji` is left out when there is none. */
export function soundboardPayload(
  url: string,
  shortcode: string,
  emoji?: string | null
): Record<string, unknown> {
  return { url, shortcode, ...(emoji ? { [SOUNDBOARD_EMOJI_KEY]: emoji } : {}) };
}

/**
 * The old Mudrix packet for a press. Old clients require `sound.id`, `sound.name` and either
 * `sound.builtin` or an `mxc://` `sound.url` with a mimetype; built-ins are sent by URL too, so a
 * receiver that does not know this shortcode still plays the right clip.
 */
export function legacySoundboardPayload(
  play: SoundboardPlay & {
    name?: string;
    mimetype?: string;
    durationMs?: number;
    volume?: number;
  }
): { sound: Record<string, unknown> } {
  return {
    sound: {
      id: play.shortcode || play.url,
      name: play.name || play.shortcode || 'Sound',
      volume: typeof play.volume === 'number' ? Math.min(1, Math.max(0, play.volume)) : 1,
      ...(play.emoji ? { emoji: play.emoji } : {}),
      url: play.url,
      mimetype: play.mimetype || 'audio/mpeg',
      ...(play.durationMs && play.durationMs > 0 ? { durationMs: play.durationMs } : {}),
    },
  };
}

/** Reads a standard press; anything oversized, malformed or without an mxc URL is null. */
export function parseSoundboardPlay(data: Uint8Array): SoundboardPlay | null {
  if (data.byteLength > MAX_MESSAGE_BYTES) return null;
  try {
    const value = JSON.parse(decoder.decode(data)) as Record<string, unknown> | null;
    const url = value?.url;
    if (typeof url !== 'string' || !url.startsWith('mxc://')) return null;
    const shortcode = value?.shortcode;
    const emoji = value?.[SOUNDBOARD_EMOJI_KEY];
    return {
      emoji: typeof emoji === 'string' && bytesOf(emoji) <= MAX_EMOJI_BYTES ? emoji : undefined,
      url,
      shortcode:
        typeof shortcode === 'string' && bytesOf(shortcode) <= MAX_SHORTCODE_BYTES
          ? shortcode
          : undefined,
    };
  } catch {
    return null;
  }
}

/** Reads the useful fields of an old press, for deduplicating it against the standard topic. */
export function legacyPlayFromPayload(payload: unknown): LegacySoundboardPlay | null {
  if (!payload || typeof payload !== 'object') return null;
  const sound = (payload as { sound?: unknown }).sound;
  if (!sound || typeof sound !== 'object') return null;
  const value = sound as Record<string, unknown>;
  const text = (key: string, limit: number) => {
    const field = value[key];
    return typeof field === 'string' && bytesOf(field) <= limit ? field : undefined;
  };
  const url =
    typeof value.url === 'string' && value.url.startsWith('mxc://') ? value.url : undefined;
  const duration = value.durationMs;
  return {
    url,
    shortcode: text('id', MAX_SHORTCODE_BYTES),
    name: text('name', 256),
    emoji: text('emoji', MAX_EMOJI_BYTES),
    mimetype: text('mimetype', 128),
    durationMs:
      typeof duration === 'number' && Number.isFinite(duration)
        ? Math.min(Math.max(duration, 0), MAX_DURATION_S * 1000)
        : undefined,
  };
}

type AudioWithSink = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

/**
 * Downloads, caches and plays soundboard clips for one call. The same clip is fetched once and kept
 * as an object URL; a sender can have at most `MAX_PLAYING` clips at a time, plays are spaced out,
 * and a clip that runs longer than the standard's 15 seconds is cut off.
 */
export class SoundboardPlayer {
  private readonly fetchSound: (url: string) => Promise<Uint8Array>;
  private sources = new Map<string, Promise<string>>();
  private lastPlayed = new Map<string, number>();
  private playing = new Map<string, Set<HTMLAudioElement>>();
  private ends = new Map<HTMLAudioElement, () => void>();
  private disposed = false;

  constructor(fetchSound: (url: string) => Promise<Uint8Array>) {
    this.fetchSound = fetchSound;
  }

  private source(url: string): Promise<string> {
    let source = this.sources.get(url);
    if (!source) {
      source = this.fetchSound(url).then((data) =>
        URL.createObjectURL(new Blob([data as BlobPart]))
      );
      source.catch(() => this.sources.delete(url));
      this.sources.set(url, source);
    }
    return source;
  }

  prefetch(url: string) {
    if (this.disposed) return;
    void this.source(url).catch(() => {});
  }

  async play(
    url: string,
    sender: string,
    volume: number,
    sinkId: string | undefined,
    events: { onStart: () => void; onEnd: () => void }
  ) {
    if (this.disposed) return;
    const now = Date.now();
    if (now - (this.lastPlayed.get(sender) ?? 0) < MIN_INTERVAL_MS) return;
    const playing = this.playing.get(sender) ?? new Set<HTMLAudioElement>();
    if (playing.size >= MAX_PLAYING) return;
    this.lastPlayed.set(sender, now);
    let audio: AudioWithSink;
    try {
      audio = new Audio(await this.source(url));
    } catch {
      return;
    }
    if (this.disposed) return;
    audio.volume = Math.min(Math.max(volume, 0), 1);
    let ended = false;
    const done = () => {
      audio.pause();
      playing.delete(audio);
      this.ends.delete(audio);
      if (!playing.size) this.playing.delete(sender);
      if (ended) return;
      ended = true;
      events.onEnd();
    };
    this.ends.set(audio, done);
    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration > MAX_DURATION_S) done();
    });
    playing.add(audio);
    this.playing.set(sender, playing);
    if (sinkId && audio.setSinkId) await audio.setSinkId(sinkId).catch(() => {});
    await audio.play().then(() => {
      if (!ended) events.onStart();
    }, done);
  }

  /** Stops every clip now (deafened, the soundboard was turned off, the call ended). */
  stopAll() {
    for (const end of [...this.ends.values()]) end();
    this.playing.clear();
    this.lastPlayed.clear();
  }

  dispose() {
    this.disposed = true;
    this.stopAll();
    for (const source of this.sources.values()) void source.then(URL.revokeObjectURL, () => {});
    this.sources.clear();
  }
}
