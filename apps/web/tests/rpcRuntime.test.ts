import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReleasedError } from '../src/core/rpc/runtime.ts';

test('recognises the core error for a released object', () => {
  assert.equal(isReleasedError(new Error('this MudrixClient was released')), true);
  assert.equal(isReleasedError(new Error('this RoomListSubscription was released')), true);
});

test('leaves every other failure to be logged', () => {
  assert.equal(isReleasedError(new Error('sync failed: network')), false);
  assert.equal(isReleasedError(new Error('this MudrixClient was released late')), false);
  assert.equal(isReleasedError(new Error('no MudrixClient given')), false);
  assert.equal(isReleasedError('this MudrixClient was released'), false);
  assert.equal(isReleasedError(undefined), false);
});
