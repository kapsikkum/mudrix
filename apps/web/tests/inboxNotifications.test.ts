import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ServerNotification } from '@wizardchat/core';
import {
  mergeMentionCounts,
  roomsWithUnreadThreads,
  threadCandidates,
  unreadCountsByRoom,
} from '../src/app/features/inbox/inboxNotifications.ts';

const note = (
  roomId: string,
  extra: { read?: boolean; threadRootId?: string | null } = {}
): ServerNotification => ({
  roomId,
  eventId: `$event-${roomId}`,
  sender: '@alice:example.org',
  timestamp: 1,
  read: extra.read ?? false,
  threadRootId: extra.threadRootId ?? null,
});

test('unread notifications are counted per room, read ones are not', () => {
  const counts = unreadCountsByRoom([
    note('!a'),
    note('!a'),
    note('!a', { read: true }),
    note('!b'),
  ]);
  assert.deepEqual(Object.fromEntries(counts), { '!a': 2, '!b': 1 });
});

test('a room mention count is the higher of its own and the server count', () => {
  const merged = mergeMentionCounts(
    [
      { id: '!a', unreadMentions: 1 },
      { id: '!b', unreadMentions: 0 },
      { id: '!c', unreadMentions: 2 },
    ],
    new Map([
      ['!a', 3],
      ['!b', 2],
      ['!d', 5],
    ])
  );
  assert.deepEqual(Object.fromEntries(merged), { '!a': 3, '!b': 2, '!c': 2 });
});

test('without server counts the room counts stand, and rooms with none are left out', () => {
  const merged = mergeMentionCounts(
    [
      { id: '!a', unreadMentions: 1 },
      { id: '!b', unreadMentions: 0 },
    ],
    new Map()
  );
  assert.deepEqual(Object.fromEntries(merged), { '!a': 1 });
});

test('rooms with unread thread replies are the unread notifications in a thread', () => {
  const rooms = roomsWithUnreadThreads([
    note('!a', { threadRootId: '$root' }),
    note('!b', { threadRootId: '$root', read: true }),
    note('!c', { threadRootId: null }),
  ]);
  assert.deepEqual([...rooms], ['!a']);
});

test('thread candidates are the busiest rooms plus rooms with unread threads beyond them', () => {
  const rooms = [
    { id: '!1', lastActivity: 5 },
    { id: '!2', lastActivity: 4 },
    { id: '!3', lastActivity: 3 },
    { id: '!4', lastActivity: null },
  ];
  const picked = threadCandidates(rooms, new Set(['!4']), 2);
  assert.deepEqual(
    picked.map((room) => room.id),
    ['!1', '!2', '!4']
  );
});

test('a busy room with unread threads is listed once', () => {
  const rooms = [
    { id: '!1', lastActivity: 5 },
    { id: '!2', lastActivity: 4 },
  ];
  const picked = threadCandidates(rooms, new Set(['!1']), 2);
  assert.deepEqual(
    picked.map((room) => room.id),
    ['!1', '!2']
  );
});
