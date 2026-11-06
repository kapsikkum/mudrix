import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import {
  notificationSoundPackAtom,
  notificationSoundsAtom,
  notificationSoundVolumeAtom,
  soundOverridesAtom,
} from '@/app/store/atoms';
import { setActiveSoundSettings } from '@/util/notificationSounds';

/** Keeps the sounds played from code (messages, calls, voice) following the sound settings. */
export function useSoundSettings(): void {
  const enabled = useAtomValue(notificationSoundsAtom);
  const pack = useAtomValue(notificationSoundPackAtom);
  const overrides = useAtomValue(soundOverridesAtom);
  const volume = useAtomValue(notificationSoundVolumeAtom);
  useEffect(() => {
    setActiveSoundSettings({ enabled, pack, overrides, volume });
  }, [enabled, pack, overrides, volume]);
}
