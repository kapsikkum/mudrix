import type { WizardClient } from '@wizardchat/core';
import { normalizeMimetype } from './builtIn';
import {
  SOUNDBOARD_MAX_DURATION_MS,
  SOUNDBOARD_MAX_NAME_LENGTH,
  SOUNDBOARD_MAX_SIZE_BYTES,
  SoundboardError,
  type SoundboardMimetype,
  type SoundboardSound,
} from './types';

/** What the file input should accept. */
export const SOUNDBOARD_FILE_ACCEPT = 'audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav';

export interface ValidatedSoundFile {
  mimetype: SoundboardMimetype;
  durationMs: number;
  size: number;
}

function mimetypeOf(file: File): SoundboardMimetype | null {
  const byType = normalizeMimetype(file.type);
  if (byType) return byType;
  // Some systems hand over an empty or generic type for .ogg and .wav.
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'ogg') return 'audio/ogg';
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
 * Checks a chosen file: mp3, ogg or wav, at most 512 KB and 5 seconds (the length is read by
 * decoding it). Throws SoundboardError with code 'type', 'size', 'decode' or 'duration'.
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

export function newSoundId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `c_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function cleanSoundName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, SOUNDBOARD_MAX_NAME_LENGTH);
}

/** Validates a file and uploads it to the homeserver. The returned sound is not saved to a board yet. */
export async function uploadSoundFile(
  client: WizardClient,
  file: File,
  meta: { name: string; emoji?: string; volume?: number },
  validated?: ValidatedSoundFile
): Promise<SoundboardSound> {
  const checked = validated ?? (await validateSoundFile(file));
  let url: string;
  try {
    url = await client.uploadMedia(new Uint8Array(await file.arrayBuffer()), checked.mimetype);
  } catch (err) {
    console.warn('[soundboard] upload failed', err);
    throw new SoundboardError('upload');
  }
  const name =
    cleanSoundName(meta.name) || cleanSoundName(file.name.replace(/\.[^.]+$/, '')) || 'Sound';
  return {
    id: newSoundId(),
    name,
    emoji: meta.emoji?.trim() ? meta.emoji.trim().slice(0, 16) : undefined,
    url,
    mimetype: checked.mimetype,
    durationMs: checked.durationMs,
    size: checked.size,
    volume: Math.min(1, Math.max(0, meta.volume ?? 1)),
  };
}
