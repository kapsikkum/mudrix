import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  READ_RECEIPT_RESEND_MS,
  decideReadReceipt,
  isServerEventId,
  roomHasUnread,
  type ReadReceiptInput,
} from '../src/app/features/timeline/readReceipt.ts';

const base: ReadReceiptInput = {
  focused: true,
  visible: true,
  atBottom: true,
  atLiveEnd: true,
  latestEventId: '$new:mudrix.test',
  lastSentEventId: null,
  lastSentAt: null,
  roomUnread: false,
  now: 1_000_000,
};

const decide = (patch: Partial<ReadReceiptInput>) => decideReadReceipt({ ...base, ...patch });

test('an open, focused room at the live end reads a new message', () => {
  assert.deepEqual(decide({}), { send: true });
});

test('a new message is read even when the room no longer reports unread', () => {
  assert.deepEqual(
    decide({ lastSentEventId: '$old:mudrix.test', lastSentAt: base.now - 1, roomUnread: false }),
    { send: true }
  );
});

test('nothing is read while the timeline is scrolled up', () => {
  assert.deepEqual(decide({ atBottom: false }), { send: false, reason: 'scrolled-up' });
});

test('nothing is read when the view is parked on older history', () => {
  assert.deepEqual(decide({ atLiveEnd: false }), { send: false, reason: 'not-live' });
});

test('nothing is read in a hidden or unfocused tab', () => {
  assert.deepEqual(decide({ visible: false }), { send: false, reason: 'hidden' });
  assert.deepEqual(decide({ focused: false }), { send: false, reason: 'unfocused' });
});

test('nothing is read for an empty view or a local echo', () => {
  assert.deepEqual(decide({ latestEventId: null }), { send: false, reason: 'no-event' });
  assert.deepEqual(decide({ latestEventId: '~!local:mudrix.test' }), {
    send: false,
    reason: 'pending-event',
  });
});

test('the same event is not resent within the resend window', () => {
  assert.deepEqual(
    decide({
      lastSentEventId: base.latestEventId,
      lastSentAt: base.now - (READ_RECEIPT_RESEND_MS - 1),
      roomUnread: true,
    }),
    { send: false, reason: 'already-sent' }
  );
});

test('the same event is retried after the resend window while the room stays unread', () => {
  assert.deepEqual(
    decide({
      lastSentEventId: base.latestEventId,
      lastSentAt: base.now - READ_RECEIPT_RESEND_MS,
      roomUnread: true,
    }),
    { send: true }
  );
});

test('the same event is not retried for an already read room', () => {
  assert.deepEqual(
    decide({
      lastSentEventId: base.latestEventId,
      lastSentAt: base.now - READ_RECEIPT_RESEND_MS * 10,
      roomUnread: false,
    }),
    { send: false, reason: 'already-sent' }
  );
});

test('server event ids exclude local echoes', () => {
  assert.equal(isServerEventId('$abc:mudrix.test'), true);
  assert.equal(isServerEventId('~!abc:mudrix.test'), false);
  assert.equal(isServerEventId(''), false);
  assert.equal(isServerEventId(null), false);
  assert.equal(isServerEventId(undefined), false);
});

test('roomHasUnread covers counts and the marked-unread flag', () => {
  const read = {
    unreadMessages: 0,
    unreadMentions: 0,
    unreadNotifications: 0,
    markedUnread: false,
  };
  assert.equal(roomHasUnread(read), false);
  assert.equal(roomHasUnread(null), false);
  assert.equal(roomHasUnread({ ...read, unreadMessages: 1 }), true);
  assert.equal(roomHasUnread({ ...read, unreadMentions: 1 }), true);
  assert.equal(roomHasUnread({ ...read, unreadNotifications: 1 }), true);
  assert.equal(roomHasUnread({ ...read, markedUnread: true }), true);
});
