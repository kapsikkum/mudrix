import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { markdownToHtml, plainTextToHtml } from '@/util/markdownToHtml';

export interface ReplyContent {
  eventId: string;
  body: string;
  formattedBody?: string;
  senderId: string;
  mxcUrl?: string;
  event?: MatrixEvent;
  isUndecryptable: boolean;
}

export function extractReplyMxcUrl(
  eventType: string,
  content: Record<string, unknown>
): string | undefined {
  if (eventType === 'm.sticker') {
    return (content?.url as string | undefined) ?? undefined;
  }
  if (eventType === 'm.room.message') {
    const formattedBody = content?.formatted_body as string | undefined;
    if (formattedBody) {
      const match = formattedBody.match(/<img[^>]+data-mx-emoticon[^>]+src="([^"]+)"/);
      if (match) return match[1];
    }
  }
  return undefined;
}

const EDITABLE_MSGTYPES = new Set(['m.text', 'm.emote', 'm.notice']);

export function isEditableEvent(event: MatrixEvent): boolean {
  if (event.getType() !== 'm.room.message') return false;
  const msgtype = event.getContent()?.msgtype as string | undefined;
  return msgtype !== undefined && EDITABLE_MSGTYPES.has(msgtype);
}

export function stripReplyFallback(body: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => {
    const trimmed = l.trim();
    return trimmed !== '' && !trimmed.startsWith('>');
  });
  if (start === -1) return '';
  return lines.slice(start).join('\n').replace(/^\s+/, '').trimEnd();
}

export function stripReplyFallbackHtml(formattedBody: string): string {
  return formattedBody
    .replace(/<mx-reply>[\s\S]*?<\/mx-reply>/g, '')
    .replace(/^\s+/, '')
    .trimEnd();
}

export function buildReplyContent(targetEvent: MatrixEvent): ReplyContent | null {
  if (targetEvent.isDecryptionFailure()) {
    return {
      eventId: targetEvent.getId() ?? '',
      body: '',
      senderId: targetEvent.getSender() ?? '',
      isUndecryptable: true,
    };
  }
  const content = targetEvent.getContent();
  return {
    eventId: targetEvent.getId() ?? '',
    body: stripReplyFallback((content?.body as string | undefined) ?? ''),
    formattedBody:
      stripReplyFallbackHtml((content?.formatted_body as string | undefined) ?? '') || undefined,
    senderId: targetEvent.getSender() ?? '',
    mxcUrl: extractReplyMxcUrl(targetEvent.getType(), content),
    event: targetEvent,
    isUndecryptable: false,
  };
}

export function getReplyContent(event: MatrixEvent, client: MatrixClient): ReplyContent | null {
  const content = event.getContent();
  const relatesTo = content?.['m.relates_to'];
  if (!relatesTo?.['m.in_reply_to']?.event_id) return null;
  if (relatesTo?.is_falling_back) return null;

  const room = client.getRoom(event.getRoomId() ?? '');
  const replyEventId = relatesTo['m.in_reply_to'].event_id;
  const replyEvent = room?.findEventById(replyEventId);
  if (!replyEvent) return null;

  return buildReplyContent(replyEvent);
}

const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}$/u;

export function isRenderedEmojiOnly(html: string): boolean {
  const div = document.createElement('div');
  div.innerHTML = html;
  let hasContent = false;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.nodeValue ?? '';
    if (text.trim().length > 0) hasContent = true;
    for (const ch of text) {
      if (!/\s/.test(ch) && !EMOJI_PRESENTATION.test(ch)) return false;
    }
  }
  if (!hasContent) hasContent = div.querySelector('img') !== null;
  return hasContent;
}

export function renderTextContent(
  content: Record<string, unknown>,
  myUserId?: string,
  prettifyLinks = false,
  allowedImgOrigins?: ReadonlySet<string>
): string {
  const format = content.format as string | undefined;
  const formattedBody = content.formatted_body as string | undefined;
  if (format === 'org.matrix.custom.html' && formattedBody) {
    if (/<[a-z]/i.test(formattedBody)) {
      const clean = stripReplyFallbackHtml(formattedBody);
      return markdownToHtml(clean, myUserId, true, prettifyLinks, true, allowedImgOrigins);
    }
  }
  const body = (content.body as string) ?? '';
  return plainTextToHtml(stripReplyFallback(body), myUserId, true, prettifyLinks);
}

export function getMediaCaption(content: Record<string, unknown>): string | undefined {
  const body = (content.body as string) ?? '';
  const filename = (content.filename as string | undefined) ?? (content.body as string | undefined);
  if (!body.trim()) return undefined;
  if (filename === undefined || filename === body) return undefined;
  return body;
}
