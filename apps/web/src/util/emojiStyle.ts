/**
 * Emoji style: which colour emoji font renders emoji across the app.
 *
 * Same idea as Element Web: a colour (COLR) font goes into the font stack through custom
 * properties, so the timeline, composer (Slate), reactions, pickers and settings all pick it up
 * without rewriting any message HTML. Only the selected font's @font-face rules are injected, so
 * unselected styles are never downloaded.
 *
 * Stack: `<first>, Roboto, <last>, sans-serif`
 *  - first: the bundled emoji font declared with a `unicode-range` limited to emoji code points
 *    (see emojiRanges.ts). It sits BEFORE the UI font so a whole sequence (e.g. face + ZWJ +
 *    arrow + VS16) is shaped by one font instead of the UI font grabbing the arrow in the middle.
 *    Digits, '#', '*' and (c)/(r)/TM are outside the range, so normal text is unaffected.
 *  - last: the same font file without a range, a safety net for anything the range misses
 *    (keycap sequences). For the native style this is the OS emoji font list instead.
 *
 * Font file names carry the font version. nginx serves *.woff2 as `immutable` for a year, so a
 * font must never be replaced at the same URL: bump the version in the file name and URL.
 */

import { EMOJI_UNICODE_RANGE } from './emojiRanges';

export type EmojiStyle = 'twemoji' | 'native' | 'noto' | 'openmoji';
export type EmojiOnlySize = 'normal' | 'large' | 'jumbo';

export const DEFAULT_EMOJI_STYLE: EmojiStyle = 'twemoji';
export const DEFAULT_EMOJI_ONLY_SIZE: EmojiOnlySize = 'large';

export const EMOJI_STYLES: EmojiStyle[] = ['twemoji', 'native', 'noto', 'openmoji'];
export const EMOJI_ONLY_SIZES: EmojiOnlySize[] = ['normal', 'large', 'jumbo'];

/** Custom properties consumed by the body font stack (see vars.css.ts). */
export const EMOJI_FONT_FIRST_VAR = '--mudrix-emoji-font-first';
export const EMOJI_FONT_LAST_VAR = '--mudrix-emoji-font-last';
/** CSS custom property holding the font size of emoji-only messages. */
export const EMOJI_ONLY_SIZE_VAR = '--mudrix-emoji-only-size';

const STYLE_ELEMENT_ID = 'mudrix-emoji-font';

const NATIVE_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

/** A family that never exists; keeps the stack valid when a slot has nothing to put in it. */
const NO_FONT = '"Mudrix Native"';

interface EmojiFont {
  /** Base family name; the ranged face is `<family>`, the unranged safety net `<family> Full`. */
  family: string;
  /** Versioned URL under public/assets/emoji/<style>/ (never reuse a URL for a different file). */
  url: string;
}

interface EmojiStyleDef {
  /** Bundled font (absent for native). */
  font?: EmojiFont;
  /**
   * Highest Unicode Emoji version (emojibase `version`) the font draws. Anything newer would be
   * shown as broken pieces (e.g. a face plus a loose arrow), so pickers hide it. Infinity = no
   * filtering (system emoji are up to the OS).
   *
   * Verified by shaping every emojibase-data v17 emoji (and skin tone variants) with HarfBuzz and
   * requiring a single glyph: Twemoji (Element's Twemoji Mozilla build, Twemoji 17.0.2), Noto Color
   * Emoji and OpenMoji all cover everything up to 17.0. The older twemoji-colr-font 15.0.3 npm
   * build stopped at 15.0; if the font is ever downgraded, lower this.
   */
  maxVersion: number;
}

