import { useSyncExternalStore } from 'react';
import type { VideoQuality } from '@/util/videoCompress';

// Kept in memory only: what the user picked for one video. Without a pick, the settings decide.
const picks = new Map<string, VideoQuality>();
const listeners = new Set<() => void>();

export function getAttachmentQuality(id: string): VideoQuality | undefined {
  return picks.get(id);
}

/** Pass `undefined` to forget the pick and fall back to the settings. */
export function setAttachmentQuality(id: string, quality: VideoQuality | undefined): void {
  if (quality === undefined) picks.delete(id);
  else picks.set(id, quality);
  listeners.forEach((listener) => listener());
}

export function useAttachmentQuality(id: string): VideoQuality | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => getAttachmentQuality(id)
  );
}
