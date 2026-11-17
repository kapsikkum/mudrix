import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSafeUrl,
  isSafeMatrixMediaUrl,
  isSameOriginUrl,
  openSafeExternalUrl,
  safeExternalUrl,
  safeSameOriginUrl,
} from '../src/util/safeUrl.ts';

test('only http and https are safe', () => {
  assert.equal(isSafeUrl('https://example.org/a'), true);
  assert.equal(isSafeUrl('http://example.org/a'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/html,hello'), false);
  assert.equal(isSafeUrl('file:///etc/passwd'), false);
  assert.equal(isSafeUrl('not a url'), false);
  assert.equal(isSafeUrl(null), false);
  assert.equal(isSafeUrl(''), false);
});

test('another protocol can be allowed explicitly', () => {
  assert.equal(isSafeUrl('matrix:u/x:example.org', ['matrix:']), true);
  assert.equal(safeExternalUrl('matrix:u/x:example.org', ['matrix:']), 'matrix:u/x:example.org');
});

test('safeExternalUrl normalizes and refuses unsafe schemes', () => {
  assert.equal(safeExternalUrl('https://example.org'), 'https://example.org/');
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('//evil.example'), null);
  assert.equal(safeExternalUrl(undefined), null);
});

test('same-origin checks compare the exact origin', () => {
  const base = 'https://app.example.org';
  assert.equal(isSameOriginUrl('/room/1', base), true);
  assert.equal(isSameOriginUrl(`${base}/room/1`, base), true);
  assert.equal(isSameOriginUrl('https://other.example.org/room/1', base), false);
  assert.equal(isSameOriginUrl('//evil.example/room/1', base), false);
  assert.equal(isSameOriginUrl('http://app.example.org/room/1', base), false);
  assert.equal(isSameOriginUrl('', base), false);
});

test('safeSameOriginUrl returns the absolute URL of the same origin only', () => {
  const base = 'https://app.example.org';
  assert.equal(safeSameOriginUrl('/room/1', base), `${base}/room/1`);
  assert.equal(safeSameOriginUrl('https://evil.example/room/1', base), null);
  assert.equal(safeSameOriginUrl('javascript:alert(1)', base), null);
  assert.equal(safeSameOriginUrl('/room/1'), null);
});

test('openSafeExternalUrl refuses unsafe URLs', () => {
  assert.equal(openSafeExternalUrl('javascript:alert(1)'), null);
  assert.equal(openSafeExternalUrl(null), null);
});

test('matrix media URLs are checked', () => {
  assert.equal(isSafeMatrixMediaUrl('mxc://example.org/abcdef'), true);
  assert.equal(isSafeMatrixMediaUrl('https://example.org/abcdef'), false);
  assert.equal(isSafeMatrixMediaUrl('mxc://example.org'), false);
  assert.equal(isSafeMatrixMediaUrl('mxc://example.org/abc/def?x=1'), false);
  assert.equal(isSafeMatrixMediaUrl(null), false);
});
