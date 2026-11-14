import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANNER_ASPECT, cropRect } from '../src/util/cropImage.ts';

test('an image already at the banner aspect is kept whole', () => {
  assert.deepEqual(cropRect(1200, 400, BANNER_ASPECT, 0.5), {
    sx: 0,
    sy: 0,
    sw: 1200,
    sh: 400,
  });
});

test('a wide image is cropped left and right', () => {
  assert.deepEqual(cropRect(3000, 500, BANNER_ASPECT, 0), {
    sx: 0,
    sy: 0,
    sw: 1500,
    sh: 500,
  });
  assert.deepEqual(cropRect(3000, 500, BANNER_ASPECT, 0.5), {
    sx: 750,
    sy: 0,
    sw: 1500,
    sh: 500,
  });
  assert.deepEqual(cropRect(3000, 500, BANNER_ASPECT, 1), {
    sx: 1500,
    sy: 0,
    sw: 1500,
    sh: 500,
  });
});

test('a tall image is cropped top and bottom', () => {
  assert.deepEqual(cropRect(900, 1800, BANNER_ASPECT, 0), {
    sx: 0,
    sy: 0,
    sw: 900,
    sh: 300,
  });
  assert.deepEqual(cropRect(900, 1800, BANNER_ASPECT, 0.5), {
    sx: 0,
    sy: 750,
    sw: 900,
    sh: 300,
  });
  assert.deepEqual(cropRect(900, 1800, BANNER_ASPECT, 1), {
    sx: 0,
    sy: 1500,
    sw: 900,
    sh: 300,
  });
});

test('focus outside 0..1 is clamped to the image edges', () => {
  assert.equal(cropRect(3000, 500, BANNER_ASPECT, -2).sx, 0);
  assert.equal(cropRect(3000, 500, BANNER_ASPECT, 4).sx, 1500);
  assert.equal(cropRect(900, 1800, BANNER_ASPECT, -2).sy, 0);
  assert.equal(cropRect(900, 1800, BANNER_ASPECT, 4).sy, 1500);
});

test('the kept rectangle never leaves the image', () => {
  for (const [width, height] of [
    [3, 1],
    [333, 1000],
    [1000, 333],
    [1920, 1080],
    [1080, 1920],
  ]) {
    for (const focus of [0, 0.25, 0.5, 0.75, 1]) {
      const { sx, sy, sw, sh } = cropRect(width, height, BANNER_ASPECT, focus);
      assert.ok(sx >= 0 && sy >= 0, `negative offset for ${width}x${height} at ${focus}`);
      assert.ok(sx + sw <= width, `overflowing width for ${width}x${height} at ${focus}`);
      assert.ok(sy + sh <= height, `overflowing height for ${width}x${height} at ${focus}`);
      assert.ok(sw > 0 && sh > 0, `empty rectangle for ${width}x${height} at ${focus}`);
    }
  }
});
