import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSetAtom, useAtom } from 'jotai';
import { credentialsAtom, userIdAtom, serverUploadLimitAtom } from '@/app/store/atoms';
import { readSettings } from '@/client/settingsSync';
import { loadSettingsContents, useApplySettings } from '@/app/hooks/useSettingsSync';
import {
  resume,
  loadCredentials,
  logout,
  getMatrixClientOrNull,
  endSessionForOtherTab,
} from '@/client/initMatrix';
import { tabLockFor, type TabLock, type TabLockState } from '@/client/singleTab';
import { AppLoading, FADE_OUT_MS } from '@/app/components/AppLoading';
import { DataSync } from '@/app/data';
import { fetchServerUploadLimit } from '@/util/serverCapabilities';
import { getErrorMessage } from '@/util/error';
import { SessionError } from './SessionError';
import { OtherTab } from './OtherTab';

interface Props {
  children: ReactNode;
}

type Status = 'pending' | 'syncing' | 'hiding' | 'ready' | 'unauthenticated' | 'error';

export function RequireAuth({ children }: Props) {
  const [credentials] = useAtom(credentialsAtom);
  const setUserId = useSetAtom(userIdAtom);
  const setServerUploadLimit = useSetAtom(serverUploadLimitAtom);
  const applySettings = useApplySettings();

  const creds = credentials ?? loadCredentials();
  const storeLocation = creds?.store.location ?? null;
  const [tabLock, setTabLock] = useState<TabLock | null>(null);
  const [tabState, setTabState] = useState<TabLockState>('pending');
  const [takingOver, setTakingOver] = useState(false);
  /** The restore under way, so a takeover can wait for it before stopping the client. */
  const resumeRef = useRef<Promise<unknown> | null>(null);

  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const onTakenOver = useCallback(async () => {
    // A restore already under way must finish before the client is stopped: it would otherwise
    // make a new client after this tab gave the store up.
    await resumeRef.current?.catch(() => {});
    await endSessionForOtherTab();
  }, []);

  useEffect(() => {
    if (!storeLocation) {
      setTabLock(null);
      return;
    }
    const lock = tabLockFor(storeLocation);
    setTabLock(lock);
    return lock.subscribe({ onState: setTabState, onTakenOver });
  }, [storeLocation, onTakenOver]);

  useEffect(() => {
    if (!creds) {
      setStatus('unauthenticated');
      return;
    }
    // One tab owns the account's store: a second client on it is the same Matrix device twice,
    // and their syncs would split the room keys between them.
    if (tabState !== 'acquired') return;

    let cancelled = false;
    setStatus('pending');
    setError(null);

    const init = async () => {
      try {
        let resolveFirstSync!: () => void;
        const firstSyncPromise = new Promise<void>((res) => {
          resolveFirstSync = res;
        });

        const restoring = resume(creds, () => resolveFirstSync());
        resumeRef.current = restoring;
        const client = await restoring;
        if (cancelled) return;
        // Settings as this device stored them, before the app shows
        applySettings(readSettings(await loadSettingsContents(client)));
        if (cancelled) return;

        setUserId(client.userId() ?? null);

        void fetchServerUploadLimit(client).then((limit) => {
          if (!cancelled) setServerUploadLimit(limit);
        });

        setStatus('syncing');

        await firstSyncPromise;
        if (cancelled) return;

        setStatus('hiding');
        setTimeout(() => {
          if (!cancelled) setStatus('ready');
        }, FADE_OUT_MS);
      } catch (err) {
        console.error('[RequireAuth] Failed to resume session:', err);
        if (!cancelled) {
          setError(getErrorMessage(err));
          setStatus('error');
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, tabState]);

  const useThisTab = useCallback(() => {
    if (!tabLock || takingOver) return;
    setTakingOver(true);
    void tabLock
      .takeOver()
      .then((acquired) => {
        if (!acquired) {
          setTakingOver(false);
          return;
        }
        // A reload starts from the store the other tab has just let go of, and from the current
        // credentials: the account may have been signed out while this tab waited.
        window.location.reload();
      })
      .catch(() => setTakingOver(false));
  }, [tabLock, takingOver]);

  if (!creds) {
    return <Navigate to="/welcome" replace />;
  }

  if (tabState === 'otherTab') {
    return <OtherTab busy={takingOver} onUse={useThisTab} />;
  }

  if (tabState === 'pending' || !tabLock) {
    return <AppLoading />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/welcome" replace />;
  }

  if (status === 'error') {
    return (
      <SessionError
        error={error}
        onRetry={() => setAttempt((a) => a + 1)}
        onSignOut={() => {
          void logout(creds?.userId ?? null);
        }}
      />
    );
  }

  if (status === 'pending') return <AppLoading />;

  const client = getMatrixClientOrNull();
  return (
    <>
      {client && <DataSync client={client} />}
      {children}
      {(status === 'syncing' || status === 'hiding') && <AppLoading hiding={status === 'hiding'} />}
    </>
  );
}
