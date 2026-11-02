import type { RoomTimeline } from '@wizardchat/core';
import { getMediaCacheKey, setCachedBlobUrl } from '../message/mediaCache';
import type { ReplyTarget } from './sendMessageContent';
import { VOICE_MIMETYPE } from './useVoiceRecorder';

const VOICE_FILENAME = 'Voice message.ogg';
const VOICE_BODY = 'Voice message';

interface SendVoiceMessageOptions {
  timeline: RoomTimeline;
  replyTo?: ReplyTarget | null;
  myId?: string;
  durationMs: number;
  waveform: number[];
}

function cacheKeyOf(source: unknown): string | null {
  const { url, file } = (source ?? {}) as {
    url?: unknown;
    file?: { url?: unknown; iv?: unknown };
  };
  if (file && typeof file.url === 'string') {
    return getMediaCacheKey({ url: file.url, iv: typeof file.iv === 'string' ? file.iv : '' });
  }
  return typeof url === 'string' ? `mxc:${url}` : null;
}

export async function sendVoiceMessage(
  blob: Blob,
  { timeline, replyTo, durationMs, waveform }: SendVoiceMessageOptions
): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const source = await timeline.uploadFile(bytes, VOICE_MIMETYPE, () => {});

  // The sender's own message plays at once instead of downloading what was just recorded
  try {
    const key = cacheKeyOf(source);
    if (key) setCachedBlobUrl(key, URL.createObjectURL(blob), VOICE_MIMETYPE);
  } catch {
    // Caching is best-effort
  }

  await timeline.sendUploaded({
    source,
    size: bytes.byteLength,
    filename: VOICE_FILENAME,
    mimetype: VOICE_MIMETYPE,
    caption: VOICE_BODY,
    voice: true,
    durationMs: Math.max(0, Math.round(durationMs)),
    waveform: Array.isArray(waveform)
      ? waveform.map((v) => Math.max(0, Math.min(1024, Math.round(v))))
      : [],
    replyTo: replyTo?.eventId ?? null,
  });
}
