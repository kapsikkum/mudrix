import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { SAVED_TYPES, parseSavedMessages, savedMessagesAtom } from '@/util/savedMessages';
import { useFirstAccountData } from './useFirstAccountData';

/** Mirrors the saved-messages account data into `savedMessagesAtom`; mount it once. */
export function useSavedMessagesSync(client: WizardClient | null): void {
  const content = useFirstAccountData(client, SAVED_TYPES);
  const setSaved = useSetAtom(savedMessagesAtom);
  useEffect(() => setSaved(parseSavedMessages(content)), [content, setSaved]);
}
