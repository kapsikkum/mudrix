import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TabLock, type TabLocks, type TabLockState } from '../src/client/singleTab.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** One lock at a time, like the Web Locks API's exclusive mode. */
class FakeLocks implements TabLocks {
  private busy = false;
  private waiters: Array<() => void> = [];

  request(
    _name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<void>
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const grant = async () => {
        this.busy = true;
        try {
          await callback({});
        } finally {
          this.busy = false;
          resolve();
          this.waiters.shift()?.();
        }
      };
      if (!this.busy) void grant();
      else if (options.ifAvailable) void callback(null).then(() => resolve());
      else this.waiters.push(() => void grant());
    });
  }
}

/** Delivers messages to the other tabs, never back to the sender. */
class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  private readonly bus: Set<FakeChannel>;

  constructor(bus: Set<FakeChannel>) {
    this.bus = bus;
    bus.add(this);
  }

  postMessage(data: unknown): void {
    for (const channel of this.bus) {
      if (channel !== this) channel.onmessage?.({ data } as MessageEvent);
    }
  }

  close(): void {
    this.bus.delete(this);
  }
}

function guard(key: string, locks: TabLocks, bus: Set<FakeChannel>): TabLock {
  return new TabLock(key, locks, new FakeChannel(bus) as unknown as BroadcastChannel);
}

test('the first tab takes its store', async () => {
  const locks = new FakeLocks();
  const tab = guard('store-a', locks, new Set());
  const states: TabLockState[] = [];
  tab.subscribe({ onState: (state) => states.push(state) });
  await settle();

  assert.equal(tab.current, 'acquired');
  assert.deepEqual(states, ['pending', 'acquired']);
});

test('a second tab waits, and takes over only after the first stopped', async () => {
  const locks = new FakeLocks();
  const bus = new Set<FakeChannel>();
  const first = guard('store-b', locks, bus);
  let takenOver = false;
  let firstStoppedBeforeTakeover: boolean | null = null;
  first.subscribe({ onState: () => {}, onTakenOver: () => void (takenOver = true) });
  await settle();

  const second = guard('store-b', locks, bus);
  second.subscribe({
    onState: (state) => {
      if (state === 'acquired') firstStoppedBeforeTakeover = takenOver;
    },
  });
  await settle();

  assert.equal(first.current, 'acquired');
  assert.equal(second.current, 'otherTab');

  assert.equal(await second.takeOver(), true);
  assert.equal(takenOver, true);
  assert.equal(firstStoppedBeforeTakeover, true);
  assert.equal(first.current, 'otherTab');
  assert.equal(second.current, 'acquired');
});

test('stores are guarded apart, so another account can run beside the first', async () => {
  const bus = new Set<FakeChannel>();
  const first = guard('store-c', new FakeLocks(), bus);
  const other = guard('store-d', new FakeLocks(), bus);
  await settle();

  assert.equal(first.current, 'acquired');
  assert.equal(other.current, 'acquired');
});
