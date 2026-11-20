import type { MudrixClient, SoundboardSound as CoreSound } from '@mudrix/core';
import { normalizeMimetype } from './builtIn';
import {
  SOUNDBOARD_MAX_DURATION_MS,
  SOUNDBOARD_MAX_NAME_LENGTH,
  SOUNDBOARD_MAX_SIZE_BYTES,
  SoundboardError,
  type SoundboardMimetype,
} from './types';

/** What the file input should accept (the formats the core's uploader takes). */
export const SOUNDBOARD_FILE_ACCEPT =
  'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,.mp3,.m4a,.aac,.wav';

/** The mimetypes `uploadSound` accepts; older ogg clips are still read and played. */
const UPLOAD_MIMETYPES = new Set<SoundboardMimetype>([
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
]);

export interface ValidatedSoundFile {
  mimetype: SoundboardMimetype;
  durationMs: number;
  size: number;
}

function mimetypeOf(file: File): SoundboardMimetype | null {
  const byType = normalizeMimetype(file.type);
  if (byType && UPLOAD_MIMETYPES.has(byType)) return byType;
  // Some systems hand over an empty or generic type for these files.
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a') return 'audio/x-m4a';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'wav') return 'audio/wav';
  return null;
}

async function decodeDurationMs(file: File): Promise<number> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new SoundboardError('decode');
  const ctx = new Ctor();
  try {
    const data = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(data);
    return Math.round(buffer.duration * 1000);
  } catch {
    throw new SoundboardError('decode');
  } finally {
    ctx.close().catch(() => {});
  }
}

/**
 * Checks a chosen file: an MP3, M4A, AAC or WAV, at most 512 KB and 5 seconds (the length is read
 * by decoding it). Throws SoundboardError with code 'type', 'size', 'decode' or 'duration'.
 */
export async function validateSoundFile(file: File): Promise<ValidatedSoundFile> {
  const mimetype = mimetypeOf(file);
  if (!mimetype) throw new SoundboardError('type');
  if (file.size > SOUNDBOARD_MAX_SIZE_BYTES || file.size === 0) throw new SoundboardError('size');
  const durationMs = await decodeDurationMs(file);
  if (durationMs <= 0) throw new SoundboardError('decode');
  if (durationMs > SOUNDBOARD_MAX_DURATION_MS) throw new SoundboardError('duration');
  return { mimetype, durationMs, size: file.size };
}

export function cleanSoundName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, SOUNDBOARD_MAX_NAME_LENGTH);
}

/**
 * A standard shortcode from a display name: lower-case ASCII letters, digits, `-` and `_` (the
 * characters the core and other clients accept), at most 96 bytes so a numeric suffix still fits.
 */
export function shortcodeFor(name: string): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii.slice(0, 96) || 'sound';
}

/** A shortcode for `name` that no sound in `taken` uses yet (`name`, then `name_2`, ...). */
export function uniqueShortcode(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = shortcodeFor(name);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Validates a file and uploads it to the homeserver through the core. The returned sound has no
 * shortcode yet: the board it is added to assigns a unique one.
 */
export async function uploadSoundFile(
  client: MudrixClient,
  file: File,
  meta: { name: string; emoji?: string },
  validated?: ValidatedSoundFile
): Promise<CoreSound> {
  const checked = validated ?? (await validateSoundFile(file));
  if (!UPLOAD_MIMETYPES.has(checked.mimetype)) throw new SoundboardError('type');
  let uploaded: CoreSound;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    uploaded = await client.uploadSound(data, checked.mimetype, checked.durationMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unsupported|mimetype/i.test(message)) throw new SoundboardError('type');
    if (/tooLarge/i.test(message)) throw new SoundboardError('size');
    if (/tooLong/i.test(message)) throw new SoundboardError('duration');
    console.warn('[soundboard] upload failed', err);
    throw new SoundboardError('upload');
  }
  const name =
    cleanSoundName(meta.name) || cleanSoundName(file.name.replace(/\.[^.]+$/, '')) || 'Sound';
  return {
    ...uploaded,
    shortcode: '',
    body: name,
    emoji: meta.emoji?.trim() ? meta.emoji.trim().slice(0, 16) : undefined,
    mimetype: checked.mimetype,
    durationMs: checked.durationMs,
    size: checked.size,
  };
}
