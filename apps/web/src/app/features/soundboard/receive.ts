import { evaluateSoundboardAccess } from './boards';
import { getBuiltInSound, normalizeMimetype } from './builtIn';
import { RECEIVE_LIMITS, SoundboardLimiter } from './limits';
import { playClipLocal } from './playback';
import { soundboardRuntime } from './runtime';
import { SOUNDBOARD_MAX_DURATION_MS, type SoundboardMimetype } from './types';

const limiter = new SoundboardLimiter(RECEIVE_LIMITS);
/** The same press can arrive twice (the call's data channel and the room event). */
const DUPLICATE_WINDOW_MS = 1500;
const recent = new Map<string, number>();

/** Forget the senders' history (a new call). */
export function resetSoundboardReceiver(): void {
  limiter.reset();
  recent.clear();
}

/**
 * Plays someone else's press if all of this holds: we are connected to a call in `roomId`; the
 * soundboard is on here, we are not deafened and the sender is not muted for soundboard; the
 * sender is in the call, is not us, and may play (room/space enabled, power level high enough); the
 * clip has an allowed type and length; and the sender is within the rate limit. Best effort: it
 * never throws.
 */
export async function receiveSoundboardPlay(
  roomId: string,
  sender: string,
  content: unknown,
  inCall: (userId: string) => boolean
): Promise<void> {
  try {
    const { client } = soundboardRuntime;
    if (!client || soundboardRuntime.callRoomId !== roomId) return;
    if (sender === client.userId() || !inCall(sender)) return;
    if (!soundboardRuntime.enabled || soundboardRuntime.deafened) return;
    if (soundboardRuntime.mutedUsers.has(sender)) return;

    const sound = (content as { sound?: Record<string, unknown> } | null)?.sound;
    if (!sound || typeof sound !== 'object' || typeof sound.id !== 'string') return;

    const now = Date.now();
    const duplicateKey = `${sender}:${sound.id}`;
    const seenAt = recent.get(duplicateKey);
    if (seenAt !== undefined && now - seenAt < DUPLICATE_WINDOW_MS) return;
    recent.set(duplicateKey, now);
    if (recent.size > 100) recent.delete(recent.keys().next().value as string);

    if (
      (await evaluateSoundboardAccess(client, soundboardRuntime.spaceGraph, roomId, sender)) !==
      'ok'
    ) {
      return;
    }

    const volumeRaw =
      typeof sound.volume === 'number' && Number.isFinite(sound.volume) ? sound.volume : 1;
    const clipVolume = Math.min(1, Math.max(0, volumeRaw));
    const name = typeof sound.name === 'string' ? sound.name.slice(0, 64) : '';
    const emoji = typeof sound.emoji === 'string' ? sound.emoji.slice(0, 16) : undefined;

    let url: string;
    let mimetype: SoundboardMimetype;
    let durationMs: number | undefined;
    if (sound.builtin === true) {
      const builtIn = getBuiltInSound(sound.id);
      if (!builtIn) return;
      ({ url, mimetype, durationMs } = builtIn);
    } else {
      if (typeof sound.url !== 'string' || !sound.url.startsWith('mxc://')) return;
      const normalized = normalizeMimetype(
        typeof sound.mimetype === 'string' ? sound.mimetype : ''
      );
      if (!normalized) return;
      mimetype = normalized;
      url = sound.url;
      durationMs =
        typeof sound.durationMs === 'number' && Number.isFinite(sound.durationMs)
          ? Math.min(Math.max(sound.durationMs, 0), SOUNDBOARD_MAX_DURATION_MS)
          : undefined;
    }

    if (limiter.check(sender, sound.id) !== 'ok') return;

    await playClipLocal({
      client,
      senderId: sender,
      soundId: sound.id,
      name: name || sound.id,
      emoji,
      url,
      mimetype,
      volume: clipVolume,
      durationMs,
    });
  } catch (err) {
    console.warn('[soundboard] could not handle a clip', err);
  }
}
