import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  MagnifyingGlassIcon,
  HashStraightIcon,
  SpeakerHighIcon,
  StackIcon,
  CubeIcon,
  ArrowBendUpRightIcon,
} from '@phosphor-icons/react';
import type { SpaceNode } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { canSendState, childrenOf, useSpaceGraph } from '@/app/data';
import {
  addRoomToSpaceAtom,
  forwardMessageAtom,
  type ForwardMessageState,
} from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Avatar } from '@/app/components/Avatar';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { KeyCaps } from '@/app/components/KeyCaps';
import * as css from './RoomSwitcher.css';
import { HighlightedText, useRoomEntries, type RoomEntry } from './roomEntries';
import { useKeyboardHints } from '@/app/hooks/useKeyboardHints';

function pickerEligible(
  graph: SpaceNode[],
  entries: RoomEntry[],
  spaceId: string,
  type: 'room' | 'subspace'
): Set<string> {
  const eligible = new Set<string>();
  const childIds = new Set(childrenOf(graph, spaceId).map((c) => c.roomId));

  const ancestorIds = new Set<string>();
  if (type === 'subspace') {
    let cur = spaceId;
    for (let i = 0; i < 20; i++) {
      const found = graph.find((s) => s.spaceId === cur)?.canonicalParent ?? null;
      if (!found) break;
      ancestorIds.add(found);
      cur = found;
    }
  }

  for (const entry of entries) {
    if (entry.roomId === spaceId) continue;
    if (childIds.has(entry.roomId)) continue;

    if (type === 'room') {
      if (entry.kind === 'space') continue;
    } else {
      if (entry.kind !== 'space') continue;
      if (ancestorIds.has(entry.roomId)) continue;
    }
    eligible.add(entry.roomId);
  }
  return eligible;
}

async function addToSpace(
  entry: RoomEntry,
  addState: {
    spaceId: string;
    spaceName: string;
    type?: 'room' | 'subspace';
  },
  toast: ReturnType<typeof useToast>,
  setLoadingId: (id: string | null) => void,
  setAddState: (state: null) => void,
  t: (key: string, opts?: Record<string, unknown>) => string
) {
  const client = getMatrixClientOrNull();
  if (!client) return;
  setLoadingId(entry.roomId);
  const isSubspace = addState.type === 'subspace';
  const failKey = isSubspace ? 'space.addExistingSubSpaceFailed' : 'space.addExistingRoomFailed';
  try {
    const settings = await client.roomSettings(addState.spaceId);
    if (!canSendState(settings, client.userId() ?? '', 'm.space.child')) {
      toast.error(t('space.addExistingRoomFailed', { error: 'insufficient permissions' }));
      return;
    }
    await client.addToSpace(addState.spaceId, entry.roomId, false);
    setAddState(null);
  } catch (err) {
    toast.error(t(failKey, { error: getErrorMessage(err) }));
  } finally {
    setLoadingId(null);
  }
}

async function forwardMessage(
  entry: RoomEntry,
  state: ForwardMessageState,
  toast: ReturnType<typeof useToast>,
  setLoadingId: (id: string | null) => void,
  setForwardState: (state: null) => void,
  t: (key: string, opts?: Record<string, unknown>) => string
) {
  const client = getMatrixClientOrNull();
  if (!client) return;
  setLoadingId(entry.roomId);
  try {
    await client.sendEvent(entry.roomId, state.eventType, state.content);
    setForwardState(null);
  } catch (err) {
    toast.error(t('timeline.forwardFailed', { error: getErrorMessage(err) }));
  } finally {
    setLoadingId(null);
  }
}

