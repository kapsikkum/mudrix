import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIN_PASSPHRASE_LENGTH,
  ROOM_KEYS_FILE_NAME,
  canExportKeys,
  coreErrorCode,
  isPassphraseLongEnough,
  keyFileName,
} from '../src/app/features/settings/encryption/roomKeys.ts';

test('a passphrase must be long enough', () => {
  assert.equal(MIN_PASSPHRASE_LENGTH, 1);
  assert.ok(!isPassphraseLongEnough(''));
  assert.ok(isPassphraseLongEnough('correct horse'));
});

test('an export needs the passphrase twice', () => {
  assert.ok(canExportKeys('hunter2', 'hunter2'));
  assert.ok(!canExportKeys('hunter2', 'hunter3'));
  assert.ok(!canExportKeys('hunter2', ''));
  assert.ok(!canExportKeys('', ''));
});

test('the export file name is Mudrix branded', () => {
  assert.equal(ROOM_KEYS_FILE_NAME, 'mudrix-room-keys.txt');
  assert.ok(!/wizardchat/i.test(ROOM_KEYS_FILE_NAME));
});

test('a chosen file shows only its name', () => {
  assert.equal(
    keyFileName('C:\\Users\\me\\Downloads\\mudrix-room-keys.txt'),
    'mudrix-room-keys.txt'
  );
  assert.equal(keyFileName('/home/me/keys.txt'), 'keys.txt');
  assert.equal(keyFileName('keys.txt'), 'keys.txt');
});

test('the core error code is read from the error and nowhere else', () => {
  assert.equal(
    coreErrorCode(Object.assign(new Error('nope'), { code: 'wrongRecoveryKey' })),
    'wrongRecoveryKey'
  );
  assert.equal(coreErrorCode(new Error('nope')), null);
  assert.equal(coreErrorCode(null), null);
  assert.equal(coreErrorCode('wrongRecoveryKey'), null);
  assert.equal(coreErrorCode({ code: 7 }), null);
});
