import type { TimelineEntry, WizardClient } from '@wizardchat/core';
import { composerDraftKey, type EditMessageState } from '@/app/store/atoms';
import { entryEventId, entryMsgtype, entryText, isEventEntry, type EventEntry } from './entry';
import { editableBody } from './textContent';

const published = new Map<string, TimelineEntry[]>();
const localIds = new Map<string, string>();
const listeners = new Set<() => void>();

export function publishTimelineEntries(
  roomId: string,
  threadId: string | null | undefined,
  entries: TimelineEntry[]
): () => void {
  const key = composerDraftKey(roomId, threadId);
  published.set(key, entries);
  for (const entry of entries) {
    if (entry.kind === 'event' && entry.itemKey.startsWith('txn:')) {
      localIds.set(entry.itemKey, entry.id);
    }
  }
  listeners.forEach((listener) => listener());
  return () => {
    if (published.get(key) === entries) published.delete(key);
  };
}

export function getPublishedEntries(roomId: string): TimelineEntry[][] {
  const out: TimelineEntry[][] = [];
  for (const [key, entries] of published) {
    if (key === roomId || key.startsWith(`${roomId}|`)) out.push(entries);
  }
  return out;
}

export function subscribePublishedEntries(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function findPublishedEntry(
  roomId: string,
  key: string,
  byEntryId = false
): EventEntry | null {
  for (const entries of getPublishedEntries(roomId)) {
    for (const entry of entries) {
      if (entry.kind !== 'event') continue;
      if (byEntryId ? entry.id === key : entryEventId(entry) === key) return entry;
    }
  }
  return null;
}

export function localEchoEntryId(itemKey: string): string | null {
  return localIds.get(itemKey) ?? null;
}

function isEditableOwnMessage(entry: EventEntry): boolean {
  if (!entry.isOwn || !entry.isEditable) return false;
  if (entry.sendState === 'failed') return false;
  return entryText(entry) !== null;
}

function getEditableMessages(roomId: string, threadId?: string | null): EventEntry[] {
  const entries = published.get(composerDraftKey(roomId, threadId)) ?? [];
  return entries.filter(isEventEntry).filter(isEditableOwnMessage);
}

export function findAdjacentEditableMessage(
  _client: WizardClient,
  roomId: string,
  threadId: string | null | undefined,
  fromEventId: string | null,
  direction: 'previous' | 'next'
): EventEntry | null {
  const messages = getEditableMessages(roomId, threadId);
  if (fromEventId === null)
    return direction === 'previous' ? (messages[messages.length - 1] ?? null) : null;
  const index = messages.findIndex((e) => entryEventId(e) === fromEventId);
  if (index === -1) return null;
  return messages[direction === 'previous' ? index - 1 : index + 1] ?? null;
}

export function editStateFor(
  event: EventEntry,
  roomId: string,
  threadId?: string | null
): EditMessageState {
  return {
    roomId,
    eventId: entryEventId(event),
    body: editableBody(event),
    msgtype: entryMsgtype(event) ?? 'm.text',
    threadId: threadId ?? null,
  };
}
