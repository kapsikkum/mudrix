/**
 * Integration repositories are data only: nothing from a repo.json is ever executed by the
 * client itself. The one exception is `permissions.widget`, which names a page that runs in a
 * sandboxed iframe on its own origin (see `runsCode`). This file
 * holds the types and a strict hand-written validator. Anything unknown is rejected rather than
 * ignored, so a manifest can never carry a capability the client does not know how to show for
 * approval.
 */

import { MAX_WIDGET_EVENTS, checkEventType } from './customEvents';
import { MAX_SERIAL, isValidKey } from './signature';
import {
  WIDGET_CAPABILITY_IDS,
  WIDGET_PARAMETERS,
  type WidgetParameter,
} from './widgetCapabilities';

export const MANIFEST_SCHEMA = 1;
/** Cap on the raw repo.json text, in bytes. */
export const MAX_MANIFEST_BYTES = 256 * 1024;

export const COMPOSER_ICON_NAMES = ['send', 'download', 'link', 'plus'] as const;
export type ComposerIconName = (typeof COMPOSER_ICON_NAMES)[number];

export interface LinkCardRule {
  /** Exact lowercase hostnames. No wildcards, no IPs. */
  hosts: string[];
  /** Only links whose path starts with this match. Starts with "/". Exclusive with `pathPattern`. */
  pathPrefix?: string;
  /**
   * Segment pattern such as "/{owner}/{repo}": literal segments must match exactly, each `{name}`
   * takes one segment, and the link may continue below. The captured values can be used in
   * `title`, `subtitle` and a `linkDetails` lookup path. Exclusive with `pathPrefix`.
   */
  pathPattern?: string;
  /** With `pathPattern`, may hold `{name}` placeholders of that pattern. */
  title: string;
  subtitle?: string;
  buttonLabel?: string;
  /** Accepted for compatibility but never shown; the card uses the integration's icon. */
  icon?: string;
  /** Id of a lookup in this integration's `linkDetails.lookups`. Needs `pathPattern`. */
  details?: string;
  /**
   * Links under any of these paths (whole segments, ignoring case) never match this rule, so a
   * pattern such as "/{owner}/{repo}" can leave out "/orgs/..." or "/settings/...".
   */
  pathExclude?: string[];
}

export const SETTING_TYPES = ['toggle', 'text', 'choice'] as const;
export type SettingType = (typeof SETTING_TYPES)[number];

interface SettingBase {
  /** Lowercase letter first, then letters and digits (camelCase), up to 24. */
  id: string;
  label: string;
  description?: string;
}
export interface ChoiceOption {
  value: string;
  label: string;
}
/**
 * A per-integration option the person sets on their device. Values are plain data kept in local
 * storage and never sent anywhere by Mudrix itself; they only fill the integration's own approved
 * templates (`{setting.<id>}`) and decide which looked-up fields a card shows (`if`).
 */
export type IntegrationSetting =
  | (SettingBase & { type: 'toggle'; default: boolean })
  | (SettingBase & { type: 'text'; default: string; maxLength: number })
  | (SettingBase & { type: 'choice'; default: string; options: ChoiceOption[] });

/** Formats a looked-up value can be shown in. */
export const LINK_FACT_FORMATS = ['text', 'count', 'date'] as const;
export type LinkFactFormat = (typeof LINK_FACT_FORMATS)[number];

export interface LinkFact {
  label: string;
  /** Dotted path into the JSON answer, such as "stargazers_count" or "owner.login". */
  field: string;
  format?: LinkFactFormat;
  /** Id of a toggle setting: the fact is only shown (and asked for) while it is on. */
  if?: string;
}

export interface LinkLookup {
  id: string;
  /** Request path on the lookup host. `{name}` placeholders come from the card's `pathPattern`. */
  path: string;
  /** Field shown as the card title (replaces the rule's title when present). */
  title?: string;
  /** Field shown as a short description under the title. */
  description?: string;
  /** Id of a toggle setting: the description is only shown while it is on. */
  descriptionIf?: string;
  facts?: LinkFact[];
}

/**
 * Data only, but it does contact a host: when a matching link is shown, Mudrix GETs one fixed-shape
 * path on this one host, without cookies, and shows a few named fields of the JSON answer as text.
 * The request itself is made by `util/integrationFetch.ts`.
 */
export interface LinkDetailsPermission {
  /** One exact lowercase hostname. */
  host: string;
  lookups: LinkLookup[];
}

export interface ComposerAction {
  id: string;
  label: string;
  icon?: ComposerIconName;
  /** Plain text inserted into the composer, never sent automatically. `{room}` is the only placeholder. */ insert: string;
}

/** Placeholders usable inside `api` action body values. */
export const API_PLACEHOLDERS = ['room', 'text', 'args'] as const;

export interface ApiAction {
  id: string;
  label: string;
  /** Starts with "/", plain path characters only. The method is always POST. */
  path: string;
  /** JSON body template: string values only, `{room}`, `{text}` and `{args}` are substituted. */
  body?: Record<string, string>;
  /** Name of a string field in the JSON response that holds a link to insert into the composer. */
  insertResultLink?: string;
}

export interface ApiPermission {
  /** One exact lowercase hostname. */
  host: string;
  actions: ApiAction[];
}

export interface SlashCommand {
  /** Without the leading "/". */
  name: string;
  description: string;
  /** Shown as a hint; starts with "/" + name. */
  usage?: string;
  /** Plain text put into the composer. `{room}` and `{args}` are the placeholders. Exclusive with `api`. */
  insert?: string;
  /** Id of an action in this integration's `api.actions`. Exclusive with `insert`. */
  api?: string;
  /** Opens this integration's widget. Exclusive with `insert` and `api`. */
  widget?: true;
}

