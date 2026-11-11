import type { Mentions, MessageKind, RoomTimeline } from '@wizardchat/core';
import type { EventEntry } from '../message/entry';

export type ReplyTarget = EventEntry;

export interface ReplyMetadataOptions {
  replyTo?: ReplyTarget | null;
  myId?: string;
  mentionedUserIds?: string[];
}

export function replyMentions(
  { replyTo, myId, mentionedUserIds = [] }: ReplyMetadataOptions,
  room = false
): Mentions {
  const allMentions = new Set(mentionedUserIds);
  if (replyTo?.eventId && replyTo.sender && replyTo.sender !== myId)
    allMentions.add(replyTo.sender);
  const mentions: Mentions = allMentions.size > 0 ? { userIds: Array.from(allMentions) } : {};
  if (room) mentions.room = true;
  return mentions;
}

export function applyReplyMetadata(
  content: Record<string, unknown>,
  { replyTo, myId, mentionedUserIds = [] }: ReplyMetadataOptions
): void {
  if (!replyTo?.eventId) return;

  content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo.eventId } };
  const existingMentions = (content['m.mentions'] as
    { user_ids?: string[]; room?: boolean } | undefined) ?? { user_ids: [] };
  const allMentions = new Set([...(existingMentions.user_ids ?? []), ...mentionedUserIds]);
  if (replyTo.sender && replyTo.sender !== myId) allMentions.add(replyTo.sender);
  const newMentions: Record<string, unknown> =
    allMentions.size > 0 ? { user_ids: Array.from(allMentions) } : {};
  if (existingMentions.room) newMentions.room = true;
  content['m.mentions'] = newMentions;
}

export function applyThreadRelation(
  content: Record<string, unknown>,
  threadId: string,
  replyTo?: ReplyTarget | null
): void {
  const replyId = replyTo?.eventId;
  content['m.relates_to'] = {
    rel_type: 'm.thread',
    event_id: threadId,
    is_falling_back: !replyId,
    'm.in_reply_to': { event_id: replyId ?? threadId },
  };
}

export interface SendRawEventOptions extends ReplyMetadataOptions {
  timeline: RoomTimeline;
  threadId?: string | null;
}

export async function sendRawEvent(
  eventType: string,
  content: Record<string, unknown>,
  { timeline, threadId, replyTo, myId, mentionedUserIds = [] }: SendRawEventOptions
): Promise<void> {
  applyReplyMetadata(content, { replyTo, myId, mentionedUserIds });
  if (threadId) applyThreadRelation(content, threadId, replyTo);
  await timeline.sendEvent(eventType, content);
}

export interface TextMessage {
  kind: MessageKind;
  body: string;
  html: string | null;
  mentionedUserIds: string[];
  roomMentioned: boolean;
}

export function textMessageFrom(
  kind: MessageKind,
  built: {
    body: string;
    content: Record<string, unknown>;
    mentionedUserIds: string[];
    roomMentioned: boolean;
  }
): TextMessage {
  const html =
    built.content.format === 'org.matrix.custom.html'
      ? ((built.content.formatted_body as string | undefined) ?? null)
      : null;
  return {
    kind,
    body: (built.content.body as string | undefined) ?? built.body,
    html,
    mentionedUserIds: built.mentionedUserIds,
    roomMentioned: built.roomMentioned,
  };
}

export async function sendTextMessage(
  timeline: RoomTimeline,
  message: TextMessage,
  { replyTo, myId }: { replyTo?: ReplyTarget | null; myId?: string }
): Promise<void> {
  const mentions = replyMentions(
    { replyTo, myId, mentionedUserIds: message.mentionedUserIds },
    message.roomMentioned
  );
  await timeline.sendMessage(
    message.kind,
    message.body,
    message.html,
    replyTo?.eventId ?? null,
    mentions
  );
}
