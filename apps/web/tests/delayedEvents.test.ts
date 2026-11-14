import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  featuresAllowDelayedEvents,
  isEncryptedRoomRefusal,
  isUnsupportedByServer,
  scheduledMessagesOf,
} from '../src/app/features/timeline/composer/delayedEvents.ts';

const event = (over: Record<string, unknown>) => ({
  delayId: 'd1',
  roomId: '!a:x',
  eventType: 'm.room.message',
  stateKey: null,
  content: { msgtype: 'm.text', body: 'hi' },
  delayMs: 60_000,
  runningSince: 1_000,
  ...over,
});

test('the feature is read from the homeserver unstable features', () => {
  assert.equal(featuresAllowDelayedEvents(['org.matrix.msc4140']), true);
  assert.equal(featuresAllowDelayedEvents(['org.matrix.msc2285']), false);
  assert.equal(featuresAllowDelayedEvents([]), false);
});

test("only this room's pending messages are listed, soonest first", () => {
  const list = scheduledMessagesOf(
    [
      event({ delayId: 'late', delayMs: 90_000, content: { body: 'later' } }),
      event({ delayId: 'other-room', roomId: '!b:x' }),
      event({ delayId: 'state', eventType: 'm.room.topic', stateKey: '' }),
      event({ delayId: 'soon', delayMs: 10_000, runningSince: 5_000, content: { body: 'soon' } }),
    ] as never,
    '!a:x'
  );
  assert.deepEqual(
    list.map((m) => [m.delayId, m.body, m.sendAt]),
    [
      ['soon', 'soon', 15_000],
      ['late', 'later', 91_000],
    ]
  );
});

test('a message without text body lists with an empty body', () => {
  const [item] = scheduledMessagesOf([event({ content: { msgtype: 'm.image' } })] as never, '!a:x');
  assert.equal(item.body, '');
});

test('core refusals are told apart by code', () => {
  assert.equal(
    isUnsupportedByServer(Object.assign(new Error('x'), { code: 'unsupportedByServer' })),
    true
  );
  assert.equal(isUnsupportedByServer(new Error('x')), false);
  assert.equal(
    isEncryptedRoomRefusal(Object.assign(new Error('x'), { code: 'unsupported' })),
    true
  );
  assert.equal(
    isEncryptedRoomRefusal(Object.assign(new Error('x'), { code: 'unsupportedByServer' })),
    false
  );
  assert.equal(isUnsupportedByServer(null), false);
});
