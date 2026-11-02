import { WizardClient, type PendingLogin } from '@wizardchat/core';
import { setStoredUserId } from '@/const/accountStorage';
import {
  DEVICE_NAME,
  appInfo,
  forgetAccount,
  loadCore,
  rememberSignIn,
  signInWithPassword,
  signInWithPopup,
} from '@/core/client';
import {
  ACCOUNTS_KEY,
  activeAccount,
  newStoreConfig,
  setActive,
  storedAccount,
  updateSession,
  deleteStore,
} from '@/core/storage';
import { clearMediaCache, mediaCacheDbName } from '@/app/features/timeline/message/mediaCache';
import { toCredentials } from './accounts';
import type { MatrixCredentials } from './types';

export { DEVICE_NAME, appInfo, loadCore };

const SESSION_END_TIMEOUT_MS = 3000;
const LOGOUT_TIMEOUT_MS = 10_000;

let client: WizardClient | null = null;
const sessionEndHandlers = new Set<() => Promise<void> | void>();
const subscriptions: { cancel(): void }[] = [];
const invalidHandlers = new Set<(softLogout: boolean) => void>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `handler` when the server ends the session (signed out elsewhere, token revoked) */
export function onSessionInvalid(handler: (softLogout: boolean) => void): () => void {
  invalidHandlers.add(handler);
  return () => invalidHandlers.delete(handler);
}

/** Runs `handler` before the session ends (sign-out, account switch) */
export function onSessionEnd(handler: () => Promise<void> | void): () => void {
  sessionEndHandlers.add(handler);
  return () => sessionEndHandlers.delete(handler);
}

async function endSession() {
  const handlers = [...sessionEndHandlers];
  await Promise.race([
    Promise.allSettled(handlers.map(async (handler) => handler())),
    sleep(SESSION_END_TIMEOUT_MS),
  ]);
  subscriptions.splice(0).forEach((s) => s.cancel());
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'clearSession' });
    const registration = await navigator.serviceWorker?.getRegistration();
    (await registration?.getNotifications())?.forEach((n) => n.close());
  } catch {
    // best effort
  }
  if (client)
    await Promise.race([client.stopSync().catch(() => {}), sleep(SESSION_END_TIMEOUT_MS)]);
  client = null;
}

export function getMatrixClient(): WizardClient {
  if (!client) throw new Error('Not signed in');
  return client;
}

export function getMatrixClientOrNull(): WizardClient | null {
  return client;
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function loadCredentials(): MatrixCredentials | null {
  const account = activeAccount();
  return account ? toCredentials(account) : null;
}

/** Calls `onLoaded` once the account's data can be shown: stored from before, or synced */
function whenLoaded(loaded: WizardClient, onLoaded: () => void) {
  let done = false;
  const subscription = loaded.watchLoadState((state) => {
    if (done || state === 'loading') return;
    done = true;
    queueMicrotask(() => subscription.cancel());
    onLoaded();
  });
  subscriptions.push(subscription);
}

/**
 * Restores a stored account, starts syncing and calls `onFirstSync` once its data is there
 * (from this device's store, or the first sync). Token refreshes are saved as they happen.
 */
export async function resume(
  credentials: MatrixCredentials,
  onFirstSync?: () => void
): Promise<WizardClient> {
  await loadCore();
  if (resuming?.userId !== credentials.userId && client?.userId() === credentials.userId) {
    if (onFirstSync) whenLoaded(client, onFirstSync);
    return client;
  }
  // A second caller (React runs effects twice in development) shares the restore in flight,
  // which only resolves once the sync is running
  if (resuming?.userId !== credentials.userId) {
    resuming = { userId: credentials.userId, client: restore(credentials) };
    resuming.client.catch(() => {}).finally(() => (resuming = null));
  }
  const restored = await resuming.client;
  if (onFirstSync) whenLoaded(restored, onFirstSync);
  return restored;
}

let resuming: { userId: string; client: Promise<WizardClient> } | null = null;

/** Another tab refreshed the tokens: newer than what this client uses */
function storedSessionIsNewer(current: WizardClient): boolean {
  const userId = current.userId();
  const stored = userId ? storedAccount(userId) : null;
  return !!stored && stored.session.accessToken !== current.session().accessToken;
}

async function restore(credentials: MatrixCredentials): Promise<WizardClient> {
  if (client) await endSession();
  const restored = await WizardClient.restore(credentials.session, credentials.store);
  client = restored;
  setActive(credentials.userId);
  setStoredUserId(credentials.userId);
  subscriptions.push(
    restored.watchSession((event) => {
      if (event.type === 'refreshed') updateSession(event.session);
      // The server rejected tokens another tab already replaced: start over with the new ones
      else if (storedSessionIsNewer(restored)) window.location.reload();
      else invalidHandlers.forEach((handler) => handler(event.softLogout));
    })
  );
  await restored.startSync();
  return restored;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== ACCOUNTS_KEY || !client) return;
    const userId = client.userId();
    const stored = userId ? storedAccount(userId) : null;
    if (stored && stored.session.accessToken !== client.session().accessToken)
      void client.adoptSession(stored.session).catch(() => {});
  });
}

