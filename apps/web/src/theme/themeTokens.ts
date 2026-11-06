import { themeColors, themes, type ThemeId } from '@wizardchat/design-tokens';

/**
 * Themes are build-time JSON in packages/design-tokens (the native apps read the same files). This
 * file reads them for the web, and derives the full token set of a user-made theme from a handful
 * of colours (the same formula the built-in extra themes were generated with).
 */

/** The colour tree of one theme, as the design tokens define it. */
export type ThemeColors = (typeof themeColors)[ThemeId]['color'];

export interface ThemeLogoTokens {
  logo: ThemeColors['logo'];
}

/** The colours the app reads as plain values (title bar, swatches, call background, logo). */
export interface ThemeColorTokens extends ThemeLogoTokens {
  color: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    accent: string;
    textPrimary: string;
    textMuted: string;
    border: string;
    msgMineBg: string;
    msgOtherBg: string;
  };
}

export function tokensOf(colors: ThemeColors): ThemeColorTokens {
  return {
    logo: colors.logo,
    color: {
      bgPrimary: colors.bg.app,
      bgSecondary: colors.bg.surface,
      bgTertiary: colors.bg.raised,
      accent: colors.accent.default,
      textPrimary: colors.text.primary,
      textMuted: colors.text.muted,
      border: colors.border.default,
      msgMineBg: colors.message.mine,
      msgOtherBg: colors.message.other,
    },
  };
}

/** A built-in theme name, or `custom:<id>` for a theme the user made. */
export type ThemeName = string;

/** Built-in theme names in the order they are offered (the default first, dark by hue, light last). */
export const BUILTIN_THEME_NAMES: readonly string[] = themes.map((theme) => theme.name);

const idOfName = new Map(themes.map((theme) => [theme.name, theme.id]));

export const THEME_TOKENS: Record<string, ThemeColorTokens> = Object.fromEntries(
  themes.map((theme) => [theme.name, tokensOf(themeColors[theme.id].color)])
);

export const LIGHT_THEMES: ReadonlySet<string> = new Set(
  themes.filter((theme) => theme.scheme === 'light').map((theme) => theme.name)
);

/** The colours of a built-in theme by name */
export function builtinThemeColors(name: string): ThemeColors | undefined {
  const id = idOfName.get(name);
  return id ? themeColors[id].color : undefined;
}

export const BASE_LOGO: ThemeColors['logo'] = themeColors[themes[0].id].color.logo;

/** Colours of the app icon (and logo) for each theme */
export const THEME_LOGOS: Record<string, ThemeColors['logo']> = Object.fromEntries(
  themes.map((theme) => [theme.name, themeColors[theme.id].color.logo])
);

// Custom themes -----------------------------------------------------------------------------------

/** The colours a user picks; everything else is derived. */
export interface ThemeSpec {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  accent: string;
  textPrimary: string;
  textMuted: string;
  border: string;
  msgMineBg: string;
  msgOtherBg: string;
}

export const THEME_SPEC_KEYS: readonly (keyof ThemeSpec)[] = [
  'bgPrimary',
  'bgSecondary',
  'bgTertiary',
  'accent',
  'textPrimary',
  'textMuted',
  'border',
  'msgMineBg',
  'msgOtherBg',
];

const HEX6 = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0');

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `#${channel(ar + (br - ar) * t)}${channel(ag + (bg - ag) * t)}${channel(ab + (bb - ab) * t)}`;
}

/** `#rrggbb` with an alpha (0-1) as `#rrggbbaa`, the format the design tokens use. */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${channel(alpha * 255)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** True for a light background (relative luminance above the midpoint). */
export function isLightColor(hex: string): boolean {
  return luminance(hex) > 0.4;
}

const firstOfScheme = (scheme: 'light' | 'dark') =>
  themeColors[(themes.find((theme) => theme.scheme === scheme) ?? themes[0]).id].color;

/** Fills in a whole theme from the nine colours (status, presence and username colours come from a built-in dark or light theme). */
export function buildThemeColors(spec: ThemeSpec): ThemeColors {
  const light = isLightColor(spec.bgPrimary);
  const base = JSON.parse(JSON.stringify(firstOfScheme(light ? 'light' : 'dark'))) as ThemeColors;
  const hover = mixHex(spec.accent, '#000000', 0.18);
  const highlight = withAlpha(base.status.mention, light ? 0.12 : 0.15);
  return {
    ...base,
    bg: {
      app: spec.bgPrimary,
      surface: spec.bgSecondary,
      raised: spec.bgTertiary,
      input: mixHex(spec.bgSecondary, '#000000', light ? 0.04 : 0.35),
      hover: light ? '#06060710' : '#ffffff0f',
      active: withAlpha(spec.accent, light ? 0.14 : 0.2),
      overlay: light ? withAlpha(spec.textPrimary, 0.4) : '#000000a6',
    },
    text: {
      primary: spec.textPrimary,
      secondary: mixHex(spec.textPrimary, spec.textMuted, 0.5),
      muted: spec.textMuted,
      disabled: mixHex(spec.textMuted, spec.bgPrimary, 0.35),
      onAccent: '#ffffff',
      link: light ? '#1f6fd1' : '#4ea8ff',
    },
    accent: {
      default: spec.accent,
      hover,
      soft: withAlpha(spec.accent, light ? 0.12 : 0.15),
      glow1: withAlpha(spec.accent, 0.05),
      glow2: withAlpha(spec.accent, 0.03),
    },
    border: {
      default: spec.border,
      strong: mixHex(spec.border, spec.textMuted, 0.25),
      focus: light ? hover : mixHex(spec.accent, '#ffffff', 0.35),
    },
    message: { mine: spec.msgMineBg, other: spec.msgOtherBg, highlight },
    logo: themeColors[themes[0].id].color.logo,
  };
}

/** The colours of a theme in editable form (used to start a custom theme from it). */
export function specFromTokens(tokens: ThemeColorTokens): ThemeSpec {
  const c = tokens.color;
  const hex = (value: string, fallback: string) => (isHexColor(value) ? value : fallback);
  return {
    bgPrimary: hex(c.bgPrimary, '#1a1b1e'),
    bgSecondary: hex(c.bgSecondary, '#131416'),
    bgTertiary: hex(c.bgTertiary, '#232428'),
    accent: hex(c.accent, '#5865f2'),
    textPrimary: hex(c.textPrimary, '#dbdee1'),
    textMuted: hex(c.textMuted, '#949ba4'),
    border: hex(c.border, '#2b2d31'),
    msgMineBg: hex(c.msgMineBg, '#2e3036'),
    msgOtherBg: hex(c.msgOtherBg, '#131416'),
  };
}

// CSS variables -----------------------------------------------------------------------------------

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every theme colour as the CSS variables the design tokens define (`--wz-color-bg-app`, ...). */
export function themeVars(colors: ThemeColors): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, values] of Object.entries(colors))
    for (const [name, value] of Object.entries(values as Record<string, string>))
      out[`--wz-color-${group}-${kebab(name)}`] = value;
  out['--wz-accent-rgb'] = hexToRgb(colors.accent.default).join(', ');
  return out;
}

/** The logo colours as the CSS variables the logo reads. */
export function logoVars(logo: ThemeColors['logo']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(logo).map(([k, v]) => [`--wz-color-logo-${kebab(k)}`, v])
  );
}
