import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RoomSummary } from '@wizardchat/core';
import { getRoomDisplayName } from '../src/util/matrix.ts';

const room = (fields: Partial<RoomSummary>) => fields as RoomSummary;

test('a DM whose partner left is named after the partner, not the SDK placeholder', () => {
  const dm = room({
    isDirect: true,
    dmUserId: '@sable:example.org',
    dmUserName: 'Sable',
    name: 'Empty Room (was Sable)',
  });
  assert.equal(getRoomDisplayName(dm), 'Sable');
});

test('a DM without a partner name keeps the room name', () => {
  const dm = room({ isDirect: true, dmUserId: '@sable:example.org', name: 'Sable' });
  assert.equal(getRoomDisplayName(dm), 'Sable');
});

test('a room keeps its own name, even with a partner name left over', () => {
  const group = room({ isDirect: false, name: 'general', dmUserName: null });
  assert.equal(getRoomDisplayName(group), 'general');
});

test('no room gives no name, so callers fall back to the id', () => {
  assert.equal(getRoomDisplayName(null), null);
  assert.equal(getRoomDisplayName(undefined), null);
  assert.equal(getRoomDisplayName(room({ isDirect: false, name: null })), null);
});
