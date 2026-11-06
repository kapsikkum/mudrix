/**
 * Soundboard data model.
 *
 * A soundboard press is sent to the call as `io.github.kapsikkum.mudrix.soundboard.play` (a Matrix
 * event in the call's room, and the same payload on the call's data channel). Every receiving
 * client plays the clip locally; it is never mixed into the sender's microphone, so each listener
 * can silence it separately from voice.
 */
import { mudrixKey } from '@/util/namespace';

/** Account data (personal board) and room state, state_key '' (room or space board). */
export const SOUNDBOARD_DATA_TYPE = mudrixKey('soundboard');
/** Room state, state_key '': `{ enabled, minPowerLevel }`. */
export const SOUNDBOARD_SETTINGS_TYPE = mudrixKey('soundboard.settings');
/** Event (and data channel topic) sent to the call when a clip is played. */
export const SOUNDBOARD_PLAY_EVENT_TYPE = mudrixKey('soundboard.play');

export const SOUNDBOARD_MAX_DURATION_MS = 5000;
export const SOUNDBOARD_MAX_SIZE_BYTES = 512 * 1024;
/** Most clips one board (personal, or one room/space) can hold. */
export const SOUNDBOARD_MAX_SOUNDS = 32;
export const SOUNDBOARD_MAX_NAME_LENGTH = 32;

/** Normalised mimetypes a clip may have. */
export const SOUNDBOARD_MIMETYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav'] as const;
export type SoundboardMimetype = (typeof SOUNDBOARD_MIMETYPES)[number];

/** Power level that "moderators only" means. */
export const SOUNDBOARD_MODERATOR_LEVEL = 50;

/** A custom clip: stored in account data (personal) or room state (room/space). */
export interface SoundboardSound {
  /** Unique within its board. */
  id: string;
  name: string;
  emoji?: string;
  /** mxc:// URI of the uploaded file. */
  url: string;
  mimetype: SoundboardMimetype;
  durationMs: number;
  size: number;
  /** 0..1, the clip's own gain. */
  volume: number;
}

/** A bundled clip (see `builtIn.ts`). */
export interface BuiltInSound {
  /** Also the id sent to other clients, which resolve it from their own copy. */
  id: string;
  name: string;
  emoji: string;
  /** File name in packages/sounds/raw (served at /assets/sounds/). */
  file: string;
  durationMs: number;
  license: string;
  author: string;
  sourceUrl: string;
}

export type SoundboardSource = 'builtIn' | 'personal' | 'room';

/**
 * One clip as the UI lists and plays it, whichever board it came from.
 * For built-in clips `url` is the bundled file's http URL, `size` is 0 and `volume` is 1.
 * For custom clips `url` is the mxc:// URI.
 */
export interface SoundboardClip extends Omit<SoundboardSound, 'emoji' | 'mimetype'> {
  emoji?: string;
  mimetype: SoundboardMimetype;
  source: SoundboardSource;
  /** For 'room' clips: the room or space whose board holds the clip (needed to edit or remove it). */
  originRoomId?: string;
  /** Built-in clips only: credit shown in the UI. */
  license?: string;
  author?: string;
  sourceUrl?: string;
}

/** Content of a `io.github.kapsikkum.mudrix.soundboard.play` event. */
export interface SoundboardPlayContent {
  sound: {
    id: string;
    name: string;
    emoji?: string;
    /** 0..1 */
    volume: number;
    /** True for a bundled clip: receivers resolve it from their own catalogue by `id`. */
    builtin?: boolean;
    /** mxc:// URI, for custom clips. */
    url?: string;
    mimetype?: string;
    durationMs?: number;
  };
}

/** Room/space `io.github.kapsikkum.mudrix.soundboard.settings` state. */
export interface SoundboardRoomSettings {
  enabled: boolean;
  /** 0 = everyone, 50 = moderators and up. */
  minPowerLevel: number;
}

export const DEFAULT_SOUNDBOARD_ROOM_SETTINGS: SoundboardRoomSettings = {
  enabled: true,
  minPowerLevel: 0,
};

export type SoundboardErrorCode =
  'type' | 'size' | 'duration' | 'decode' | 'limit' | 'forbidden' | 'upload' | 'save' | 'offline';

/** Thrown by add/edit/remove; `code` maps to `soundboard.error.<code>` in the locale files. */
export class SoundboardError extends Error {
  readonly code: SoundboardErrorCode;

  constructor(code: SoundboardErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'SoundboardError';
    this.code = code;
  }
}

/** Why `playSoundboard` did not play (or 'ok'). */
export type PlaySoundboardResult =
  | 'ok'
  | 'disabled'
  | 'not-in-call'
  | 'room-disabled'
  | 'forbidden'
  | 'rate-limited'
  | 'cooldown'
  | 'error';
