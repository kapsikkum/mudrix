import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { callUiAtom, streamerModeAtom } from '@/app/store/atoms';
import { setStreamerModeActive } from '@/util/streamerMode';

/**
 * Whether streamer mode is on: always when chosen, or "auto" while this device shares its
 * screen. Mount once near the root to keep the blur styles and the notification code in step;
 * anything may call it to read the state.
 */
export function useStreamerMode(): boolean {
  const mode = useAtomValue(streamerModeAtom);
  const sharing = useAtomValue(callUiAtom).isScreenSharing;
  const active = mode === 'on' || (mode === 'auto' && sharing);

  useEffect(() => {
    setStreamerModeActive(active);
  }, [active]);
  useEffect(() => () => setStreamerModeActive(false), []);

  return active;
}
