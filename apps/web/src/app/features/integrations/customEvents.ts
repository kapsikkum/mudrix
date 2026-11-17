/**
 * Custom room events for integration widgets. A widget may declare up to MAX_WIDGET_EVENTS of its
 * own event types (`permissions.widget.events`); the person approves them like any other grant.
 * Only plain room events (never state, to-device or account data) in the one room the widget is
 * opened in. Pure helpers, no React, no I/O: the manifest validator and the widget driver both
 * use them so the rules can not drift apart.
 */

export const MAX_WIDGET_EVENTS = 3;
const MIN_EVENT_TYPE = 5;
const MAX_EVENT_TYPE = 80;
const EVENT_TYPE_CHARS = /^[a-z0-9._-]+$/;
const SEGMENT = /^[a-z0-9][a-z0-9_-]*$/;
/** Namespaces that belong to Matrix and the big clients; a widget never gets to use them. */
const RESERVED_PREFIXES = ['m.', 'org.matrix.', 'im.vector.', 'io.element.'] as const;

/** Largest JSON.stringify length of the content of a custom event a widget sends. */
export const MAX_CUSTOM_EVENT_CONTENT = 8192;
/** Top-level keys a widget may not put in a custom event (they would thread, reply or ping). */
const FORBIDDEN_CONTENT_KEYS = ['m.relates_to', 'm.mentions'] as const;

/**
 * Why `type` can not be a declared custom event type, or null when it is fine: reverse-DNS style
 * (`com.example.fileshare.sent`), lowercase, at least three non-empty dot-separated parts, and
 * outside the Matrix and big-client namespaces.
 */
export function checkEventType(type: unknown): string | null {
  if (typeof type !== 'string') return 'must be a string';
  if (type.length === 0) return 'must not be empty';
  if (type.length < MIN_EVENT_TYPE || type.length > MAX_EVENT_TYPE)
    return `must be ${MIN_EVENT_TYPE} to ${MAX_EVENT_TYPE} characters`;
  if (!EVENT_TYPE_CHARS.test(type))
    return 'may only contain lowercase letters a-z, digits, ".", "_" and "-"';
  const parts = type.split('.');
  if (parts.length < 3)
    return 'must have at least 3 parts separated by "." (like com.example.app.sent)';
  if (parts.some((p) => p.length === 0)) return 'must not have an empty part between dots';
  if (!parts.every((p) => SEGMENT.test(p)))
    return 'every part between dots must start with a letter or digit';
  if (type === 'm' || RESERVED_PREFIXES.some((p) => type.startsWith(p)))
    return 'must not start with "m.", "org.matrix.", "im.vector." or "io.element."';
  return null;
}

/** True when `type` is a valid custom type AND one of the approved `declared` ones (exact match). */
export function isDeclaredEventType(type: unknown, declared: readonly string[]): type is string {
  return typeof type === 'string' && declared.includes(type) && checkEventType(type) === null;
}

/**
 * Why `content` can not be sent as a custom event, or null when it can: a plain JSON object of
 * at most MAX_CUSTOM_EVENT_CONTENT characters with no top-level `m.relates_to` or `m.mentions`.
 */
export function validateCustomEventContent(content: unknown): string | null {
  if (typeof content !== 'object' || content === null || Array.isArray(content))
    return 'The content of an event must be a JSON object';
  if (FORBIDDEN_CONTENT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(content, k)))
    return 'The content of a custom event can not contain m.relates_to or m.mentions';
  let size: number;
  try {
    size = JSON.stringify(content).length;
  } catch {
    return 'The content of an event must be JSON';
  }
  if (size > MAX_CUSTOM_EVENT_CONTENT) return 'The content of the event is too large';
  return null;
}
