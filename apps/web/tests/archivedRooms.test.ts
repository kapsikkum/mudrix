import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RoomSummary } from '@mudrix/core';
import { splitArchived, splitArchivedHierarchy } from '../src/app/features/room/archivedRooms.ts';
import type {
  HierarchyItem,
  HierarchyRoomItem,
  HierarchySpaceItem,
} from '../src/app/features/room/useSpaceHierarchy.ts';

const room = (id: string, fields: Partial<RoomSummary> = {}) =>
  ({ id, name: id, isDirect: false, isArchived: false, ...fields }) as RoomSummary;

const entry = (id: string, fields: Partial<RoomSummary> = {}) => ({
  room: room(id, fields),
  roomId: id,
  name: id,
});

const hierarchyRoom = (id: string, archived: boolean): HierarchyRoomItem => ({
  kind: 'room',
  roomId: id,
  parentSpaceId: '!space:example.org',
  categoryKey: '!space:example.org::!space:example.org',
  entry: {
    room: room(id, { isArchived: archived }),
    roomId: id,
    name: id,
    avatarMxc: null,
    unreadCount: 0,
    hasNotif: false,
    inviterUserId: null,
    inviterDisplayName: null,
    hasVoiceRoom: false,
  },
  depth: 1,
});

const hierarchyHeader: HierarchySpaceItem = {
  kind: 'space',
  roomId: '!space:example.org',
  categoryKey: '!space:example.org::!space:example.org',
  name: 'Space',
  avatarMxc: null,
  hasNotif: false,
  hasMention: false,
  isRoot: true,
  depth: 0,
};

test('archived DMs and rooms leave the main list and land in Archived', () => {
  const rows = [
    entry('dm-juno', { isDirect: true }),
    entry('dm-lin', { isDirect: true, isArchived: true }),
    entry('general'),
    entry('old-room', { isArchived: true }),
  ];

  const { active, archived } = splitArchived(rows, (row) => row.room.isArchived);

  assert.deepEqual(
    active.map((row) => row.roomId),
    ['dm-juno', 'general']
  );
  assert.deepEqual(
    archived.map((row) => row.roomId),
    ['dm-lin', 'old-room']
  );
});

test('an archived space room leaves its category and joins the Archived rows', () => {
  const items: HierarchyItem[] = [
    hierarchyHeader,
    hierarchyRoom('general', false),
    hierarchyRoom('old-room', true),
    hierarchyRoom('lounge', false),
  ];

  const { active, archived } = splitArchivedHierarchy(items);

  assert.deepEqual(
    active.map((item) => (item.kind === 'room' ? item.roomId : 'header')),
    ['header', 'general', 'lounge']
  );
  assert.deepEqual(
    archived.map((item) => item.roomId),
    ['old-room']
  );
});

test('the Archived list keeps the order the rooms arrived in', () => {
  const rows = [entry('zebra'), entry('alpha')];
  const { archived } = splitArchived(rows, () => true);
  assert.deepEqual(
    archived.map((row) => row.roomId),
    ['zebra', 'alpha']
  );
});
