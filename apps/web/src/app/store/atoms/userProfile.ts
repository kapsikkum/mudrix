import { atom } from 'jotai';
import type { Placement } from '@floating-ui/dom';

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface UserProfileState {
  userId: string;
  roomId?: string | null;
  anchorRect: AnchorRect;
  placement?: Placement;
  source?: 'userpanel' | 'profile';
}

export const userProfileAtom = atom<UserProfileState | null>(null);
