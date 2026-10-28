import { createClient } from 'matrix-js-sdk';
import {
  completeAuthorizationCodeGrant,
  type DeviceAccessTokenResponse,
  generateOidcAuthorizationUrl,
  registerOidcClient,
  type OidcClientConfig,
  type OidcRegistrationClientMetadata,
} from 'matrix-js-sdk/lib/oidc';
import { STORAGE_KEY_OIDC_CLIENT_ID_PREFIX, STORAGE_KEY_OIDC_PENDING } from '@/const/storageKeys';
import type { MatrixCredentials, OidcResponseMode, OidcSession } from '@/client/types';
import { isNativeApp, nativeAppUrl, openAuthUrl } from '@/util/nativeApp';

export type OidcAction = 'login' | 'register';

const OIDC_RESPONSE_MODE: OidcResponseMode = 'query';

const REVOKE_TIMEOUT_MS = 10_000;

const DEVICE_SCOPE_RE = /urn:matrix:org\.matrix\.msc2967\.client:device:([^\s]+)/;

interface PendingOidcFlow {
  homeserverUrl: string;
  nonce: string;
  responseMode: OidcResponseMode;
  action: OidcAction;
  revocationEndpoint?: string;
}

interface WhoamiResponse {
  user_id: string;
  device_id?: string;
  is_guest?: boolean;
}

export function getOidcRedirectUri(): string {
  const isDesktop = Boolean((window as { electronAPI?: unknown }).electronAPI);
  if (isDesktop) {
    return 'http://127.0.0.1:34759/oidc/callback';
  }
  if (isNativeApp()) {
    return nativeAppUrl('/oidc/callback').toString();
  }
  return new URL('/oidc/callback', window.location.origin).toString();
}

function randomString(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function clientIdStorageKey(issuer: string, redirectUri: string): string {
  return `${STORAGE_KEY_OIDC_CLIENT_ID_PREFIX}${issuer}|${redirectUri}`;
}

export function getCachedClientId(issuer: string, redirectUri: string): string | null {
  return localStorage.getItem(clientIdStorageKey(issuer, redirectUri));
}

function isSecureContext(): boolean {
  return window.location.protocol === 'https:' && !isNativeApp();
}

function resolveClientUri(): string {
  const base = isSecureContext() ? window.location.origin : import.meta.env.APP_HOME_URL;
  return new URL('/', base).toString();
}

export async function getOrRegisterClientId(
  metadata: OidcClientConfig,
  redirectUri: string
): Promise<string> {
  const existing = getCachedClientId(metadata.issuer, redirectUri);
  if (existing) return existing;

  const clientMetadata: OidcRegistrationClientMetadata = {
    clientName: 'WizardChat',
    clientUri: resolveClientUri(),
    applicationType: isSecureContext() ? 'web' : 'native',
    redirectUris: [redirectUri],
    contacts: [],
    tosUri: undefined,
    policyUri: undefined,
  };

  let clientId: string;
  try {
    clientId = await registerOidcClient(metadata, clientMetadata);
  } catch (err) {
    const portless = loopbackWithoutPort(redirectUri);
    if (!portless) throw err;
    clientId = await registerOidcClient(metadata, { ...clientMetadata, redirectUris: [portless] });
  }
  localStorage.setItem(clientIdStorageKey(metadata.issuer, redirectUri), clientId);
  return clientId;
}

function loopbackWithoutPort(uri: string): string | null {
  try {
    const url = new URL(uri);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'http:' || !loopback || !url.port) return null;
    url.port = '';
    return url.toString();
  } catch {
    return null;
  }
}

function resolvePrompt(metadata: OidcClientConfig, action: OidcAction): string | undefined {
  if (action !== 'register') return undefined;
  return metadata.prompt_values_supported?.includes('create') ? 'create' : undefined;
}

export function readPendingOidcFlow(): PendingOidcFlow | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OIDC_PENDING);
    return raw ? (JSON.parse(raw) as PendingOidcFlow) : null;
  } catch {
    return null;
  }
}

export function clearPendingOidcFlow(): void {
  localStorage.removeItem(STORAGE_KEY_OIDC_PENDING);
}

