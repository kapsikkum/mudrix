import {
  hasUnsafeChars,
  parsePathPattern,
  stripUnsafeChars,
  type ApiAction,
  type Capability,
  type ComposerAction,
  type LinkCardRule,
  type LinkLookup,
  type WidgetPermission,
} from './manifest';
import {
  NO_SETTING_VALUES,
  renderTemplate,
  resolveSettings,
  type SettingValues,
  type StoredSettings,
} from './settings';
import type { GrantMap, InstalledIntegration } from './types';
import { assertViewerUrlAllowed } from './widget';

export interface LinkCardMatch {
  integrationId: string;
  integrationName: string;
  rule: LinkCardRule;
  /** What the rule's `pathPattern` captured from the link (decoded); empty without a pattern. */
  captures: Record<string, string>;
  /** The rule's texts with the captures filled in. */
  title: string;
  subtitle?: string;
  /** The integration's setting values (checked; defaults where nothing valid is stored). */
  settings: SettingValues;
}

export interface ActiveComposerAction extends ComposerAction {
  integrationId: string;
  integrationName: string;
  settings: SettingValues;
}

export interface ActiveApiAction extends ApiAction {
  integrationId: string;
  integrationName: string;
  host: string;
  settings: SettingValues;
}

export interface ActiveCommand {
  name: string;
  description: string;
  usage?: string;
  kind: 'insert' | 'api' | 'widget';
  /** Template, for kind insert. */
  insert?: string;
  /** Id of an action in the same integration's api actions, for kind api. */
  api?: string;
  integrationId: string;
  integrationName: string;
  settings: SettingValues;
}

function active(i: InstalledIntegration, grants: GrantMap, cap: Capability) {
  return i.enabled && grants[i.id]?.[cap] === true;
}

/**
 * The hosts a request for this capability may reach right now: the one host the person approved
 * for it, and only while the integration is enabled and the capability is still switched on.
 * This is what `util/integrationFetch.ts` receives as its allow-list.
 */
export function allowedHosts(
  i: InstalledIntegration,
  grants: GrantMap,
  cap: 'linkDetails' | 'api'
): string[] {
  if (!active(i, grants, cap)) return [];
  const host = (cap === 'api' ? i.permissions.api : i.permissions.linkDetails)?.host;
  return host ? [host] : [];
}

/** An installed integration's setting values, checked against what it declares. */
export function settingsOf(i: InstalledIntegration, stored?: StoredSettings): SettingValues {
  if (!i.settings) return NO_SETTING_VALUES;
  const own =
    stored && Object.prototype.hasOwnProperty.call(stored, i.id) ? stored[i.id] : undefined;
  return resolveSettings(i.settings, own);
}

/** The approved window a card's link can be opened in (see `WidgetPermission.fromLinks`). */
export interface LinkViewer {
  integrationId: string;
  integrationName: string;
  /** The widget's own url: the link must be on exactly its origin. */
  widgetUrl: string;
  label?: string;
  saveFiles: boolean;
}

/** The enabled, widget-granted integration allowed to open this link in a window, if any. */
export function findLinkViewer(
  url: string,
  installed: readonly InstalledIntegration[],
  grants: GrantMap
): LinkViewer | null {
  for (const i of installed) {
    const w = i.permissions.widget;
    if (w?.fromLinks && active(i, grants, 'widget') && assertViewerUrlAllowed(w.url, url).ok) {
      return {
        integrationId: i.id,
        integrationName: i.name,
        widgetUrl: w.url,
        label: w.linkLabel,
        saveFiles: w.saveFiles === true,
      };
    }
  }
  return null;
}

/** `/s` covers `/s` and `/s/...` but not `/sx`. */
function pathUnder(pathname: string, prefix: string): boolean {
  if (prefix === '/') return true;
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Longest text taken from one link segment. */
const MAX_CAPTURE = 100;

/**
 * Matches a link path against a `pathPattern` by whole segments; the link may continue below the
 * pattern. Returns the decoded captures, or null. A capture that is empty, "." or "..", too long,
 * not decodable or holds control/invisible characters makes the rule not match.
 */
export function matchPathPattern(pathname: string, pattern: string): Record<string, string> | null {
  const want = parsePathPattern(pattern);
  if (typeof want === 'string') return null;
  const have = pathname.slice(1).split('/');
  if (have.length < want.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < want.length; i += 1) {
    const seg = want[i];
    if ('literal' in seg) {
      if (have[i] !== seg.literal) return null;
    } else {
      let value: string;
      try {
        value = decodeURIComponent(have[i]);
      } catch {
        return null;
      }
      if (
        value === '' ||
        value === '.' ||
        value === '..' ||
        value.length > MAX_CAPTURE ||
        hasUnsafeChars(value)
      )
        return null;
      out[seg.name] = value;
    }
  }
  return out;
}

/**
 * Fills `{name}` placeholders from the captures and `{setting.<id>}` from the settings, in one
 * pass (inserted text is never re-expanded).
 */
export function fillCaptures(
  template: string,
  captures: Record<string, string>,
  settings: SettingValues = NO_SETTING_VALUES
): string {
  return renderTemplate(template, captures, settings);
}

/** True when the path is under one of the rule's `pathExclude` paths (whole segments, any case). */
function excluded(pathname: string, rule: LinkCardRule): boolean {
  const p = pathname.toLowerCase();
  return (rule.pathExclude ?? []).some((e) => pathUnder(p, e.toLowerCase()));
}

/** First enabled, granted link-card rule matching this link by exact host (default port) and path. */
export function matchLinkCard(
  url: string,
  installed: readonly InstalledIntegration[],
  grants: GrantMap,
  stored?: StoredSettings
): LinkCardMatch | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Default port only: an approved host on another port is a different service.
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  for (const i of installed) {
    if (active(i, grants, 'linkCards')) {
      for (const rule of i.permissions.linkCards ?? []) {
        if (rule.hosts.includes(host) && !excluded(u.pathname, rule)) {
          const settings = settingsOf(i, stored);
          if (rule.pathPattern !== undefined) {
            const captures = matchPathPattern(u.pathname, rule.pathPattern);
            if (captures) {
              return {
                integrationId: i.id,
                integrationName: i.name,
                rule,
                captures,
                title: fillCaptures(rule.title, captures, settings),
                subtitle: rule.subtitle && fillCaptures(rule.subtitle, captures, settings),
                settings,
              };
            }
          } else if (pathUnder(u.pathname, rule.pathPrefix ?? '/')) {
            return {
              integrationId: i.id,
              integrationName: i.name,
              rule,
              captures: {},
              title: fillCaptures(rule.title, {}, settings),
              subtitle: rule.subtitle && fillCaptures(rule.subtitle, {}, settings),
              settings,
            };
          }
        }
      }
    }
  }
  return null;
}

