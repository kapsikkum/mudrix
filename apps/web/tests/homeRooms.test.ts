import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RoomSummary } from '@mudrix/core';
import { isHomeRoom, selectHomeRooms } from '../src/app/features/room/homeRooms.ts';

const room = (id: string, fields: Partial<RoomSummary> = {}) =>
  ({ id, name: id, isDirect: false, ...fields }) as RoomSummary;

const noSpaces = () => false;

test('a plain joined room is in Home', () => {
  assert.equal(isHomeRoom(room('general'), noSpaces()), true);
});

test('a direct message is never in Home, it belongs to Direct Messages only', () => {
  const dm = room('dm-juno', { isDirect: true, dmUserId: '@juno:example.org', dmUserName: 'Juno' });
  assert.equal(isHomeRoom(dm, noSpaces()), false);
});

test('a direct message stays out of Home even when a space lists it as a child', () => {
  const dm = room('dm-juno', { isDirect: true, dmUserId: '@juno:example.org' });
  assert.equal(isHomeRoom(dm, true), false);
});

test('rooms inside a space belong to that space, not Home', () => {
  const child = room('category-room');
  assert.equal(isHomeRoom(child, true), false);
});

test('invites, tombstones and spaces are left out of Home', () => {
  assert.equal(isHomeRoom(room('invite', { isInvite: true }), noSpaces()), false);
  assert.equal(isHomeRoom(room('old', { isTombstoned: true }), noSpaces()), false);
  assert.equal(isHomeRoom(room('space', { isSpace: true }), noSpaces()), false);
});

test('selectHomeRooms keeps Home rooms in list order and drops everything else', () => {
  const rooms = [
    room('zebra'),
    room('dm-juno', { isDirect: true, dmUserId: '@juno:example.org' }),
    room('in-space'),
    room('alpha'),
    room('invite', { isInvite: true }),
  ];
  const picked = selectHomeRooms(rooms, (id) => id === 'in-space');
  assert.deepEqual(
    picked.map((r) => r.id),
    ['zebra', 'alpha']
  );
});
