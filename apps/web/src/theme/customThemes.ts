import {
  BUILTIN_THEME_NAMES,
  THEME_SPEC_KEYS,
  THEME_TOKENS,
  LIGHT_THEMES,
  builtinThemeColors,
  buildThemeColors,
  isHexColor,
  isLightColor,
  themeVars,
  tokensOf,
  type ThemeColorTokens,
  type ThemeColors,
  type ThemeSpec,
} from './themeTokens';
import { DEFAULT_THEME } from './themes.css';

/** A theme made by the user: a name and a handful of colours (the rest is derived). */
export interface CustomTheme {
  id: string;
  name: string;
  colors: ThemeSpec;
}

export const CUSTOM_THEME_PREFIX = 'custom:';
export const MAX_CUSTOM_THEMES = 20;
const MAX_NAME_LENGTH = 40;

export function isCustomThemeName(name: string): boolean {
  return name.startsWith(CUSTOM_THEME_PREFIX);
}

export function customThemeName(id: string): string {
  return `${CUSTOM_THEME_PREFIX}${id}`;
}

/** Whether `value` is the name of a custom theme (`custom:` and an id), whether or not it exists. */
export function isCustomThemeId(value: unknown): value is string {
  return (
    typeof value === 'string' && new RegExp(`^${CUSTOM_THEME_PREFIX}[a-z0-9]{6,32}$`).test(value)
  );
}

export function newCustomThemeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// The theme list is state in jotai; this mirror lets non-React code (call embeds, the sticker
// picker, ...) resolve a custom theme by name. App keeps it in step with the atom.
let registry: CustomTheme[] = [];

export function setCustomThemeRegistry(list: CustomTheme[]): void {
  registry = list;
}

const colorCache = new Map<string, ThemeColors>();

function colorsFor(theme: CustomTheme): ThemeColors {
  const key = `${theme.id}:${THEME_SPEC_KEYS.map((k) => theme.colors[k]).join('')}`;
  let colors = colorCache.get(key);
  if (!colors) {
    if (colorCache.size > 200) colorCache.clear();
    colors = buildThemeColors(theme.colors);
    colorCache.set(key, colors);
  }
  return colors;
}

/** Full colours of a built-in or custom theme by name; an unknown name falls back to the default. */
export function resolveThemeColors(name: string): ThemeColors {
  if (isCustomThemeName(name)) {
    const id = name.slice(CUSTOM_THEME_PREFIX.length);
    const custom = registry.find((t) => t.id === id);
    if (custom) return colorsFor(custom);
  }
  return builtinThemeColors(name) ?? (builtinThemeColors(DEFAULT_THEME) as ThemeColors);
}

/** Tokens of a built-in or custom theme by name; an unknown name falls back to the default. */
export function resolveThemeTokens(name: string): ThemeColorTokens {
  if (isCustomThemeName(name)) return tokensOf(resolveThemeColors(name));
  return THEME_TOKENS[name] ?? THEME_TOKENS[DEFAULT_THEME];
}

export function isLightTheme(name: string): boolean {
  if (isCustomThemeName(name)) return isLightColor(resolveThemeColors(name).bg.app);
  return LIGHT_THEMES.has(name);
}

export function isKnownTheme(name: string, customThemes: readonly CustomTheme[]): boolean {
  if (BUILTIN_THEME_NAMES.includes(name)) return true;
  return isCustomThemeName(name) && customThemes.some((t) => customThemeName(t.id) === name);
}

function parseColors(raw: unknown): ThemeSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const out: Partial<ThemeSpec> = {};
  for (const key of THEME_SPEC_KEYS) {
    const value = input[key];
    if (!isHexColor(value)) return null;
    out[key] = value.toLowerCase();
  }
  return out as ThemeSpec;
}

function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
}

/** Keeps well-formed custom themes only (used for synced and stored data alike). */
export function sanitizeCustomThemes(raw: unknown): CustomTheme[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomTheme[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (out.length >= MAX_CUSTOM_THEMES) break;
    if (!entry || typeof entry !== 'object') continue;
    const { id, name, colors } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9]{6,32}$/.test(id) || seen.has(id)) continue;
    const parsed = parseColors(colors);
    const cleaned = cleanName(name);
    if (!parsed || !cleaned) continue;
    seen.add(id);
    out.push({ id, name: cleaned, colors: parsed });
  }
  return out;
}

/** A theme pasted from another person: `{ "name": "...", "colors": { ... } }`. */
export function parseSharedTheme(text: string): { name: string; colors: ThemeSpec } | null {
  try {
    const data = JSON.parse(text) as { name?: unknown; colors?: unknown };
    const colors = parseColors(data?.colors);
    const name = cleanName(data?.name);
    return colors && name ? { name, colors } : null;
  } catch {
    return null;
  }
}

export function serializeTheme(theme: CustomTheme): string {
  return JSON.stringify({ name: theme.name, colors: theme.colors }, null, 2);
}

// --- Applying a custom theme ---------------------------------------------------------------------

const appliedProps = new Set<string>();

/**
 * Paints a custom theme by overriding the theme variables on the root element (built-in themes
 * are static classes). Passing null removes the overrides again.
 */
export function applyCustomThemeVars(colors: ThemeColors | null): void {
  const root = document.documentElement;
  appliedProps.forEach((prop) => root.style.removeProperty(prop));
  appliedProps.clear();
  if (!colors) return;
  for (const [prop, value] of Object.entries(themeVars(colors))) {
    root.style.setProperty(prop, value);
    appliedProps.add(prop);
  }
}
