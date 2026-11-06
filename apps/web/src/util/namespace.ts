/**
 * Mudrix's namespace for custom Matrix event types, account data, room state, profile keys and
 * call data topics. The spec asks for reverse-DNS names under a domain you control; this one hangs
 * off the project's GitHub Pages host (kapsikkum.github.io).
 *
 * Two older families are still read, so existing data keeps working: `chat.mudrix.*` (earlier
 * Mudrix versions) and `org.wizardchat.*` (the WizardChat base this app is built on). Only the
 * current name is written, except where another device may still need an older one (settings).
 */
export const MUDRIX_NS = 'io.github.kapsikkum.mudrix';

/** The name earlier Mudrix versions used (`chat.mudrix.*`). */
const LEGACY_MUDRIX_NS = 'chat.mudrix';

/** The name WizardChat used (`org.wizardchat.*`). */
const WIZARDCHAT_NS = 'org.wizardchat';

/** The current name of a Mudrix type or key. */
export const mudrixKey = (name: string): string => `${MUDRIX_NS}.${name}`;

/** The name earlier Mudrix versions used for it. */
export const legacyMudrixKey = (name: string): string => `${LEGACY_MUDRIX_NS}.${name}`;

/** The name WizardChat used for it. */
export const wizardchatKey = (name: string): string => `${WIZARDCHAT_NS}.${name}`;

/** The name earlier versions used for a current Mudrix type (`io.github...mudrix.x` to `chat.mudrix.x`). */
export const legacyTypeOf = (type: string): string =>
  type.startsWith(`${MUDRIX_NS}.`) ? legacyMudrixKey(type.slice(MUDRIX_NS.length + 1)) : type;

/** A current Mudrix type and the name earlier Mudrix versions used for it, current first. */
export const typeAndLegacy = (type: string): readonly [string, string] => [
  type,
  legacyTypeOf(type),
];

/** Every name `name` has been stored under, current first. */
export const allNamesOf = (name: string): readonly string[] => [
  mudrixKey(name),
  legacyMudrixKey(name),
  wizardchatKey(name),
];

/** Whether an event of type `actual` is of the Mudrix type `type`, under either of its Mudrix names. */
export const isMudrixType = (actual: string, type: string): boolean =>
  actual === type || actual === legacyTypeOf(type);

/** The first of `types` that `get` finds something for. */
export function firstOf<T>(
  get: (type: string) => T | undefined,
  types: readonly string[]
): T | undefined {
  for (const type of types) {
    const found = get(type);
    if (found) return found;
  }
  return undefined;
}

/** The first of `keys` that is set on a plain object (a profile, event content). */
export function firstKeyOf(raw: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return undefined;
}
