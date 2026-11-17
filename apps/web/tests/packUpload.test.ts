import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fileResumeKey,
  sameContent,
  shortcodeFromFile,
  uploadFilesPooled,
  withRateLimitRetry,
  type UploadedImage,
} from '../src/app/features/room/roomsettings/packUpload.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

const file = (n: number, size = 1) =>
  new File([new Uint8Array(size)], `image_${n}.png`, { type: 'image/png', lastModified: n });

const uploaded = (n: number): UploadedImage => ({
  mxc: `mxc://example.org/${n}`,
  mimetype: 'image/png',
  info: { w: 32, h: 32, mimetype: 'image/png' },
});

test('uploads run at most `concurrency` at a time', async () => {
  const files = Array.from({ length: 10 }, (_, i) => file(i));
  let active = 0;
  let peak = 0;
  let runs = 0;
  const result = await uploadFilesPooled(
    files,
    async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      active -= 1;
      runs += 1;
      return uploaded(0);
    },
    { concurrency: 3 }
  );
  assert.equal(peak, 3);
  assert.equal(result.uploaded.length, files.length);
  assert.ok(result.uploaded.every(Boolean));
  assert.equal(result.errors.size, 0);
  assert.equal(result.cancelled, false);
  assert.equal(runs, files.length);
});

test('failures are collected per index and progress counts them', async () => {
  const files = [file(0), file(1), file(2)];
  const progress: [number, number, number][] = [];
  const result = await uploadFilesPooled(
    files,
    async (f) => {
      if (f.name === 'image_1.png') throw new Error('server said no');
      return uploaded(0);
    },
    { concurrency: 2, onProgress: (done, total, failed) => progress.push([done, total, failed]) }
  );
  assert.equal(result.uploaded[0]?.mxc, 'mxc://example.org/0');
  assert.equal(result.uploaded[1], null);
  assert.equal(result.uploaded[2]?.mxc, 'mxc://example.org/0');
  assert.deepEqual([...result.errors.entries()], [[1, 'server said no']]);
  assert.deepEqual(progress.at(-1), [3, 3, 1]);
  assert.equal(result.cancelled, false);
});

test('an abort stops the pool and reports cancellation', async () => {
  const files = Array.from({ length: 6 }, (_, i) => file(i));
  const controller = new AbortController();
  let started = 0;
  const result = await uploadFilesPooled(
    files,
    async () => {
      started += 1;
      if (started === 2) controller.abort();
      await tick();
      return uploaded(0);
    },
    { concurrency: 2, signal: controller.signal }
  );
  assert.equal(result.cancelled, true);
  assert.ok(started < files.length);
  assert.equal(result.errors.size, 0);
});

test('already-uploaded files are skipped, keyed by name, size and lastModified', async () => {
  const files = [file(0, 4), file(1, 4)];
  const done = new Map([[fileResumeKey(files[0]), uploaded(9)]]);
  const seen: string[] = [];
  const result = await uploadFilesPooled(
    files,
    async (f) => {
      seen.push(f.name);
      return uploaded(1);
    },
    { done }
  );
  assert.deepEqual(seen, ['image_1.png']);
  assert.equal(result.uploaded[0]?.mxc, 'mxc://example.org/9');
  assert.equal(result.uploaded[1]?.mxc, 'mxc://example.org/1');
  assert.equal(done.size, 2);
  assert.notEqual(fileResumeKey(files[0]), fileResumeKey(file(0, 5)));
});

test('rate-limited calls retry with growing waits', async () => {
  const waits: number[] = [];
  let calls = 0;
  const value = await withRateLimitRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('slow down'), { errcode: 'M_LIMIT_EXCEEDED' });
      return 'done';
    },
    undefined,
    {
      sleep: async (ms) => {
        waits.push(ms);
      },
    }
  );
  assert.equal(value, 'done');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('the retry wait honours retry_after_ms within 250 ms and 30 s', async () => {
  const waits: number[] = [];
  const retry = (ms: number) =>
    withRateLimitRetry(
      async () => {
        throw { errcode: 'M_LIMIT_EXCEEDED', data: { retry_after_ms: ms } };
      },
      undefined,
      {
        attempts: 2,
        sleep: async (wait) => {
          waits.push(wait);
        },
      }
    );
  await assert.rejects(retry(10));
  await assert.rejects(retry(10 * 60 * 1000));
  assert.deepEqual(waits, [250, 30_000]);
});

test('other errors are not retried, and a lasting rate limit throws on the last attempt', async () => {
  let calls = 0;
  await assert.rejects(
    withRateLimitRetry(async () => {
      calls += 1;
      throw new Error('nope');
    })
  );
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(
    withRateLimitRetry(
      async () => {
        calls += 1;
        throw { errcode: 'M_LIMIT_EXCEEDED' };
      },
      undefined,
      {
        attempts: 3,
        sleep: async () => {},
      }
    )
  );
  assert.equal(calls, 3);
});

test('shortcodes come from file names and stay inside the allowed characters', () => {
  assert.equal(shortcodeFromFile('Party Parrot.gif'), 'party_parrot');
  assert.equal(shortcodeFromFile('a.b.png'), 'a_b');
  assert.equal(shortcodeFromFile('__x__'), 'x');
  assert.equal(shortcodeFromFile('.png'), 'image');
  assert.equal(shortcodeFromFile('smile:cat.png', 'item'), 'smile_cat');
});

test('content comparison ignores key order and undefined values', () => {
  assert.ok(sameContent({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }));
  assert.ok(sameContent({ a: 1, b: undefined }, { a: 1 }));
  assert.ok(!sameContent({ a: 1 }, { a: 2 }));
  assert.ok(!sameContent({ a: [1, 2] }, { a: [2, 1] }));
});
