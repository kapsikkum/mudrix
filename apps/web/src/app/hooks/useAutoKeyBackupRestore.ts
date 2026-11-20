import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { MudrixClient as MatrixClient } from '@mudrix/core';
import { sessionVerificationAtom } from '@/app/store/atoms';

/** One restore per app run, however many rooms show unreadable messages first. */
let attempted = false;

/**
 * Older messages do not trigger the SDK's automatic backup download: that listens for new sync
 * events only, and a session it has already failed for is not tried again on its own. When a room
 * shows messages this device cannot read while the key backup is readable here, fetch the room
 * keys from it once, so they unlock without pressing "Restore from key backup" on a message.
 */
export function useAutoKeyBackupRestore(client: MatrixClient, hasUnreadable: boolean): void {
  const verification = useAtomValue(sessionVerificationAtom);
  const [backupReadable, setBackupReadable] = useState(false);

  // The backup key can arrive after the first messages failed (the recovery key is entered, or
  // another session verifies this one), so look again whenever verification changes.
  useEffect(() => {
    let alive = true;
    client
      .encryptionStatus()
      .then((status) => {
        if (alive) setBackupReadable(status.backupEnabled);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, verification.status]);

  useEffect(() => {
    if (!hasUnreadable || !backupReadable || attempted) return;
    attempted = true;
    void client
      .restoreKeyBackup(() => {})
      .catch((error) => {
        console.warn('[timeline] automatic key backup restore failed', error);
      });
  }, [client, hasUnreadable, backupReadable]);
}
