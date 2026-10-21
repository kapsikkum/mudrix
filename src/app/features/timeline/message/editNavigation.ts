import { EventStatus, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import type { EditMessageState } from '@/app/store/atoms';

const EDITABLE_MSGTYPES = new Set(['m.text', 'm.notice', 'm.emote']);

function isEditableOwnMessage(event: MatrixEvent, myId: string): boolean {
  if (event.getSender() !== myId || event.getType() !== 'm.room.message') return false;
  if (event.isRedacted() || event.isDecryptionFailure()) return false;
  if (event.status === EventStatus.NOT_SENT || event.status === EventStatus.CANCELLED) return false;
  if (event.getRelation()?.rel_type === 'm.replace') return false;
  return EDITABLE_MSGTYPES.has(event.getContent()?.msgtype as string);
}

function getEditableMessages(
  client: MatrixClient,
  roomId: string,
  threadId?: string | null
): MatrixEvent[] {
  const room = client.getRoom(roomId);
  const myId = client.getUserId();
  if (!room || !myId) return [];
  const events = threadId
    ? (room.getThread(threadId)?.liveTimeline.getEvents() ?? [])
    : room
        .getLiveTimeline()
        .getEvents()
        .filter((e) => e.getRelation()?.rel_type !== 'm.thread');
  return events.filter((e) => isEditableOwnMessage(e, myId));
}

export function findAdjacentEditableMessage(
  client: MatrixClient,
  roomId: string,
  threadId: string | null | undefined,
  fromEventId: string | null,
  direction: 'previous' | 'next'
): MatrixEvent | null {
  const messages = getEditableMessages(client, roomId, threadId);
  if (fromEventId === null)
    return direction === 'previous' ? (messages[messages.length - 1] ?? null) : null;
  const index = messages.findIndex((e) => e.getId() === fromEventId);
  if (index === -1) return null;
  return messages[direction === 'previous' ? index - 1 : index + 1] ?? null;
}

export function editStateFor(
  event: MatrixEvent,
  roomId: string,
  threadId?: string | null
): EditMessageState {
  return {
    roomId,
    eventId: event.getId() ?? '',
    body: (event.getContent()?.body as string) ?? '',
    msgtype: (event.getContent()?.msgtype as string) ?? 'm.text',
    threadId: threadId ?? null,
  };
}
