import type { Descendant } from 'slate';
import type {
  ParagraphElement,
  BlockQuoteElement,
  CodeBlockElement,
  HeadingElement,
  HeadingLevel,
  ListItemElement,
  LinkElement,
  MentionElement,
  RoomMentionElement,
  RoomLinkElement,
  FormattedText,
} from './types';
import { emptyDocument } from './types';
import { parseMatrixToUrl } from '@/util/matrixTo';

export interface MentionToken {
  token: string;
  userId: string;
  displayName: string;
}

export interface RoomMentionToken {
  token: string;
  label: string;
}

export interface RoomLinkToken {
  token: string;
  url: string;
  name: string;
}

export interface MentionResolver {
  tokens: MentionToken[];
  rooms?: RoomLinkToken[];
}

const ROOM_MENTION_TOKENS: RoomMentionToken[] = [
  { token: '@room', label: '@room' },
  { token: '@everyone', label: '@everyone' },
  { token: '@all', label: '@all' },
];

export const HEADING_RE = /^(#{1,3}) /;
export const BULLET_RE = /^[-*+] /;
export const NUMBERED_RE = /^\d+[.)] /;

function lineBlock(
  line: string,
  resolver: MentionResolver | undefined,
  formatting: boolean
): HeadingElement | ListItemElement | null {
  const heading = HEADING_RE.exec(line);
  if (heading) {
    return {
      type: 'heading',
      level: heading[1].length as HeadingLevel,
      children: parseInline(line.slice(heading[0].length), resolver, formatting),
    };
  }
  const list = BULLET_RE.exec(line) ?? NUMBERED_RE.exec(line);
  if (list) {
    return {
      type: 'list-item',
      listType: BULLET_RE.test(line) ? 'bulleted' : 'numbered',
      children: parseInline(line.slice(list[0].length), resolver, formatting),
    };
  }
  return null;
}

export function fromMarkdown(
  markdown: string,
  resolver?: MentionResolver,
  { formatting = true }: { formatting?: boolean } = {}
): Descendant[] {
  if (!markdown.trim()) return emptyDocument();

  const lines = markdown.split('\n');
  const blocks: Descendant[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({
        type: 'code-block',
        children: [{ text: codeLines.join('\n') }],
      } as CodeBlockElement);
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({
        type: 'block-quote',
        children: parseInline(quoteLines.join('\n'), resolver, formatting),
      } as BlockQuoteElement);
      continue;
    }

    blocks.push(
      (formatting && lineBlock(line, resolver, formatting)) ||
        ({
          type: 'paragraph',
          children: parseInline(line, resolver, formatting),
        } as ParagraphElement)
    );
    i++;
  }

  return blocks.length > 0 ? blocks : emptyDocument();
}

type InlineNode =
  FormattedText | LinkElement | MentionElement | RoomMentionElement | RoomLinkElement;

const FORMAT_RE = new RegExp(
  [
    String.raw`\*\*\*(?!\s)(.+?)(?<!\s)\*\*\*`,
    String.raw`\*\*(?!\s)(.+?)(?<!\s)\*\*`,
    String.raw`(?<!\w)__(?!\s)(.+?)(?<!\s)__(?!\w)`,
    String.raw`\*(?!\s)(.+?)(?<!\s)\*`,
    String.raw`(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)`,
    String.raw`~~(?!\s)(.+?)(?<!\s)~~`,
    '`(.+?)`',
    String.raw`\[([^\]]*)\]\(([^)]*)\)`,
  ]
    .map((pattern) => `(?:${pattern})`)
    .join('|'),
  'g'
);

const BOUNDARY_RE = /[\w@.\u00c0-\u024f-]/;

