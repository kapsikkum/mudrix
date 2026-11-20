/**
 * One live client per account store.
 *
 * Two tabs restoring the same store are two clients behind one Matrix device: their syncs
 * compete for the to-device room keys, so whichever tab misses a key shows incoming messages as
 * "waiting for the key" even though the other tab decrypted them. The store belongs to one tab at
 * a time; another tab waits and can take over once the holder has stopped its client.
 *
 * Web Locks are released by the browser when a page goes away, a crash included, so a closed tab
 * cannot leave a lock behind. Where the API is unavailable (a plain-http origin), the guard steps
 * aside and the app behaves as before.
 */

export type TabLockState = 'pending' | 'acquired' | 'otherTab';

export interface TabLockHandlers {
  /** Called with the current state on subscribe, and on every change afterwards. */
  onState?: (state: TabLockState) => void;
  /** Another tab asked for the lock: stop the client and let go of the store. */
  onTakenOver?: () => void | Promise<void>;
}

/** The part of the Web Locks API the guard uses, small enough to fake in tests. */
export interface TabLocks {
  request(
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<void>
  ): Promise<void>;
}

const TAKEOVER = 'take-over';
const CHANNEL_PREFIX = 'mudrix-tabs:';

function browserLocks(): TabLocks | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null;
  return navigator.locks as unknown as TabLocks;
}

function browserChannel(name: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

export class TabLock {
  private state: TabLockState = 'pending';
  private release: (() => void) | null = null;
  private handlers: TabLockHandlers = {};
  private closed = false;
  private readonly key: string;
  private readonly locks: TabLocks | null;
  private readonly channel: BroadcastChannel | null;

  constructor(
    key: string,
    locks: TabLocks | null = browserLocks(),
    channel: BroadcastChannel | null = browserChannel(`${CHANNEL_PREFIX}${key}`)
  ) {
    this.key = key;
    this.locks = locks;
    this.channel = channel;
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent) => {
        const data = event.data as { type?: unknown; key?: unknown } | null;
        if (data?.type === TAKEOVER && data.key === key) void this.stopForOtherTab();
      };
    }
    if (!this.locks) {
      // No Web Locks: the guard cannot keep tabs apart, so leave the app as it was.
      this.state = 'acquired';
      return;
    }
    void this.acquire();
  }

  get current(): TabLockState {
    return this.state;
  }

  subscribe(handlers: TabLockHandlers): () => void {
    this.handlers = handlers;
    handlers.onState?.(this.state);
    return () => {
      if (this.handlers === handlers) this.handlers = {};
    };
  }

  /**
   * Asks the holding tab to stop and waits for the lock, then reports whether this tab may use
   * the store. A holder that is stuck can be closed by the person; the browser releases its lock.
   */
  async takeOver(): Promise<boolean> {
    if (this.state === 'acquired') return true;
    if (this.closed || !this.locks) return false;
    this.channel?.postMessage({ type: TAKEOVER, key: this.key });
    const release = await this.request(false);
    if (!release || this.closed) {
      release?.();
      return false;
    }
    this.release = release;
    this.change('acquired');
    return true;
  }

  /** Releases the lock now. The page going away releases it too. */
  dispose(): void {
    this.closed = true;
    this.release?.();
    this.release = null;
    this.channel?.close();
  }

  private async acquire(): Promise<void> {
    const release = await this.request(true);
    if (this.closed) {
      release?.();
      return;
    }
    if (!release) {
      this.change('otherTab');
      return;
    }
    this.release = release;
    this.change('acquired');
  }

  private request(ifAvailable: boolean): Promise<(() => void) | null> {
    const locks = this.locks;
    if (!locks) return Promise.resolve(() => {});
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: (() => void) | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      locks
        .request(this.key, { ifAvailable }, async (lock) => {
          if (!lock || this.closed) {
            settle(null);
            return;
          }
          await new Promise<void>((release) => settle(release));
        })
        .catch(() => settle(null));
    });
  }

  private async stopForOtherTab(): Promise<void> {
    if (this.state !== 'acquired') return;
    // Show the notice first: the app's screens must not keep using a client that is being freed.
    this.change('otherTab');
    try {
      await this.handlers.onTakenOver?.();
    } finally {
      this.release?.();
      this.release = null;
    }
  }

  private change(state: TabLockState): void {
    if (this.state === state) return;
    this.state = state;
    this.handlers.onState?.(state);
  }
}

const guards = new Map<string, TabLock>();

/** The guard for one store, shared by everything a page mounts on it. */
export function tabLockFor(storeLocation: string): TabLock {
  const key = `mudrix-store:${storeLocation}`;
  let guard = guards.get(key);
  if (!guard) {
    guard = new TabLock(key);
    guards.set(key, guard);
  }
  return guard;
}
