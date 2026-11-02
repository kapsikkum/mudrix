import type { MatrixCredentials } from './types';
import {
  activeAccount,
  listAccounts as listStored,
  removeAccount as removeStored,
  saveAccount,
  setActive,
  type StoredAccount,
} from '@/core/storage';

export type AccountsMap = Record<string, MatrixCredentials>;

export function toCredentials(account: StoredAccount): MatrixCredentials {
  const { session, store } = account;
  return {
    userId: session.userId,
    accessToken: session.accessToken,
    deviceId: session.deviceId,
    homeserverUrl: session.homeserverUrl,
    session,
    store,
  };
}

export function loadAccounts(): AccountsMap {
  return Object.fromEntries(listStored().map((a) => [a.session.userId, toCredentials(a)]));
}

export function listAccounts(): MatrixCredentials[] {
  return listStored().map(toCredentials);
}

export function getAccount(userId: string): MatrixCredentials | null {
  return loadAccounts()[userId] ?? null;
}

export function getActiveAccountId(): string | null {
  return activeAccount()?.session.userId ?? null;
}

export function setActiveAccountId(userId: string | null): void {
  if (userId) setActive(userId);
}

export function upsertAccount(credentials: MatrixCredentials): void {
  saveAccount({ session: credentials.session, store: credentials.store });
}

export function removeAccount(userId: string): void {
  removeStored(userId);
}
