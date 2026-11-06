import { evaluateSoundboardAccess } from './boards';
import { SEND_LIMITS, SoundboardLimiter } from './limits';
import { playClipLocal } from './playback';
import { getSoundboardDevicePrefs, soundboardRuntime } from './runtime';
import type { PlaySoundboardResult, SoundboardClip, SoundboardPlayContent } from './types';

const sendLimiter = new SoundboardLimiter(SEND_LIMITS);

/** The event content for a clip. Built-in clips carry only their id; the rest carry the mxc URI. */
export function clipToPlayContent(clip: SoundboardClip): SoundboardPlayContent {
  const volume = Math.min(1, Math.max(0, clip.volume));
  if (clip.source === 'builtIn') {
    return {
      sound: { id: clip.id, name: clip.name, emoji: clip.emoji, volume, builtin: true },
    };
  }
  return {
    sound: {
      id: clip.id,
      name: clip.name,
      emoji: clip.emoji,
      volume,
      url: clip.url,
      mimetype: clip.mimetype,
      durationMs: clip.durationMs,
    },
  };
}

/**
 * Press a soundboard clip in the call we are in: plays it here at once and tells everyone else in
 * the call (they play it on their side). Never throws; the return value says why nothing
 * happened, so the UI can show it. 'ok' means it was played and sent.
 *
 * Refused when: the soundboard is off on this device, we are not connected to a call in `roomId`,
 * the room/space disabled it or restricts it to moderators, or the rate limits apply (a new clip
 * after 0.4 seconds, 5 per 10 seconds, and a 1 second cooldown per clip). While deafened the clip
 * is sent but not heard.
 */
export async function playSoundboard(
  roomId: string,
  clip: SoundboardClip
): Promise<PlaySoundboardResult> {
  try {
    const { client, send } = soundboardRuntime;
    const myId = client?.userId();
    if (!client || !myId) return 'error';
    if (!getSoundboardDevicePrefs().enabled) return 'disabled';
    if (soundboardRuntime.callRoomId !== roomId || !send) return 'not-in-call';

    const access = await evaluateSoundboardAccess(
      client,
      soundboardRuntime.spaceGraph,
      roomId,
      myId
    );
    if (access !== 'ok') return access;

    const verdict = sendLimiter.check(myId, `${clip.source}:${clip.id}`);
    if (verdict !== 'ok') return verdict;

    if (!soundboardRuntime.deafened) {
      void playClipLocal({
        client,
        senderId: myId,
        soundId: clip.id,
        name: clip.name,
        emoji: clip.emoji,
        url: clip.url,
        mimetype: clip.mimetype,
        volume: clip.volume,
        durationMs: clip.durationMs,
      });
    }

    send(clipToPlayContent(clip));
    return 'ok';
  } catch (err) {
    console.warn('[soundboard] play failed', err);
    return 'error';
  }
}
