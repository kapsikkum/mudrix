import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { contextMenuAtom } from '../features/contextMenu/contextMenuAtom';
import type {
  ContextMenuAnchor,
  ContextMenuItem,
  QuickReactions,
} from '../features/contextMenu/contextMenuAtom';

export type MenuOpenEvent = React.MouseEvent & { anchor?: ContextMenuAnchor };

export function isMenuOpenKey(e: React.KeyboardEvent | KeyboardEvent): boolean {
  if (e.key === 'ContextMenu') return true;
  return e.key === 'F10' && e.shiftKey;
}

export function syntheticMouseEvent(
  x: number,
  y: number,
  target: HTMLElement | null,
  anchor?: ContextMenuAnchor
) {
  return {
    clientX: x,
    clientY: y,
    currentTarget: target,
    anchor,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as React.MouseEvent & { anchor?: ContextMenuAnchor };
}

function currentTargetEl(e: React.SyntheticEvent): HTMLElement | null {
  return e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
}

export function anchorFromElement(el: HTMLElement | null): ContextMenuAnchor {
  const rect = el?.getBoundingClientRect();
  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      placement: 'bottom-start',
    };
  }
  return { x: 0, y: 0, width: 0, height: 0, placement: 'bottom-start' };
}

function anchorFromMouseEvent(e: MenuOpenEvent): ContextMenuAnchor {
  if (e.anchor) return e.anchor;
  if (e.clientX !== 0 || e.clientY !== 0) {
    return { x: e.clientX, y: e.clientY, width: 0, height: 0, placement: 'bottom-start' };
  }
  return anchorFromElement(currentTargetEl(e));
}

export function useContextMenu() {
  const setMenu = useSetAtom(contextMenuAtom);

  const openContextMenu = useCallback(
    (e: MenuOpenEvent, items: ContextMenuItem[], quickReactions?: QuickReactions) => {
      e.preventDefault();
      e.stopPropagation();
      if (items.length === 0) return;
      setMenu({
        items,
        anchor: anchorFromMouseEvent(e),
        opener: currentTargetEl(e),
        quickReactions,
      });
    },
    [setMenu]
  );

  const openContextMenuAt = useCallback(
    (items: ContextMenuItem[], anchor: ContextMenuAnchor, opener?: HTMLElement | null) => {
      if (items.length === 0) return;
      setMenu({ items, anchor, opener: opener ?? null });
    },
    [setMenu]
  );

  const closeContextMenu = useCallback(() => {
    setMenu(null);
  }, [setMenu]);

  return { openContextMenu, openContextMenuAt, closeContextMenu };
}
