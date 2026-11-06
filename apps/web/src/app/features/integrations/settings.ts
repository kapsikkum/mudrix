/**
 * Integration settings: plain values the person picks for an integration's declared options. They
 * are kept on this device only, never sent anywhere by Mudrix itself, and only ever fill the
 * integration's own approved templates or choose which looked-up fields a card shows.
 *
 * Stored values are re-checked against the declaration on every read: local storage can be edited
 * by hand, and a declaration can change with an update. Anything that does not fit falls back to
 * the declared default; a value for a setting that no longer exists is ignored.
 */
import {
  MAX_SETTING_TEXT,
  TEMPLATE_PLACEHOLDER,
  hasUnsafeChars,
  stripUnsafeChars,
  type IntegrationSetting,
  type LinkLookup,
} from './manifest';

export type SettingValue = boolean | string;
export type SettingValues = Readonly<Record<string, SettingValue>>;
/** Integration id -> setting id -> stored value (unchecked; see resolveSettings). */
export type StoredSettings = Record<string, Record<string, unknown>>;

export const NO_SETTING_VALUES: SettingValues = Object.freeze({});

/** True when `value` is acceptable for this setting as it is declared now. */
export function isValidSettingValue(def: IntegrationSetting, value: unknown): boolean {
  if (def.type === 'toggle') return typeof value === 'boolean';
  if (typeof value !== 'string') return false;
  if (def.type === 'choice') return def.options.some((o) => o.value === value);
  return value.length <= Math.min(def.maxLength, MAX_SETTING_TEXT) && !hasUnsafeChars(value);
}

/** The value of every declared setting: the stored one when it still fits, else the default. */
export function resolveSettings(
  defs: readonly IntegrationSetting[] | undefined,
  stored: unknown
): SettingValues {
  if (!defs || defs.length === 0) return NO_SETTING_VALUES;
  const raw =
    typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const out: Record<string, SettingValue> = {};
  defs.forEach((def) => {
    const v = Object.prototype.hasOwnProperty.call(raw, def.id) ? raw[def.id] : undefined;
    out[def.id] = isValidSettingValue(def, v) ? (v as SettingValue) : def.default;
  });
  return out;
}

/** What `{setting.<id>}` becomes: the text or choice value, plain and capped; '' otherwise. */
export function settingText(values: SettingValues, id: string): string {
  const v = Object.prototype.hasOwnProperty.call(values, id) ? values[id] : undefined;
  return typeof v === 'string' ? stripUnsafeChars(v).slice(0, MAX_SETTING_TEXT) : '';
}

/** A toggle's value; a missing or non-boolean one counts as off. */
export function settingOn(values: SettingValues, id: string | undefined): boolean {
  if (id === undefined) return true;
  return Object.prototype.hasOwnProperty.call(values, id) && values[id] === true;
}

/**
 * Fills `{name}` from `vars` and `{setting.<id>}` from `settings`, in one pass so that inserted
 * text is never expanded again. Unknown `{name}`s are kept as written.
 */
export function renderTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
  settings: SettingValues
): string {
  return template.replace(TEMPLATE_PLACEHOLDER, (m, name: string) => {
    if (name.startsWith('setting.')) return settingText(settings, name.slice(8));
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m;
  });
}

/** Whether a lookup would show anything with these settings (if not, nothing is asked). */
export function lookupShowsAnything(lookup: LinkLookup, settings: SettingValues): boolean {
  return (
    lookup.title !== undefined ||
    (lookup.description !== undefined && settingOn(settings, lookup.descriptionIf)) ||
    (lookup.facts ?? []).some((f) => settingOn(settings, f.if))
  );
}

/**
 * True when an update changes a setting in a way that could change what is inserted or sent
 * without the templates changing: another type, default, or a new choice value. New and removed
 * settings, and new labels, are not (removed values fall back to defaults).
 */
export function settingsWidened(
  prev: readonly IntegrationSetting[] | undefined,
  next: readonly IntegrationSetting[] | undefined
): boolean {
  return (next ?? []).some((n) => {
    const p = (prev ?? []).find((x) => x.id === n.id);
    if (!p) return false;
    if (p.type !== n.type || p.default !== n.default) return true;
    if (n.type === 'choice' && p.type === 'choice')
      return n.options.some((o) => !p.options.some((q) => q.value === o.value));
    return false;
  });
}
