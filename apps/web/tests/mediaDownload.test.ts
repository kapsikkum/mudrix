import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DownloadStalledError,
  downloadMedia,
  isCancelled,
} from '../src/app/features/timeline/message/mediaDownload.ts';

type Progress = { received: number; total: number | null };

/** A core whose download ends when its token is cancelled, or when `finish` is called. */
function fakeClient() {
  const cancelled: string[] = [];
  let finish: (bytes: Uint8Array) => void = () => {};
  let report: (progress: Progress) => void = () => {};
  let token = '';
  let hint: number | null | undefined;
  let fail: ((error: Error) => void) | undefined;
  const client = {
    cancelMediaDownload: async (t: string) => {
      cancelled.push(t);
      fail?.(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
    },
    mediaDownload: (
      _source: unknown,
      sizeHint: number | null | undefined,
      t: string,
      listener: (p: Progress) => void
    ) => {
      token = t;
      hint = sizeHint;
      report = listener;
      return new Promise<Uint8Array>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    },
  };
  return {
    client: client as never,
    cancelled,
    report: (p: Progress) => report(p),
    finish: (b: Uint8Array) => finish(b),
    token: () => token,
    hint: () => hint,
  };
}

const source = { url: 'mxc://example.org/abc' } as never;

test('downloads report progress and return the bytes', async () => {
  const fake = fakeClient();
  const seen: Progress[] = [];
  const done = downloadMedia(fake.client, source, {
    sizeHint: 10,
    onProgress: (p) => seen.push(p),
  });
  fake.report({ received: 4, total: 10 });
  fake.report({ received: 10, total: 10 });
  fake.finish(new Uint8Array([1, 2]));
  assert.deepEqual(await done, new Uint8Array([1, 2]));
  assert.deepEqual(seen, [
    { received: 4, total: 10 },
    { received: 10, total: 10 },
  ]);
  assert.equal(fake.hint(), 10);
  assert.deepEqual(fake.cancelled, []);
});

test('aborting cancels the download with its own token', async () => {
  const fake = fakeClient();
  const controller = new AbortController();
  const done = downloadMedia(fake.client, source, { signal: controller.signal });
  controller.abort();
  await assert.rejects(done, (error) => isCancelled(error));
  assert.deepEqual(fake.cancelled, [fake.token()]);
});

test('a download with no bytes for too long is cancelled as stalled', async () => {
  const fake = fakeClient();
  await assert.rejects(
    downloadMedia(fake.client, source, { startMs: 20, stallMs: 20 }),
    (error) => error instanceof DownloadStalledError
  );
  assert.deepEqual(fake.cancelled, [fake.token()]);
});

test('progress keeps a slow download alive', async () => {
  const fake = fakeClient();
  const done = downloadMedia(fake.client, source, { startMs: 40, stallMs: 40 });
  for (let i = 1; i <= 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    fake.report({ received: i, total: null });
  }
  fake.finish(new Uint8Array([9]));
  assert.deepEqual(await done, new Uint8Array([9]));
  assert.deepEqual(fake.cancelled, []);
});
