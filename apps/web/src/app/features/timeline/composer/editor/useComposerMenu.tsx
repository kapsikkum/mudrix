import { useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor, Node, Range, Transforms, Text } from 'slate';
import { ReactEditor } from 'slate-react';
import {
  BookBookmarkIcon,
  ClipboardTextIcon,
  CopyIcon,
  EyeSlashIcon,
  ScissorsIcon,
  SelectionAllIcon,
} from '@phosphor-icons/react';
import { anchorFromElement, isMenuOpenKey, useContextMenu } from '@/app/hooks/useContextMenu';
import type {
  ContextMenuAnchor,
  ContextMenuItem,
} from '@/app/features/contextMenu/contextMenuAtom';
import { isMobileDevice } from '@/util/desktop';
import { wordAtOffset } from '@/util/spellcheck/decorations';
import { addPersonalWord, ignoreWord, suggestWords } from '@/util/spellcheck/spellcheck';
import type { CustomEditor } from './types';
import { isSpellcheckable, type Spellcheck } from './useSpellcheck';

const MAX_SUGGESTIONS = 5;
/** The menu never waits longer than this for suggestions. */
const SUGGESTION_WAIT_MS = 150;
const ICON_SIZE = 14;

const KEYBOARD_MENU = isMobileDevice();

interface WordAtPoint {
  word: string;
  range: Range;
}

/** The misspelled word at a point of the document, if there is one. */
function misspelledWordAt(
  editor: CustomEditor,
  spell: Spellcheck,
  point: Range['anchor']
): WordAtPoint | null {
  if (!spell.enabled || !Node.has(editor, point.path)) return null;
  const node = Node.get(editor, point.path);
  if (!isSpellcheckable(editor, node, point.path)) return null;
  const token = wordAtOffset(node.text, point.offset);
  if (!token || !spell.isMisspelled(token.word)) return null;
  return {
    word: token.word,
    range: {
      anchor: { path: point.path, offset: token.start },
      focus: { path: point.path, offset: token.end },
    },
  };
}

/** Puts the selection (formatted and plain) on the clipboard; false when there is none. */
async function copySelection(editor: CustomEditor): Promise<boolean> {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection)) return false;
  const text = Editor.string(editor, selection);
  try {
    const data = new DataTransfer();
    ReactEditor.setFragmentData(editor, data, 'copy');
    const html = data.getData('text/html');
    if (html && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([data.getData('text/plain') || text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return true;
    }
  } catch {
    // fall back to plain text below
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function pasteText(editor: CustomEditor) {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return;
  }
  if (!text) return;
  ReactEditor.focus(editor);
  const data = new DataTransfer();
  data.setData('text/plain', text);
  ReactEditor.insertData(editor, data);
}

function caretAnchor(el: HTMLElement): ContextMenuAnchor {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = range?.getClientRects()[0] ?? range?.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0)) {
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      placement: 'bottom-start',
    };
  }
  return anchorFromElement(el);
}

/**
 * The composer's own right-click menu (also opened by the menu key): spelling suggestions for the
 * word under the pointer, then Cut / Copy / Paste / Select all. Phones keep the system menu.
 */
export function useComposerMenu(editor: CustomEditor, spell: Spellcheck, readOnly?: boolean) {
  const { t } = useTranslation();
  const { openContextMenuAt } = useContextMenu();
  const active = !KEYBOARD_MENU && !readOnly;

  const openMenu = useCallback(
    async (at: Range | null, anchor: ContextMenuAnchor, opener: HTMLElement) => {
      let target: WordAtPoint | null = null;
      if (at) {
        target = misspelledWordAt(editor, spell, at.anchor);
        const { selection } = editor;
        const insideSelection =
          !!selection && !Range.isCollapsed(selection) && Range.includes(selection, at.anchor);
        // like a native menu: act on what was clicked unless the click is inside the selection
        if (!insideSelection) Transforms.select(editor, target ? target.range : at);
      }
      const { selection } = editor;
      const hasSelection = !!selection && !Range.isCollapsed(selection);

      let suggestions: string[] | null = [];
      if (target) {
        suggestions = await Promise.race([
          suggestWords(target.word, spell.languages),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), SUGGESTION_WAIT_MS);
          }),
        ]);
      }

      const refocus = () => ReactEditor.focus(editor);
      const items: ContextMenuItem[] = [];
      if (target) {
        const { word, range } = target;
        if (suggestions && suggestions.length === 0) {
          items.push({ label: t('spellcheck.noSuggestions'), disabled: true, onClick: () => {} });
        }
        suggestions?.slice(0, MAX_SUGGESTIONS).forEach((suggestion) => {
          items.push({
            label: suggestion,
            onClick: () => {
              refocus();
              Transforms.insertText(editor, suggestion, { at: range });
            },
          });
        });
        items.push(
          {
            label: t('spellcheck.addToDictionary'),
            icon: <BookBookmarkIcon size={ICON_SIZE} />,
            onClick: () => addPersonalWord(word),
          },
          {
            label: t('spellcheck.ignore'),
            icon: <EyeSlashIcon size={ICON_SIZE} />,
            onClick: () => ignoreWord(word),
          },
          { label: '', divider: true, onClick: () => {} }
        );
      }
      items.push(
        {
          label: t('spellcheck.cut'),
          icon: <ScissorsIcon size={ICON_SIZE} />,
          disabled: !hasSelection,
          onClick: async () => {
            if (await copySelection(editor)) {
              refocus();
              Editor.deleteFragment(editor);
            }
          },
        },
        {
          label: t('common.copy'),
          icon: <CopyIcon size={ICON_SIZE} />,
          disabled: !hasSelection,
          onClick: () => {
            copySelection(editor);
          },
        },
        {
          label: t('spellcheck.paste'),
          icon: <ClipboardTextIcon size={ICON_SIZE} />,
          onClick: () => {
            pasteText(editor);
          },
        },
        {
          label: t('spellcheck.selectAll'),
          icon: <SelectionAllIcon size={ICON_SIZE} />,
          onClick: () => {
            refocus();
            Transforms.select(editor, Editor.range(editor, []));
          },
        }
      );
      openContextMenuAt(items, anchor, opener);
    },
    [editor, spell, t, openContextMenuAt]
  );

  const onContextMenu = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      let at: Range | null = null;
      try {
        at = ReactEditor.findEventRange(editor, e);
      } catch {
        // the pointer is not over editable text: the menu still offers the clipboard actions
      }
      // a click on a mention or emoji (void) has no word
      if (at && !Text.isText(Node.get(editor, at.anchor.path))) at = null;
      openMenu(
        at,
        { x: e.clientX, y: e.clientY, width: 0, height: 0, placement: 'bottom-start' },
        e.currentTarget
      );
    },
    [active, editor, openMenu]
  );

  /** Opens the menu at the caret for the menu key / Shift+F10; true when it handled the key. */
  const onMenuKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): boolean => {
      if (!active || !isMenuOpenKey(e)) return false;
      e.preventDefault();
      const { selection } = editor;
      openMenu(
        selection ? Editor.range(editor, selection.focus) : null,
        caretAnchor(e.currentTarget),
        e.currentTarget
      );
      return true;
    },
    [active, editor, openMenu]
  );

  return { onContextMenu, onMenuKey };
}
