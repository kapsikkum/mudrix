import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cssRgbToHex,
  isLightColor,
  luminance,
  mixHex,
  readableAccent,
  withAlpha,
} from '../src/theme/colorMath.ts';

test('computed colours become hex', () => {
  assert.equal(cssRgbToHex('rgb(0, 120, 212)'), '#0078d4');
  assert.equal(cssRgbToHex('rgba(255, 0, 5, 1)'), '#ff0005');
  assert.equal(cssRgbToHex('rgb(0 120 212)'), '#0078d4');
  assert.equal(cssRgbToHex('AccentColor'), null);
  assert.equal(cssRgbToHex('rgb(300, 0, 0)'), null);
});

test('mixing and alpha', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(withAlpha('#ff0000', 0.2), '#ff000033');
});

test('a very light accent is darkened until white text reads on it', () => {
  const light = readableAccent('#ffee88', false);
  assert.ok(luminance(light) <= 0.45);
  assert.ok(luminance(light) < luminance('#ffee88'));
});

test('a nearly black accent is lifted on a dark theme but kept on a light one', () => {
  assert.ok(luminance(readableAccent('#050510', false)) > luminance('#050510'));
  assert.equal(readableAccent('#050510', true), '#050510');
});

test('light and dark backgrounds', () => {
  assert.equal(isLightColor('#ffffff'), true);
  assert.equal(isLightColor('#1a1b1e'), false);
});
