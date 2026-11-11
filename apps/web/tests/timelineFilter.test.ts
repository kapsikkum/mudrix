import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SHOW_ALL,
  isReceiptAnchorEntry,
  isSystemLine,
  isTimelineRenderedEntry,
} from '../src/app/hooks/timelineFilter.ts';

const event = (content: Record<string, unknown>) => ({ kind: 'event', id: 'x', content }) as never;

const join = event({ type: 'membership', userId: '@a:x', change: 'Joined' });
const leave = event({ type: 'membership', userId: '@a:x', change: 'Left' });
const kick = event({ type: 'membership', userId: '@a:x', change: 'Kicked' });
const invite = event({ type: 'membership', userId: '@a:x', change: 'Invited' });
const rename = event({
  type: 'profileChange',
  userId: '@a:x',
  displayName: { from: 'A', to: 'B' },
  avatar: null,
});
const newAvatar = event({
  type: 'profileChange',
  userId: '@a:x',
  displayName: null,
  avatar: 'changed',
});
const nothing = event({ type: 'profileChange', userId: '@a:x', displayName: null, avatar: null });
const text = event({ type: 'text', body: 'hi' });
const state = event({ type: 'state' });

const defaults = { hideMembership: false, hideProfile: true };

test('by default joins and leaves show and profile changes do not', () => {
  assert.equal(isTimelineRenderedEntry(join, defaults), true);
  assert.equal(isTimelineRenderedEntry(leave, defaults), true);
  assert.equal(isTimelineRenderedEntry(kick, defaults), true);
  assert.equal(isTimelineRenderedEntry(rename, defaults), false);
  assert.equal(isTimelineRenderedEntry(newAvatar, defaults), false);
});

test('hide joins and leaves hides them all, kicks included, but not messages', () => {
  const prefs = { hideMembership: true, hideProfile: true };
  for (const e of [join, leave, kick]) assert.equal(isTimelineRenderedEntry(e, prefs), false);
  assert.equal(isTimelineRenderedEntry(text, prefs), true);
});

test('profile changes show once they are not hidden', () => {
  const prefs = { hideMembership: false, hideProfile: false };
  assert.equal(isTimelineRenderedEntry(rename, prefs), true);
  assert.equal(isTimelineRenderedEntry(newAvatar, prefs), true);
  assert.equal(isTimelineRenderedEntry(nothing, prefs), false);
});

test('invites and state events never get a row', () => {
  assert.equal(isTimelineRenderedEntry(invite, SHOW_ALL), false);
  assert.equal(isTimelineRenderedEntry(state, SHOW_ALL), false);
});

test('read receipts sit on messages only', () => {
  assert.equal(isReceiptAnchorEntry(text), true);
  for (const e of [join, leave, rename, newAvatar]) assert.equal(isReceiptAnchorEntry(e), false);
});

test('joins and profile changes are system lines', () => {
  assert.equal(isSystemLine(join as never), true);
  assert.equal(isSystemLine(rename as never), true);
  assert.equal(isSystemLine(text as never), false);
});
