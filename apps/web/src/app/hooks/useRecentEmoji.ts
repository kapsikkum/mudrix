import { useState, useCallback, useEffect, useRef } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAccountData } from '@/app/data';

export interface RecentEmojiEntry {
  emoji: string;
  label: string;
  url?: string;
  total?: number;
}

const MAX_RECENT = 30;
const RECENT_EMOJI_ACCOUNT_DATA = 'm.recent_emoji';

function parseRecentEmoji(content: unknown): RecentEmojiEntry[] {
  if (!content || typeof content !== 'object') return [];
  const list = (content as Record<string, unknown>).recent_emoji;
  if (!Array.isArray(list)) return [];
  // Element X writes only `emoji` and a use count, without a label
  return list.flatMap((e): RecentEmojiEntry[] => {
    if (typeof e !== 'object' || e === null) return [];
    const { emoji, label, url, total } = e as Record<string, unknown>;
    if (typeof emoji !== 'string') return [];
    return [
      {
        emoji,
        label: typeof label === 'string' ? label : emoji,
        ...(typeof url === 'string' ? { url } : {}),
        ...(typeof total === 'number' ? { total } : {}),
      },
    ];
  });
}

export function useRecentEmoji(client: MatrixClient | null | undefined): {
  recent: RecentEmojiEntry[];
  saveRecent: (emoji: string, label: string, url?: string) => void;
} {
  const [recent, setRecent] = useState<RecentEmojiEntry[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<RecentEmojiEntry[]>([]);
  const content = useAccountData(RECENT_EMOJI_ACCOUNT_DATA);

  useEffect(() => {
    if (!client) {
      setRecent([]);
      return;
    }
    const entries = parseRecentEmoji(content);
    latestRef.current = entries;
    setRecent(entries);
  }, [client, content]);

  const saveRecent = useCallback(
    (emoji: string, label: string, url?: string) => {
      if (!client) return;
      setRecent((prev) => {
        const total = (prev.find((r) => r.emoji === emoji)?.total ?? 0) + 1;
        const next = prev.filter((r) => r.emoji !== emoji);
        next.unshift(url ? { emoji, label, url, total } : { emoji, label, total });
        if (next.length > MAX_RECENT) next.length = MAX_RECENT;
        latestRef.current = next;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          client
            .setAccountData(RECENT_EMOJI_ACCOUNT_DATA, {
              recent_emoji: latestRef.current,
            })
            .catch(() => {});
        }, 500);

        return next;
      });
    },
    [client]
  );

  return { recent, saveRecent };
}