export interface WidgetPermission {
  /** https, no fragment, no `$` template variables. */
  url: string;
  /** Defaults to the integration name. */
  name?: string;
  /** Ids from WIDGET_CAPABILITY_CATALOGUE. Empty = the widget can only display. */
  capabilities: string[];
  /** Extra URL query parameters Mudrix may add (besides the always-sent theme and lang). */
  parameters?: WidgetParameter[];
  /**
   * The widget's own custom room event types (at most 3, reverse-DNS style, see customEvents.ts).
   * The widget may send and read exactly these in the room it is opened in, once approved.
   */
  events?: string[];
  /**
   * Cards for links on this widget's host get a button that opens the clicked link (any path, query
   * and fragment on that exact host) in a window, instead of the fixed `url`. The page at the link
   * runs code. Nothing loads until the button is pressed.
   */
  fromLinks?: boolean;
  /** Text of that button (default "Open here"). Only with `fromLinks`. */
  linkLabel?: string;
  /** The page may save files to the device (lets the sandbox start downloads). */
  saveFiles?: boolean;
}

export interface Permissions {
  linkCards?: LinkCardRule[];
  linkDetails?: LinkDetailsPermission;
  composerActions?: ComposerAction[];
  commands?: SlashCommand[];
  api?: ApiPermission;
  /** Runs code. The only capability that is not data-only. */
  widget?: WidgetPermission;
}

export type Capability = keyof Permissions;
export const CAPABILITIES: readonly Capability[] = [
  'linkCards',
  'linkDetails',
  'composerActions',
  'commands',
  'api',
  'widget',
];

/** True when approving these permissions lets third-party code run (in a sandboxed iframe). */
export function runsCode(p: Permissions): boolean {
  return p.widget !== undefined;
}

/** True when the permission set actually offers this capability (non-empty). */
export function hasCapability(p: Permissions, c: Capability): boolean {
  if (c === 'api') return (p.api?.actions.length ?? 0) > 0;
  if (c === 'linkDetails') return (p.linkDetails?.lookups.length ?? 0) > 0;
  if (c === 'widget') return p.widget !== undefined;
  return (p[c]?.length ?? 0) > 0;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  version: string;
  icon?: string;
  permissions: Permissions;
  /** Options the person can set (see IntegrationSetting). Not a permission. */
  settings?: IntegrationSetting[];
}

/**
 * An entry of a repository that this version of Mudrix can not use. It is listed (so the person
 * sees why) but can never be installed; the rest of the repository stays usable.
 */
export interface RejectedIntegration {
  /** Position in the file. */
  index: number;
  /** Only when the entry carries a well-formed id / plain name. */
  id?: string;
  name?: string;
  error: string;
  /** "unsupported": it uses something this Mudrix does not know (likely made for a newer one). */
  reason: 'unsupported' | 'invalid';
}

export interface RepoManifest {
  schema: typeof MANIFEST_SCHEMA;
  /** Standard base64 of the raw 32-byte Ed25519 public key that signs this file. */
  key: string;
  /** Integer 1..2147483647, raised on every release. */
  serial: number;
  name: string;
  integrations: Integration[];
  /** Entries left out, each with its reason. Authors' tools refuse a file with any. */
  rejected: RejectedIntegration[];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ACTION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const HOST_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9-]{1,23}$/;
const API_PATH_PATTERN = /^\/[A-Za-z0-9._~/-]*$/;
const BODY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const RESULT_FIELD_PATTERN = /^[A-Za-z0-9_]{1,32}$/;

const MAX_REPO_NAME = 60;
const MAX_INTEGRATIONS = 50;
const MAX_NAME = 40;
const MAX_DESCRIPTION = 400;
const MAX_VERSION = 20;
const MAX_URL = 500;
const MAX_LINK_RULES = 10;
const MAX_HOSTS = 10;
const MAX_ACTIONS = 6;
const MAX_LABEL = 24;
const MAX_INSERT = 500;
const MAX_TEXT = 120;
const MAX_PATH_PREFIX = 200;
const MAX_API_ACTIONS = 4;
const MAX_API_PATH = 200;
const MAX_BODY_KEYS = 16;
const MAX_BODY_VALUE = 200;
const MAX_COMMANDS = 6;
const MAX_COMMAND_DESCRIPTION = 80;
const MAX_COMMAND_USAGE = 60;
const MAX_LOOKUPS = 4;
const MAX_FACTS = 6;
const MAX_PATH_EXCLUDES = 30;
const MAX_PATH_EXCLUDE = 100;
export const MAX_SETTINGS = 8;
const MAX_SETTING_LABEL = 40;
const MAX_SETTING_DESCRIPTION = 120;
export const MAX_SETTING_TEXT = 200;
const DEFAULT_SETTING_TEXT = 100;
const MAX_CHOICES = 8;
const SETTING_ID_PATTERN = /^[a-z][a-zA-Z0-9]{0,23}$/;
const CHOICE_VALUE_PATTERN = /^[A-Za-z0-9._~-]{1,40}$/;
const MAX_PATTERN_SEGMENTS = 8;
const PATTERN_NAME = /^[a-z][a-z0-9_]{0,15}$/;
const PATTERN_LITERAL = /^[A-Za-z0-9._~-]+$/;
const FIELD_PART = /^[A-Za-z0-9_]{1,32}$/;
const FORBIDDEN_FIELD_PARTS = ['__proto__', 'constructor', 'prototype'];

export type PathPatternSegment = { literal: string } | { name: string };

/**
 * Parses "/{owner}/{repo}" style patterns. Each segment is a literal (letters, digits, . _ ~ -, not
 * "." or "..") or a whole-segment `{name}` placeholder (lowercase, unique). Returns an error text
 * for anything else.
 */
