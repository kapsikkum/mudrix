import { Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import type { CustomEditor, EmoticonElement } from './types';

export function insertEmoji(editor: CustomEditor, emoji: string, mxcUrl?: string) {
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
  ReactEditor.focus(editor);
}
