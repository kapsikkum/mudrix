import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultVideoQuality,
  planCompression,
  qualityTarget,
  smartMaxBytes,
  videoChoices,
  type VideoMeta,
  type VideoUploadPrefs,
} from '../src/util/videoPlan.ts';

const MB = 1024 * 1024;
const prefs: VideoUploadPrefs = {
  mode: 'smart',
  height: 720,
  targetBytes: 50 * MB,
  minBytes: 25 * MB,
};
/** A phone clip: 1080p at 8 Mbit/s. */
const phone = (minutes: number): VideoMeta => ({
  durationSec: minutes * 60,
  width: 1920,
  height: 1080,
  bitrate: 8_000_000,
});

test('smart: a video that already fits is left alone', () => {
  assert.equal(planCompression(phone(0.5), { kind: 'smart', maxBytes: 50 * MB }), null);
});

test('smart: a short clip keeps 1080p, a long one drops resolution, both fit', () => {
  const short = planCompression(phone(1), { kind: 'smart', maxBytes: 50 * MB });
  assert.ok(short);
  assert.equal(short.height, 1080);
  assert.ok(short.estimatedBytes <= 50 * MB);

  const long = planCompression(phone(20), { kind: 'smart', maxBytes: 50 * MB });
  assert.ok(long);
  assert.ok(long.height < 1080);
  assert.ok(long.videoBitrate >= 150_000);
  assert.ok(long.estimatedBytes <= 50 * MB);
});

test('smart: never upscales or raises the bitrate', () => {
  const small: VideoMeta = { durationSec: 600, width: 640, height: 360, bitrate: 1_000_000 };
  const plan = planCompression(small, { kind: 'smart', maxBytes: 20 * MB });
  assert.ok(plan);
  assert.ok(plan.height <= 360);
  assert.ok(plan.videoBitrate <= 1_000_000 - 128_000);
});

test('fixed: scales the short side, portrait keeps its shape', () => {
  const plan = planCompression(phone(2), { kind: 'fixed', height: 720 });
  assert.ok(plan);
  assert.equal(plan.height, 720);
  assert.equal(plan.videoBitrate, 2_800_000);
  const portrait = planCompression(
    { durationSec: 120, width: 1080, height: 1920, bitrate: 8_000_000 },
    { kind: 'fixed', height: 720 }
  );
  assert.equal(portrait?.height, 720);
});

test('fixed: a video already at or below the target is left alone', () => {
  const lean: VideoMeta = { durationSec: 60, width: 1280, height: 720, bitrate: 2_500_000 };
  assert.equal(planCompression(lean, { kind: 'fixed', height: 720 }), null);
  assert.equal(planCompression(lean, { kind: 'fixed', height: 1080 }), null);
});

test('unknown metadata gives no plan', () => {
  const unknown: VideoMeta = { durationSec: 0, width: 0, height: 0, bitrate: 0 };
  assert.equal(planCompression(unknown, { kind: 'fixed', height: 480 }), null);
});

test('smartMaxBytes stays under the server limit', () => {
  assert.equal(smartMaxBytes(prefs, 100 * MB), 50 * MB);
  assert.equal(smartMaxBytes(prefs, 20 * MB), Math.floor(20 * MB * 0.95));
  assert.equal(
    smartMaxBytes({ ...prefs, targetBytes: Infinity }, 100 * MB),
    Math.floor(100 * MB * 0.95)
  );
});

test('default quality: original unless the settings or the server limit ask otherwise', () => {
  const original = { ...prefs, mode: 'original' as const };
  assert.equal(defaultVideoQuality(original, 40 * MB, 100 * MB, true), 'original');
  assert.equal(defaultVideoQuality(prefs, 10 * MB, 100 * MB, true), 'original');
  assert.equal(defaultVideoQuality(prefs, 40 * MB, 100 * MB, true), 'smart');
  assert.equal(defaultVideoQuality({ ...prefs, mode: 'fixed' }, 40 * MB, 100 * MB, true), 720);
  // Over the server limit it is shrunk even when the settings say original.
  assert.equal(defaultVideoQuality(original, 200 * MB, 100 * MB, true), 'smart');
  assert.equal(defaultVideoQuality(prefs, 200 * MB, 100 * MB, false), 'original');
});

test('quality target', () => {
  assert.equal(qualityTarget('original', prefs, 100 * MB), undefined);
  assert.deepEqual(qualityTarget(480, prefs, 100 * MB), { kind: 'fixed', height: 480 });
  assert.deepEqual(qualityTarget('smart', prefs, 100 * MB), { kind: 'smart', maxBytes: 50 * MB });
});

test('choices: original first, only options that save at least 15%', () => {
  const size = (phone(5).bitrate * 300) / 8;
  const choices = videoChoices(phone(5), size, prefs, 100 * MB);
  assert.equal(choices[0].quality, 'original');
  assert.equal(choices[0].size, size);
  for (const choice of choices.slice(1)) {
    assert.ok(choice.size !== null && choice.size <= size * 0.85);
  }
  assert.deepEqual(
    videoChoices(null, size, prefs, 100 * MB).map((c) => c.quality),
    ['original', 'smart', 720, 480]
  );
});
