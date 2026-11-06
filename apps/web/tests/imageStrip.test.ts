import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripJpeg, stripPng } from '../src/util/imageStrip.ts';

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

function segment(marker: number, body: number[]): number[] {
  return [0xff, marker, ...be16(body.length + 2), ...body];
}

/** Exif segment body with one IFD0 entry: orientation. */
function exif(orientation: number): number[] {
  const tiff = [
    ...text('MM'),
    ...be16(42),
    ...be32(8),
    ...be16(1),
    ...be16(0x0112),
    ...be16(3),
    ...be32(1),
    ...be16(orientation),
    0,
    0,
    ...be32(0),
  ];
  return [...text('Exif'), 0, 0, ...tiff];
}

const SCAN = [0xff, 0xda, 0, 4, 0, 0, 1, 2, 3, 0xff, 0xd9];

function contains(bytes: number[], needle: number[]): boolean {
  return bytes.some((_, i) => needle.every((b, j) => bytes[i + j] === b));
}

test('jpeg: drops exif, comments and xmp but keeps the icc profile and the picture', () => {
  const icc = segment(0xe2, [...text('ICC_PROFILE'), 0, 1, 2, 3]);
  const file = Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...text('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, exif(6)),
    ...segment(0xe1, [...text('http://ns.adobe.com/xap/1.0/'), 0, 1]),
    ...icc,
    ...segment(0xfe, text('hello')),
    ...SCAN,
  ]);
  const out = stripJpeg(file);
  assert.ok(out);
  assert.equal(out.orientation, 6);
  const bytes = [...out.data];
  assert.ok(!contains(bytes, text('Exif')));
  assert.ok(!contains(bytes, text('xap')));
  assert.ok(!contains(bytes, text('hello')));
  assert.ok(contains(bytes, text('ICC_PROFILE')));
  assert.ok(contains(bytes, text('JFIF')));
  assert.deepEqual(bytes.slice(-SCAN.length), SCAN);
});

test('jpeg: no exif means upright', () => {
  const file = Uint8Array.from([0xff, 0xd8, ...segment(0xe0, text('JFIF-abcdefg')), ...SCAN]);
  assert.equal(stripJpeg(file)?.orientation, 1);
});

test('jpeg: not a jpeg is rejected', () => {
  assert.equal(stripJpeg(Uint8Array.from([1, 2, 3, 4, 5])), null);
});

function chunk(type: string, data: number[]): number[] {
  return [...be32(data.length), ...text(type), ...data, 0, 0, 0, 0];
}

test('png: drops text, exif and time chunks only', () => {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const header = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const file = Uint8Array.from([
    ...sig,
    ...header,
    ...chunk('tEXt', text('Comment-secret')),
    ...chunk('eXIf', [1, 2, 3]),
    ...chunk('tIME', [1, 2, 3, 4, 5, 6, 7]),
    ...chunk('IDAT', [9, 9, 9]),
    ...chunk('IEND', []),
  ]);
  const out = stripPng(file);
  assert.ok(out);
  const expected = [...sig, ...header, ...chunk('IDAT', [9, 9, 9]), ...chunk('IEND', [])];
  assert.deepEqual([...out], expected);
});

test('png: not a png is rejected', () => {
  assert.equal(stripPng(new Uint8Array(30)), null);
});
