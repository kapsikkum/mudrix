import { evaluateSoundboardAccess } from './boards';
import { SEND_LIMITS, SoundboardLimiter } from './limits';
import { getSoundboardDevicePrefs, soundboardRuntime } from './runtime';
import type { PlaySoundboardResult, SoundboardClip } from './types';

const sendLimiter = new SoundboardLimiter(SEND_LIMITS);

/**
 * Press a soundboard clip in the call we are in: it plays here at once and everyone else in the
 * call hears it (they play it on their side). Never throws; the return value says why nothing
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
    const { client, play } = soundboardRuntime;
    const myId = client?.userId();
    if (!client || !myId) return 'error';
    if (!getSoundboardDevicePrefs().enabled) return 'disabled';
    if (soundboardRuntime.callRoomId !== roomId || !play) return 'not-in-call';

    const access = await evaluateSoundboardAccess(
      client,
      soundboardRuntime.spaceGraph,
      roomId,
      myId
    );
    if (access !== 'ok') return access;

    const verdict = sendLimiter.check(myId, `${clip.source}:${clip.packStateKey ?? ''}:${clip.id}`);
    if (verdict !== 'ok') return verdict;

    await play({
      url: clip.url,
      shortcode: clip.id,
      emoji: clip.emoji,
      name: clip.name,
      mimetype: clip.mimetype,
      durationMs: clip.durationMs,
    });
    void client
      .recordSoundPlayed(clip.url)
      .catch((err) => console.warn('[soundboard] could not count a play', err));
    return 'ok';
  } catch (err) {
    console.warn('[soundboard] play failed', err);
    return 'error';
  }
}