export function parseInline(
  text: string,
  resolver?: MentionResolver,
  formatting = true
): InlineNode[] {
  const format = (part: string): InlineNode[] =>
    formatting ? parseFormatting(part) : [{ text: part }];
  const allTokens: Array<MentionToken | RoomMentionToken | RoomLinkToken> = [
    ...ROOM_MENTION_TOKENS,
  ];
  for (const token of [...(resolver?.rooms ?? []), ...(resolver?.tokens ?? [])]) {
    if (!allTokens.some((t) => t.token === token.token)) allTokens.push(token);
  }

  const spans = findMentionSpans(text, allTokens);
  if (spans.length > 0) {
    const nodes: InlineNode[] = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) nodes.push(...format(text.slice(cursor, span.start)));
      if (span.kind === 'room-link') {
        nodes.push({
          type: 'room-link',
          url: span.url!,
          name: span.label!,
          children: [{ text: '' }],
        } as RoomLinkElement);
      } else if (span.kind === 'room') {
        nodes.push({
          type: 'room-mention',
          label: span.label ?? text.slice(span.start, span.end),
          children: [{ text: '' }],
        } as RoomMentionElement);
      } else {
        nodes.push({
          type: 'mention',
          userId: span.userId!,
          displayName: span.displayName!,
          children: [{ text: '' }],
        } as MentionElement);
      }
      cursor = span.end;
    }
    if (cursor < text.length) nodes.push(...format(text.slice(cursor)));
    return nodes;
  }
  return format(text);
}

interface MentionSpan {
  start: number;
  end: number;
  kind: 'room' | 'room-link' | 'user';
  userId?: string;
  displayName?: string;
  label?: string;
  url?: string;
}

function findMentionSpans(
  text: string,
  tokens: Array<MentionToken | RoomMentionToken | RoomLinkToken>
): MentionSpan[] {
  const claimed = new Array<boolean>(text.length).fill(false);

  // Protect formatting spans (code, links, bold, italic, strikethrough) so
  // mentions never pillify text inside them (e.g. `@user` in an inline code).
  FORMAT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FORMAT_RE.exec(text)) !== null) {
    for (let k = match.index; k < match.index + match[0].length; k++) claimed[k] = true;
  }

  const spans: MentionSpan[] = [];
  for (const t of tokens) {
    const token = t.token;
    const isRoomToken = !('userId' in t) && !('url' in t);
    if (token.length < 2) continue;
    let from = 0;
    while (true) {
      const start = text.indexOf(token, from);
      if (start === -1) break;
      from = start + 1;
      const end = start + token.length;
      if (start > 0 && BOUNDARY_RE.test(text[start - 1])) continue;
      if (end < text.length && BOUNDARY_RE.test(text[end])) continue;
      let overlap = false;
      for (let k = start; k < end; k++) {
        if (claimed[k]) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      for (let k = start; k < end; k++) claimed[k] = true;
      if ('url' in t) {
        spans.push({ start, end, kind: 'room-link', url: t.url, label: t.name });
      } else if (isRoomToken) {
        const rm = t as RoomMentionToken;
        spans.push({ start, end, kind: 'room', label: rm.label });
      } else {
        const u = t as MentionToken;
        spans.push({ start, end, kind: 'user', userId: u.userId, displayName: u.displayName });
      }
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

function isRoomLink(label: string, url: string): boolean {
  if (!label.startsWith('#') || label.length < 2) return false;
  const target = parseMatrixToUrl(url);
  return target?.kind === 'room' && !target.eventId;
}

export function parseFormatting(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];

  let last = 0;
  let match: RegExpExecArray | null;
  FORMAT_RE.lastIndex = 0;

  while ((match = FORMAT_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push({ text: text.slice(last, match.index) });

    if (match[1] !== undefined) {
      nodes.push({ text: match[1], bold: true, italic: true });
    } else if (match[2] !== undefined || match[3] !== undefined) {
      nodes.push({ text: (match[2] ?? match[3])!, bold: true });
    } else if (match[4] !== undefined || match[5] !== undefined) {
      nodes.push({ text: (match[4] ?? match[5])!, italic: true });
    } else if (match[6] !== undefined) {
      nodes.push({ text: match[6], strikethrough: true });
    } else if (match[7] !== undefined) {
      nodes.push({ text: match[7], code: true });
    } else if (match[8] !== undefined) {
      nodes.push(
        isRoomLink(match[8], match[9])
          ? ({
              type: 'room-link',
              url: match[9],
              name: match[8].slice(1),
              children: [{ text: '' }],
            } as RoomLinkElement)
          : ({ type: 'link', url: match[9], children: [{ text: match[8] }] } as LinkElement)
      );
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) nodes.push({ text: text.slice(last) });
  if (nodes.length === 0) nodes.push({ text: '' });

  return nodes;
}
