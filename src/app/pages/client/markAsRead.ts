import { ReceiptType } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

export const RECEIPTABLE_TYPES = [
  'm.room.message',
  'm.sticker',
  'm.room.encrypted',
  'm.poll.start',
  'org.matrix.msc3381.poll.start',
] as const;

export function findLastReceiptableEvent(room: Room): MatrixEvent | null {
  const events = room.getLiveTimeline().getEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.isRedacted?.()) continue;
    if (RECEIPTABLE_TYPES.includes(event.getType() as (typeof RECEIPTABLE_TYPES)[number])) {
      return event;
    }
  }
  return null;
}

export function receiptTypeFor(
  sendReadReceipts: boolean
): typeof ReceiptType.Read | typeof ReceiptType.ReadPrivate {
  return sendReadReceipts ? ReceiptType.Read : ReceiptType.ReadPrivate;
}

export function sendUnthreadedReadReceipt(
  client: MatrixClient,
  event: MatrixEvent,
  sendReadReceipts: boolean
): void {
  client.sendReadReceipt(event, receiptTypeFor(sendReadReceipts), true).catch(() => {});
}
