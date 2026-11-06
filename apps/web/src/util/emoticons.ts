import type { Descendant } from 'slate';

/** Plain-text emoticons turned into Unicode emoji on send (the Element/Discord behaviour). */
const EMOTICONS: Record<string, string> = {
  ':)': '🙂',
  ':-)': '🙂',
  '(:': '🙂',
  ':D': '😃',
  ':-D': '😃',
  XD: '😆',
  xD: '😆',
  ':(': '🙁',
  ':-(': '🙁',
  ":'(": '😢',
  ':P': '😛',
  ':-P': '😛',
  ':p': '😛',
  ';)': '😉',
  ';-)': '😉',
  ':O': '😮',
  ':-O': '😮',
  ':o': '😮',
  ':/': '😕',
  ':-/': '😕',
  ':|': '😐',
  ':-|': '😐',
  ':*': '😘',
  ':-*': '😘',
  'B)': '😎',
  '8)': '😎',
  '>:(': '😠',
  '<3': '❤️',
  '</3': '💔',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

const TOKENS = Object.keys(EMOTICONS)
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join('|');

// A token only counts when whitespace or the start of the text comes before it and
// whitespace, the end, or sentence punctuation comes after, so "http://x", "a:D" and
// "(:" inside words are left alone.
const EMOTICON_RE = new RegExp(`(^|\\s)(${TOKENS})(?=$|\\s|[.,!?;])`, 'g');
const INLINE_CODE_RE = /(`[^`]*`)/;

export function replaceEmoticonsInText(text: string): string {
  return text
    .split(INLINE_CODE_RE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(EMOTICON_RE, (_m, lead: string, token: string) => lead + EMOTICONS[token])
    )
    .join('');
}

function isText(node: Descendant): node is { text: string; code?: true } {
  return typeof (node as { text?: unknown }).text === 'string';
}

function paragraphText(node: Descendant): string {
  if (isText(node)) return node.text;
  return ((node as { children?: Descendant[] }).children ?? []).map(paragraphText).join('');
}

function mapNode(node: Descendant): Descendant {
  if (isText(node)) {
    if (node.code) return node;
    const text = replaceEmoticonsInText(node.text);
    return text === node.text ? node : { ...node, text };
  }
  const el = node as { type?: string; children?: Descendant[] };
  // Mentions, custom emoji and code blocks keep their content as typed.
  if (!el.children || el.type === 'code-block') return node;
  if (el.type === 'mention' || el.type === 'room-mention' || el.type === 'emoticon') return node;
  return { ...node, children: el.children.map(mapNode) } as Descendant;
}

/** Replaces emoticons in the editor value, skipping inline code and fenced code blocks. */
export function replaceEmoticonsInValue(value: Descendant[]): Descendant[] {
  let inFence = false;
  return value.map((node) => {
    const isFenceLine =
      !isText(node) &&
      (node as { type?: string }).type === 'paragraph' &&
      paragraphText(node).trim().startsWith('```');
    if (isFenceLine) {
      inFence = !inFence;
      return node;
    }
    return inFence ? node : mapNode(node);
  });
}
