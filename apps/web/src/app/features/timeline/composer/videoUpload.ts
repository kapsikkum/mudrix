import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import {
  serverUploadLimitAtom,
  videoUploadHeightAtom,
  videoUploadMinSizeAtom,
  videoUploadModeAtom,
  videoUploadTargetAtom,
} from '@/app/store/atoms';
import {
  defaultVideoQuality,
  type FixedHeight,
  type VideoQuality,
  type VideoUploadPrefs,
} from '@/util/videoPlan';

// The planning itself (smart/fixed targets, choices with expected sizes) is in `@/util/videoPlan`.
export {
  defaultVideoQuality,
  qualityTarget,
  smartMaxBytes,
  videoChoices,
  type VideoChoice,
  type VideoUploadPrefs,
} from '@/util/videoPlan';

const MB = 1024 * 1024;

export function useVideoUploadPrefs(): VideoUploadPrefs {
  const mode = useAtomValue(videoUploadModeAtom);
  const height = useAtomValue(videoUploadHeightAtom);
  const target = useAtomValue(videoUploadTargetAtom);
  const minSize = useAtomValue(videoUploadMinSizeAtom);
  return useMemo(
    () => ({
      mode,
      height: Number(height) as FixedHeight,
      targetBytes: target === 'server' ? Infinity : Number(target) * MB,
      minBytes: Number(minSize) * MB,
    }),
    [mode, height, target, minSize]
  );
}

/** What the tray shows and the send uses for one video: the user's pick, else the default. */
export function useEffectiveVideoQuality(
  override: VideoQuality | undefined,
  size: number,
  canCompress: boolean
): VideoQuality {
  const prefs = useVideoUploadPrefs();
  const maxUploadBytes = useAtomValue(serverUploadLimitAtom);
  return override ?? defaultVideoQuality(prefs, size, maxUploadBytes, canCompress);
}
