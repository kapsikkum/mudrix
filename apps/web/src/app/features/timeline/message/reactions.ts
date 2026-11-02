import { useTranslation } from 'react-i18next';
import type { RoomTimeline } from '@wizardchat/core';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { formatUserId } from '@/util/matrix';
import type { EventEntry } from './entry';

const pending = new Set<string>();

export interface Reaction {
  key: string;
  count: number;
  isOwn: boolean;
  ownEventIds: string[];
  shortcode?: string;
}

export function getReactionSenderIds(events: EventEntry[], key: string): string[] {
  const seen = new Set<string>();
  const senders: string[] = [];
  for (const event of events) {
    for (const reaction of event.reactions) {
      if (reaction.key !== key) continue;
      for (const sender of reaction.senders) {
        if (seen.has(sender)) continue;
        seen.add(sender);
        senders.push(sender);
      }
    }
  }
  return senders;
}

export function getReactionSenderNames(
  events: EventEntry[],
  key: string,
  nameOf: (userId: string) => string | null | undefined
): string[] {
  return getReactionSenderIds(events, key).map((id) => nameOf(id) ?? formatUserId(id));
}

export function buildReactionMap(event: EventEntry): Map<string, Reaction> {
  const reactionMap = new Map<string, Reaction>();
  for (const reaction of event.reactions) {
    if (!reaction.key || reaction.count === 0) continue;
    reactionMap.set(reaction.key, {
      key: reaction.key,
      count: reaction.count,
      isOwn: reaction.mine,
      ownEventIds: reaction.mine ? [event.itemKey] : [],
    });
  }
  return reactionMap;
}

export function buildGalleryReactionMap(events: EventEntry[]): Map<string, Reaction> {
  const merged = new Map<string, Reaction & { users: Set<string> }>();
  for (const event of events) {
    for (const reaction of event.reactions) {
      if (!reaction.key) continue;
      const existing = merged.get(reaction.key) ?? {
        key: reaction.key,
        count: 0,
        isOwn: false,
        ownEventIds: [],
        users: new Set<string>(),
      };
      for (const sender of reaction.senders) {
        if (existing.users.has(sender)) continue;
        existing.users.add(sender);
        existing.count++;
      }
      if (reaction.mine) {
        existing.isOwn = true;
        existing.ownEventIds.push(event.itemKey);
      }
      merged.set(reaction.key, existing);
    }
  }

  const result = new Map<string, Reaction>();
  for (const entry of merged.values()) {
    if (entry.count === 0) continue;
    result.set(entry.key, {
      key: entry.key,
      count: entry.count,
      isOwn: entry.isOwn,
      ownEventIds: entry.ownEventIds,
    });
  }
  return result;
}

async function toggleOnce(timeline: RoomTimeline, itemKey: string, key: string): Promise<void> {
  const pendingKey = `${itemKey}:${key}`;
  if (pending.has(pendingKey)) return;
  pending.add(pendingKey);
  try {
    await timeline.toggleReaction(itemKey, key);
  } finally {
    pending.delete(pendingKey);
  }
}

export async function toggleReaction(
  timeline: RoomTimeline,
  messageEvent: EventEntry,
  key: string
): Promise<void> {
  await toggleOnce(timeline, messageEvent.itemKey, key);
}

export async function toggleGalleryReaction(
  timeline: RoomTimeline,
  anchorEvent: EventEntry,
  ownEventIds: string[],
  key: string
): Promise<void> {
  for (const own of ownEventIds) {
    await toggleOnce(timeline, own, key);
  }
  if (ownEventIds.length === 0) {
    await toggleOnce(timeline, anchorEvent.itemKey, key);
  }
}

export function useReactionHandler(event: EventEntry, timeline: RoomTimeline | null) {
  const { t } = useTranslation();
  const toast = useToast();

  return async (r: Reaction) => {
    if (!timeline) return;
    try {
      await toggleReaction(timeline, event, r.key);
    } catch (err) {
      toast.error(t('timeline.reactFailed', { error: getErrorMessage(err) }));
    }
  };
}

export function useGalleryReactionHandler(
  galleryEvents: EventEntry[],
  timeline: RoomTimeline | null
) {
  const { t } = useTranslation();
  const toast = useToast();
  const anchorEvent = galleryEvents[0];

  return async (r: Reaction) => {
    if (!timeline || !anchorEvent) return;
    try {
      await toggleGalleryReaction(timeline, anchorEvent, r.ownEventIds, r.key);
    } catch (err) {
      toast.error(t('timeline.reactFailed', { error: getErrorMessage(err) }));
    }
  };
}
