import type { Descendant, Text } from 'slate';
import { BULLET_RE, HEADING_RE, NUMBERED_RE, parseFormatting } from './fromMarkdown';
import { isFenceLineParagraph } from './toMarkdown';
import type { CustomElement, CustomText, HeadingLevel } from './types';

function isText(node: Descendant): node is Text {
  return 'text' in node;
}

function markLeaf(leaf: CustomText): Descendant[] {
  if (leaf.code || !leaf.text) return [leaf];
  const marks: Partial<CustomText> = { ...leaf };
  delete marks.text;
  return parseFormatting(leaf.text).map((node) =>
    isText(node as Descendant)
      ? ({ ...marks, ...(node as CustomText) } as Descendant)
      : ({
          ...(node as CustomElement),
          children: (node as CustomElement).children.map((c) => ({ ...marks, ...c })),
        } as Descendant)
  );
}

function transform(node: Descendant): Descendant {
  if (isText(node)) return node;
  const el = node as CustomElement;
  if (
    el.type !== 'paragraph' &&
    el.type !== 'block-quote' &&
    el.type !== 'heading' &&
    el.type !== 'list-item'
  )
    return node;
  return {
    ...el,
    children: el.children.flatMap((child) =>
      isText(child) ? markLeaf(child as CustomText) : [transform(child)]
    ),
  } as Descendant;
}

function quoteLineChildren(node: Descendant): Descendant[] | null {
  if (isText(node) || (node as CustomElement).type !== 'paragraph') return null;
  const children = (node as CustomElement).children;
  const first = children[0];
  if (!first || !isText(first) || (first as CustomText).code) return null;
  const text = (first as CustomText).text;
  if (text !== '>' && !text.startsWith('> ')) return null;
  return [{ ...first, text: text.slice(2) } as Descendant, ...children.slice(1)];
}

function lineBlock(node: Descendant): Descendant | null {
  if (isText(node) || (node as CustomElement).type !== 'paragraph') return null;
  const children = (node as CustomElement).children;
  const first = children[0];
  if (!first || !isText(first) || (first as CustomText).code) return null;
  const text = (first as CustomText).text;
  const strip = (prefix: string) => [
    { ...first, text: text.slice(prefix.length) } as Descendant,
    ...children.slice(1),
  ];
  const heading = HEADING_RE.exec(text);
  if (heading) {
    const level = heading[1].length as HeadingLevel;
    return { type: 'heading', level, children: strip(heading[0]) } as Descendant;
  }
  const bullet = BULLET_RE.exec(text);
  if (bullet) {
    return { type: 'list-item', listType: 'bulleted', children: strip(bullet[0]) } as Descendant;
  }
  const numbered = NUMBERED_RE.exec(text);
  if (numbered) {
    return { type: 'list-item', listType: 'numbered', children: strip(numbered[0]) } as Descendant;
  }
  return null;
}

export function applyInlineMarkdown(value: Descendant[]): Descendant[] {
  const out: Descendant[] = [];
  let inFence = false;
  for (let i = 0; i < value.length; i++) {
    const node = value[i];
    if (!isText(node) && isFenceLineParagraph(node as CustomElement)) {
      inFence = !inFence;
      out.push(node);
      continue;
    }
    if (inFence) {
      out.push(node);
      continue;
    }
    // Consecutive `> ` lines become one quote
    const lines: Descendant[][] = [];
    let line = quoteLineChildren(node);
    while (line) {
      lines.push(line);
      line = i + 1 < value.length ? quoteLineChildren(value[i + 1]) : null;
      if (line) i++;
    }
    if (lines.length > 0) {
      const children = lines.flatMap((l, n) => (n === 0 ? l : [{ text: '\n' }, ...l]));
      out.push(transform({ type: 'block-quote', children } as Descendant));
      continue;
    }
    out.push(transform(lineBlock(node) ?? node));
  }
  return out;
}
