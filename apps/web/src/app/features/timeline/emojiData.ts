import type { ImagePackImage } from '@/app/hooks/useImagePacks';

import rawEmojiData from 'emojibase-data/en/data.json';
import rawMessages from 'emojibase-data/en/messages.json';
import emojibaseShortcodes from 'emojibase-data/en/shortcodes/emojibase.json';

const messages = rawMessages as MessagesDataset;

function unicodeToChar(hexcode: string): string {
  try {
    return String.fromCodePoint(...hexcode.split('-').map((h) => parseInt(h, 16)));
  } catch {
    return '';
  }
}

let cachedShortcodeByEmoji: Map<string, string> | null = null;

function getShortcodeByEmoji(): Map<string, string> {
  if (cachedShortcodeByEmoji) return cachedShortcodeByEmoji;
  const map = new Map<string, string>();
  const data = emojibaseShortcodes as Record<string, string | string[]>;
  for (const [hexcode, sc] of Object.entries(data)) {
    const char = unicodeToChar(hexcode);
    if (!char) continue;
    const all = Array.isArray(sc) ? sc : [sc];
    const first = all[0];
    if (!first) continue;
    map.set(char, `:${first.replace(/^:|:$/g, '')}:`);
  }
  cachedShortcodeByEmoji = map;
  return map;
}

export function emojiToShortcode(emoji: string): string | null {
  return getShortcodeByEmoji().get(emoji) ?? null;
}

interface MessagesDataset {
  groups: { key: string; message: string; order: number }[];
  subgroups: { key: string; message: string; order: number }[];
  skinTones: { key: string; message: string }[];
}

interface RawEmoji {
  hexcode: string;
  emoji: string;
  label: string;
  tags?: string[];
  group?: number;
  subgroup?: number;
  order?: number;
  skins?: RawEmoji[];
  tone?: number | number[];
  type: number;
  version: number;
}

export interface EmojiItem {
  hexcode: string;
  emoji: string;
  label: string;
  tags: string[];
  skins?: EmojiItem[];
}

export interface CustomEmojiItem {
  shortcode: string;
  url: string;
  label: string;
}

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: EmojiItem[];
  type: 'standard';
}

export interface CustomPackCategory {
  id: string;
  label: string;
  emojis: CustomEmojiItem[];
  type: 'pack';
}

export type PickerCategory = EmojiCategory | CustomPackCategory;

const SKIP_GROUPS = new Set([2, undefined]);

let cachedCategories: EmojiCategory[] | null = null;

function buildEmojiData(): EmojiCategory[] {
  if (cachedCategories) return cachedCategories;

  const data = rawEmojiData as unknown as RawEmoji[];
  const groups = messages.groups.sort((a, b) => a.order - b.order);

  const categories: EmojiCategory[] = [];
  const groupMap = new Map<number, EmojiItem[]>();

  for (const emoji of data) {
    if (SKIP_GROUPS.has(emoji.group)) continue;
    if (!emoji.emoji) continue;

    const item: EmojiItem = {
      hexcode: emoji.hexcode,
      emoji: emoji.emoji,
      label: emoji.label,
      tags: emoji.tags ?? [],
      skins: emoji.skins
        ?.filter((s) => s.emoji)
        .map((s) => ({
          hexcode: s.hexcode,
          emoji: s.emoji!,
          label: s.label,
          tags: s.tags ?? [],
        })),
    };

    const list = groupMap.get(emoji.group!);
    if (list) {
      list.push(item);
    } else {
      groupMap.set(emoji.group!, [item]);
    }
  }

  for (const group of groups) {
    const groupIndex = group.order;
    const emojis = groupMap.get(groupIndex);
    if (!emojis || emojis.length === 0) continue;

    categories.push({
      id: group.key,
      label: group.message,
      emojis,
      type: 'standard',
    });
  }

  cachedCategories = categories;
  return categories;
}

function buildCustomEmojiCategories(imagePacks: Map<string, ImagePackImage>): CustomPackCategory[] {
  const packMap = new Map<string, CustomEmojiItem[]>();

  for (const [shortcode, img] of imagePacks) {
    if (!img.usage.includes('emoticon')) continue;
    const existing = packMap.get(img.packName);
    const item: CustomEmojiItem = { shortcode, url: img.url, label: img.body ?? shortcode };
    if (existing) {
      existing.push(item);
    } else {
      packMap.set(img.packName, [item]);
    }
  }

  return Array.from(packMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, emojis]) => ({
      id: `pack-${name}`,
      label: name,
      emojis: emojis.slice().sort((a, b) => a.shortcode.localeCompare(b.shortcode)),
      type: 'pack' as const,
    }));
}

export function getAllCategories(imagePacks: Map<string, ImagePackImage>): PickerCategory[] {
  const standard = buildEmojiData();
  const customCategories = buildCustomEmojiCategories(imagePacks);

  if (customCategories.length === 0) return standard;
  return [...customCategories, ...standard];
}

export function searchEmoji(query: string, categories: PickerCategory[]): PickerCategory[] {
  const q = query.toLowerCase().trim();
  if (!q) return categories;

  return categories
    .map((cat) => {
      if (cat.type === 'pack') {
        const filtered = cat.emojis.filter(
          (e) => e.shortcode.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)
        );
        if (filtered.length === 0) return null;
        return { ...cat, emojis: filtered };
      }

      const filtered = cat.emojis.filter(
        (e) => e.tags.some((t) => t.toLowerCase().includes(q)) || e.label.toLowerCase().includes(q)
      );
      if (filtered.length === 0) return null;
      return { ...cat, emojis: filtered };
    })
    .filter(Boolean) as PickerCategory[];
}
