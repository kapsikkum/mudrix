import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNTS_KEY, readAccountsState, type KeyValueStore } from '../src/core/accountsState.ts';
import { UPSTREAM_ACCOUNTS_KEY, UPSTREAM_SINGLE_ACCOUNT_KEY } from '../src/util/namespace.ts';

function memory(initial: Record<string, string>): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const account = (userId: string) => ({
  session: { userId } as never,
  store: { location: `store-${userId}`, passphrase: 'p' } as never,
});

test('accounts under the current key are read as they are', () => {
  const state = { active: '@a:x', accounts: { '@a:x': account('@a:x') } };
  const storage = memory({ [ACCOUNTS_KEY]: JSON.stringify(state) });
  assert.deepEqual(readAccountsState(storage), state);
});

test('accounts from before the rename move to the current key and stay signed in', () => {
  const state = {
    active: '@b:x',
    accounts: { '@a:x': account('@a:x'), '@b:x': account('@b:x') },
  };
  const storage = memory({ [UPSTREAM_ACCOUNTS_KEY]: JSON.stringify(state) });
  assert.deepEqual(readAccountsState(storage), state);
  assert.deepEqual(JSON.parse(storage.data.get(ACCOUNTS_KEY)!), state);
  assert.equal(storage.data.has(UPSTREAM_ACCOUNTS_KEY), false);
  // a second read uses the moved copy
  assert.deepEqual(readAccountsState(storage), state);
});

test('the single-account key from even older installs becomes the active account', () => {
  const storage = memory({ [UPSTREAM_SINGLE_ACCOUNT_KEY]: JSON.stringify(account('@c:x')) });
  const state = readAccountsState(storage);
  assert.equal(state.active, '@c:x');
  assert.deepEqual(Object.keys(state.accounts), ['@c:x']);
  assert.equal(storage.data.has(UPSTREAM_SINGLE_ACCOUNT_KEY), false);
});

test('nothing stored, or unreadable storage, means signed out', () => {
  assert.deepEqual(readAccountsState(memory({})), { active: null, accounts: {} });
  assert.deepEqual(readAccountsState(memory({ [ACCOUNTS_KEY]: '{not json' })), {
    active: null,
    accounts: {},
  });
});