/** The approved lookup for a matched card, if its integration still has the linkDetails grant. */
export function findLinkLookup(
  match: LinkCardMatch,
  installed: readonly InstalledIntegration[],
  grants: GrantMap
): { host: string; lookup: LinkLookup; allow: string[] } | null {
  if (!match.rule.details) return null;
  const i = installed.find((x) => x.id === match.integrationId);
  if (!i || !active(i, grants, 'linkDetails') || !i.permissions.linkDetails) return null;
  const lookup = i.permissions.linkDetails.lookups.find((l) => l.id === match.rule.details);
  return lookup
    ? {
        host: i.permissions.linkDetails.host,
        lookup,
        allow: allowedHosts(i, grants, 'linkDetails'),
      }
    : null;
}

/** Composer actions of every enabled integration whose composerActions grant is still on. */
export function getComposerActions(
  installed: readonly InstalledIntegration[],
  grants: GrantMap,
  stored?: StoredSettings
): ActiveComposerAction[] {
  return installed
    .filter((i) => active(i, grants, 'composerActions'))
    .flatMap((i) => {
      const settings = settingsOf(i, stored);
      return (i.permissions.composerActions ?? []).map((a) => ({
        ...a,
        integrationId: i.id,
        integrationName: i.name,
        settings,
      }));
    });
}

/** API actions of every enabled integration whose api grant is still on. */
export function getApiActions(
  installed: readonly InstalledIntegration[],
  grants: GrantMap,
  stored?: StoredSettings
): ActiveApiAction[] {
  return installed
    .filter((i) => active(i, grants, 'api') && i.permissions.api)
    .flatMap((i) => {
      const { host, actions } = i.permissions.api!;
      const settings = settingsOf(i, stored);
      return actions.map((a) => ({
        ...a,
        integrationId: i.id,
        integrationName: i.name,
        host,
        settings,
      }));
    });
}

export interface ActiveWidget extends WidgetPermission {
  integrationId: string;
  integrationName: string;
}

/** Widgets of every enabled integration whose widget grant is still on. */
export function getWidgets(
  installed: readonly InstalledIntegration[],
  grants: GrantMap
): ActiveWidget[] {
  return installed.flatMap((i) =>
    active(i, grants, 'widget') && i.permissions.widget
      ? [{ ...i.permissions.widget, integrationId: i.id, integrationName: i.name }]
      : []
  );
}

/**
 * Slash commands of enabled, granted integrations. Names in `reserved` (built-in commands and
 * aliases) are dropped so an integration can never shadow them; between integrations the first
 * installed wins. Api commands also need the api grant and an existing target action.
 */
export function getCommands(
  installed: readonly InstalledIntegration[],
  grants: GrantMap,
  reserved: ReadonlySet<string>,
  stored?: StoredSettings
): ActiveCommand[] {
  const seen = new Set<string>();
  const out: ActiveCommand[] = [];
  installed.forEach((i) => {
    if (!active(i, grants, 'commands')) return;
    (i.permissions.commands ?? []).forEach((c) => {
      const name = c.name.toLowerCase();
      if (reserved.has(name) || seen.has(name)) return;
      const kind: ActiveCommand['kind'] =
        c.widget === true ? 'widget' : c.api !== undefined ? 'api' : 'insert';
      if (kind === 'api') {
        if (!active(i, grants, 'api')) return;
        if (!i.permissions.api?.actions.some((a) => a.id === c.api)) return;
      } else if (kind === 'widget') {
        if (!active(i, grants, 'widget') || !i.permissions.widget) return;
      } else if (c.insert === undefined) return;
      seen.add(name);
      const { widget: _w, ...rest } = c;
      out.push({
        ...rest,
        kind,
        integrationId: i.id,
        integrationName: i.name,
        settings: settingsOf(i, stored),
      });
    });
  });
  return out;
}

const MAX_ARGS = 500;

/**
 * Fills `{room}` (URL-encoded), `{args}` (what was typed after the command, as plain text minus
 * control/invisible characters, capped) and `{setting.<id>}` (the value, plain and capped). The
 * result is plain text for the composer. One pass, so substituted text is never re-expanded.
 */
export function renderInsert(
  insert: string,
  roomId: string,
  args = '',
  settings: SettingValues = NO_SETTING_VALUES
): string {
  const vars = {
    room: encodeURIComponent(roomId),
    args: stripUnsafeChars(args).slice(0, MAX_ARGS),
  };
  return renderTemplate(insert, vars, settings);
}
