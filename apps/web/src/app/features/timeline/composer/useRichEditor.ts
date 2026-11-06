import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { createEditor, Transforms, type Descendant, Node, Element } from 'slate';
import { withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAutocomplete } from '../useAutocomplete';
import type { Suggestion } from '../useAutocomplete';
import { useFormatToolbar } from './useFormatToolbar';
import { emptyDocument, withBlocks, withMentions } from './editor/types';
import type { CustomEditor } from './editor/types';

interface UseRichEditorOptions {
  client: MatrixClient;
  roomId: string;
  onEscape?: () => void;
  disableCommands?: boolean;
}

export function useRichEditor({ client, roomId, onEscape, disableCommands }: UseRichEditorOptions) {
  const editor = useRef<CustomEditor>(
    withBlocks(withMentions(withHistory(withReact(createEditor() as CustomEditor))))
  ).current;

  const [value, setValue] = useState<Descendant[]>(() => emptyDocument());

  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const autocomplete = useAutocomplete(client, roomId, { disableCommands });
  const { toolbar, updateToolbar, applyFormat, resetToolbar, linkPopover, submitLink, cancelLink } =
    useFormatToolbar({ editor });

  const isEmpty = value.every((node) => {
    if (Node.string(node).trim().length > 0) return false;
    for (const [child] of Node.nodes(node)) {
      if (
        Element.isElement(child) &&
        (child.type === 'emoticon' || child.type === 'mention' || child.type === 'room-mention')
      ) {
        return false;
      }
    }
    return true;
  });

  const handleChange = useCallback(
    (newValue: Descendant[]) => {
      setValue(newValue);
      autocomplete.onEditorChange(editor);
      resetToolbar();
    },
    [autocomplete, editor, resetToolbar]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): boolean => {
      if (autocomplete.state.open) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          autocomplete.onArrow('down');
          return true;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          autocomplete.onArrow('up');
          return true;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          autocomplete.close();
          return true;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          const confirmed = autocomplete.confirm(editor);
          if (confirmed) {
            e.preventDefault();
            return true;
          }
        }
      }
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.preventDefault();
        onEscapeRef.current();
        return true;
      }
      return false;
    },
    [autocomplete, editor]
  );

  const handleAutocompleteSelect = useCallback(
    (suggestion: Suggestion) => {
      autocomplete.confirm(editor, suggestion);
    },
    [autocomplete, editor]
  );

  const handleAutocompleteHover = useCallback(
    (index: number) => {
      autocomplete.select(index);
    },
    [autocomplete]
  );

  const clearValue = useCallback(() => {
    const blank = emptyDocument();
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    });
    editor.children = blank;
    setValue([...blank]);
  }, [editor]);

  return {
    editor,
    value,
    setValue,
    toolbar,
    updateToolbar,
    applyFormat,
    linkPopover,
    submitLink,
    cancelLink,
    autocomplete,
    handleChange,
    handleKeyDown,
    handleAutocompleteSelect,
    handleAutocompleteHover,
    clearValue,
    isEmpty,
  };
}
