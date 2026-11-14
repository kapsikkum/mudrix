/** Small hex-colour helpers shared by the theme code (no dependencies, so they are easy to test). */

const HEX6 = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value);
}

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0');

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `#${channel(ar + (br - ar) * t)}${channel(ag + (bg - ag) * t)}${channel(ab + (bb - ab) * t)}`;
}

/** `#rrggbb` with an alpha (0-1) as `#rrggbbaa`, the format the design tokens use. */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex}${channel(alpha * 255)}`;
}

export function luminance(hex: string): number {
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

/**
 * Nudges a system accent colour until it works as an accent: bright enough to read on a dark
 * theme (or dark enough on a light one) and dark enough to carry white button text.
 */
export function readableAccent(accent: string, onLight: boolean): string {
  let color = accent;
  for (let i = 0; i < 12 && luminance(color) > 0.45; i += 1) color = mixHex(color, '#000000', 0.1);
  if (!onLight) {
    for (let i = 0; i < 12 && luminance(color) < 0.07; i += 1)
      color = mixHex(color, '#ffffff', 0.1);
  }
  return color;
}

/** `rgb(1, 2, 3)` or `rgba(1, 2, 3, 1)` (what getComputedStyle returns) as `#rrggbb`; null otherwise. */
export function cssRgbToHex(value: string): string | null {
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(value.trim());
  if (!match) return null;
  const [r, g, b] = [match[1], match[2], match[3]].map(Number);
  if ([r, g, b].some((n) => n > 255)) return null;
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}
