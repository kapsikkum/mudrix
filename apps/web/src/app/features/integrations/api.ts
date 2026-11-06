/**
 * Integration API actions: one fixed-shape POST to the single host the user approved. The UI
 * always shows `previewApiRequest` and asks before calling `callApi`; nothing here confirms.
 */
import { fetchIntegration } from '../../../util/integrationFetch';
import { hasUnsafeChars, type ApiAction, type Permissions } from './manifest';
import { NO_SETTING_VALUES, renderTemplate, type SettingValues } from './settings';

export const MAX_API_BODY_BYTES = 8 * 1024;
export const MAX_API_RESPONSE_BYTES = 64 * 1024;
const MAX_RESULT_LINK = 500;

export interface ApiContext {
  roomId: string;
  /** The composer draft. For a command this equals `args`. */
  text: string;
  /** Text after the slash command; empty for a menu action. */
  args: string;
  /** The integration's setting values; only choice values can appear in a body. */
  settings?: SettingValues;
}

/** Only the permissions are needed, so installed and offered integrations both fit. */
export interface ApiIntegration {
  permissions: Permissions;
}

export type ApiPreview =
  | { ok: true; url: string; host: string; path: string; body: string | null }
  | { ok: false; error: string };

export type ApiCallResult = { ok: true; link?: string } | { ok: false; error: string };

/**
 * Builds exactly what will be sent. Placeholder values are substituted into the template's string
 * values (as data, in one pass so inserted text is never re-expanded) and the whole object is
 * then JSON.stringified, so quotes and newlines in user text can not break out of the JSON.
 */
export function previewApiRequest(
  integration: ApiIntegration,
  action: ApiAction,
  ctx: ApiContext
): ApiPreview {
  const api = integration.permissions.api;
  if (!api) return { ok: false, error: 'This integration has no API access' };
  const url = `https://${api.host}${action.path}`;
  try {
    const u = new URL(url);
    if (u.host !== api.host || u.pathname !== action.path || u.search || u.hash)
      return { ok: false, error: 'Invalid request path' };
  } catch {
    return { ok: false, error: 'Invalid request URL' };
  }
  let body: string | null = null;
  if (action.body) {
    const values: Record<string, string> = { room: ctx.roomId, text: ctx.text, args: ctx.args };
    const settings = ctx.settings ?? NO_SETTING_VALUES;
    const filled = Object.fromEntries(
      Object.entries(action.body).map(([k, v]) => [k, renderTemplate(v, values, settings)])
    );
    body = JSON.stringify(filled);
    if (new TextEncoder().encode(body).length > MAX_API_BODY_BYTES)
      return { ok: false, error: 'The message is too long to send (max 8 KB)' };
  }
  return { ok: true, url, host: api.host, path: action.path, body };
}

/** The link only if it stays on the api host or one of the integration's own link-card hosts. */
function safeResultLink(raw: unknown, perms: Permissions): string | undefined {
  if (typeof raw !== 'string' || raw.length > MAX_RESULT_LINK || hasUnsafeChars(raw))
    return undefined;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return undefined;
  const hosts = new Set<string>(perms.linkCards?.flatMap((r) => r.hosts) ?? []);
  if (perms.api) hosts.add(perms.api.host);
  if (!hosts.has(u.host) || u.href.length > MAX_RESULT_LINK) return undefined;
  return u.href;
}

/**
 * Sends the request, only to the hosts in `allow` (what the person approved for this integration).
 * Never throws; errors only ever name the host and status.
 */
export async function callApi(
  integration: ApiIntegration,
  action: ApiAction,
  ctx: ApiContext,
  allow: readonly string[]
): Promise<ApiCallResult> {
  try {
    const req = previewApiRequest(integration, action, ctx);
    if (!req.ok) return req;
    const res = await fetchIntegration({
      url: req.url,
      allow,
      expect: 'json',
      maxBytes: MAX_API_RESPONSE_BYTES,
      post: true,
      ...(req.body !== null ? { jsonBody: req.body } : {}),
    });
    // An oversized answer, or one that is not JSON, still means the service responded; there is
    // just no link we would read.
    if (!res.ok)
      return ['too-large', 'invalid', 'type'].includes(res.reason ?? '') ? { ok: true } : res;
    if (!action.insertResultLink) return { ok: true };
    const json = res.json;
    if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
      const link = safeResultLink(
        (json as Record<string, unknown>)[action.insertResultLink],
        integration.permissions
      );
      if (link) return { ok: true, link };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Request failed' };
  }
}