export function parsePathPattern(pattern: string): PathPatternSegment[] | string {
  if (!pattern.startsWith('/')) return 'must start with "/"';
  const parts = pattern.slice(1).split('/');
  if (parts.length > MAX_PATTERN_SEGMENTS) return `at most ${MAX_PATTERN_SEGMENTS} segments`;
  const names = new Set<string>();
  const out: PathPatternSegment[] = [];
  for (const part of parts) {
    const m = /^\{([^{}]*)\}$/.exec(part);
    if (m) {
      if (!PATTERN_NAME.test(m[1])) return `invalid placeholder name "${m[1]}"`;
      if (names.has(m[1])) return `placeholder {${m[1]}} is used twice`;
      names.add(m[1]);
      out.push({ name: m[1] });
    } else {
      if (!PATTERN_LITERAL.test(part) || part === '.' || part === '..')
        return 'each segment must be {name} or plain text (letters, digits, . _ ~ -)';
      out.push({ literal: part });
    }
  }
  return out;
}

/** Placeholder names a pattern captures. */
export function patternNames(pattern: string): string[] {
  const parsed = parsePathPattern(pattern);
  return typeof parsed === 'string' ? [] : parsed.flatMap((s) => ('name' in s ? [s.name] : []));
}

// Control characters (newlines included) and invisible/bidi formatting characters that can make
// text read differently from what it is.
/* eslint-disable no-control-regex */
const UNSAFE_CHARS = new RegExp(
  '[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]'
);
/* eslint-enable no-control-regex */

export function hasUnsafeChars(value: string): boolean {
  return UNSAFE_CHARS.test(value);
}

const UNSAFE_CHARS_GLOBAL = new RegExp(UNSAFE_CHARS.source, 'g');

/** Removes the characters `hasUnsafeChars` rejects (for text that did not come from a manifest). */
export function stripUnsafeChars(value: string): string {
  return value.replace(UNSAFE_CHARS_GLOBAL, '');
}

class Fail extends Error {}
const fail = (path: string, msg: string): never => {
  throw new Fail(`${path}: ${msg}`);
};

type Obj = Record<string, unknown>;

function asObject(v: unknown, path: string, allowed: readonly string[]): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    return fail(path, 'must be an object');
  const obj = v as Obj;
  Object.keys(obj).forEach((k) => {
    if (!allowed.includes(k)) fail(`${path}.${k}`, 'unknown key');
  });
  return obj;
}

function asArray(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) return fail(path, 'must be an array');
  if (v.length > max) return fail(path, `at most ${max} entries`);
  return v;
}

function asString(v: unknown, path: string, max: number, min = 1): string {
  if (typeof v !== 'string') return fail(path, 'must be a string');
  if (v.length < min) return fail(path, 'must not be empty');
  if (v.length > max) return fail(path, `at most ${max} characters`);
  if (hasUnsafeChars(v)) return fail(path, 'contains control or invisible characters');
  return v;
}

/** https only, no credentials, a real hostname. Returns the string unchanged. */
function asHttpsUrl(v: unknown, path: string): string {
  const s = asString(v, path, MAX_URL);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(path, 'not a valid URL');
  }
  if (u.protocol !== 'https:') return fail(path, 'must be an https URL');
  if (u.username || u.password) return fail(path, 'must not contain credentials');
  if (!u.hostname) return fail(path, 'missing host');
  return s;
}

function isIpLike(host: string): boolean {
  return host.includes(':') || host.startsWith('[') || /^[0-9.]+$/.test(host);
}

function asHost(v: unknown, path: string): string {
  const s = asString(v, path, 253);
  if (s !== s.toLowerCase()) return fail(path, 'must be lowercase');
  if (isIpLike(s)) return fail(path, 'IP addresses are not allowed');
  const labels = s.split('.');
  if (labels.length < 2 || !labels.every((l) => HOST_LABEL.test(l)))
    return fail(path, 'not a valid hostname (no wildcards or ports)');
  return s;
}

function optional<T>(obj: Obj, key: string, read: (v: unknown) => T): T | undefined {
  return obj[key] === undefined ? undefined : read(obj[key]);
}

