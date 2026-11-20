/**
 * Soundboard data model for the web.
 *
 * Packs live in the core: a person's sounds are account data, a room's or space's sounds are
 * `moe.crafty.room_soundboard` state events, and built-ins come from the core's own pack. A press
 * travels over the call as `{ url, shortcode, emoji }` on `moe.crafty.soundboard`; every receiving
 * client plays the clip locally, so it is never mixed into the sender's microphone and each
 * listener can silence it separately from voice.
 *
 * The old Mudrix event types below are still read and written for compatibility: room settings are
 * ours (`soundboard.settings`), and 26.12.4 clients still hear presses on `soundboard.play`.
 */
import { mudrixKey } from '@/util/namespace';

/** Room state, state_key '': `{ enabled, minPowerLevel }`. */
export const SOUNDBOARD_SETTINGS_TYPE = mudrixKey('soundboard.settings');
/** Where pre-MSC4577 Mudrix kept a room's board; the core migrates it and still reads it. */
export const SOUNDBOARD_DATA_TYPE = mudrixKey('soundboard');
/** The standard room pack state event. */
export const SOUNDBOARD_PACK_TYPE = 'moe.crafty.room_soundboard';
/** Event (and data channel topic) Mudrix up to 26.12.4 used for a press. */
export const SOUNDBOARD_PLAY_EVENT_TYPE = mudrixKey('soundboard.play');

export const SOUNDBOARD_MAX_DURATION_MS = 5000;
export const SOUNDBOARD_MAX_SIZE_BYTES = 512 * 1024;
/** Most clips one board (personal, or one room/space) can hold. */
export const SOUNDBOARD_MAX_SOUNDS = 32;
export const SOUNDBOARD_MAX_NAME_LENGTH = 32;

/**
 * Every format a clip may have. `ogg` only appears in clips made by older Mudrix versions; the
 * core's uploader accepts the others.
 */
export const SOUNDBOARD_MIMETYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
] as const;
export type SoundboardMimetype = (typeof SOUNDBOARD_MIMETYPES)[number];

/** Power level that "moderators only" means. */
export const SOUNDBOARD_MODERATOR_LEVEL = 50;

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
 * One clip as the UI lists and plays it, whichever pack it came from. `id` is the standard
 * shortcode, which is unique within its pack; `url` is the mxc:// URI of the uploaded file.
 */
export interface SoundboardClip {
  id: string;
  name: string;
  emoji?: string;
  /** mxc:// URI of the uploaded file (built-ins included). */
  url: string;
  mimetype: SoundboardMimetype;
  durationMs: number;
  size: number;
  source: SoundboardSource;
  /** For 'room' clips: the room or space whose pack holds the clip. */
  originRoomId?: string;
  /** The standard pack's state key, needed to save an edit or a removal back to it. */
  packStateKey?: string;
  /** The pack's own name and attribution, kept when the pack is written again. */
  packName?: string;
  packAttribution?: string;
  /** Built-in clips only: credit shown in the UI. */
  license?: string;
  author?: string;
  sourceUrl?: string;
}

/** Room/space `soundboard.settings` state. */
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
