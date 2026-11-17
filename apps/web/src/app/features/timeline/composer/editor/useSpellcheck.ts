import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Element, Node, Path, Range, Text, type NodeEntry } from 'slate';
import { ReactEditor } from 'slate-react';
import { spellcheckEnabledAtom, spellcheckLanguagesAtom } from '@/app/store/atoms';
import { isMobileDevice } from '@/util/desktop';
import { misspelledTokens, sameWords, uniqueWords } from '@/util/spellcheck/decorations';
import { checkWords, subscribePersonalWords } from '@/util/spellcheck/spellcheck';
import type { CustomEditor, CustomText } from './types';

/** Phones keep the keyboard's own spellcheck, so none of this runs there. */
const KEYBOARD_SPELLCHECK = isMobileDevice();
const CHECK_DELAY_MS = 250;

/** Plain prose only: not code, links, mentions, emoji or other void elements. */
export function isSpellcheckable(editor: CustomEditor, node: Node, path: Path): node is CustomText {
  if (!Text.isText(node) || node.code) return false;
  for (const [ancestor] of Node.ancestors(editor, path)) {
    if (!Element.isElement(ancestor)) continue;
    if (ancestor.type === 'code-block' || ancestor.type === 'link' || editor.isVoid(ancestor)) {
      return false;
    }
  }
  return true;
}

export interface Spellcheck {
  /** False when the setting is off, the editor is read-only or the device is a phone. */
  enabled: boolean;
  languages: string[];
  /** Slate `decorate`: marks misspelled words with `misspelled: true`. */
  decorate: (entry: NodeEntry) => Range[];
  /** Call when the document changed; re-checks shortly after typing stops. */
  notifyChange: () => void;
  isMisspelled: (word: string) => boolean;
}

/**
 * Spellchecking for a Slate editor. Checking is asynchronous but `decorate` is not, so the verdicts
 * are kept as a set of misspelled words, refreshed in the background, and `decorate` re-runs when
 * the set changes.
 */
export function useSpellcheck(editor: CustomEditor, readOnly?: boolean): Spellcheck {
  const settingOn = useAtomValue(spellcheckEnabledAtom);
  const languages = useAtomValue(spellcheckLanguagesAtom);
  const enabled = settingOn && !readOnly && !KEYBOARD_SPELLCHECK;
  const languageKey = languages.join(',');

  const misspelled = useRef<ReadonlySet<string>>(new Set());
  const [version, setVersion] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const latestRun = useRef(0);

  const publish = useCallback((next: ReadonlySet<string>) => {
    if (sameWords(misspelled.current, next)) return;
    misspelled.current = next;
    setVersion((v) => v + 1);
  }, []);

  const run = useCallback(async () => {
    const id = ++latestRun.current;
    const texts: string[] = [];
    for (const [node, path] of Node.texts(editor)) {
      if (isSpellcheckable(editor, node, path)) texts.push(node.text);
    }
    const bad = await checkWords(uniqueWords(texts), languageKey.split(','));
    if (id === latestRun.current) publish(bad);
  }, [editor, languageKey, publish]);

  // settings or the personal dictionary changed: check again right away
  useEffect(() => {
    if (!enabled) {
      latestRun.current += 1;
      publish(new Set());
      return undefined;
    }
    run();
    return subscribePersonalWords(run);
  }, [enabled, run, publish]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      latestRun.current += 1;
    },
    []
  );

  const notifyChange = useCallback(() => {
    if (!enabled) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(run, CHECK_DELAY_MS);
  }, [enabled, run]);

  const decorate = useCallback(
    ([node, path]: NodeEntry): Range[] => {
      if (misspelled.current.size === 0 || !isSpellcheckable(editor, node, path)) return [];
      const { selection } = editor;
      // the word being typed is left alone until the caret moves on
      const caret =
        selection &&
        Range.isCollapsed(selection) &&
        Path.equals(selection.anchor.path, path) &&
        ReactEditor.isFocused(editor)
          ? selection.anchor.offset
          : null;
      return misspelledTokens(node.text, misspelled.current, caret).map((token) => ({
        anchor: { path, offset: token.start },
        focus: { path, offset: token.end },
        misspelled: true,
      }));
    },
    // `version` is the signal that the set changed: a new function makes Slate decorate again
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, version]
  );

  const isMisspelled = useCallback((word: string) => misspelled.current.has(word), []);

  return { enabled, languages, decorate, notifyChange, isMisspelled };
}
