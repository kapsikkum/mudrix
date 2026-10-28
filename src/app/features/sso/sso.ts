import {
  AutoDiscovery,
  AutoDiscoveryAction,
  createClient,
  MatrixError,
  SSOAction,
  type IRequestTokenResponse,
} from 'matrix-js-sdk';
import type {
  ILoginFlowsResponse,
  ISSOFlow,
  IIdentityProvider,
} from 'matrix-js-sdk/lib/@types/auth';
import type { OidcClientConfig } from 'matrix-js-sdk/lib/oidc';
import {
  isNativeApp,
  nativeAppUrl,
  openAuthUrl,
  openAuthUrlAndWaitForReturn,
} from '@/util/nativeApp';
import {
  STORAGE_KEY_SSO_HOMESERVER_URL,
  STORAGE_KEY_SSO_STATE,
  STORAGE_KEY_SSO_IDP_ID,
  STORAGE_KEY_SSO_ACTION,
} from '@/const/storageKeys';

export type IdentityProvider = IIdentityProvider;
export { SSOAction };

export function resolveIdpIconUrl(homeserverUrl: string, icon: string | undefined): string | null {
  if (!icon) return null;
  const client = createClient({ baseUrl: homeserverUrl });
  return client.mxcUrlToHttp(icon, 96, 96, 'crop', false);
}

function findSSOFlow(flows: ILoginFlowsResponse['flows']): ISSOFlow | undefined {
  return flows.find((f): f is ISSOFlow => f.type === 'm.login.sso' || f.type === 'm.login.cas');
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
}

export interface AuthCapabilities {
  resolvedBaseUrl: string;
  hasPasswordLogin: boolean;
  hasTokenLogin: boolean;
  ssoFlow?: ISSOFlow;
  registerStatus: RegisterStatus;
  discoveryStatus: DiscoveryStatus;
  delegatedAuth: boolean;
  accountManagementUri?: string;
  authMetadata?: OidcClientConfig;
}

async function resolveBaseUrl(homeserverUrl: string): Promise<{
  baseUrl: string;
  wellKnownInvalid: boolean;
}> {
  let domain: string;
  try {
    domain = new URL(homeserverUrl).host;
  } catch {
    domain = homeserverUrl;
  }

  try {
    const config = await AutoDiscovery.findClientConfig(domain);
    const hs = config['m.homeserver'];
    if (hs.state === AutoDiscoveryAction.SUCCESS && hs.base_url) {
      return { baseUrl: hs.base_url, wellKnownInvalid: false };
    }
    if (
      hs.state === AutoDiscoveryAction.FAIL_PROMPT ||
      hs.state === AutoDiscoveryAction.FAIL_ERROR
    ) {
      return { baseUrl: homeserverUrl, wellKnownInvalid: true };
    }
  } catch (err) {
    console.warn('[auth] well-known discovery failed for', homeserverUrl, err);
  }

  return { baseUrl: homeserverUrl, wellKnownInvalid: false };
}

export async function discoverAuthCapabilities(homeserverUrl: string): Promise<AuthCapabilities> {
  const { baseUrl, wellKnownInvalid } = await resolveBaseUrl(homeserverUrl);
  const client = createClient({ baseUrl });

  const [loginResult, registerResult, authMetadataResult] = await Promise.allSettled([
    client.loginFlows(),
    client.registerRequest({}),
    client.getAuthMetadata(),
  ]);

  const result: AuthCapabilities = {
    resolvedBaseUrl: baseUrl,
    hasPasswordLogin: false,
    hasTokenLogin: false,
    ssoFlow: undefined,
    registerStatus: RegisterStatus.Unavailable,
    discoveryStatus: DiscoveryStatus.Ok,
    delegatedAuth: false,
    accountManagementUri: undefined,
  };

  if (loginResult.status === 'fulfilled') {
    const { flows } = loginResult.value;
    result.hasPasswordLogin = flows.some((f) => f.type === 'm.login.password');
    result.hasTokenLogin = flows.some((f) => f.type === 'm.login.token');
    result.ssoFlow = findSSOFlow(flows);
  } else {
    console.warn('[auth] login flow discovery failed for', baseUrl, loginResult.reason);
    result.discoveryStatus = wellKnownInvalid
      ? DiscoveryStatus.WellKnownInvalid
      : DiscoveryStatus.Unreachable;
  }

  if (registerResult.status === 'fulfilled') {
    result.registerStatus = RegisterStatus.Available;
  } else {
    const err = registerResult.reason;
    if (err instanceof MatrixError) {
      if (err.httpStatus === 401) {
        result.registerStatus = RegisterStatus.Available;
      } else if (err.httpStatus === 403) {
        result.registerStatus = RegisterStatus.Disabled;
      } else if (err.httpStatus === 429) {
        result.registerStatus = RegisterStatus.RateLimited;
      }
    } else {
      console.warn('[auth] register flow discovery failed for', baseUrl, err);
    }
  }

  if (authMetadataResult.status === 'fulfilled') {
    const authMetadata = authMetadataResult.value as OidcClientConfig;
    result.delegatedAuth = true;
    result.accountManagementUri = authMetadata.account_management_uri;
    result.authMetadata = authMetadata;
  }

  return result;
}

