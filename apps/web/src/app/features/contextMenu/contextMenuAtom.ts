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

export interface ContextMenuState {
  anchor: ContextMenuAnchor;
  items: ContextMenuItem[];
  opener?: HTMLElement | null;
}

export const contextMenuAtom = atom<ContextMenuState | null>(null);
