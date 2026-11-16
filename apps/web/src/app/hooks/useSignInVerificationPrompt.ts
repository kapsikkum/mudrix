import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  sessionVerificationAtom,
  settingsOpenAtom,
  settingsPageAtom,
  whatsNewSeenAtom,
} from '@/app/store/atoms';
import { latestWhatsNew } from '@/app/features/whatsNew/whatsNew';
import { takeFreshSignIn } from '@/core/client';

/**
 * A fresh sign-in on a device that isn't verified yet opens the verification place straight away,
 * instead of leaving the person to find the warning icon in the title bar: Settings → Sessions is
 * where "verify this session" lives, with the buttons that open the existing emoji and recovery-key
 * flows. It happens once per sign-in, and only when the session state is already known - a restored
 * session, a reload, or a session that is verified by then leaves it alone.
 */
export function useSignInVerificationPrompt() {
  const { i18n } = useTranslation();
  const { status } = useAtomValue(sessionVerificationAtom);
  const seenWhatsNew = useAtomValue(whatsNewSeenAtom);
  const settingsOpen = useAtomValue(settingsOpenAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const handled = useRef(false);

  // On a device that hasn't seen this version's notes, "What's new" opens by itself right after
  // sign-in; wait for it to be dismissed rather than stacking two dialogs.
  const notes = latestWhatsNew(i18n.language);
  const whatsNewOpen = !!notes && seenWhatsNew !== notes.version;

  useEffect(() => {
    if (handled.current || status === 'checking' || whatsNewOpen) return;
    handled.current = true;
    // Settings already open: the person is in the right place and picks the page themselves.
    if (!takeFreshSignIn() || status === 'verified' || settingsOpen) return;

    setSettingsPage('sessions');
    setSettingsOpen(true);
  }, [status, whatsNewOpen, settingsOpen, setSettingsOpen, setSettingsPage]);
}
