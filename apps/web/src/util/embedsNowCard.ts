import type {
  LinkEmbedBlock,
  LinkEmbedButton,
  LinkEmbedCard,
  LinkEmbedMedia,
} from '@/core/rpc/api.gen';
import { checkPublicHttpsUrl } from './integrationFetch';

/** One run of text in a line: plain or bold, or a link to an https address. */
export type MarkdownSegment =
  | { kind: 'text'; text: string; bold: boolean }
  | { kind: 'link'; text: string; url: string; bold: boolean };

export interface MarkdownLine {
  /** A `-# ` line: small, muted subtext. */
  small: boolean;
  segments: MarkdownSegment[];
}

const MAX_MARKDOWN_LENGTH = 6000;
const MAX_LINES = 40;
const PUNCTUATION = /[!-/:-@[-`{-~]/;

/** An https link safe to open from an untrusted card, or null. Never javascript:, data:, http:. */
export function safeCardUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const checked = checkPublicHttpsUrl(raw.trim());
  return checked.ok ? checked.url.href : null;
}

/** Reads the `[label](url)` that starts at `start`, with balanced parentheses in the address. */
function readLink(
  line: string,
  start: number
): { label: string; target: string; end: number } | null {
  const close = line.indexOf(']', start + 1);
  if (close < 0 || line[close + 1] !== '(') return null;
  let depth = 1;
  let i = close + 2;
  let target = '';
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length && PUNCTUATION.test(line[i + 1])) {
      target += line[++i];
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) break;
    target += ch;
  }
  if (depth !== 0) return null;
  return { label: line.slice(start + 1, close), target, end: i + 1 };
}

function unescape(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

function parseInline(line: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let bold = false;
  let buffer = '';
  const flush = () => {
    if (buffer) segments.push({ kind: 'text', text: buffer, bold });
    buffer = '';
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length && PUNCTUATION.test(line[i + 1])) {
      buffer += line[++i];
    } else if (ch === '*' && line[i + 1] === '*') {
      flush();
      bold = !bold;
      i++;
    } else if (ch === '[') {
      const link = readLink(line, i);
      const url = link ? safeCardUrl(link.target) : null;
      if (link && url) {
        flush();
        segments.push({ kind: 'link', text: unescape(link.label), url, bold });
        i = link.end - 1;
      } else if (link) {
        // An unsafe address leaves the label as plain text and drops the address.
        buffer += unescape(link.label);
        i = link.end - 1;
      } else {
        buffer += ch;
      }
    } else {
      buffer += ch;
    }
  }
  flush();
  return segments;
}

/**
 * The tiny Discord markdown subset embeds.now cards use: `**bold**`, `[label](https://…)`, `-# `
 * subtext lines, newlines and backslash escapes. Everything else, HTML included, stays literal
 * text, and the result only ever holds plain strings, so it can be rendered as React text.
 */
export function parseEmbedMarkdown(markdown: string): MarkdownLine[] {
  if (typeof markdown !== 'string') return [];
  const lines = markdown.slice(0, MAX_MARKDOWN_LENGTH).replace(/\r\n?/g, '\n').split('\n');
  return lines.slice(0, MAX_LINES).map((raw) => {
    const small = raw.startsWith('-# ');
    return { small, segments: parseInline(small ? raw.slice(3) : raw) };
  });
}

export type GalleryItem = LinkEmbedMedia & { url: string };

export interface SafeCard {
  service: string;
  url: string | null;
  accent: string | null;
  blocks: SafeBlock[];
}

export type SafeBlock =
  | { type: 'text'; lines: MarkdownLine[]; thumbnail: GalleryItem | null }
  | { type: 'gallery'; items: GalleryItem[]; hidden: number }
  | { type: 'separator' }
  | { type: 'buttons'; buttons: Array<{ label: string; url: string }> };

export const MAX_GALLERY_ITEMS = 10;
const KINDS = new Set(['image', 'video', 'audio']);

function safeMedia(media: LinkEmbedMedia | null | undefined): GalleryItem | null {
  if (!media || !KINDS.has(media.kind)) return null;
  const url = safeCardUrl(media.url);
  if (!url) return null;
  return {
    url,
    kind: media.kind,
    description: typeof media.description === 'string' ? media.description.slice(0, 300) : null,
  };
}

function safeButtons(buttons: LinkEmbedButton[]): Array<{ label: string; url: string }> {
  const result: Array<{ label: string; url: string }> = [];
  for (const button of buttons ?? []) {
    const url = safeCardUrl(button?.url);
    const label = typeof button?.label === 'string' ? button.label.trim().slice(0, 60) : '';
    if (url && label) result.push({ label, url });
  }
  return result;
}

function safeBlock(block: LinkEmbedBlock): SafeBlock | null {
  switch (block?.type) {
    case 'text': {
      const lines = parseEmbedMarkdown(block.markdown);
      const thumbnail = safeMedia(block.thumbnail);
      if (!lines.some((line) => line.segments.length) && !thumbnail) return null;
      return { type: 'text', lines, thumbnail: thumbnail?.kind === 'image' ? thumbnail : null };
    }
    case 'gallery': {
      const all = (block.items ?? []).map(safeMedia).filter((m): m is GalleryItem => !!m);
      if (all.length === 0) return null;
      return {
        type: 'gallery',
        items: all.slice(0, MAX_GALLERY_ITEMS),
        hidden: Math.max(0, all.length - MAX_GALLERY_ITEMS),
      };
    }
    case 'separator':
      return { type: 'separator' };
    case 'buttons': {
      const buttons = safeButtons(block.buttons);
      return buttons.length ? { type: 'buttons', buttons } : null;
    }
    default:
      return null;
  }
}

/** The accent as a CSS colour, or null for none. */
export function accentColor(accent: number | null | undefined): string | null {
  if (typeof accent !== 'number' || !Number.isInteger(accent) || accent < 0 || accent > 0xffffff) {
    return null;
  }
  return `#${accent.toString(16).padStart(6, '0')}`;
}

/** Turns a card from the core into only what the timeline may render: safe urls, parsed text. */
export function sanitizeEmbedCard(card: LinkEmbedCard): SafeCard {
  return {
    service: typeof card.service === 'string' ? card.service.slice(0, 60) : '',
    url: safeCardUrl(card.url),
    accent: accentColor(card.accent),
    blocks: (card.blocks ?? []).map(safeBlock).filter((b): b is SafeBlock => !!b),
  };
}

/**
 * Column spans (of a 6-column grid) for a media grid of `count` pictures, as Discord lays them
 * out: one full width, two side by side, three with a wide first, four as a square, then rows of
 * three with the leftovers (one or two) leading.
 */
export function galleryLayout(count: number): number[] {
  const n = Math.max(0, Math.min(Math.floor(count), MAX_GALLERY_ITEMS));
  if (n <= 1) return n === 1 ? [6] : [];
  if (n === 3) return [6, 3, 3];
  if (n === 4) return [3, 3, 3, 3];
  const lead = n % 3 === 1 ? [6] : n % 3 === 2 ? [3, 3] : [];
  return [...lead, ...Array<number>(n - lead.length).fill(2)];
}
