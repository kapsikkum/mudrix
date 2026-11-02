import { useRef } from 'react';
import { useSetAtom } from 'jotai';
import { contextMenuAtom } from '../features/contextMenu/contextMenuAtom';
import type { ContextMenuItem } from '../features/contextMenu/contextMenuAtom';
import { anchorFromElement, isMenuOpenKey } from './useContextMenu';

export interface ContextMenuTriggerHandlers {
  onContextMenu: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function triggerElement(
  e: { currentTarget: EventTarget & Element } | React.SyntheticEvent
): HTMLElement | null {
  return e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
}

export function useContextMenuTrigger(
  buildItems: () => ContextMenuItem[]
): ContextMenuTriggerHandlers {
  const setMenu = useSetAtom(contextMenuAtom);
  const buildItemsRef = useRef(buildItems);
  buildItemsRef.current = buildItems;

  const openFromElement = (el: HTMLElement | null, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    setMenu({ items, anchor: anchorFromElement(el), opener: el ?? null });
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items = buildItemsRef.current();
    if (items.length === 0) return;
    if (e.clientX !== 0 || e.clientY !== 0) {
      setMenu({
        items,
        anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0, placement: 'bottom-start' },
        opener: triggerElement(e),
      });
    } else {
      openFromElement(triggerElement(e), items);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isMenuOpenKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    openFromElement(triggerElement(e), buildItemsRef.current());
  };

  return {
    onContextMenu,
    onKeyDown,
  };
}
