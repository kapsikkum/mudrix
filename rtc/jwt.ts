import type { IOpenIDToken, MatrixClient } from 'matrix-js-sdk';

export interface SfuConfig {
  url: string;
  jwt: string;
  livekitAlias: string;
  livekitIdentity: string;
}

export interface MemberIdentity {
  userId: string;
  deviceId: string;
  memberId: string;
}

export interface DelayDelegation {
  delayId: string;
  delayTimeoutMs: number;
  homeserverBaseUrl: string;
}

export class SfuAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'SfuAuthError';
  }
}

function decodeJwt(jwt: string): { sub: string; video: { room: string } } {
  const payload = jwt.split('.')[1] ?? '';
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')));
}

function withClaims(config: { url: string; jwt: string }): SfuConfig {
  const payload = decodeJwt(config.jwt);
  return { ...config, livekitAlias: payload.video.room, livekitIdentity: payload.sub };
}

function delayParts(delay?: DelayDelegation): Record<string, unknown> {
  if (!delay?.delayId) return {};
  return {
    delay_id: delay.delayId,
    delay_timeout: delay.delayTimeoutMs,
    delay_cs_api_url: delay.homeserverBaseUrl,
  };
}

async function post(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function legacyJwt(
  serviceUrl: string,
  roomId: string,
  deviceId: string,
  openIdToken: IOpenIDToken,
  delay?: DelayDelegation
): Promise<{ url: string; jwt: string }> {
  const base = { room: roomId, openid_token: openIdToken, device_id: deviceId };
  let res = await post(`${serviceUrl}/sfu/get`, { ...base, ...delayParts(delay) });
  if (res.status === 400 && delay?.delayId) {
    const err = await res
      .clone()
      .json()
      .catch(() => null);
    if (err?.errcode === 'M_BAD_JSON') res = await post(`${serviceUrl}/sfu/get`, base);
  }
  if (!res.ok) throw new SfuAuthError(`SFU token request failed (${res.status})`, res.status);
  return res.json();
}

async function matrix2Jwt(
  serviceUrl: string,
  roomId: string,
  member: MemberIdentity,
  openIdToken: IOpenIDToken,
  delay?: DelayDelegation
): Promise<{ url: string; jwt: string }> {
  const res = await post(`${serviceUrl}/get_token`, {
    room_id: roomId,
    slot_id: 'm.call#ROOM',
    openid_token: openIdToken,
    member: {
      id: member.memberId,
      claimed_user_id: member.userId,
      claimed_device_id: member.deviceId,
    },
    ...delayParts(delay),
  });
  if (!res.ok) throw new SfuAuthError(`SFU token request failed (${res.status})`, res.status);
  return res.json();
}

export async function getSfuConfig(
  client: MatrixClient,
  serviceUrl: string,
  roomId: string,
  member: MemberIdentity,
  opts: { legacyOnly: boolean; delay?: DelayDelegation }
): Promise<SfuConfig> {
  if (!opts.legacyOnly) {
    try {
      const token = await client.getOpenIdToken();
      return withClaims(await matrix2Jwt(serviceUrl, roomId, member, token, opts.delay));
    } catch {
      // Fall back to the legacy endpoint
    }
  }
  const token = await client.getOpenIdToken();
  return withClaims(await legacyJwt(serviceUrl, roomId, member.deviceId, token, opts.delay));
}
