import type { BaseEditor, Descendant } from 'slate';
import type { ReactEditor } from 'slate-react';
import type { HistoryEditor } from 'slate-history';
import { Element } from 'slate';

export interface ParagraphElement {
  type: 'paragraph';
  children: Descendant[];
}

export interface BlockQuoteElement {
  type: 'block-quote';
  children: Descendant[];
}

export interface CodeBlockElement {
  type: 'code-block';
  children: Descendant[];
}

export interface LinkElement {
  type: 'link';
  url: string;
  children: Descendant[];
}

export interface MentionElement {
  type: 'mention';
  userId: string;
  displayName: string;
  children: [{ text: '' }];
}

export interface RoomMentionElement {
  type: 'room-mention';
  label: string;
  children: [{ text: '' }];
}

export interface EmoticonElement {
  type: 'emoticon';
  mxcUrl: string;
  shortcode: string;
  children: [{ text: '' }];
}

export interface FormattedText {
  text: string;
  bold?: true;
  italic?: true;
  strikethrough?: true;
  code?: true;
}

export type CustomElement =
  | ParagraphElement
  | BlockQuoteElement
  | CodeBlockElement
  | LinkElement
  | MentionElement
  | RoomMentionElement
  | EmoticonElement;

export type CustomText = FormattedText;

export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor;

export const emptyDocument = (): ParagraphElement[] => [
  { type: 'paragraph', children: [{ text: '' }] },
];

export function withMentions(editor: CustomEditor): CustomEditor {
  const { isInline, isVoid, markableVoid } = editor;

  editor.isInline = (el) =>
    Element.isElement(el) &&
    (el.type === 'mention' ||
      el.type === 'room-mention' ||
      el.type === 'link' ||
      el.type === 'emoticon')
      ? true
      : isInline(el);

  editor.isVoid = (el) =>
    Element.isElement(el) &&
    (el.type === 'mention' || el.type === 'room-mention' || el.type === 'emoticon')
      ? true
      : isVoid(el);

  editor.markableVoid = (el) =>
    Element.isElement(el) &&
    (el.type === 'mention' || el.type === 'room-mention' || el.type === 'emoticon')
      ? true
      : markableVoid(el);

  return editor;
}
