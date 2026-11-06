import type { Descendant, Text } from 'slate';
import type {
  CustomElement,
  CustomText,
  ParagraphElement,
  BlockQuoteElement,
  CodeBlockElement,
  HeadingElement,
  ListItemElement,
  LinkElement,
  MentionElement,
  RoomMentionElement,
  EmoticonElement,
} from './types';

type Segment = { kind: 'code'; lang: string; lines: string[] } | { kind: 'node'; node: Descendant };

function collectSegments(nodes: Descendant[]): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];
    if (isText(node)) {
      segments.push({ kind: 'node', node });
      i++;
      continue;
    }

    const el = node as CustomElement;

    if (isFenceLineParagraph(el)) {
      const inner: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < nodes.length) {
        const n = nodes[j];
        if (!isText(n) && isFenceLineParagraph(n as CustomElement)) {
          closed = true;
          break;
        }
        if (isText(n)) inner.push((n as Text).text);
        else inner.push(rawElementText(n as CustomElement));
        j++;
      }
      if (closed) {
        segments.push({ kind: 'code', lang: fenceLanguage(el), lines: inner });
        i = j + 1;
        continue;
      }
      segments.push({ kind: 'node', node: el });
      i++;
      continue;
    }

    if (isCodeOnlyParagraph(el)) {
      const run = [codeParagraphText(el as ParagraphElement)];
      let j = i + 1;
      while (j < nodes.length && isCodeOnlyParagraph(nodes[j] as CustomElement)) {
        run.push(codeParagraphText(nodes[j] as ParagraphElement));
        j++;
      }
      const multiline = run.length >= 2 || (run.length === 1 && run[0].includes('\n'));
      if (multiline) {
        const lines: string[] = [];
        run.forEach((t) => lines.push(...t.split('\n')));
        segments.push({ kind: 'code', lang: '', lines });
        i = j;
        continue;
      }
      segments.push({ kind: 'node', node: el });
      i++;
      continue;
    }

    segments.push({ kind: 'node', node: el });
    i++;
  }

  return segments;
}

function numberedItem(node: Descendant): ListItemElement | null {
  if (isText(node)) return null;
  const el = node as CustomElement;
  return el.type === 'list-item' && el.listType === 'numbered' ? el : null;
}

export function toMarkdown(nodes: Descendant[]): { markdown: string } {
  const lines: string[] = [];
  let number = 0;

  for (const seg of collectSegments(nodes)) {
    const item = seg.kind === 'node' ? numberedItem(seg.node) : null;
    number = item ? number + 1 : 0;
    if (item) {
      lines.push(`${number}. ${serializeInlineChildren(item.children)}`);
      continue;
    }
    if (seg.kind === 'code') {
      lines.push(`\`\`\`${seg.lang}`);
      seg.lines.forEach((l) => lines.push(l));
      lines.push('```');
      continue;
    }
    const node = seg.node;
    if (isText(node)) {
      lines.push(serializeLeaf(node as CustomText));
      continue;
    }
    lines.push(serializeBlock(node as CustomElement));
  }

  return { markdown: lines.join('\n') };
}

function serializeBlock(el: CustomElement): string {
  switch (el.type) {
    case 'paragraph':
      return serializeInlineChildren((el as ParagraphElement).children);

    case 'block-quote': {
      const inner = serializeInlineChildren((el as BlockQuoteElement).children);
      return inner
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    }

    case 'code-block': {
      const inner = serializeInlineChildren((el as CodeBlockElement).children);
      return `\`\`\`\n${inner}\n\`\`\``;
    }

    case 'heading': {
      const heading = el as HeadingElement;
      return `${'#'.repeat(heading.level)} ${serializeInlineChildren(heading.children)}`;
    }

    case 'list-item': {
      const item = el as ListItemElement;
      const marker = item.listType === 'numbered' ? '1.' : '-';
      return `${marker} ${serializeInlineChildren(item.children)}`;
    }

    case 'link': {
      const linkEl = el as LinkElement;
      const label = serializeInlineChildren(linkEl.children);
      return `[${label}](${linkEl.url})`;
    }

    case 'mention': {
      const m = el as MentionElement;
      return `@${m.displayName}`;
    }

    case 'room-mention': {
      const rm = el as RoomMentionElement;
      return rm.label;
    }

    case 'emoticon': {
      const e = el as EmoticonElement;
      return `:${e.shortcode}:`;
    }

    default:
      return serializeInlineChildren((el as ParagraphElement).children);
  }
}

