import type {
  ApiAction,
  ApiPermission,
  ComposerAction,
  LinkCardRule,
  LinkDetailsPermission,
  LinkLookup,
  Permissions,
  SlashCommand,
  WidgetPermission,
} from './manifest';

/** An old rule already allowed everything the new rule would: same or fewer hosts, same or deeper path. */
function ruleCovered(next: LinkCardRule, old: LinkCardRule[]): boolean {
  return old.some(
    (o) =>
      next.hosts.every((h) => o.hosts.includes(h)) &&
      (o.pathPrefix === undefined || (next.pathPrefix ?? '').startsWith(o.pathPrefix)) &&
      o.pathPattern === next.pathPattern &&
      // Dropping an exclusion lets the rule match more links.
      (o.pathExclude ?? []).every((e) => (next.pathExclude ?? []).includes(e)) &&
      o.title === next.title &&
      o.subtitle === next.subtitle &&
      o.buttonLabel === next.buttonLabel &&
      o.icon === next.icon &&
      (next.details === undefined || o.details === next.details)
  );
}

/** Any difference in a lookup counts: the user approved exactly which fields are shown. */
function lookupCovered(next: LinkLookup, old: LinkLookup[]): boolean {
  return old.some((o) => JSON.stringify(o) === JSON.stringify(next));
}

function linkDetailsCovered(
  next: LinkDetailsPermission,
  old: LinkDetailsPermission | undefined
): boolean {
  return (
    old !== undefined &&
    old.host === next.host &&
    next.lookups.every((l) => lookupCovered(l, old.lookups))
  );
}

function actionCovered(next: ComposerAction, old: ComposerAction[]): boolean {
  return old.some((o) => o.id === next.id && o.insert === next.insert && o.label === next.label);
}

function sameBody(a: Record<string, string> | undefined, b: Record<string, string> | undefined) {
  if (a === undefined || b === undefined) return a === b;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Any difference at all counts: the user approved this exact request. */
function apiActionCovered(next: ApiAction, old: ApiAction[]): boolean {
  return old.some(
    (o) =>
      o.id === next.id &&
      o.label === next.label &&
      o.path === next.path &&
      o.insertResultLink === next.insertResultLink &&
      sameBody(o.body, next.body)
  );
}

function apiCovered(next: ApiPermission, old: ApiPermission | undefined): boolean {
  return (
    old !== undefined &&
    old.host === next.host &&
    next.actions.every((a) => apiActionCovered(a, old.actions))
  );
}

function commandCovered(next: SlashCommand, old: SlashCommand[]): boolean {
  return old.some(
    (o) =>
      o.name === next.name &&
      o.description === next.description &&
      o.usage === next.usage &&
      o.insert === next.insert &&
      o.api === next.api &&
      o.widget === next.widget
  );
}

/** Code that runs: any change at all (url, name, a new capability, parameter or event type) needs approval. */
function widgetCovered(next: WidgetPermission, old: WidgetPermission | undefined): boolean {
  return (
    old !== undefined &&
    old.url === next.url &&
    old.name === next.name &&
    next.capabilities.every((c) => old.capabilities.includes(c)) &&
    (next.parameters ?? []).every((p) => (old.parameters ?? []).includes(p)) &&
    (next.events ?? []).every((e) => (old.events ?? []).includes(e)) &&
    (!next.fromLinks || old.fromLinks === true) &&
    (!next.saveFiles || old.saveFiles === true) &&
    next.linkLabel === old.linkLabel
  );
}

/**
 * True when `next` lets the integration do anything `prev` did not already allow: a new
 * capability, host, rule, action or command, a broader path, or changed text, request or body
 * the user would see, insert or send. Pure; the store uses it to decide whether an update needs
 * fresh approval.
 */
export function permissionsWidened(prev: Permissions, next: Permissions): boolean {
  const oldRules = prev.linkCards ?? [];
  if ((next.linkCards ?? []).some((r) => !ruleCovered(r, oldRules))) return true;
  if (next.linkDetails && !linkDetailsCovered(next.linkDetails, prev.linkDetails)) return true;
  const oldActions = prev.composerActions ?? [];
  if ((next.composerActions ?? []).some((a) => !actionCovered(a, oldActions))) return true;
  if (next.api && !apiCovered(next.api, prev.api)) return true;
  if (next.widget && !widgetCovered(next.widget, prev.widget)) return true;
  const oldCommands = prev.commands ?? [];
  return (next.commands ?? []).some((c) => !commandCovered(c, oldCommands));
}

/**
 * Every host an integration with these permissions may contact, for showing before the person
 * installs it: the lookup host, the api host and the widget's own host. Nothing else is ever
 * requested for it.
 */
export function contactedHosts(p: Permissions): string[] {
  const widgetHost = (() => {
    if (!p.widget) return undefined;
    try {
      return new URL(p.widget.url).hostname;
    } catch {
      return undefined;
    }
  })();
  return [
    ...new Set([p.linkDetails?.host, p.api?.host, widgetHost].filter((h): h is string => !!h)),
  ];
}
