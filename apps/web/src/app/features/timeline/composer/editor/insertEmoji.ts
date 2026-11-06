import { Editor, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import type { CustomEditor, EmoticonElement } from './types';

/** `focus: false` inserts without raising the keyboard (a docked picker stays open beside it). */
export function insertEmoji(editor: CustomEditor, emoji: string, mxcUrl?: string, focus = true) {
  if (!focus && !editor.selection) Transforms.select(editor, Editor.end(editor, []));
  if (mxcUrl) {
    const shortcode = emoji.replace(/^:|:$/g, '');
    const node: EmoticonElement = {
      type: 'emoticon',
      mxcUrl,
      shortcode,
      children: [{ text: '' }],
    };
    Transforms.insertNodes(editor, node);
    Transforms.move(editor, { unit: 'offset' });
  } else {
    Transforms.insertText(editor, emoji);
  }
  if (focus) ReactEditor.focus(editor);
}
