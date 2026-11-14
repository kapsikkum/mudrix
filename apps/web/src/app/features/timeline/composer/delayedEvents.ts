import { useQuery } from '@tanstack/react-query';
import type { DelayedEvent, WizardClient } from '@wizardchat/core';

// MSC4140 delayed events ("send later"): the homeserver holds the event and sends it when the
// time comes. It has to advertise `org.matrix.msc4140` in its unstable features.
const MSC4140_FEATURE = 'org.matrix.msc4140';
const MESSAGE_TYPE = 'm.room.message';

export interface ScheduledMessage {
  delayId: string;
  roomId: string;
  body: string;
  /** Epoch ms at which the server will send the event. */
  sendAt: number;
}

export function featuresAllowDelayedEvents(unstableFeatures: readonly string[]): boolean {
  return unstableFeatures.includes(MSC4140_FEATURE);
}

/** Whether the core refused because the server lacks MSC4140 (as opposed to a real failure). */
export function isUnsupportedByServer(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'unsupportedByServer'
  );
}

/** Whether the core refused because the room is encrypted (the server would send plaintext). */
export function isEncryptedRoomRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'unsupported'
  );
}

/** The room's pending text messages, soonest first. */
export function scheduledMessagesOf(events: DelayedEvent[], roomId: string): ScheduledMessage[] {
  return events
    .filter((e) => e.roomId === roomId && e.eventType === MESSAGE_TYPE && e.stateKey === null)
    .map((e) => {
      const body = (e.content as { body?: unknown } | null)?.body;
      return {
        delayId: e.delayId,
        roomId: e.roomId,
        body: typeof body === 'string' ? body : '',
        sendAt: e.runningSince + e.delayMs,
      };
    })
    .sort((a, b) => a.sendAt - b.sendAt);
}

/** `useQuery` key shared by everything asking whether the server can send later. */
const SUPPORT_KEY = ['delayed-events-support'];

/** True/false once the server's features are known, null while they are being fetched. */
export function useDelayedEventsSupport(client: WizardClient): boolean | null {
  const { data } = useQuery({
    queryKey: SUPPORT_KEY,
    queryFn: async () =>
      featuresAllowDelayedEvents((await client.serverFeatures()).unstableFeatures),
    staleTime: Infinity,
  });
  return data ?? null;
}

export async function scheduleMessage(
  client: WizardClient,
  roomId: string,
  content: Record<string, unknown>,
  delayMs: number
): Promise<string> {
  return client.sendDelayedEvent(roomId, MESSAGE_TYPE, content, Math.round(delayMs));
}

export async function listScheduledMessages(
  client: WizardClient,
  roomId: string
): Promise<ScheduledMessage[]> {
  return scheduledMessagesOf(await client.listDelayedEvents(roomId), roomId);
}

export function cancelScheduledMessage(client: WizardClient, delayId: string): Promise<void> {
  return client.cancelDelayedEvent(delayId);
}

export function sendScheduledMessageNow(client: WizardClient, delayId: string): Promise<void> {
  return client.sendDelayedEventNow(delayId);
}
