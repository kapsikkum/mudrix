import type { Session, StoreConfig } from '@mudrix/core';
import { UPSTREAM_ACCOUNTS_KEY, UPSTREAM_SINGLE_ACCOUNT_KEY } from '@/util/namespace';

export const ACCOUNTS_KEY = 'mudrix.accounts';

export interface StoredAccount {
  session: Session;
  store: StoreConfig;
}

export interface AccountsState {
  active: string | null;
  accounts: Record<string, StoredAccount>;
}

/** The slice of localStorage the accounts need, so the migration can be tested without a browser */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The stored accounts. Installs from before the rename keep them under the upstream key (or, older
 * still, a single account under its single-account key); those are moved to ACCOUNTS_KEY the first
 * time they are read, so nobody is signed out by the rename.
 */
export function readAccountsState(storage: KeyValueStore): AccountsState {
  try {
    const raw = storage.getItem(ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw) as AccountsState;
    const previous = storage.getItem(UPSTREAM_ACCOUNTS_KEY);
    if (previous) {
      const migrated = JSON.parse(previous) as AccountsState;
      storage.setItem(ACCOUNTS_KEY, JSON.stringify(migrated));
      storage.removeItem(UPSTREAM_ACCOUNTS_KEY);
      return migrated;
    }
    const legacy = storage.getItem(UPSTREAM_SINGLE_ACCOUNT_KEY);
    if (legacy) {
      const account = JSON.parse(legacy) as StoredAccount;
      const migrated = {
        active: account.session.userId,
        accounts: { [account.session.userId]: account },
      };
      storage.setItem(ACCOUNTS_KEY, JSON.stringify(migrated));
      storage.removeItem(UPSTREAM_SINGLE_ACCOUNT_KEY);
      return migrated;
    }
  } catch {
    // Unreadable storage is treated as signed out
  }
  return { active: null, accounts: {} };
}
