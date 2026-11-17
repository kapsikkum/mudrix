/** Pure helpers for running an integration widget. No React, no I/O. */
import { EventDirection, WidgetEventCapability } from 'matrix-widget-api';
import { checkEventType } from './customEvents';
import type { WidgetPermission } from './manifest';
import { getWidgetCapabilityDef } from './widgetCapabilities';

/**
 * The widget runs in an iframe with allow-same-origin, which only means "its OWN origin". If the
 * widget were served from Mudrix's origin, allow-same-origin plus allow-scripts would let it
 * remove the sandbox and read the user's session. So a widget URL on the app's origin must never
 * be loaded (see isSameOriginAsApp / assertWidgetUrlAllowed).
 */
export const WIDGET_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';
/** The same, plus downloads, only for a widget that declared `saveFiles` and was approved for it. */
export const widgetSandbox = (saveFiles?: boolean): string =>
  saveFiles ? `${WIDGET_SANDBOX} allow-downloads` : WIDGET_SANDBOX;
/** Permissions policy for the iframe: nothing (no camera, microphone, geolocation...). */
export const WIDGET_ALLOW = '';

/** The origin of the page the app runs on; the one place a widget may never be loaded from. */
const appOrigin = (): string => (typeof window === 'undefined' ? '' : window.location.origin);

/** True when the URL is on the app's own origin. Unparseable URLs count as same-origin (fail closed). */
export function isSameOriginAsApp(url: string, origin: string = appOrigin()): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return true;
  }
}

/** Extracts host or hostname of a URL, preserving call-site fallback and hostname semantics. */
export function hostOf(
  url: string,
  options?: { fallback?: string; hostnameOnly?: boolean }
): string {
  try {
    const u = new URL(url);
    return options?.hostnameOnly ? u.hostname : u.host;
  } catch {
    return options?.fallback ?? '';
  }
}

export type WidgetUrlCheck = { ok: true } | { ok: false; error: string };

/** Call at install and at every open. Rejects the app's own origin, non-https and credentials. */
export function assertWidgetUrlAllowed(url: string, origin: string = appOrigin()): WidgetUrlCheck {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: 'The widget address is not a valid URL' };
  }
  if (u.origin === origin)
    return { ok: false, error: 'A widget can not run on the same origin as this app' };
  if (u.protocol !== 'https:') return { ok: false, error: 'A widget must be served over https' };
  if (u.username || u.password)
    return { ok: false, error: 'The widget address must not contain credentials' };
  return { ok: true };
}

const MAX_VIEWER_URL = 1000;

/**
 * A link a card may open in a window: https, no credentials, never the app's own origin, and
 * EXACTLY the widget's own origin (scheme, host and port), so the person only ever runs code from
 * the host they approved. Path, query and fragment are free.
 */
export function assertViewerUrlAllowed(
  widgetUrl: string,
  linkUrl: string,
  origin: string = appOrigin()
): WidgetUrlCheck {
  if (linkUrl.length > MAX_VIEWER_URL || /\s/.test(linkUrl))
    return { ok: false, error: 'That link is not usable' };
  const base = assertWidgetUrlAllowed(widgetUrl, origin);
  if (!base.ok) return base;
  const link = assertWidgetUrlAllowed(linkUrl, origin);
  if (!link.ok) return link;
  if (new URL(linkUrl).origin !== new URL(widgetUrl).origin)
    return { ok: false, error: 'That link is not on the approved host' };
  return { ok: true };
}

export interface WidgetUrlContext {
  roomId: string;
  userId: string;
  displayName: string;
  theme: 'light' | 'dark';
  lang: string;
}

/** theme and lang always; room_id, user_id, display_name only if the widget declared them. */
export function buildWidgetUrl(
  widget: Pick<WidgetPermission, 'url' | 'parameters'>,
  ctx: WidgetUrlContext
): string {
  const u = new URL(widget.url);
  u.searchParams.set('theme', ctx.theme);
  u.searchParams.set('lang', ctx.lang);
  const wanted = widget.parameters ?? [];
  if (wanted.includes('room_id')) u.searchParams.set('room_id', ctx.roomId);
  if (wanted.includes('user_id')) u.searchParams.set('user_id', ctx.userId);
  if (wanted.includes('display_name')) u.searchParams.set('display_name', ctx.displayName);
  return u.toString();
}

/** The Widget API capability strings to send and to read room events of this custom type. */
export const customEventCapabilities = (type: string): readonly string[] => [
  WidgetEventCapability.forRoomEvent(EventDirection.Send, type).raw,
  WidgetEventCapability.forRoomEvent(EventDirection.Receive, type).raw,
];

/**
 * The Widget API capability strings the widget asked for that the approved catalogue ids or the
 * approved custom event types cover; everything else is dropped. The per-room timeline capability
 * is granted only for `roomId` and only when an approved id or event type needs it.
 */
export function resolveCapabilities(
  requested: Iterable<string>,
  approvedIds: readonly string[],
  roomId?: string,
  approvedEvents: readonly string[] = []
): Set<string> {
  const allowed = new Set<string>();
  const timeline = roomId ? `org.matrix.msc2762.timeline:${roomId}` : undefined;
  approvedEvents.forEach((type) => {
    // Re-checked here so a malformed stored type can never become a capability string.
    if (checkEventType(type) !== null) return;
    customEventCapabilities(type).forEach((c) => allowed.add(c));
    if (timeline) allowed.add(timeline);
  });
  approvedIds.forEach((id) => {
    const def = getWidgetCapabilityDef(id);
    if (!def) return;
    def.capabilities.forEach((c) => allowed.add(c));
    if (def.needsTimeline && timeline) allowed.add(timeline);
  });
  const out = new Set<string>();
  for (const r of requested) if (allowed.has(r)) out.add(r);
  return out;
}