export function RoomSwitcher() {
  const { t } = useTranslation();
  const keyboardHints = useKeyboardHints();
  const toast = useToast();
  const [addState, setAddState] = useAtom(addRoomToSpaceAtom);
  const [forwardState, setForwardState] = useAtom(forwardMessageAtom);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const listboxId = useId();

  const client = getMatrixClientOrNull();

  const inForwardMode = forwardState?.open === true;
  const inPickerMode = addState?.open === true;
  const isSubspace = inPickerMode && addState.type === 'subspace';
  const spaceId = inPickerMode ? addState.spaceId : '';
  const spaceName = inPickerMode ? addState.spaceName : '';

  const close = useCallback(() => {
    if (forwardState?.open) setForwardState(null);
    else if (addState?.open) setAddState(null);
    setQuery('');
    setHighlightedIndex(0);
    setLoadingId(null);
  }, [setAddState, setForwardState, forwardState, addState]);

  const select = useCallback(
    (entry: RoomEntry) => {
      if (loadingId) return;
      if (forwardState?.open) {
        void forwardMessage(entry, forwardState, toast, setLoadingId, setForwardState, t);
      } else if (addState?.open) {
        void addToSpace(entry, addState, toast, setLoadingId, setAddState, t);
      }
    },
    [loadingId, forwardState, addState, toast, setForwardState, setAddState, t]
  );

  const entries = useRoomEntries();
  const graph = useSpaceGraph();

  const scope = useMemo<'room' | 'dm' | 'space' | null>(() => {
    const prefix = query.match(/^[#@*]/)?.[0];
    if (!prefix) return null;
    return prefix === '#' ? 'room' : prefix === '@' ? 'dm' : 'space';
  }, [query]);

  const searchText = useMemo(
    () =>
      query
        .replace(/^[#@*]/, '')
        .trim()
        .toLowerCase(),
    [query]
  );

  const displayed = useMemo(() => {
    const matchesScope = (e: RoomEntry) => scope === null || e.kind === scope;
    const matchesText = (e: RoomEntry) => !searchText || e.name.toLowerCase().includes(searchText);
    const byActivity = (a: RoomEntry, b: RoomEntry) =>
      Number(b.highlight) - Number(a.highlight) ||
      b.unread - a.unread ||
      b.lastActiveTs - a.lastActiveTs;

    if (inForwardMode) {
      const matchesKind = (e: RoomEntry) => e.kind === 'dm' || (e.kind === 'room' && !e.isVoice);
      const eligible = entries.filter(matchesKind).filter(matchesScope).filter(matchesText);
      return searchText
        ? [...eligible].sort((a, b) => a.name.localeCompare(b.name))
        : [...eligible].sort(byActivity);
    }

    if (!client || !spaceId) return [];
    const eligible = pickerEligible(graph, entries, spaceId, isSubspace ? 'subspace' : 'room');
    const matchesKind = (e: RoomEntry) => (isSubspace ? e.kind === 'space' : e.kind === 'room');
    return entries
      .filter((e) => eligible.has(e.roomId))
      .filter(matchesKind)
      .filter(matchesScope)
      .filter(matchesText)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, graph, scope, searchText, inForwardMode, client, spaceId, isSubspace]);

  const dialogOpen = inPickerMode || inForwardMode;

  useEffect(() => {
    if (!dialogOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, displayed.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const entry = displayed[highlightedIndex];
        if (entry) select(entry);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dialogOpen, displayed, highlightedIndex, close, select]);

  useEffect(() => {
    if (!dialogOpen) return;
    setHighlightedIndex(0);
    setQuery('');
  }, [dialogOpen]);

  useEffect(() => {
    const el = resultsRef.current?.querySelector('[data-highlighted="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  if (!dialogOpen) return null;

  return (
    <Dialog
      open={dialogOpen}
      onClose={close}
      size="lg"
      zIndex={9500}
      bodyClassName={css.dialogBody}
      title={
        inForwardMode
          ? t('timeline.forwardPickerTitle')
          : t(isSubspace ? 'space.addExistingSubSpace' : 'space.addExistingRoom', {
              name: spaceName,
            })
      }
      titleIcon={inForwardMode ? <ArrowBendUpRightIcon size={18} /> : <CubeIcon size={18} />}
    >
      <div className={css.searchBar}>
        <MagnifyingGlassIcon size={18} weight="fill" className={css.searchIcon} />
        <input
          className={css.searchInput}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            displayed.length > 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
          }
          placeholder={
            inForwardMode
              ? t('timeline.forwardSearchPlaceholder')
              : t(
                  isSubspace
                    ? 'space.addExistingSubSpaceSearchPlaceholder'
                    : 'space.addExistingRoomSearchPlaceholder'
                )
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightedIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
          autoComplete="off"
          spellCheck={false}
          data-dialog-autofocus
        />
      </div>
      <div className={css.results} ref={resultsRef} id={listboxId} role="listbox">
        {displayed.length === 0 ? (
          <div className={css.emptyState}>
            {inForwardMode
              ? t('search.switcher.noResults')
              : query
                ? t(
                    isSubspace
                      ? 'space.addExistingSubSpaceNoResults'
                      : 'space.addExistingRoomNoResults'
                  )
                : t(isSubspace ? 'space.addExistingSubSpaceEmpty' : 'space.addExistingRoomEmpty')}
          </div>
        ) : (
          displayed.map((entry, idx) => {
            const isPending = loadingId === entry.roomId;
            const entryClass = `${css.resultItem}${isPending ? ` ${css.resultItemLoading}` : ''}`;
            return (
              <div
                key={entry.roomId}
                id={`${listboxId}-option-${idx}`}
                role="option"
                aria-selected={idx === highlightedIndex}
                aria-disabled={isPending}
                tabIndex={-1}
                className={entryClass}
                data-highlighted={idx === highlightedIndex}
                onClick={() => select(entry)}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                {entry.kind === 'dm' && (
                  <Avatar
                    name={entry.name}
                    mxcUrl={entry.avatarMxc}
                    client={client ?? null}
                    size="sm"
                  />
                )}
                {entry.kind === 'room' && (
                  <span className={css.typeIcon}>
                    {entry.isVoice ? (
                      <SpeakerHighIcon size={14} weight="fill" />
                    ) : (
                      <HashStraightIcon size={14} weight="bold" />
                    )}
                  </span>
                )}
                {entry.kind === 'space' && (
                  <span className={css.typeIcon}>
                    <StackIcon size={14} weight="bold" />
                  </span>
                )}
                <span className={css.resultName}>
                  <HighlightedText text={entry.name} query={searchText} />
                </span>
              </div>
            );
          })
        )}
      </div>
      {keyboardHints && (
        <div className={css.footer}>
          <span className={css.footerHint}>
            <KeyCaps keys={['↑', '↓']} size="sm" />
            {t('common.navigate')}
          </span>
          <span className={css.footerHint}>
            <KeyCaps keys={['↵']} size="sm" />
            {inForwardMode ? t('timeline.forwardHint') : t('search.switcher.hintOpen')}
          </span>
          <span className={css.footerHint}>
            <KeyCaps keys={['Esc']} size="sm" />
            {t('search.switcher.hintClose')}
          </span>
        </div>
      )}
    </Dialog>
  );
}