/** Signs in with a password and stores the account */
export async function login(
  server: string,
  username: string,
  password: string
): Promise<MatrixCredentials> {
  await signInWithPassword(server, username, password);
  return loadCredentials()!;
}

/** Signs in on the server's page (OAuth or SSO) in a popup opened synchronously by the caller */
export async function loginWithPopup(
  popup: Window | null,
  start: (store: ReturnType<typeof newStoreConfig>, redirectUri: string) => Promise<PendingLogin>
): Promise<MatrixCredentials> {
  await signInWithPopup(popup, start);
  return loadCredentials()!;
}

/** Creates an account and stores it */
export async function register(
  server: string,
  username: string,
  password: string,
  token?: string
): Promise<MatrixCredentials> {
  await loadCore();
  const store = newStoreConfig();
  try {
    const created = await WizardClient.register(
      server,
      username,
      password,
      DEVICE_NAME,
      token,
      store
    );
    rememberSignIn(created.session(), store);
    created.free();
    return loadCredentials()!;
  } catch (error) {
    await deleteStore(store);
    throw error;
  }
}

let switching = false;

/** Switches to another stored account (the page reloads into it) */
export async function switchAccount(userId: string): Promise<void> {
  if (switching || activeAccount()?.session.userId === userId || !storedAccount(userId)) return;
  switching = true;
  await endSession();
  setActive(userId);
  setStoredUserId(userId);
  window.location.assign('/');
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

/** What this device keeps for an account besides the core's store */
async function deleteAccountData(userId: string): Promise<void> {
  if (activeAccount()?.session.userId === userId) await clearMediaCache();
  await deleteDatabase(mediaCacheDbName(userId));
  Object.keys(localStorage)
    .filter((key) => key.endsWith(`::${userId}`))
    .forEach((key) => localStorage.removeItem(key));
}

/**
 * Signs out (on the server when possible) and forgets the account. Signing out the active
 * account continues with another stored account, or the welcome page.
 */
export async function logout(fallbackUserId?: string | null): Promise<void> {
  const current = client;
  const activeId = activeAccount()?.session.userId ?? null;
  const userId = fallbackUserId ?? current?.userId() ?? activeId;
  const currentId = current?.userId() ?? null;
  const isCurrent = !!userId && (currentId ? userId === currentId : userId === activeId);
  const stored = userId ? storedAccount(userId) : null;

  if (isCurrent) await endSession();
  if (isCurrent && current) {
    await Promise.race([current.logout(), sleep(LOGOUT_TIMEOUT_MS)]).catch(() => {});
    current.free();
  } else if (stored) {
    await loadCore();
    await WizardClient.logoutSession(stored.session).catch(() => {});
  }

  if (!userId) return;
  await deleteAccountData(userId);
  const next = await forgetAccount(userId);
  if (!isCurrent) return;
  setStoredUserId(next);
  window.location.assign(next ? '/' : '/welcome');
}

/** Another tab switched or ended the session: stop this tab's client without signing out */
export async function endSessionForOtherTab(): Promise<void> {
  const current = client;
  await endSession();
  current?.free();
}
