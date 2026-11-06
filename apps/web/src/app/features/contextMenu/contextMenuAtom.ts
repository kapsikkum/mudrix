import { atom } from 'jotai';
import type { ReactNode } from 'react';
import type { Placement } from '@floating-ui/dom';

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
  checked?: boolean;
  keepOpen?: boolean;
  chevron?: boolean;
  submenu?: ContextMenuItem[];
  onClick: (menuEl?: HTMLElement | null) => void;
}

export interface ContextMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  placement: Placement;
}

/** A row of one-tap emoji reactions shown above the items in the touch (bottom sheet) layout. */
export interface QuickReactions {
  keys: string[];
  /** Keys the user has already reacted with; shown highlighted. */
  active?: string[];
  onPick: (key: string) => void;
}

export interface ContextMenuState {
  anchor: ContextMenuAnchor;
  items: ContextMenuItem[];
  opener?: HTMLElement | null;
  quickReactions?: QuickReactions;
}

export const contextMenuAtom = atom<ContextMenuState | null>(null);
