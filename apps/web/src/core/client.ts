import init, {
  WizardClient,
  type LoginIdentifier,
  type PendingLogin,
  type Session,
} from '@wizardchat/core';
import {
  activeAccount,
  deleteStore,
  listAccounts,
  newStoreConfig,
  removeAccount,
  saveAccount,
} from './storage';
import { STORAGE_KEY_OIDC_CLIENT_ID_PREFIX } from '@/const/storageKeys';
import { isDesktop, signInInBrowser } from '@/bridge/desktop';

let ready: Promise<unknown> | null = null;

export const DEVICE_NAME = isDesktop ? 'Mudrix Desktop' : 'Mudrix Web';
export const AUTH_CALLBACK_PATH = '/auth/callback';
const AUTH_MESSAGE = 'wizardchat-auth-callback';
const AUTH_CHANNEL = 'wizardchat-auth';

/** Loads and starts the wasm core once */
export function loadCore(): Promise<unknown> {
  ready ??= init();
  return ready;
}

/** Asks the browser not to evict the core's stores (session and keys) under storage pressure */
export async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return;
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // best effort: eviction is the browser's policy
  }
}

/** Client IDs this app registered with OAuth servers, by homeserver URL */
export function knownOAuthClients(): Record<string, string> {
  const clients: Record<string, string> = {};
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(STORAGE_KEY_OIDC_CLIENT_ID_PREFIX)) continue;
    const clientId = localStorage.getItem(key);
    if (clientId) clients[key.slice(STORAGE_KEY_OIDC_CLIENT_ID_PREFIX.length)] = clientId;
  }
  return clients;
}

/** Stores a new sign-in as the active account, replacing an older sign-in of the same account */
export function rememberSignIn(session: Session, store: ReturnType<typeof newStoreConfig>): void {
  const replaced = listAccounts().find(
    (account) =>
      account.session.userId === session.userId && account.store.location !== store.location
  );
  saveAccount({ session, store });
  if (session.oauthClientId) {
    localStorage.setItem(
      `${STORAGE_KEY_OIDC_CLIENT_ID_PREFIX}${session.homeserverUrl}`,
      session.oauthClientId
    );
  }
  void requestPersistentStorage();
  if (replaced) void deleteStore(replaced.store);
}

/** Saves the sign-in; the session is restored from storage, so this handle isn't needed */
function remember(client: WizardClient, store: ReturnType<typeof newStoreConfig>) {
  rememberSignIn(client.session(), store);
  client.free();
}

export async function signInWithPassword(
  server: string,
  identifier: LoginIdentifier,
  password: string
) {
  await loadCore();
  const store = newStoreConfig();
  try {
    remember(
      await WizardClient.loginPassword(server, identifier, password, DEVICE_NAME, store),
      store
    );
  } catch (error) {
    await deleteStore(store);
    throw error;
  }
}

/**
 * Runs in the page the server redirected to: hands the URL back to the window that started the
 * sign-in (its opener, or through a channel when the opener was lost) and closes.
 */
export function handleAuthCallbackPopup(): boolean {
  if (location.pathname !== AUTH_CALLBACK_PATH) return false;
  const message = { type: AUTH_MESSAGE, url: location.href };
  if (window.opener) {
    (window.opener as Window).postMessage(message, location.origin);
  } else if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } else {
    return false;
  }
  window.close();
  // Tabs the user opened themselves can't be closed by script
  setTimeout(() => location.replace('/'), 1000);
  return true;
}

function waitForCallback(popup: Window): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(AUTH_CHANNEL) : null;
    const onMessage = (event: MessageEvent) => {
      if (event.origin && event.origin !== location.origin) return;
      if (event.data?.type !== AUTH_MESSAGE) return;
      cleanup();
      resolve(String(event.data.url));
    };
    const closed = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(Object.assign(new Error('popup closed'), { code: 'popupClosed' }));
      }
    }, 500);
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      channel?.close();
      clearInterval(closed);
    };
    window.addEventListener('message', onMessage);
    channel?.addEventListener('message', onMessage);
  });
}

/**
 * Signs in on the server's own page (OAuth or SSO) in a popup. The popup must be opened
 * synchronously in the click handler, before anything async, or browsers block it.
 */
export async function signInWithPopup(
  popup: Window | null,
  start: (store: ReturnType<typeof newStoreConfig>, redirectUri: string) => Promise<PendingLogin>
) {
  if (isDesktop) return signInWithBrowser(start);
  if (!popup) throw Object.assign(new Error('popup blocked'), { code: 'popupBlocked' });
  await loadCore();
  const store = newStoreConfig();
  let pending: PendingLogin | null = null;
  try {
    pending = await start(store, `${location.origin}${AUTH_CALLBACK_PATH}`);
    popup.location.href = pending.url();
    const callback = await waitForCallback(popup);
    const client = await pending.finish(callback, DEVICE_NAME);
    pending = null;
    remember(client, store);
  } catch (error) {
    popup.close();
    if (pending) await pending.abort();
    await deleteStore(store);
    throw error;
  }
}

async function signInWithBrowser(
  start: (store: ReturnType<typeof newStoreConfig>, redirectUri: string) => Promise<PendingLogin>
) {
  const store = newStoreConfig();
  let pending: PendingLogin | null = null;
  try {
    const client = await signInInBrowser(
      async (redirectUri) => (pending = await start(store, redirectUri)),
      (callback) => pending!.finish(callback, DEVICE_NAME)
    );
    pending = null;
    remember(client, store);
  } catch (error) {
    if (pending) await (pending as PendingLogin).abort();
    await deleteStore(store);
    throw error;
  }
}

export const appInfo = () => ({
  name: 'Mudrix',
  // Servers only accept a public https client URI, so local builds use the homepage
  clientUri:
    isDesktop || location.protocol !== 'https:' ? import.meta.env.APP_HOME_URL : location.origin,
});

/** Removes an account locally (also used when the server ended the session) */
export async function forgetAccount(userId: string): Promise<string | null> {
  const removed = removeAccount(userId);
  if (removed) await deleteStore(removed.store);
  return activeAccount()?.session.userId ?? null;
}

export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}
