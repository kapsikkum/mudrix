import { MudrixClient, type HomeserverSoftware, type IdentityProvider } from '@mudrix/core';
import { appInfo, loadCore, loginWithPopup } from '@/client/initMatrix';
import type { MatrixCredentials } from '@/client/types';
import { matrixErrcode } from '@/app/features/auth/matrixError';
import { errorCode, knownOAuthClients } from '@/core/client';
import { isNativeApp, openAuthUrlAndWaitForReturn } from '@/util/nativeApp';
import { isDesktop } from '@/bridge/desktop';
import { safeExternalUrl } from '@/util/safeUrl';

export type { IdentityProvider };

export function resolveIdpIconUrl(homeserverUrl: string, icon: string | null): string | null {
  const match = icon?.match(/^mxc:\/\/([^/]+)\/([^/?#]+)/);
  if (!match) return null;
  const base = homeserverUrl.replace(/\/+$/, '');
  return `${base}/_matrix/media/v3/thumbnail/${match[1]}/${match[2]}?width=96&height=96&method=crop&allow_redirect=false`;
}

export enum RegisterStatus {
  Available = 'available',
  Disabled = 'disabled',
  RateLimited = 'rateLimited',
  Unavailable = 'unavailable',
}

export enum DiscoveryStatus {
  Ok = 'ok',
  Unreachable = 'unreachable',
  WellKnownInvalid = 'wellKnownInvalid',
  /** The address answers, but it is not a Matrix server */
  NotMatrix = 'notMatrix',
}

export interface AuthCapabilities {
  resolvedBaseUrl: string;
  hasPasswordLogin: boolean;
  /** Identity providers for SSO (an entry with a null id is the server's generic SSO) */
  ssoProviders: IdentityProvider[];
  registerStatus: RegisterStatus;
  /** Steps of each registration flow the server offers */
  registerFlows: string[][];
  discoveryStatus: DiscoveryStatus;
  delegatedAuth: boolean;
  /** Signing in by scanning a QR code with another device works with this server */
  qrLogin: boolean;
  /** What the server runs, when it could be asked before signing in */
  software?: HomeserverSoftware;
  accountManagementUri?: string;
}

const AUTH_METADATA_PATHS = [
  '/_matrix/client/v1/auth_metadata',
  '/_matrix/client/unstable/org.matrix.msc2965/auth_metadata',
];

async function fetchAccountManagementUri(baseUrl: string): Promise<string | undefined> {
  const base = baseUrl.replace(/\/+$/, '');
  for (const path of AUTH_METADATA_PATHS) {
    try {
      const res = await fetch(`${base}${path}`);
      if (!res.ok) continue;
      const body = (await res.json()) as { account_management_uri?: unknown };
      return typeof body.account_management_uri === 'string'
        ? body.account_management_uri
        : undefined;
    } catch {
      // try the next one
    }
  }
  return undefined;
}

function isRateLimited(err: unknown): boolean {
  return matrixErrcode(err) === 'M_LIMIT_EXCEEDED';
}

/**
 * What the server says it runs, asked of the base URL the client actually talks to (the address in
 * the box, or what its `.well-known` names). Best effort: a server that refuses cross-site requests
 * from browsers, or hides its version, just has no name. The reply is untrusted, so only short
 * plain strings are kept.
 */
async function detectSoftware(baseUrl: string): Promise<HomeserverSoftware | undefined> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/_matrix/federation/v1/version`, {
      cache: 'no-store',
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { server?: { name?: unknown; version?: unknown } };
    const name = typeof body.server?.name === 'string' ? body.server.name.trim().slice(0, 40) : '';
    if (!name) return undefined;
    return {
      name,
      version:
        typeof body.server?.version === 'string' ? body.server.version.trim().slice(0, 40) : '',
    };
  } catch {
    return undefined;
  }
}

export async function discoverAuthCapabilities(homeserverUrl: string): Promise<AuthCapabilities> {
  await loadCore();
  const result: AuthCapabilities = {
    resolvedBaseUrl: homeserverUrl,
    hasPasswordLogin: false,
    ssoProviders: [],
    registerStatus: RegisterStatus.Unavailable,
    registerFlows: [],
    discoveryStatus: DiscoveryStatus.Ok,
    delegatedAuth: false,
    qrLogin: false,
    accountManagementUri: undefined,
  };

  let info;
  try {
    info = await MudrixClient.discover(homeserverUrl);
  } catch (err) {
    console.warn('[auth] login flow discovery failed for', homeserverUrl, err);
    const code = errorCode(err);
    result.discoveryStatus =
      code === 'wellKnownInvalid'
        ? DiscoveryStatus.WellKnownInvalid
        : code === 'notMatrix'
          ? DiscoveryStatus.NotMatrix
          : DiscoveryStatus.Unreachable;
    return result;
  }

  result.resolvedBaseUrl = info.homeserverUrl;
  result.hasPasswordLogin = info.password;
  result.ssoProviders = info.sso;
  result.delegatedAuth = info.oauth;
  result.qrLogin = info.qrLogin;
  result.software = info.software ?? undefined;

  const [registration, accountManagementUri, software] = await Promise.allSettled([
    MudrixClient.registrationInfo(info.homeserverUrl),
    info.oauth ? fetchAccountManagementUri(info.homeserverUrl) : Promise.resolve(undefined),
    // The core asks the server name over https, which misses an address like `192.0.2.10:6167`;
    // asking the URL the client will talk to names the software for any server that answers.
    detectSoftware(info.homeserverUrl),
  ]);
  if (software.status === 'fulfilled' && software.value) {
    result.software = software.value;
  }

  if (registration.status === 'fulfilled') {
    result.registerStatus = registration.value.enabled
      ? RegisterStatus.Available
      : RegisterStatus.Disabled;
    result.registerFlows = registration.value.flows;
  } else if (isRateLimited(registration.reason)) {
    result.registerStatus = RegisterStatus.RateLimited;
  } else {
    console.warn(
      '[auth] register flow discovery failed for',
      info.homeserverUrl,
      registration.reason
    );
  }

  if (accountManagementUri.status === 'fulfilled') {
    result.accountManagementUri = accountManagementUri.value;
  }

  return result;
}

/** A new tab for the server's sign-in page; it reports back and closes itself */
function openSignInPopup(): Window | null {
  // The desktop app signs in through the system browser
  if (isDesktop) return null;
  return window.open('about:blank', 'mudrix-sign-in');
}

/** Signs in on the server's own page (OAuth). Call synchronously from the click handler. */
export function startOAuthPopupLogin(
  homeserverUrl: string,
  createAccount = false
): Promise<MatrixCredentials> {
  const popup = openSignInPopup();
  return loginWithPopup(popup, (store, redirectUri) =>
    MudrixClient.startOAuthLogin(
      homeserverUrl,
      store,
      redirectUri,
      appInfo(),
      createAccount,
      knownOAuthClients()
    )
  );
}

/** Signs in through SSO. Call synchronously from the click handler. */
export function startSsoPopupLogin(
  homeserverUrl: string,
  idpId?: string | null
): Promise<MatrixCredentials> {
  const popup = openSignInPopup();
  return loginWithPopup(popup, (store, redirectUri) =>
    MudrixClient.startSsoLogin(homeserverUrl, store, redirectUri, idpId ?? undefined)
  );
}

export function isPopupClosed(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'popupClosed';
}

/** Opens the page in the system browser; done once the user comes back to the app */
function waitForBrowserReturn(url: string): Promise<void> {
  window.open(url, '_blank');
  return new Promise((resolve) => {
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      resolve();
    };
    setTimeout(() => window.addEventListener('focus', onFocus), 500);
  });
}

export function waitForSsoFallback(fallbackUrl: string, homeserverUrl: string): Promise<void> {
  if (isNativeApp()) return openAuthUrlAndWaitForReturn(fallbackUrl);
  if (isDesktop) return waitForBrowserReturn(fallbackUrl);

  return new Promise((resolve, reject) => {
    const safeFallback = safeExternalUrl(fallbackUrl);
    if (!safeFallback) {
      reject(new Error('invalid_fallback_url'));
      return;
    }
    const popup = window.open(safeFallback, '_blank');
    if (!popup) {
      reject(new Error('popup_blocked'));
      return;
    }

    let expectedOrigin: string | null = null;
    try {
      expectedOrigin = new URL(homeserverUrl).origin;
    } catch {
      expectedOrigin = null;
    }

    let settled = false;
    let closedCheckInterval: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (closedCheckInterval) clearInterval(closedCheckInterval);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.source !== popup) return;
      if (expectedOrigin && event.origin !== expectedOrigin) return;
      if (event.data !== 'authDone') return;

      settled = true;
      cleanup();
      try {
        popup.close();
      } catch {
        // best effort
      }
      resolve();
    };

    window.addEventListener('message', onMessage);

    closedCheckInterval = setInterval(() => {
      if (settled) return;
      if (popup.closed) {
        settled = true;
        cleanup();
        reject(new Error('sso_popup_closed'));
      }
    }, 500);
  });
}

export async function requestPasswordReset(
  homeserverUrl: string,
  email: string,
  clientSecret: string
): Promise<string> {
  await loadCore();
  return MudrixClient.requestPasswordReset(homeserverUrl, email, clientSecret, 1);
}

export async function completePasswordReset(
  homeserverUrl: string,
  sid: string,
  clientSecret: string,
  newPassword: string,
  logoutDevices: boolean = true
): Promise<void> {
  await loadCore();
  await MudrixClient.resetPassword(homeserverUrl, newPassword, clientSecret, sid, logoutDevices);
}
