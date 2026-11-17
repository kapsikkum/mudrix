import { STORAGE_KEY_GIF_RECENT } from '@/const/storageKeys';
import { accountStorageKey } from '@/const/accountStorage';
import type { GifItem } from './gifProviders';
import { GIF_RECENT_CAP, parseRecentList } from './gifRecentData';

export { GIF_RECENT_CAP, parseRecentList, withRecentGif } from './gifRecentData';

export function readRecentGifs(): GifItem[] {
  try {
    return parseRecentList(localStorage.getItem(accountStorageKey(STORAGE_KEY_GIF_RECENT)));
  } catch {
    return [];
  }
}

export function writeRecentGifs(list: GifItem[]): void {
  try {
    localStorage.setItem(
      accountStorageKey(STORAGE_KEY_GIF_RECENT),
      JSON.stringify(list.slice(0, GIF_RECENT_CAP))
    );
  } catch {
    // Storage unavailable: the Recent tab is then simply empty.
  }
}
