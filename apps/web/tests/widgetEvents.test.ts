import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeRoomEvents } from '../src/app/features/integrations/widgetEvents.ts';

const ev = (eventId: string, originServerTs: number) => ({ eventId, originServerTs });

test('history and live events merge oldest first', () => {
  const merged = mergeRoomEvents([ev('c', 30)], [ev('b', 20), ev('a', 10)], 10);
  assert.deepEqual(
    merged.map((e) => e.eventId),
    ['a', 'b', 'c']
  );
});

test('an event in both lists is kept once', () => {
  const merged = mergeRoomEvents([ev('a', 10), ev('b', 20)], [ev('b', 20), ev('a', 10)], 10);
  assert.equal(merged.length, 2);
});

test('only the newest events are kept', () => {
  const merged = mergeRoomEvents([ev('c', 30), ev('d', 40)], [ev('a', 10), ev('b', 20)], 3);
  assert.deepEqual(
    merged.map((e) => e.eventId),
    ['b', 'c', 'd']
  );
});

test('a live event is appended', () => {
  const merged = mergeRoomEvents([ev('a', 10)], [ev('b', 20)], 10);
  assert.deepEqual(
    merged.map((e) => e.eventId),
    ['a', 'b']
  );
});
