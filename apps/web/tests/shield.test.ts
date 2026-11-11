import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shieldDisplay } from '../src/app/features/timeline/message/shield.ts';

test('no shield, no icon', () => {
  assert.equal(shieldDisplay(null), null);
});

test('grey shields stay quiet, red SDK shields warn', () => {
  assert.deepEqual(shieldDisplay({ color: 'grey', code: 'authenticityNotGuaranteed' }), {
    kind: 'grey',
    reasonKey: 'encryption.shield.authenticity',
  });
  assert.deepEqual(shieldDisplay({ color: 'red', code: 'unverifiedIdentity' }), {
    kind: 'warning',
    reasonKey: 'encryption.shield.unverifiedIdentity',
  });
  assert.equal(
    shieldDisplay({ color: 'red', code: 'verificationViolation' })?.reasonKey,
    'encryption.shield.violation'
  );
});

test('a message sent in the clear into an encrypted room is the strongest red', () => {
  assert.deepEqual(shieldDisplay({ color: 'red', code: 'sentInClear' }), {
    kind: 'red',
    reasonKey: 'encryption.shield.sentInClear',
  });
});