const STYLE_DEFS: Record<EmojiStyle, EmojiStyleDef> = {
  twemoji: {
    font: { family: 'Mudrix Twemoji', url: '/assets/emoji/twemoji/Twemoji.17.0.2.woff2' },
    maxVersion: 17,
  },
  native: { maxVersion: Number.POSITIVE_INFINITY },
  noto: {
    font: {
      family: 'Mudrix Noto Color Emoji',
      url: '/assets/emoji/noto/NotoColorEmoji.2.057.woff2',
    },
    maxVersion: 17,
  },
  openmoji: {
    font: {
      family: 'Mudrix OpenMoji',
      url: '/assets/emoji/openmoji/OpenMoji-color.18.0.woff2',
    },
    maxVersion: 17,
  },
};

const EMOJI_ONLY_SIZE_VALUES: Record<EmojiOnlySize, string> = {
  normal: '1em',
  large: '2.5rem',
  jumbo: '3.5rem',
};

function resolveStyle(style: string | undefined): EmojiStyle {
  return EMOJI_STYLES.includes(style as EmojiStyle) ? (style as EmojiStyle) : DEFAULT_EMOJI_STYLE;
}

/** Highest emoji version (emojibase `version`) the given style can render; Infinity = unfiltered. */
export function getMaxEmojiVersion(style: string | undefined): number {
  return STYLE_DEFS[resolveStyle(style)].maxVersion;
}

// Match Roboto's vertical metrics (hhea ascent 0.9277, descent 0.2441, no line gap) so a line that
// contains emoji keeps the same height as one without, whichever emoji font is active.
const METRIC_DESCRIPTORS = {
  ascentOverride: '92.77%',
  descentOverride: '24.41%',
  lineGapOverride: '0%',
};

// Registered through the FontFace API rather than an injected <style>: the desktop shell's CSP
// carries style hashes, which makes browsers ignore 'unsafe-inline', so a runtime <style> with
// @font-face is silently dropped there. FontFace is governed by font-src only.
let activeFaces: FontFace[] = [];

function face(family: string, url: string, range?: string): FontFace {
  // The weight range stops browsers from synthesising bold emoji (and, on Windows
  // Chrome, from skipping the font for bold text).
  const descriptors: FontFaceDescriptors & typeof METRIC_DESCRIPTORS = {
    weight: '100 900',
    style: 'normal',
    display: 'swap',
    ...METRIC_DESCRIPTORS,
    ...(range ? { unicodeRange: range } : {}),
  };
  return new FontFace(family, `url("${url}") format("woff2")`, descriptors);
}

/** Both faces for a bundled font: ranged (first in the stack) and full (safety net, after Roboto). */
function buildFontFaces({ family, url }: EmojiFont): FontFace[] {
  return [face(family, url, EMOJI_UNICODE_RANGE), face(`${family} Full`, url)];
}

/** Applies the emoji style: registers only the selected font's faces and sets the font variable. */
export function applyEmojiStyle(style: string | undefined): void {
  if (typeof document === 'undefined') return;
  const def = STYLE_DEFS[resolveStyle(style)];

  // Drop the legacy injected <style> from earlier builds, then swap the registered faces.
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
  activeFaces.forEach((f) => document.fonts.delete(f));
  activeFaces = [];
  if (def.font) {
    activeFaces = buildFontFaces(def.font);
    activeFaces.forEach((f) => {
      document.fonts.add(f);
      f.load().catch(() => {
        // the browser retries when the font is actually needed
      });
    });
  }

  const root = document.documentElement.style;
  root.setProperty(EMOJI_FONT_FIRST_VAR, def.font ? `"${def.font.family}"` : NO_FONT);
  root.setProperty(EMOJI_FONT_LAST_VAR, def.font ? `"${def.font.family} Full"` : NATIVE_STACK);
}

/** Applies the font size used for emoji-only messages. */
export function applyEmojiOnlySize(size: string | undefined): void {
  if (typeof document === 'undefined') return;
  const value =
    EMOJI_ONLY_SIZE_VALUES[size as EmojiOnlySize] ??
    EMOJI_ONLY_SIZE_VALUES[DEFAULT_EMOJI_ONLY_SIZE];
  document.documentElement.style.setProperty(EMOJI_ONLY_SIZE_VAR, value);
}