export async function startOidcLogin(
  homeserverUrl: string,
  metadata: OidcClientConfig,
  action: OidcAction
): Promise<void> {
  const redirectUri = getOidcRedirectUri();
  const clientId = await getOrRegisterClientId(metadata, redirectUri);
  const nonce = randomString();

  const url = await generateOidcAuthorizationUrl({
    metadata,
    clientId,
    redirectUri,
    homeserverUrl,
    nonce,
    prompt: resolvePrompt(metadata, action),
    responseMode: OIDC_RESPONSE_MODE,
  });

  const pending: PendingOidcFlow = {
    homeserverUrl,
    nonce,
    responseMode: OIDC_RESPONSE_MODE,
    action,
    revocationEndpoint: metadata.revocation_endpoint,
  };
  localStorage.setItem(STORAGE_KEY_OIDC_PENDING, JSON.stringify(pending));

  openAuthUrl(url);
}

function deviceIdFromScope(scope: string | undefined): string | undefined {
  return scope?.match(DEVICE_SCOPE_RE)?.[1];
}

async function whoami(homeserverUrl: string, accessToken: string): Promise<WhoamiResponse> {
  const client = createClient({ baseUrl: homeserverUrl, accessToken });
  return client.whoami();
}

export async function completeOidcLogin({
  code,
  state,
}: {
  code: string;
  state: string;
}): Promise<MatrixCredentials> {
  const pending = readPendingOidcFlow();
  const responseMode = pending?.responseMode ?? OIDC_RESPONSE_MODE;

  const { tokenResponse, idTokenClaims, homeserverUrl, oidcClientSettings } =
    await completeAuthorizationCodeGrant(code, state, responseMode);

  const resolvedHomeserverUrl = homeserverUrl ?? pending?.homeserverUrl;
  if (!resolvedHomeserverUrl) {
    throw new Error('oidc_missing_homeserver_url');
  }

  const whoamiResponse = await whoami(resolvedHomeserverUrl, tokenResponse.access_token);
  const deviceId = whoamiResponse.device_id ?? deviceIdFromScope(tokenResponse.scope);
  if (!deviceId) {
    throw new Error('oidc_missing_device_id');
  }

  const expiresInMs =
    typeof tokenResponse.expires_in === 'number' ? tokenResponse.expires_in * 1000 : undefined;

  return {
    userId: whoamiResponse.user_id,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    deviceId,
    homeserverUrl: resolvedHomeserverUrl,
    expiresInMs,
    oidc: {
      issuer: oidcClientSettings.issuer,
      clientId: oidcClientSettings.clientId,
      redirectUri: getOidcRedirectUri(),
      responseMode,
      revocationEndpoint: pending?.revocationEndpoint,
      idTokenClaims: idTokenClaims as unknown as Record<string, unknown>,
    },
  };
}

export async function credentialsFromDeviceGrant(
  homeserverUrl: string,
  metadata: OidcClientConfig,
  clientId: string,
  tokens: DeviceAccessTokenResponse
): Promise<MatrixCredentials> {
  const whoamiResponse = await whoami(homeserverUrl, tokens.access_token);
  const deviceId = whoamiResponse.device_id ?? deviceIdFromScope(tokens.scope);
  if (!deviceId) throw new Error('oidc_missing_device_id');
  return {
    userId: whoamiResponse.user_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    deviceId,
    homeserverUrl,
    expiresInMs: typeof tokens.expires_in === 'number' ? tokens.expires_in * 1000 : undefined,
    oidc: {
      issuer: metadata.issuer,
      clientId,
      redirectUri: getOidcRedirectUri(),
      responseMode: OIDC_RESPONSE_MODE,
      revocationEndpoint: metadata.revocation_endpoint,
      idTokenClaims: {},
    },
  };
}

export async function revokeOidcSession(
  session: OidcSession,
  tokens: { accessToken?: string; refreshToken?: string }
): Promise<void> {
  const endpoint = session.revocationEndpoint;
  if (!endpoint) return;

  const token = tokens.refreshToken ?? tokens.accessToken;
  if (!token) return;

  const body = new URLSearchParams({
    token,
    token_type_hint: tokens.refreshToken ? 'refresh_token' : 'access_token',
    client_id: session.clientId,
  });

  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
  });
}
