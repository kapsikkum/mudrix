import type { WizardClient } from '@wizardchat/core';
import { getPublishedEntries, localEchoEntryId, subscribePublishedEntries } from './editNavigation';

const DEFAULT_TIMEOUT_MS = 10_000;

type Lookup = { eventId: string } | { failed: true } | null;

function lookup(roomId: string, entryId: string): Lookup {
  for (const entries of getPublishedEntries(roomId)) {
    for (const entry of entries) {
      if (entry.kind !== 'event' || entry.id !== entryId) continue;
      if (entry.eventId) return { eventId: entry.eventId };
      if (entry.sendState === 'failed') return { failed: true };
    }
  }
  return null;
}

export function resolveRelationTarget(
  _client: WizardClient,
  roomId: string,
  eventId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  if (!eventId.startsWith('txn:')) return Promise.resolve(eventId);

  const entryId = localEchoEntryId(eventId);
  if (!entryId) return Promise.reject(new Error('relation target is not being sent'));

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      fn();
    };
    const check = () => {
      const found = lookup(roomId, entryId);
      if (!found) return;
      if ('eventId' in found) settle(() => resolve(found.eventId));
      else settle(() => reject(new Error('the original message failed to send')));
    };
    const timer = setTimeout(
      () => settle(() => reject(new Error('timed out waiting for the message to be sent'))),
      timeoutMs
    );
    unsubscribe = subscribePublishedEntries(check);
    check();
  });
}
