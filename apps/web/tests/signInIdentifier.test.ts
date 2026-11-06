import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  interpretIdentifier,
  parseIdentifier,
  toLoginIdentifier,
} from '../src/app/pages/auth/signInIdentifier.ts';

test('reads what the sign-in box can hold', () => {
  assert.deepEqual(parseIdentifier(' ash '), { kind: 'user', user: 'ash' });
  assert.deepEqual(parseIdentifier('@ash'), { kind: 'user', user: 'ash' });
  assert.deepEqual(parseIdentifier('@ash:example.org'), {
    kind: 'mxid',
    user: '@ash:example.org',
  });
  assert.deepEqual(parseIdentifier('ash@mail.example'), {
    kind: 'email',
    address: 'ash@mail.example',
  });
  assert.deepEqual(parseIdentifier('+49 151 234567'), { kind: 'phone', number: '49151234567' });
  assert.equal(parseIdentifier('  '), null);
});

test('a run of digits is a username, not a phone number', () => {
  assert.deepEqual(parseIdentifier('1234567'), { kind: 'user', user: '1234567' });
});

test('an email on the server name is a user id written email-style', () => {
  assert.deepEqual(interpretIdentifier('ash@example.org', 'example.org'), {
    kind: 'user',
    user: 'ash',
  });
  assert.deepEqual(interpretIdentifier('ash@mail.example', 'example.org'), {
    kind: 'email',
    address: 'ash@mail.example',
  });
});

test('becomes the core identifier', () => {
  assert.deepEqual(toLoginIdentifier({ kind: 'mxid', user: '@a:b.org' }), {
    type: 'user',
    user: '@a:b.org',
  });
  assert.deepEqual(toLoginIdentifier({ kind: 'phone', number: '491' }), {
    type: 'phone',
    number: '491',
  });
});