export function redirectToSso(homeserverUrl: string, action: SSOAction, idpId?: string): void {
  const state = crypto.randomUUID();

  localStorage.setItem(STORAGE_KEY_SSO_HOMESERVER_URL, homeserverUrl);
  localStorage.setItem(STORAGE_KEY_SSO_STATE, state);
  localStorage.setItem(STORAGE_KEY_SSO_ACTION, action);
  if (idpId) {
    localStorage.setItem(STORAGE_KEY_SSO_IDP_ID, idpId);
  } else {
    localStorage.removeItem(STORAGE_KEY_SSO_IDP_ID);
  }

  const redirectUrl = isNativeApp()
    ? nativeAppUrl('/sso/callback')
    : new URL('/sso/callback', window.location.origin);
  redirectUrl.searchParams.set('state', state);

  const client = createClient({ baseUrl: homeserverUrl });
  openAuthUrl(client.getSsoLoginUrl(redirectUrl.toString(), 'sso', idpId, action));
}

export interface PendingSsoFlow {
  homeserverUrl: string;
  state: string;
  action: SSOAction | null;
  idpId?: string;
}

export function readPendingSsoFlow(): PendingSsoFlow | null {
  const homeserverUrl = localStorage.getItem(STORAGE_KEY_SSO_HOMESERVER_URL);
  const state = localStorage.getItem(STORAGE_KEY_SSO_STATE);
  if (!homeserverUrl || !state) return null;

  return {
    homeserverUrl,
    state,
    action: (localStorage.getItem(STORAGE_KEY_SSO_ACTION) as SSOAction | null) ?? null,
    idpId: localStorage.getItem(STORAGE_KEY_SSO_IDP_ID) ?? undefined,
  };
}

export function clearPendingSsoFlow(): void {
  localStorage.removeItem(STORAGE_KEY_SSO_HOMESERVER_URL);
  localStorage.removeItem(STORAGE_KEY_SSO_STATE);
  localStorage.removeItem(STORAGE_KEY_SSO_IDP_ID);
  localStorage.removeItem(STORAGE_KEY_SSO_ACTION);
}

export interface SsoTokenLoginResult {
  userId: string;
  accessToken: string;
  deviceId: string;
  refreshToken?: string;
  expiresInMs?: number;
}

export async function exchangeLoginToken(
  token: string,
  homeserverUrl: string,
  deviceName: string
): Promise<SsoTokenLoginResult> {
  const client = createClient({ baseUrl: homeserverUrl });
  const res = await client.loginRequest({
    type: 'm.login.token',
    token,
    refresh_token: true,
    initial_device_display_name: deviceName,
  });

  return {
    userId: res.user_id,
    accessToken: res.access_token,
    deviceId: res.device_id,
    refreshToken: res.refresh_token,
    expiresInMs: res.expires_in_ms,
  };
}

export function waitForSsoFallback(fallbackUrl: string, homeserverUrl: string): Promise<void> {
  if (isNativeApp()) return openAuthUrlAndWaitForReturn(fallbackUrl);

  return new Promise((resolve, reject) => {
    const popup = window.open(fallbackUrl, '_blank');
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
  const client = createClient({ baseUrl: homeserverUrl });
  const result = await client.requestPasswordEmailToken(email, clientSecret, 1);
  return (result as IRequestTokenResponse).sid;
}

export async function completePasswordReset(
  homeserverUrl: string,
  sid: string,
  clientSecret: string,
  newPassword: string,
  logoutDevices: boolean = true
): Promise<void> {
  const client = createClient({ baseUrl: homeserverUrl });
  await client.setPassword(
    {
      type: 'm.login.email.identity',
      threepid_creds: {
        sid,
        client_secret: clientSecret,
      },
    },
    newPassword,
    logoutDevices
  );
}
