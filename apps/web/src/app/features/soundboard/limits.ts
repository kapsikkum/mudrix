/**
 * Soundboard rate limits. The sender limits itself and every receiver limits each sender again, so a
 * modified client cannot flood the call.
 */

interface Limits {
  /** Minimum gap between two clips from one sender. */
  minGapMs: number;
  /** At most `burst` clips from one sender in any `windowMs`. */
  burst: number;
  windowMs: number;
  /** Minimum gap before the same clip from the same sender. */
  perSoundCooldownMs: number;
}

/** What we allow ourselves: a new clip after 0.4 s (it cuts the last one off), 5 per 10 s, 1 s cooldown per sound. */
export const SEND_LIMITS: Limits = {
  minGapMs: 400,
  burst: 5,
  windowMs: 10_000,
  perSoundCooldownMs: 1000,
};

/** Receivers are a little looser on the gap, since events arrive with network jitter. */
export const RECEIVE_LIMITS: Limits = {
  minGapMs: 250,
  burst: 5,
  windowMs: 10_000,
  perSoundCooldownMs: 700,
};

export type LimitVerdict = 'ok' | 'rate-limited' | 'cooldown';

interface SenderHistory {
  times: number[];
  perSound: Map<string, number>;
}

export class SoundboardLimiter {
  private readonly limits: Limits;

  private readonly senders = new Map<string, SenderHistory>();

  constructor(limits: Limits) {
    this.limits = limits;
  }

  /** Records the clip when allowed. */
  check(senderId: string, soundKey: string, now = Date.now()): LimitVerdict {
    const { minGapMs, burst, windowMs, perSoundCooldownMs } = this.limits;
    let history = this.senders.get(senderId);
    if (!history) {
      history = { times: [], perSound: new Map() };
      this.senders.set(senderId, history);
    }
    history.times = history.times.filter((t) => now - t < windowMs);
    for (const [key, at] of history.perSound) {
      if (now - at >= windowMs) history.perSound.delete(key);
    }

    const last = history.times[history.times.length - 1];
    if (last !== undefined && now - last < minGapMs) return 'rate-limited';
    if (history.times.length >= burst) return 'rate-limited';
    const lastSame = history.perSound.get(soundKey);
    if (lastSame !== undefined && now - lastSame < perSoundCooldownMs) return 'cooldown';

    history.times.push(now);
    history.perSound.set(soundKey, now);
    return 'ok';
  }

  reset(): void {
    this.senders.clear();
  }
}