function validateLinkCard(
  v: unknown,
  path: string,
  details: LinkDetailsPermission | undefined,
  ids: SettingIds
): LinkCardRule {
  const o = asObject(v, path, [
    'hosts',
    'pathPrefix',
    'pathPattern',
    'pathExclude',
    'title',
    'subtitle',
    'buttonLabel',
    'icon',
    'details',
  ]);
  const hosts = asArray(o.hosts, `${path}.hosts`, MAX_HOSTS).map((h, i) =>
    asHost(h, `${path}.hosts[${i}]`)
  );
  if (hosts.length === 0) fail(`${path}.hosts`, 'needs at least one host');
  if (new Set(hosts).size !== hosts.length) fail(`${path}.hosts`, 'duplicate host');
  if (o.pathPrefix !== undefined && o.pathPattern !== undefined)
    fail(path, 'use either "pathPrefix" or "pathPattern", not both');
  const pathPattern = optional(o, 'pathPattern', (x) => {
    const p = asString(x, `${path}.pathPattern`, MAX_PATH_PREFIX);
    const parsed = parsePathPattern(p);
    if (typeof parsed === 'string') fail(`${path}.pathPattern`, parsed);
    return p;
  });
  // With a pattern, the texts may show what it captured; without one they are plain text.
  const names = pathPattern === undefined ? undefined : patternNames(pathPattern);
  const text = (x: unknown, at: string) =>
    names === undefined
      ? asTextWithSettings(x, at, MAX_TEXT, ids.text)
      : asTemplate(x, at, MAX_TEXT, names, 1, ids.text);
  const rule: LinkCardRule = { hosts, title: text(o.title, `${path}.title`) };
  const pathPrefix = optional(o, 'pathPrefix', (x) => {
    const p = asString(x, `${path}.pathPrefix`, MAX_PATH_PREFIX);
    if (!p.startsWith('/')) fail(`${path}.pathPrefix`, 'must start with "/"');
    if (/[?#\s\\]/.test(p)) fail(`${path}.pathPrefix`, 'must be a plain path');
    return p;
  });
  if (pathPrefix !== undefined) rule.pathPrefix = pathPrefix;
  if (pathPattern !== undefined) rule.pathPattern = pathPattern;
  const pathExclude = optional(o, 'pathExclude', (x) =>
    validatePathExclude(x, `${path}.pathExclude`)
  );
  if (pathExclude !== undefined) rule.pathExclude = pathExclude;
  const subtitle = optional(o, 'subtitle', (x) => text(x, `${path}.subtitle`));
  if (subtitle !== undefined) rule.subtitle = subtitle;
  const detailsId = optional(o, 'details', (x) => {
    const id = asString(x, `${path}.details`, 32);
    const lookup = details?.lookups.find((l) => l.id === id);
    if (!lookup)
      return fail(`${path}.details`, 'no such lookup in permissions.linkDetails.lookups');
    if (names === undefined) return fail(`${path}.details`, 'needs a "pathPattern"');
    const missing = lookupNames(lookup.path).filter((n) => !names.includes(n));
    if (missing.length > 0)
      fail(
        `${path}.details`,
        `the lookup path uses ${missing.map((n) => `{${n}}`).join(', ')}, which this pathPattern does not capture`
      );
    return id;
  });
  if (detailsId !== undefined) rule.details = detailsId;
  const buttonLabel = optional(o, 'buttonLabel', (x) =>
    asString(x, `${path}.buttonLabel`, MAX_LABEL)
  );
  if (buttonLabel !== undefined) rule.buttonLabel = buttonLabel;
  const icon = optional(o, 'icon', (x) => asHttpsUrl(x, `${path}.icon`));
  if (icon !== undefined) rule.icon = icon;
  return rule;
}

/** `{room}`-style placeholders and `{setting.<id>}` ones. */
export const TEMPLATE_PLACEHOLDER = /\{(\w+|setting\.[a-zA-Z0-9]+)\}/g;

/**
 * Which declared settings a template may use: text and choice values may fill templates (`text`),
 * only choice values may go into what is sent to a host (`choice`), and toggles only decide which
 * looked-up fields are shown (`toggle`).
 */
interface SettingIds {
  text: readonly string[];
  choice: readonly string[];
  toggle: readonly string[];
}
const NO_SETTINGS: SettingIds = { text: [], choice: [], toggle: [] };

/**
 * A string whose only braces are complete, allowed placeholders: `{name}` from `allowed`, and
 * `{setting.<id>}` for the ids in `settingIds`.
 */
function asTemplate(
  v: unknown,
  path: string,
  max: number,
  allowed: readonly string[],
  min = 1,
  settingIds: readonly string[] = []
): string {
  const s = asString(v, path, max, min);
  const rest = s.replace(TEMPLATE_PLACEHOLDER, (m, name: string) => {
    if (name.startsWith('setting.')) {
      if (!settingIds.includes(name.slice(8)))
        fail(
          path,
          `{${name}} is not a setting that can be used here (declare it in "settings"; toggles only work in "if", and only choice settings can be sent in an api body)`
        );
      return '';
    }
    return allowed.includes(name) ? '' : m;
  });
  if (rest.includes('{') || rest.includes('}'))
    fail(
      path,
      `only the ${[...allowed.map((a) => `{${a}}`), ...settingIds.map((id) => `{setting.${id}}`)].join(', ') || 'no'} placeholder(s) are allowed`
    );
  return s;
}

/** A plain text that may still use `{setting.<id>}` (other braces are kept as written). */
function asTextWithSettings(v: unknown, path: string, max: number, settingIds: readonly string[]) {
  const s = asString(v, path, max);
  for (const m of s.matchAll(TEMPLATE_PLACEHOLDER)) {
    const name = m[1];
    if (name.startsWith('setting.') && !settingIds.includes(name.slice(8)))
      fail(path, `{${name}} is not a declared text or choice setting`);
  }
  return s;
}

function validateSetting(v: unknown, path: string): IntegrationSetting {
  const o = asObject(v, path, [
    'id',
    'label',
    'description',
    'type',
    'default',
    'maxLength',
    'options',
  ]);
  const id = asString(o.id, `${path}.id`, 24);
  if (!SETTING_ID_PATTERN.test(id))
    fail(`${path}.id`, 'must start with a lowercase letter, then letters and digits (up to 24)');
  const label = asString(o.label, `${path}.label`, MAX_SETTING_LABEL);
  const description = optional(o, 'description', (x) =>
    asString(x, `${path}.description`, MAX_SETTING_DESCRIPTION)
  );
  const base = { id, label, ...(description !== undefined ? { description } : {}) };
  if (typeof o.type !== 'string' || !(SETTING_TYPES as readonly string[]).includes(o.type))
    return fail(`${path}.type`, `must be one of ${SETTING_TYPES.join(', ')}`);
  const only = (key: string, type: string) => {
    if (o[key] !== undefined) fail(`${path}.${key}`, `only for "${type}" settings`);
  };
  if (o.type === 'toggle') {
    only('maxLength', 'text');
    only('options', 'choice');
    if (typeof o.default !== 'boolean') fail(`${path}.default`, 'must be true or false');
    return { ...base, type: 'toggle', default: o.default as boolean };
  }
  if (o.type === 'text') {
    only('options', 'choice');
    const maxLength =
      o.maxLength === undefined
        ? DEFAULT_SETTING_TEXT
        : typeof o.maxLength === 'number' &&
            Number.isInteger(o.maxLength) &&
            o.maxLength >= 1 &&
            o.maxLength <= MAX_SETTING_TEXT
          ? o.maxLength
          : fail(`${path}.maxLength`, `must be a whole number from 1 to ${MAX_SETTING_TEXT}`);
    const def = asString(o.default, `${path}.default`, maxLength, 0);
    return { ...base, type: 'text', default: def, maxLength };
  }
  only('maxLength', 'text');
  const options = asArray(o.options, `${path}.options`, MAX_CHOICES).map((c, i) => {
    const co = asObject(c, `${path}.options[${i}]`, ['value', 'label']);
    const value = asString(co.value, `${path}.options[${i}].value`, 40);
    if (!CHOICE_VALUE_PATTERN.test(value))
      fail(`${path}.options[${i}].value`, 'letters, digits and . _ ~ - only (up to 40)');
    return { value, label: asString(co.label, `${path}.options[${i}].label`, MAX_SETTING_LABEL) };
  });
  if (options.length < 2) fail(`${path}.options`, 'needs at least two options');
  if (new Set(options.map((c) => c.value)).size !== options.length)
    fail(`${path}.options`, 'duplicate option value');
  if (typeof o.default !== 'string' || !options.some((c) => c.value === o.default))
    fail(`${path}.default`, 'must be the value of one of the options');
  return { ...base, type: 'choice', default: o.default as string, options };
}

function validateSettings(v: unknown, path: string): IntegrationSetting[] {
  const list = asArray(v, path, MAX_SETTINGS).map((s, i) => validateSetting(s, `${path}[${i}]`));
  if (new Set(list.map((s) => s.id)).size !== list.length) fail(path, 'duplicate setting id');
  return list;
}

function settingIdsOf(settings: readonly IntegrationSetting[] | undefined): SettingIds {
  const of = (...types: SettingType[]) =>
    (settings ?? []).filter((s) => types.includes(s.type)).map((s) => s.id);
  return { text: of('text', 'choice'), choice: of('choice'), toggle: of('toggle') };
}

function asToggleRef(v: unknown, path: string, ids: SettingIds): string {
  const s = asString(v, path, 24);
  if (!ids.toggle.includes(s)) fail(path, 'must be the id of a toggle setting in "settings"');
  return s;
}

function validatePathExclude(v: unknown, path: string): string[] {
  const list = asArray(v, path, MAX_PATH_EXCLUDES).map((x, i) => {
    const p = asString(x, `${path}[${i}]`, MAX_PATH_EXCLUDE);
    if (!p.startsWith('/') || p === '/')
      fail(`${path}[${i}]`, 'must start with "/" and not be "/"');
    if (/[?#\s\\{}]/.test(p)) fail(`${path}[${i}]`, 'must be a plain path');
    return p;
  });
  if (list.length === 0) fail(path, 'leave it out instead of giving an empty list');
  if (new Set(list.map((p) => p.toLowerCase())).size !== list.length) fail(path, 'duplicate path');
  return list;
}

const validateInsert = (v: unknown, path: string, ids: SettingIds): string =>
  asTemplate(v, path, MAX_INSERT, ['room'], 1, ids.text);

function asApiHost(v: unknown, path: string): string {
  return asHost(v, path);
}

function validateApiAction(v: unknown, path: string, ids: SettingIds): ApiAction {
  const o = asObject(v, path, ['id', 'label', 'path', 'body', 'insertResultLink']);
  const id = asString(o.id, `${path}.id`, 32);
  if (!ACTION_ID_PATTERN.test(id)) fail(`${path}.id`, 'invalid id');
  const apiPath = asString(o.path, `${path}.path`, MAX_API_PATH);
  if (!API_PATH_PATTERN.test(apiPath) || apiPath.split('/').some((s) => s === '..' || s === '.'))
    fail(`${path}.path`, 'must start with "/" and be a plain path (letters, digits, . _ ~ / -)');
  const action: ApiAction = {
    id,
    label: asString(o.label, `${path}.label`, MAX_LABEL),
    path: apiPath,
  };
  const body = optional(o, 'body', (x) => {
    if (typeof x !== 'object' || x === null || Array.isArray(x))
      return fail(`${path}.body`, 'must be an object');
    const keys = Object.keys(x);
    if (keys.length > MAX_BODY_KEYS) fail(`${path}.body`, `at most ${MAX_BODY_KEYS} keys`);
    const out: Record<string, string> = {};
    keys.forEach((k) => {
      if (!BODY_KEY_PATTERN.test(k) || k === '__proto__') fail(`${path}.body.${k}`, 'invalid key');
      // Only choice values may be sent: a free-text setting must never carry a secret to a host.
      out[k] = asTemplate(
        (x as Obj)[k],
        `${path}.body.${k}`,
        MAX_BODY_VALUE,
        API_PLACEHOLDERS,
        0,
        ids.choice
      );
    });
    return out;
  });
  if (body !== undefined) action.body = body;
  const link = optional(o, 'insertResultLink', (x) => {
    if (typeof x !== 'string' || !RESULT_FIELD_PATTERN.test(x))
      fail(`${path}.insertResultLink`, 'must be a plain JSON field name');
    return x as string;
  });
  if (link !== undefined) action.insertResultLink = link;
  return action;
}

function validateApi(v: unknown, path: string, ids: SettingIds): ApiPermission {
  const o = asObject(v, path, ['host', 'actions']);
  const host = asApiHost(o.host, `${path}.host`);
  const actions = asArray(o.actions, `${path}.actions`, MAX_API_ACTIONS).map((a, i) =>
    validateApiAction(a, `${path}.actions[${i}]`, ids)
  );
  if (actions.length === 0) fail(`${path}.actions`, 'needs at least one action');
  if (new Set(actions.map((a) => a.id)).size !== actions.length)
    fail(`${path}.actions`, 'duplicate action id');
  return { host, actions };
}

const LOOKUP_PLACEHOLDER = /\{([a-z][a-z0-9_]{0,15})\}/g;

/** Placeholder names used in a lookup path. */
export function lookupNames(lookupPath: string): string[] {
  return [...lookupPath.matchAll(LOOKUP_PLACEHOLDER)].map((m) => m[1]);
}

function asField(v: unknown, path: string): string {
  const s = asString(v, path, 140);
  const parts = s.split('.');
  if (
    parts.length > 4 ||
    !parts.every((p) => FIELD_PART.test(p) && !FORBIDDEN_FIELD_PARTS.includes(p))
  )
    fail(
      path,
      'must be a JSON field name, or up to 4 of them joined with "." (such as owner.login)'
    );
  return s;
}

function validateFact(v: unknown, path: string, ids: SettingIds): LinkFact {
  const o = asObject(v, path, ['label', 'field', 'format', 'if']);
  const fact: LinkFact = {
    label: asString(o.label, `${path}.label`, MAX_LABEL),
    field: asField(o.field, `${path}.field`),
  };
  const format = optional(o, 'format', (x) => {
    if (typeof x !== 'string' || !(LINK_FACT_FORMATS as readonly string[]).includes(x))
      fail(`${path}.format`, `must be one of ${LINK_FACT_FORMATS.join(', ')}`);
    return x as LinkFactFormat;
  });
  if (format !== undefined) fact.format = format;
  const cond = optional(o, 'if', (x) => asToggleRef(x, `${path}.if`, ids));
  if (cond !== undefined) fact.if = cond;
  return fact;
}

function validateLookup(v: unknown, path: string, ids: SettingIds): LinkLookup {
  const o = asObject(v, path, ['id', 'path', 'title', 'description', 'descriptionIf', 'facts']);
  const id = asString(o.id, `${path}.id`, 32);
  if (!ACTION_ID_PATTERN.test(id)) fail(`${path}.id`, 'invalid id');
  const lookupPath = asString(o.path, `${path}.path`, MAX_API_PATH);
  const rest = lookupPath.replace(LOOKUP_PLACEHOLDER, 'x');
  if (
    !API_PATH_PATTERN.test(rest) ||
    rest.split('/').some((s) => s === '..' || s === '.') ||
    lookupPath.split('/').some((s) => s === '.' || s === '..')
  )
    fail(
      `${path}.path`,
      'must start with "/" and be a plain path (letters, digits, . _ ~ / -) with {name} placeholders'
    );
  const lookup: LinkLookup = { id, path: lookupPath };
  const title = optional(o, 'title', (x) => asField(x, `${path}.title`));
  if (title !== undefined) lookup.title = title;
  const description = optional(o, 'description', (x) => asField(x, `${path}.description`));
  if (description !== undefined) lookup.description = description;
  const descriptionIf = optional(o, 'descriptionIf', (x) => {
    if (description === undefined)
      fail(`${path}.descriptionIf`, 'only makes sense together with "description"');
    return asToggleRef(x, `${path}.descriptionIf`, ids);
  });
  if (descriptionIf !== undefined) lookup.descriptionIf = descriptionIf;
  const facts = optional(o, 'facts', (x) =>
    asArray(x, `${path}.facts`, MAX_FACTS).map((f, i) =>
      validateFact(f, `${path}.facts[${i}]`, ids)
    )
  );
  if (facts !== undefined && facts.length > 0) lookup.facts = facts;
  if (!lookup.title && !lookup.description && !lookup.facts)
    fail(path, 'shows nothing: give it a "title", a "description" or "facts"');
  return lookup;
}

function validateLinkDetails(v: unknown, path: string, ids: SettingIds): LinkDetailsPermission {
  const o = asObject(v, path, ['host', 'lookups']);
  const host = asApiHost(o.host, `${path}.host`);
  const lookups = asArray(o.lookups, `${path}.lookups`, MAX_LOOKUPS).map((l, i) =>
    validateLookup(l, `${path}.lookups[${i}]`, ids)
  );
  if (lookups.length === 0) fail(`${path}.lookups`, 'needs at least one lookup');
  if (new Set(lookups.map((l) => l.id)).size !== lookups.length)
    fail(`${path}.lookups`, 'duplicate lookup id');
  return { host, lookups };
}

function validateWidget(v: unknown, path: string): WidgetPermission {
  const o = asObject(v, path, [
    'url',
    'name',
    'capabilities',
    'parameters',
    'events',
    'fromLinks',
    'linkLabel',
    'saveFiles',
  ]);
  const raw = asString(o.url, `${path}.url`, MAX_URL);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return fail(`${path}.url`, 'not a valid URL');
  }
  if (u.protocol !== 'https:') fail(`${path}.url`, 'must be an https URL');
  if (u.username || u.password) fail(`${path}.url`, 'must not contain credentials');
  asHost(u.hostname, `${path}.url`);
  if (raw.includes('#')) fail(`${path}.url`, 'must not have a fragment');
  if (raw.includes('$')) fail(`${path}.url`, 'template variables are not supported');
  if (u.searchParams.has('theme') || u.searchParams.has('lang'))
    fail(`${path}.url`, 'theme and lang are added by the client');
  const capabilities = asArray(
    o.capabilities,
    `${path}.capabilities`,
    WIDGET_CAPABILITY_IDS.length
  ).map((c, i) => {
    if (typeof c !== 'string' || !WIDGET_CAPABILITY_IDS.includes(c))
      return fail(
        `${path}.capabilities[${i}]`,
        `must be one of ${WIDGET_CAPABILITY_IDS.join(', ')}`
      );
    return c;
  });
  if (new Set(capabilities).size !== capabilities.length)
    fail(`${path}.capabilities`, 'duplicate capability');
  const widget: WidgetPermission = { url: raw, capabilities };
  const name = optional(o, 'name', (x) => asString(x, `${path}.name`, MAX_NAME));
  if (name !== undefined) widget.name = name;
  const parameters = optional(o, 'parameters', (x) => {
    const list = asArray(x, `${path}.parameters`, WIDGET_PARAMETERS.length).map((p, i) => {
      if (typeof p !== 'string' || !(WIDGET_PARAMETERS as readonly string[]).includes(p))
        return fail(`${path}.parameters[${i}]`, `must be one of ${WIDGET_PARAMETERS.join(', ')}`);
      return p as WidgetParameter;
    });
    if (new Set(list).size !== list.length) fail(`${path}.parameters`, 'duplicate parameter');
    return list;
  });
  if (parameters !== undefined) widget.parameters = parameters;
  const events = optional(o, 'events', (x) => {
    const list = asArray(x, `${path}.events`, MAX_WIDGET_EVENTS).map((e, i) => {
      const problem = checkEventType(e);
      if (problem !== null) return fail(`${path}.events[${i}]`, problem);
      return e as string;
    });
    if (new Set(list).size !== list.length) fail(`${path}.events`, 'duplicate event type');
    return list;
  });
  // An empty list is the same as none; keep one canonical shape.
  if (events !== undefined && events.length > 0) widget.events = events;
  const mustBeTrue = (key: string) => (x: unknown) =>
    x === true ? true : fail(`${path}.${key}`, 'must be true (or left out)');
  if (optional(o, 'fromLinks', mustBeTrue('fromLinks'))) widget.fromLinks = true;
  if (optional(o, 'saveFiles', mustBeTrue('saveFiles'))) widget.saveFiles = true;
  const linkLabel = optional(o, 'linkLabel', (x) => asString(x, `${path}.linkLabel`, 24));
  if (linkLabel !== undefined) {
    if (!widget.fromLinks) fail(`${path}.linkLabel`, 'only makes sense together with fromLinks');
    widget.linkLabel = linkLabel;
  }
  return widget;
}

function validateCommand(
  v: unknown,
  path: string,
  api: ApiPermission | undefined,
  widget: WidgetPermission | undefined,
  ids: SettingIds
): SlashCommand {
  const o = asObject(v, path, ['name', 'description', 'usage', 'insert', 'api', 'widget']);
  const name = asString(o.name, `${path}.name`, 24);
  if (!COMMAND_NAME_PATTERN.test(name)) fail(`${path}.name`, 'invalid command name');
  const cmd: SlashCommand = {
    name,
    description: asString(o.description, `${path}.description`, MAX_COMMAND_DESCRIPTION),
  };
  const usage = optional(o, 'usage', (x) => {
    const u = asString(x, `${path}.usage`, MAX_COMMAND_USAGE);
    if (u !== `/${name}` && !u.startsWith(`/${name} `))
      fail(`${path}.usage`, `must start with "/${name}"`);
    return u;
  });
  if (usage !== undefined) cmd.usage = usage;
  if ([o.insert, o.api, o.widget].filter((x) => x !== undefined).length !== 1)
    fail(path, 'needs exactly one of "insert", "api" or "widget"');
  if (o.widget !== undefined) {
    if (o.widget !== true) fail(`${path}.widget`, 'must be true');
    if (!widget) fail(`${path}.widget`, 'requires permissions.widget');
    cmd.widget = true;
  } else if (o.insert !== undefined)
    cmd.insert = asTemplate(o.insert, `${path}.insert`, MAX_INSERT, ['room', 'args'], 1, ids.text);
  else {
    const target = asString(o.api, `${path}.api`, 32);
    if (!api?.actions.some((a) => a.id === target))
      fail(`${path}.api`, 'no such action in permissions.api.actions');
    cmd.api = target;
  }
  return cmd;
}

function validateAction(v: unknown, path: string, ids: SettingIds): ComposerAction {
  const o = asObject(v, path, ['id', 'label', 'icon', 'insert']);
  const id = asString(o.id, `${path}.id`, 32);
  if (!ACTION_ID_PATTERN.test(id)) fail(`${path}.id`, 'invalid id');
  const action: ComposerAction = {
    id,
    label: asString(o.label, `${path}.label`, MAX_LABEL),
    insert: validateInsert(o.insert, `${path}.insert`, ids),
  };
  const icon = optional(o, 'icon', (x) => {
    if (typeof x !== 'string' || !(COMPOSER_ICON_NAMES as readonly string[]).includes(x))
      fail(`${path}.icon`, `must be one of ${COMPOSER_ICON_NAMES.join(', ')}`);
    return x as ComposerIconName;
  });
  if (icon !== undefined) action.icon = icon;
  return action;
}

function validatePermissions(v: unknown, path: string, ids: SettingIds = NO_SETTINGS): Permissions {
  const o = asObject(v, path, CAPABILITIES as readonly string[]);
  const out: Permissions = {};
  // linkDetails first: link cards cross-check their `details` against it.
  const details =
    o.linkDetails === undefined
      ? undefined
      : validateLinkDetails(o.linkDetails, `${path}.linkDetails`, ids);
  if (o.linkCards !== undefined) {
    out.linkCards = asArray(o.linkCards, `${path}.linkCards`, MAX_LINK_RULES).map((r, i) =>
      validateLinkCard(r, `${path}.linkCards[${i}]`, details, ids)
    );
  }
  if (details) {
    details.lookups.forEach((l, i) => {
      if (!out.linkCards?.some((r) => r.details === l.id))
        fail(`${path}.linkDetails.lookups[${i}]`, `no link card uses lookup "${l.id}"`);
    });
    out.linkDetails = details;
  }
  if (o.composerActions !== undefined) {
    const actions = asArray(o.composerActions, `${path}.composerActions`, MAX_ACTIONS).map((a, i) =>
      validateAction(a, `${path}.composerActions[${i}]`, ids)
    );
    if (new Set(actions.map((a) => a.id)).size !== actions.length)
      fail(`${path}.composerActions`, 'duplicate action id');
    out.composerActions = actions;
  }
  // api and widget first: commands cross-check their targets against them.
  if (o.api !== undefined) out.api = validateApi(o.api, `${path}.api`, ids);
  if (o.widget !== undefined) out.widget = validateWidget(o.widget, `${path}.widget`);
  if (o.commands !== undefined) {
    const commands = asArray(o.commands, `${path}.commands`, MAX_COMMANDS).map((c, i) =>
      validateCommand(c, `${path}.commands[${i}]`, out.api, out.widget, ids)
    );
    if (new Set(commands.map((c) => c.name)).size !== commands.length)
      fail(`${path}.commands`, 'duplicate command name');
    out.commands = commands;
  }
  return out;
}

function validateIntegration(v: unknown, path: string): Integration {
  const o = asObject(v, path, [
    'id',
    'name',
    'description',
    'version',
    'icon',
    'permissions',
    'settings',
  ]);
  const id = asString(o.id, `${path}.id`, 64);
  if (!ID_PATTERN.test(id)) fail(`${path}.id`, 'invalid id');
  // Settings first: the permissions' templates may only use settings that exist.
  const settings = optional(o, 'settings', (x) => validateSettings(x, `${path}.settings`));
  const integration: Integration = {
    id,
    name: asString(o.name, `${path}.name`, MAX_NAME),
    description: asString(o.description, `${path}.description`, MAX_DESCRIPTION),
    version: asString(o.version, `${path}.version`, MAX_VERSION),
    permissions: validatePermissions(o.permissions, `${path}.permissions`, settingIdsOf(settings)),
  };
  const icon = optional(o, 'icon', (x) => asHttpsUrl(x, `${path}.icon`));
  if (icon !== undefined) integration.icon = icon;
  // An empty list is the same as none; keep one canonical shape.
  if (settings !== undefined && settings.length > 0) integration.settings = settings;
  return integration;
}

/**
 * Something this Mudrix does not know (an unknown key or value), as opposed to a plain mistake.
 */
function looksNewer(error: string): boolean {
  return / unknown key$| must be one of /.test(error);
}

/** The entry's id and name for listing it, only when they are well-formed. */
function describeRejected(v: unknown, index: number, error: string): RejectedIntegration {
  const o = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {};
  const out: RejectedIntegration = {
    index,
    error,
    reason: looksNewer(error) ? 'unsupported' : 'invalid',
  };
  if (typeof o.id === 'string' && ID_PATTERN.test(o.id)) out.id = o.id;
  if (typeof o.name === 'string') {
    const name = stripUnsafeChars(o.name).trim().slice(0, MAX_NAME);
    if (name) out.name = name;
  }
  return out;
}

/**
 * Validates an already parsed value. Never throws. The repository itself (schema, key, serial,
 * name, the list) must be valid or the whole file is refused; each integration is then checked on
 * its own, and one this Mudrix can not use is listed in `rejected` instead of failing the rest.
 */
export function validateManifest(raw: unknown): ValidationResult<RepoManifest> {
  try {
    const o = asObject(raw, 'repo', ['schema', 'key', 'serial', 'name', 'integrations']);
    if (o.schema !== MANIFEST_SCHEMA) fail('repo.schema', `must be ${MANIFEST_SCHEMA}`);
    const key = asString(o.key, 'repo.key', 44, 44);
    if (!isValidKey(key)) fail('repo.key', 'must be base64 of a 32-byte public key');
    const serial = o.serial;
    if (
      typeof serial !== 'number' ||
      !Number.isInteger(serial) ||
      serial < 1 ||
      serial > MAX_SERIAL
    )
      fail('repo.serial', `must be an integer from 1 to ${MAX_SERIAL}`);
    const name = asString(o.name, 'repo.name', MAX_REPO_NAME);
    const integrations: Integration[] = [];
    const rejected: RejectedIntegration[] = [];
    const seen = new Set<string>();
    asArray(o.integrations, 'repo.integrations', MAX_INTEGRATIONS).forEach((it, i) => {
      const path = `repo.integrations[${i}]`;
      try {
        const integration = validateIntegration(it, path);
        // The first entry with an id wins; a later one with the same id is never offered.
        if (seen.has(integration.id)) fail(`${path}.id`, 'duplicate integration id');
        seen.add(integration.id);
        integrations.push(integration);
      } catch (e) {
        if (!(e instanceof Fail)) throw e;
        rejected.push(describeRejected(it, i, e.message));
      }
    });
    return {
      ok: true,
      value: {
        schema: MANIFEST_SCHEMA,
        key,
        serial: serial as number,
        name,
        integrations,
        rejected,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Fail ? e.message : 'invalid repository file' };
  }
}

/** Size-checks and parses raw repo.json text, then validates it. Never throws. */
export function parseManifestText(text: string): ValidationResult<RepoManifest> {
  try {
    if (new TextEncoder().encode(text).length > MAX_MANIFEST_BYTES)
      return { ok: false, error: 'repository file is too large (max 256 KB)' };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: 'repository file is not valid JSON' };
    }
    return validateManifest(json);
  } catch {
    return { ok: false, error: 'invalid repository file' };
  }
}
