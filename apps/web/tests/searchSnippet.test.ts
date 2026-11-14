import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeSnippet } from '../src/app/features/timeline/searchSnippet.ts';

test('a short body is shown whole', () => {
  assert.equal(makeSnippet('hello there', 'there'), 'hello there');
});

test('a long body is cut around the match', () => {
  const body = `${'a'.repeat(400)} needle ${'b'.repeat(400)}`;
  const snippet = makeSnippet(body, 'needle');
  assert.ok(snippet.includes('needle'));
  assert.ok(snippet.startsWith('…'));
  assert.ok(snippet.endsWith('…'));
  assert.ok(snippet.length < body.length);
});

test('a long body with no match keeps its start', () => {
  const body = 'z'.repeat(500);
  const snippet = makeSnippet(body, 'needle');
  assert.equal(snippet, `${'z'.repeat(280)}…`);
});

test('a match at the start does not get a leading ellipsis', () => {
  const body = `needle ${'b'.repeat(400)}`;
  assert.ok(!makeSnippet(body, 'needle').startsWith('…'));
});
