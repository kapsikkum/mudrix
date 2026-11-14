import { atom } from 'jotai';
import {
  STORAGE_KEY_CURRENT_SPACE,
  STORAGE_KEY_LAST_ROOMS,
  STORAGE_KEY_PINNED_SUBSPACES,
} from '@/const/storageKeys';
import { atomWithAccountStorage } from './accountStorage';

export const currentRoomIdAtom = atom<string | null>(null);

export const favouriteRoomsAtom = atom<ReadonlySet<string>>(new Set<string>());

/** Rooms tagged low priority that are not favourites (a favourite is never low priority) */
export const lowPriorityRoomsAtom = atom<ReadonlySet<string>>(new Set<string>());

export const currentSpaceIdAtom = atomWithAccountStorage<string | null>(
  STORAGE_KEY_CURRENT_SPACE,
  null
);

// Last opened room per sidebar context ('home', 'dms' or a space id), restored when switching back
export const lastRoomByContextAtom = atomWithAccountStorage<Record<string, string>>(
  STORAGE_KEY_LAST_ROOMS,
  {}
);

export const pinnedSubSpacesAtom = atomWithAccountStorage<string[]>(
  STORAGE_KEY_PINNED_SUBSPACES,
  []
);
