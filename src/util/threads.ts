import type { MatrixEvent, Room, Thread } from 'matrix-js-sdk';

export type ThreadLastSeen = Record<string, string>;

export function isThreadReplyUnread(
  room: Room | null | undefined,
  thread: Thread | null | undefined,
  threadId: string,
  lastReply: MatrixEvent | null | undefined,
  lastSeen: ThreadLastSeen
): boolean {
  const lastReplyId = lastReply?.getId();
  if (!room || !lastReply || !lastReplyId) return false;
  const myUserId = room.client.getUserId();
  if (!myUserId || lastReply.getSender() === myUserId) return false;
  if (lastSeen[threadId] === lastReplyId) return false;
  return thread
    ? !thread.hasUserReadEvent(myUserId, lastReplyId)
    : !room.hasUserReadEvent(myUserId, lastReplyId);
}

export function isThreadUnread(thread: Thread, lastSeen: ThreadLastSeen): boolean {
  return isThreadReplyUnread(thread.room, thread, thread.id, thread.lastReply(), lastSeen);
}
