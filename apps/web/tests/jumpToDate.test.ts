import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  eventNearDate,
  jumpToDateErrorKey,
  startOfLocalDay,
  toDateInputValue,
} from '../src/app/features/timeline/jumpToDate.ts';

test('a date input value is local midnight, not UTC', () => {
  const ts = startOfLocalDay('2026-03-09');
  assert.equal(ts, new Date(2026, 2, 9).getTime());
  assert.equal(toDateInputValue(new Date(ts!)), '2026-03-09');
  assert.equal(startOfLocalDay(''), null);
  assert.equal(startOfLocalDay('09/03/2026'), null);
});

test('the first event at or after the date wins', async () => {
  const calls: string[] = [];
  const id = await eventNearDate(async (_ts, dir) => {
    calls.push(dir);
    return { eventId: `$${dir}`, timestamp: 1 };
  }, 100);
  assert.equal(id, '$forward');
  assert.deepEqual(calls, ['forward']);
});

test('a date past the last message falls back to the closest earlier event', async () => {
  const id = await eventNearDate(
    async (_ts, dir) => (dir === 'backward' ? { eventId: '$last', timestamp: 1 } : null),
    100
  );
  assert.equal(id, '$last');
});

test('an empty room finds nothing', async () => {
  assert.equal(await eventNearDate(async () => null, 100), null);
});

test('server errors map to their messages', () => {
  assert.equal(
    jumpToDateErrorKey(Object.assign(new Error('x'), { code: 'unsupportedByServer' })),
    'room.jumpToDate.unsupported'
  );
  assert.equal(jumpToDateErrorKey(new Error('x')), 'room.jumpToDate.failed');
  assert.equal(jumpToDateErrorKey(null), 'room.jumpToDate.failed');
});
