import type { BaseEditor, Descendant } from 'slate';
import type { ReactEditor } from 'slate-react';
import type { HistoryEditor } from 'slate-history';
import { Editor, Element, Range, Transforms } from 'slate';

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

export interface HeadingElement {
  type: 'heading';
  level: HeadingLevel;
  children: Descendant[];
}

export type HeadingLevel = 1 | 2 | 3;

export interface ListItemElement {
  type: 'list-item';
  listType: ListType;
  children: Descendant[];
}

export type ListType = 'bulleted' | 'numbered';

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

export interface RoomLinkElement {
  type: 'room-link';
  url: string;
  name: string;
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
  | HeadingElement
  | ListItemElement
  | LinkElement
  | MentionElement
  | RoomMentionElement
  | RoomLinkElement
  | EmoticonElement;

export type CustomText = FormattedText;

export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor;

export const emptyDocument = (): ParagraphElement[] => [
  { type: 'paragraph', children: [{ text: '' }] },
];

export function withMentions(editor: CustomEditor): CustomEditor {
  const { isInline, isVoid, markableVoid } = editor;
  const pill = (el: unknown) =>
    Element.isElement(el) &&
    (el.type === 'mention' ||
      el.type === 'room-mention' ||
      el.type === 'room-link' ||
      el.type === 'emoticon');

  editor.isInline = (el) => pill(el) || (el.type === 'link' ? true : isInline(el));
  editor.isVoid = (el) => pill(el) || isVoid(el);
  editor.markableVoid = (el) => pill(el) || markableVoid(el);

  return editor;
}

function currentBlock(editor: CustomEditor) {
  return Editor.above(editor, {
    match: (n) => Element.isElement(n) && Editor.isBlock(editor, n),
  });
}

function resetToParagraph(editor: CustomEditor) {
  Transforms.unsetNodes(editor, ['level', 'listType'], {
    match: (n) => Element.isElement(n) && Editor.isBlock(editor, n),
  });
  Transforms.setNodes(
    editor,
    { type: 'paragraph' },
    { match: (n) => Element.isElement(n) && Editor.isBlock(editor, n) }
  );
}

export function withBlocks(editor: CustomEditor): CustomEditor {
  const { insertBreak, deleteBackward } = editor;

  editor.insertBreak = () => {
    const block = editor.selection && Range.isCollapsed(editor.selection) && currentBlock(editor);
    if (block) {
      const [node, path] = block;
      const type = (node as CustomElement).type;
      if (type === 'list-item' && Editor.string(editor, path) === '') {
        resetToParagraph(editor);
        return;
      }
      if (type === 'heading') {
        insertBreak();
        resetToParagraph(editor);
        return;
      }
    }
    insertBreak();
  };

  editor.deleteBackward = (unit) => {
    const block = editor.selection && Range.isCollapsed(editor.selection) && currentBlock(editor);
    if (block) {
      const [node, path] = block;
      const type = (node as CustomElement).type;
      if (
        (type === 'list-item' || type === 'heading') &&
        Editor.isStart(editor, editor.selection!.anchor, path)
      ) {
        resetToParagraph(editor);
        return;
      }
    }
    deleteBackward(unit);
  };

  return editor;
}
