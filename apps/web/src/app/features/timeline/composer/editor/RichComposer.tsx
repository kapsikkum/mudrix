import { useCallback, type KeyboardEvent, type ClipboardEvent } from 'react';
import { Slate, Editable, type RenderElementProps, type RenderLeafProps } from 'slate-react';
import { Element as SlateElement, Node, Text, type Descendant, type NodeEntry } from 'slate';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import type { CustomEditor } from './types';
import { Element, Leaf, MatrixClientContext } from './Elements';
import { handleEditorKeyDown } from './keyboard';
import { URL_RE } from '@/util/markdownToHtml';
import { isMobileDevice } from '@/util/desktop';
import { useSpellcheck } from './useSpellcheck';
import { useComposerMenu } from './useComposerMenu';

const TEXT_ASSIST = isMobileDevice();

export interface RichComposerProps {
  editor: CustomEditor;
  value: Descendant[];
  onChange: (value: Descendant[]) => void;
  onSend: () => void;
  onEscape?: () => void;
  onSelectionChange?: () => void;
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  autoFocus?: boolean;
  readOnly?: boolean;
  client?: MatrixClient | null;
  ariaLabel?: string;
  autocompleteListId?: string;
  autocompleteOpen?: boolean;
  autocompleteActiveId?: string;
}

const renderElement = (props: RenderElementProps) => <Element {...props} />;
const renderLeaf = (props: RenderLeafProps) => <Leaf {...props} />;

export function RichComposer({
  editor,
  value,
  onChange,
  onSend,
  onEscape,
  onSelectionChange,
  onPaste,
  placeholder,
  className,
  onKeyDown: externalKeyDown,
  autoFocus,
  readOnly,
  client,
  ariaLabel,
  autocompleteListId,
  autocompleteOpen,
  autocompleteActiveId,
}: RichComposerProps) {
  const spell = useSpellcheck(editor, readOnly);
  const { onContextMenu, onMenuKey } = useComposerMenu(editor, spell, readOnly);
  const { decorate: spellDecorate, notifyChange } = spell;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (externalKeyDown) {
        externalKeyDown(e);
        if (e.defaultPrevented) return;
      }

      if (onMenuKey(e)) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
        return;
      }

      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }

      if (handleEditorKeyDown(e, editor)) {
        e.preventDefault();
      }
    },
    [editor, onSend, onEscape, externalKeyDown, onMenuKey]
  );

  const decorate = useCallback(
    (entry: NodeEntry) => {
      const [node, path] = entry;
      if (!Text.isText(node) || node.code) return spellDecorate(entry);
      const parent = Node.parent(editor, path);
      if (
        SlateElement.isElement(parent) &&
        (parent.type === 'code-block' || parent.type === 'link')
      )
        return spellDecorate(entry);
      return [
        ...Array.from(node.text.matchAll(URL_RE), (m) => ({
          anchor: { path, offset: m.index },
          focus: { path, offset: m.index + m[0].length },
          url: true,
        })),
        ...spellDecorate(entry),
      ];
    },
    [editor, spellDecorate]
  );

  const handleChange = useCallback(
    (newValue: Descendant[]) => {
      onChange(newValue);
      onSelectionChange?.();
      notifyChange();
    },
    [onChange, onSelectionChange, notifyChange]
  );

  return (
    <MatrixClientContext.Provider value={client ?? null}>
      <Slate editor={editor} initialValue={value} onValueChange={handleChange}>
        <Editable
          className={className}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          decorate={decorate}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onSelect={onSelectionChange}
          onPaste={onPaste}
          onContextMenu={onContextMenu}
          autoFocus={autoFocus}
          readOnly={readOnly}
          // Phones get the normal keyboard (suggestions, autocorrect, capital letters);
          // on a computer a message is sent as typed, and misspelled words are underlined by
          // useSpellcheck instead of the webview (which would draw a second set of squiggles).
          spellCheck={TEXT_ASSIST}
          autoCorrect={TEXT_ASSIST ? 'on' : 'off'}
          autoCapitalize={TEXT_ASSIST ? 'sentences' : 'off'}
          aria-label={ariaLabel}
          role={autocompleteListId ? 'combobox' : 'textbox'}
          aria-autocomplete={autocompleteListId ? 'list' : undefined}
          aria-expanded={autocompleteListId ? autocompleteOpen : undefined}
          aria-controls={autocompleteListId}
          aria-activedescendant={
            autocompleteListId && autocompleteActiveId ? autocompleteActiveId : undefined
          }
        />
      </Slate>
    </MatrixClientContext.Provider>
  );
}
