import { activeAccount } from '@/core/storage';
import { STORAGE_KEY_ACTIVE_ACCOUNT } from './storageKeys';

function readUserIdFromStorage(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return (
      localStorage.getItem(STORAGE_KEY_ACTIVE_ACCOUNT) ?? activeAccount()?.session.userId ?? null
    );
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
