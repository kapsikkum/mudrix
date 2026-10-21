import type { KeyboardEvent } from 'react';
import { Editor, Transforms, Element } from 'slate';
import type { CustomEditor } from './types';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export function isMod(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

function moveByLine(editor: CustomEditor, e: KeyboardEvent, reverse: boolean): boolean {
  e.preventDefault();
  const options: Parameters<typeof Transforms.move>[1] = { unit: 'line', reverse };
  if (e.shiftKey) options.edge = 'focus';
  Transforms.move(editor, options);
  return true;
}

function moveToDocumentEdge(editor: CustomEditor, e: KeyboardEvent, start: boolean): boolean {
  e.preventDefault();
  const current = editor.selection;
  const fixed = current?.anchor ?? Editor.start(editor, []);
  const target = start ? Editor.start(editor, []) : Editor.end(editor, []);
  Transforms.select(editor, { anchor: fixed, focus: target });
  return true;
}

export function handleEditorKeyDown(e: KeyboardEvent, editor: CustomEditor): boolean {
  if (isMod(e) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    Transforms.select(editor, []);
    return true;
  }

  if (e.key === 'Home' || e.key === 'End') {
    const toDocumentEdge = isMac ? isMod(e) : e.ctrlKey;
    if (toDocumentEdge) return moveToDocumentEdge(editor, e, e.key === 'Home');
    return moveByLine(editor, e, e.key === 'Home');
  }

  if (isMac && isMod(e) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    return moveByLine(editor, e, e.key === 'ArrowLeft');
  }

  const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
  if (isArrow && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    Transforms.move(editor, {
      unit: 'character',
      reverse: e.key === 'ArrowLeft',
      edge: 'focus',
    });
    return true;
  }

  const isUpDown = e.key === 'ArrowUp' || e.key === 'ArrowDown';
  if (isUpDown && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const { selection } = editor;
    if (selection) {
      const blockEntry = Editor.above(editor, {
        at: selection.focus,
        match: (n) => Element.isElement(n) && Editor.isBlock(editor, n),
      });
      const blockPath = blockEntry ? blockEntry[1] : [];
      const target =
        e.key === 'ArrowUp'
          ? (Editor.before(editor, Editor.start(editor, blockPath), { unit: 'line' }) ??
            Editor.start(editor, []))
          : (Editor.after(editor, Editor.end(editor, blockPath), { unit: 'line' }) ??
            Editor.end(editor, []));
      Transforms.select(editor, { anchor: selection.anchor, focus: target });
    }
    return true;
  }

  if (isArrow && e.shiftKey && (e.altKey || (!isMac && e.ctrlKey))) {
    e.preventDefault();
    Transforms.move(editor, {
      unit: 'word',
      reverse: e.key === 'ArrowLeft',
      edge: 'focus',
    });
    return true;
  }

  if (!isMod(e)) return false;

  switch (e.key) {
    case 'b':
    case 'B':
      toggleMark(editor, 'bold');
      return true;
    case 'i':
    case 'I':
      toggleMark(editor, 'italic');
      return true;
    case 's':
    case 'S':
      if (e.shiftKey) {
        toggleMark(editor, 'strikethrough');
        return true;
      }
      return false;
    case 'e':
    case 'E':
      toggleMark(editor, 'code');
      return true;
    default:
      return false;
  }
}

export type MarkKey = 'bold' | 'italic' | 'strikethrough' | 'code';

export function isMarkActive(editor: CustomEditor, mark: MarkKey): boolean {
  const marks = Editor.marks(editor);
  return marks ? marks[mark] === true : false;
}

export function toggleMark(editor: CustomEditor, mark: MarkKey): void {
  if (isMarkActive(editor, mark)) {
    Editor.removeMark(editor, mark);
  } else {
    Editor.addMark(editor, mark, true);
  }
}

export type BlockType = 'paragraph' | 'block-quote' | 'code-block';

export function isBlockActive(editor: CustomEditor, blockType: BlockType): boolean {
  const [match] = Editor.nodes(editor, {
    match: (n) => Element.isElement(n) && n.type === blockType,
  });
  return !!match;
}

export function toggleBlock(editor: CustomEditor, blockType: BlockType): void {
  const isActive = isBlockActive(editor, blockType);
  Transforms.setNodes(
    editor,
    { type: isActive ? 'paragraph' : blockType },
    { match: (n) => Element.isElement(n) && Editor.isBlock(editor, n) }
  );
}
