import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applySpaceOrder } from '../src/app/features/room/spaceRailOrder.ts';

const ids = (items: { roomId: string }[]) => items.map((item) => item.roomId);
const space = (roomId: string) => ({ roomId });

test('with no saved order the rail keeps the order it came in', () => {
  const spaces = [space('!mud:x'), space('!parity:x')];
  assert.deepEqual(ids(applySpaceOrder(spaces, [], (s) => s.roomId)), ['!mud:x', '!parity:x']);
});

test('the saved order puts the spaces it names first, in that order', () => {
  const spaces = [space('!mud:x'), space('!parity:x'), space('!other:x')];
  assert.deepEqual(ids(applySpaceOrder(spaces, ['!parity:x', '!mud:x'], (s) => s.roomId)), [
    '!parity:x',
    '!mud:x',
    '!other:x',
  ]);
});

test('a space the saved order does not name keeps its place after the named ones', () => {
  const spaces = [space('!new:x'), space('!mud:x'), space('!parity:x')];
  assert.deepEqual(ids(applySpaceOrder(spaces, ['!parity:x'], (s) => s.roomId)), [
    '!parity:x',
    '!new:x',
    '!mud:x',
  ]);
});

test('a saved order for spaces that are gone changes nothing', () => {
  const spaces = [space('!mud:x'), space('!parity:x')];
  assert.deepEqual(ids(applySpaceOrder(spaces, ['!left:x', '!gone:x'], (s) => s.roomId)), [
    '!mud:x',
    '!parity:x',
  ]);
});

test('the input list is not changed in place', () => {
  const spaces = [space('!mud:x'), space('!parity:x')];
  applySpaceOrder(spaces, ['!parity:x'], (s) => s.roomId);
  assert.deepEqual(ids(spaces), ['!mud:x', '!parity:x']);
});