function serializeInlineChildren(children: Descendant[]): string {
  return children
    .map((child) => {
      if (isText(child)) return serializeLeaf(child as CustomText);
      const el = child as CustomElement;
      if (el.type === 'mention') {
        const m = el as MentionElement;
        return `@${m.displayName}`;
      }
      if (el.type === 'room-mention') {
        const rm = el as RoomMentionElement;
        return rm.label;
      }
      if (el.type === 'link') {
        const linkEl = el as LinkElement;
        const label = serializeInlineChildren(linkEl.children);
        return `[${label}](${linkEl.url})`;
      }
      if (el.type === 'emoticon') {
        const e = el as EmoticonElement;
        return `:${e.shortcode}:`;
      }
      return serializeBlock(el);
    })
    .join('');
}

function serializeLeaf(leaf: CustomText): string {
  let text = leaf.text;
  if (leaf.code) text = `\`${text}\``;
  if (leaf.bold) text = `**${text}**`;
  if (leaf.italic) text = `*${text}*`;
  if (leaf.strikethrough) text = `~~${text}~~`;
  return text;
}

function isText(node: Descendant): node is Text {
  return 'text' in node;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const OUTBOUND_URL_RE = /https?:\/\/[^\s<>"')]+/g;

function autoLinkUrlsInText(text: string): string {
  OUTBOUND_URL_RE.lastIndex = 0;
  if (!OUTBOUND_URL_RE.test(text)) return escapeHtml(text);
  OUTBOUND_URL_RE.lastIndex = 0;

  const parts: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OUTBOUND_URL_RE.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(escapeHtml(text.slice(lastIndex, m.index)));
    const href = escapeHtml(m[0]);
    parts.push(`<a href="${href}">${href}</a>`);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(escapeHtml(text.slice(lastIndex)));
  return parts.join('');
}

export function toHtml(nodes: Descendant[]): {
  html: string;
  hasCustomContent: boolean;
} {
  let hasCustomContent = false;
  const parts: { html: string; block: boolean }[] = [];
  let list = null as { tag: 'ul' | 'ol'; items: string[] } | null;

  const flushList = () => {
    if (!list) return;
    parts.push({
      html: `<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`,
      block: true,
    });
    list = null;
  };

  for (const seg of collectSegments(nodes)) {
    const el = seg.kind === 'node' && !isText(seg.node) ? (seg.node as CustomElement) : null;
    if (el?.type === 'list-item') {
      const tag = el.listType === 'numbered' ? 'ol' : 'ul';
      if (list?.tag !== tag) flushList();
      const { html, custom } = serializeInlineChildrenHtml(el.children);
      if (custom) hasCustomContent = true;
      list ??= { tag, items: [] };
      list.items.push(html);
      continue;
    }
    flushList();
    if (seg.kind === 'code') {
      const codeClass = seg.lang ? ` class="language-${seg.lang}"` : '';
      parts.push({
        html: `<pre><code${codeClass}>${escapeHtml(seg.lines.join('\n'))}</code></pre>`,
        block: false,
      });
      continue;
    }
    if (!el) {
      parts.push({ html: serializeLeafHtml(seg.node as CustomText), block: false });
      continue;
    }
    const { html, custom } = serializeBlockHtml(el);
    if (custom) hasCustomContent = true;
    parts.push({ html, block: el.type === 'heading' });
  }
  flushList();

  const html = parts
    .map((part, i) => (i > 0 && !part.block && !parts[i - 1].block ? '<br>' : '') + part.html)
    .join('');
  return { html, hasCustomContent };
}

function serializeBlockHtml(el: CustomElement): { html: string; custom: boolean } {
  switch (el.type) {
    case 'paragraph': {
      const { html } = serializeInlineChildrenHtml((el as ParagraphElement).children);
      return { html, custom: false };
    }

    case 'block-quote': {
      const { html: inner } = serializeInlineChildrenHtml((el as BlockQuoteElement).children);
      return { html: `<blockquote>${inner.replace(/\n/g, '<br>')}</blockquote>`, custom: false };
    }

    case 'code-block': {
      const { html: inner } = serializeInlineChildrenHtml((el as CodeBlockElement).children);
      return { html: `<pre><code>${inner}</code></pre>`, custom: false };
    }

    case 'heading': {
      const heading = el as HeadingElement;
      const { html: inner, custom } = serializeInlineChildrenHtml(heading.children);
      return { html: `<h${heading.level}>${inner}</h${heading.level}>`, custom };
    }

    case 'list-item': {
      const { html: inner, custom } = serializeInlineChildrenHtml((el as ListItemElement).children);
      return { html: `<ul><li>${inner}</li></ul>`, custom };
    }

    case 'link': {
      const linkEl = el as LinkElement;
      const { html: label } = serializeInlineChildrenHtml(linkEl.children);
      const safe = escapeHtml(linkEl.url);
      return { html: `<a href="${safe}">${label}</a>`, custom: false };
    }

    case 'mention': {
      const m = el as MentionElement;
      const userId = escapeHtml(m.userId);
      const name = escapeHtml(`@${m.displayName}`);
      return {
        html: `<a href="https://matrix.to/#/${userId}">${name}</a>`,
        custom: false,
      };
    }

    case 'room-mention': {
      const rm = el as RoomMentionElement;
      const label = escapeHtml(rm.label);
      return {
        html: label,
        custom: false,
      };
    }

    case 'emoticon': {
      const e = el as EmoticonElement;
      const src = escapeHtml(e.mxcUrl);
      const sc = escapeHtml(e.shortcode);
      return {
        html: `<img data-mx-emoticon src="${src}" alt=":${sc}:" title="${sc}" height="32" />`,
        custom: true,
      };
    }

    default:
      return serializeInlineChildrenHtml((el as ParagraphElement).children);
  }
}

function serializeInlineChildrenHtml(children: Descendant[]): { html: string; custom: boolean } {
  let custom = false;
  const parts = children.map((child) => {
    if (isText(child)) return serializeLeafHtml(child as CustomText);
    const el = child as CustomElement;
    if (el.type === 'mention') {
      const m = el as MentionElement;
      const userId = escapeHtml(m.userId);
      const name = escapeHtml(`@${m.displayName}`);
      return `<a href="https://matrix.to/#/${userId}">${name}</a>`;
    }
    if (el.type === 'room-mention') {
      const rm = el as RoomMentionElement;
      return escapeHtml(rm.label);
    }
    if (el.type === 'link') {
      const linkEl = el as LinkElement;
      const { html: label } = serializeInlineChildrenHtml(linkEl.children);
      const safe = escapeHtml(linkEl.url);
      return `<a href="${safe}">${label}</a>`;
    }
    if (el.type === 'emoticon') {
      const e = el as EmoticonElement;
      const src = escapeHtml(e.mxcUrl);
      const sc = escapeHtml(e.shortcode);
      custom = true;
      return `<img data-mx-emoticon src="${src}" alt=":${sc}:" title="${sc}" height="32" />`;
    }
    const { html, custom: c } = serializeBlockHtml(el);
    if (c) custom = true;
    return html;
  });
  return { html: parts.join(''), custom };
}

function serializeLeafHtml(leaf: CustomText): string {
  let html = leaf.code ? `<code>${escapeHtml(leaf.text)}</code>` : autoLinkUrlsInText(leaf.text);
  if (leaf.bold) html = `<strong>${html}</strong>`;
  if (leaf.italic) html = `<em>${html}</em>`;
  if (leaf.strikethrough) html = `<del>${html}</del>`;
  return html;
}

function paragraphText(el: ParagraphElement): string {
  return (el.children as Descendant[]).map((c) => (isText(c) ? (c as Text).text : '')).join('');
}

export function isFenceLineParagraph(el: CustomElement): boolean {
  if (el.type !== 'paragraph') return false;
  return paragraphText(el as ParagraphElement)
    .trim()
    .startsWith('```');
}

function fenceLanguage(el: CustomElement): string {
  const line = paragraphText(el as ParagraphElement)
    .trim()
    .slice(3);
  return line && !line.includes(' ') ? line : '';
}

function isCodeOnlyParagraph(el: CustomElement): boolean {
  if (el.type !== 'paragraph') return false;
  const children = (el as ParagraphElement).children;
  if (children.length !== 1) return false;
  const c = children[0];
  return isText(c) && (c as CustomText).code === true;
}

function codeParagraphText(el: ParagraphElement): string {
  return (el.children[0] as Text)?.text ?? '';
}

function rawElementText(el: CustomElement): string {
  if (
    el.type === 'paragraph' ||
    el.type === 'block-quote' ||
    el.type === 'code-block' ||
    el.type === 'heading' ||
    el.type === 'list-item'
  ) {
    return (el as { children: Descendant[] }).children
      .map((c) => (isText(c) ? (c as Text).text : ''))
      .join('');
  }
  return '';
}
