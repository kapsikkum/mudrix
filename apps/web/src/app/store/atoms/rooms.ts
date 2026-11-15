import { atom } from 'jotai';
import {
  STORAGE_KEY_CURRENT_SPACE,
  STORAGE_KEY_LAST_ROOMS,
  STORAGE_KEY_PINNED_SUBSPACES,
  STORAGE_KEY_SPACE_ORDER,
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

/**
 * The space rail order the old app saved on this device (`wz_space_order`, one account at a time).
 * Read only: the new app writes its own order to room account data, so a drag here still reaches
 * other devices, while people coming from the old app keep the rail they arranged.
 */
export const legacySpaceOrderAtom = atomWithAccountStorage<string[]>(STORAGE_KEY_SPACE_ORDER, []);
