import { readAccountsState } from '@/core/accountsState';
import { STORAGE_KEY_ACTIVE_ACCOUNT } from './storageKeys';

function readUserIdFromStorage(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const active = localStorage.getItem(STORAGE_KEY_ACTIVE_ACCOUNT);
    if (active) return active;
    // The active-account key can be missing from older installs: the accounts state knows.
    const state = readAccountsState(localStorage);
    return state.active && Object.prototype.hasOwnProperty.call(state.accounts, state.active)
      ? state.active
      : null;
  } catch {
    return null;
  }
}

let currentUserId: string | null = readUserIdFromStorage();

const listeners = new Set<() => void>();

export function getStoredUserId(): string | null {
  return currentUserId;
}

export function setStoredUserId(userId: string | null): void {
  if (currentUserId === userId) return;
  currentUserId = userId;
  listeners.forEach((listener) => listener());
}

export function subscribeStoredUserId(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const ANONYMOUS_SCOPE = '__anon__';

export function accountStorageKey(baseKey: string): string {
  return `${baseKey}::${currentUserId ?? ANONYMOUS_SCOPE}`;
}
