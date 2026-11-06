import { atom } from 'jotai';
import type { EventSource, WizardClient } from '@wizardchat/core';
import { legacyMudrixKey, mudrixKey } from '@/util/namespace';
import { readFirstAccountData } from '@/app/hooks/useFirstAccountData';

// Saved messages live in account data, so they follow the account to every device. Only room and
// event ids are stored: the server never sees the text of a saved (possibly encrypted) message.
const SAVED_TYPE = mudrixKey('saved_messages');
// Earlier versions stored the list under names Mudrix does not own. They are still read when
// the current name has never been written, so nobody loses what they saved.
export const SAVED_TYPES = [
  SAVED_TYPE,
  legacyMudrixKey('saved_messages'),
  'io.mudrix.saved_messages',
] as const;

export interface SavedMessage {
  roomId: string;
  eventId: string;
  savedAt: number;
}

/** The saved list, newest first, kept current by `useSavedMessagesSync`. */
export const savedMessagesAtom = atom<SavedMessage[]>([]);

/** Event ids that are saved, for the message menu. */
export const savedEventIdsAtom = atom(
  (get) => new Set(get(savedMessagesAtom).map((i) => i.eventId))
);

export function parseSavedMessages(content: unknown): SavedMessage[] {
  const items = (content as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item): SavedMessage[] => {
    const { roomId, eventId, savedAt } = (item ?? {}) as Partial<SavedMessage>;
    if (typeof roomId !== 'string' || typeof eventId !== 'string') return [];
    return [{ roomId, eventId, savedAt: typeof savedAt === 'number' ? savedAt : 0 }];
  });
}

/** Saves the message, or removes it from the saved list when it already is there. */
export async function toggleSavedMessage(
  client: WizardClient,
  roomId: string,
  eventId: string
): Promise<boolean> {
  const current = parseSavedMessages(await readFirstAccountData(client, SAVED_TYPES));
  const saved = current.some((i) => i.eventId === eventId);
  const next = saved
    ? current.filter((i) => i.eventId !== eventId)
    : [{ roomId, eventId, savedAt: Date.now() }, ...current];
  await client.setAccountData(SAVED_TYPE, { items: next });
  return !saved;
}

/** A message's sender, text and time, with the first line of the text only. */
export interface EventPreview {
  sender: string;
  body: string;
  timestamp: number;
  redacted: boolean;
}

/** What a stored event looks like to a person: decrypted when the core could, null when it is gone. */
export function previewOfSource(source: EventSource): EventPreview {
  const clear = (source.decrypted ?? source.original) as {
    sender?: unknown;
    origin_server_ts?: unknown;
    content?: unknown;
  };
  const content = (clear.content ?? {}) as Record<string, unknown>;
  const edited = content['m.new_content'] as Record<string, unknown> | undefined;
  const body = (edited ?? content).body;
  return {
    sender: typeof clear.sender === 'string' ? clear.sender : '',
    body: typeof body === 'string' ? body : '',
    timestamp: typeof clear.origin_server_ts === 'number' ? clear.origin_server_ts : 0,
    redacted: Object.keys(content).length === 0,
  };
}

/** Looks a saved message up from the core (it decrypts), null when the message cannot be fetched. */
export async function resolveSavedEvent(
  client: WizardClient,
  saved: Pick<SavedMessage, 'roomId' | 'eventId'>
): Promise<EventPreview | null> {
  try {
    return previewOfSource(await client.eventSource(saved.roomId, saved.eventId));
  } catch {
    return null;
  }
}
