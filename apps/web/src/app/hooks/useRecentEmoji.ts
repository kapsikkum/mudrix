import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAccountData } from '@/app/data';

export interface RecentEmojiEntry {
  emoji: string;
  label: string;
  url?: string;
  /** How many times it has been used. */
  total: number;
}

/** How many are offered in the picker. */
const MAX_SHOWN = 30;
/** More are kept than shown, so a favourite you have not used lately still ranks. */
const MAX_STORED = 100;

// Shared with Element: `{ recent_emoji: [{ emoji, total }] }`. Custom emoji ride along in the same
// list (`:shortcode:` with a `url`); Element skips entries it does not know. Older Element versions
// read `io.element.recent_emoji` (`[[emoji, count]]`) instead, so that is kept in step too.
const RECENT_EMOJI_ACCOUNT_DATA = 'm.recent_emoji';
const LEGACY_RECENT_EMOJI_ACCOUNT_DATA = 'io.element.recent_emoji';

function parseRecentEmoji(content: unknown): RecentEmojiEntry[] {
  if (!content || typeof content !== 'object') return [];
  const list = (content as Record<string, unknown>).recent_emoji;
  if (!Array.isArray(list)) return [];
  const out: RecentEmojiEntry[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { emoji, total, label, url } = item as Record<string, unknown>;
    if (typeof emoji !== 'string' || !emoji) continue;
    out.push({
      emoji,
      // Entries from before counts were kept have none; they stay in the order they were saved.
      total: typeof total === 'number' && total > 0 ? total : 1,
      label: typeof label === 'string' ? label : '',
      ...(typeof url === 'string' && url ? { url } : {}),
    });
  }
  return out;
}

function parseLegacyRecentEmoji(content: unknown): RecentEmojiEntry[] {
  if (!content || typeof content !== 'object') return [];
  const list = (content as Record<string, unknown>).recent_emoji;
  if (!Array.isArray(list)) return [];
  const out: RecentEmojiEntry[] = [];
  for (const item of list) {
    if (!Array.isArray(item) || typeof item[0] !== 'string' || !item[0]) continue;
    out.push({
      emoji: item[0],
      total: typeof item[1] === 'number' && item[1] > 0 ? item[1] : 1,
      label: '',
    });
  }
  return out;
}

/** Both lists as one, each emoji with the higher of its two counts (as Element merges them). */
function merge(current: unknown, legacy: unknown): RecentEmojiEntry[] {
  const byEmoji = new Map<string, RecentEmojiEntry>();
  for (const entry of [...parseRecentEmoji(current), ...parseLegacyRecentEmoji(legacy)]) {
    const known = byEmoji.get(entry.emoji);
    if (!known || entry.total > known.total) {
      byEmoji.set(entry.emoji, { ...entry, label: entry.label || known?.label || '' });
    }
  }
  return [...byEmoji.values()];
}

/** The most used first. Ties keep the stored order, which has the latest use first. */
function mostUsed(stored: RecentEmojiEntry[]): RecentEmojiEntry[] {
  return [...stored].sort((a, b) => b.total - a.total).slice(0, MAX_SHOWN);
}

export function useRecentEmoji(client: MatrixClient | null | undefined): {
  /** The frequently used emoji, most used first. */
  recent: RecentEmojiEntry[];
  saveRecent: (emoji: string, label: string, url?: string) => void;
} {
  const [stored, setStored] = useState<RecentEmojiEntry[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<RecentEmojiEntry[]>([]);
  const content = useAccountData(RECENT_EMOJI_ACCOUNT_DATA);
  const legacyContent = useAccountData(LEGACY_RECENT_EMOJI_ACCOUNT_DATA);

  useEffect(() => {
    const entries = client ? merge(content, legacyContent) : [];
    latestRef.current = entries;
    setStored(entries);
  }, [client, content, legacyContent]);

  const recent = useMemo(() => mostUsed(stored), [stored]);

  const saveRecent = useCallback(
    (emoji: string, label: string, url?: string) => {
      if (!client) return;
      const prev = latestRef.current;
      const used = prev.find((r) => r.emoji === emoji);
      const entry: RecentEmojiEntry = {
        emoji,
        label: label || used?.label || '',
        total: (used?.total ?? 0) + 1,
        ...(url ? { url } : {}),
      };
      const next = [entry, ...prev.filter((r) => r.emoji !== emoji)].slice(0, MAX_STORED);
      latestRef.current = next;
      setStored(next);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const list = latestRef.current;
        client
          .setAccountData(RECENT_EMOJI_ACCOUNT_DATA, {
            recent_emoji: list.map((r) => ({
              emoji: r.emoji,
              total: r.total,
              ...(r.label ? { label: r.label } : {}),
              ...(r.url ? { url: r.url } : {}),
            })),
          })
          .catch(() => {});
        client
          .setAccountData(LEGACY_RECENT_EMOJI_ACCOUNT_DATA, {
            recent_emoji: list.filter((r) => !r.url).map((r) => [r.emoji, r.total]),
          })
          .catch(() => {});
      }, 500);
    },
    [client]
  );

  return { recent, saveRecent };
}
