import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { LogoLoader } from '@/app/components/AppLoading/LogoLoader';
import { Button } from '@/app/components/Button';
import { getActiveAccountId } from '@/client/accounts';
import { endSessionForOtherTab } from '@/client/initMatrix';
import * as css from './AccountSwitchGuard.css';

const RELOAD_DELAY_MS = 3000;
const ACCOUNTS_KEY = 'wizardchat.accounts';

function localpart(userId: string): string {
  return userId.replace(/^@/, '').split(':')[0];
}

interface Props {
  client: WizardClient | null;
}

export function AccountSwitchGuard({ client }: Props) {
  const { t } = useTranslation();
  const [conflictId, setConflictId] = useState<string | null | undefined>(() => {
    if (!client) return undefined;
    const myId = client.userId();
    if (!myId) return undefined;
    const activeId = getActiveAccountId();
    return activeId === myId ? undefined : activeId;
  });

  useEffect(() => {
    if (!client) return;
    const myId = client.userId();
    if (!myId) return;

    const handler = (e: StorageEvent) => {
      if (e.key !== ACCOUNTS_KEY) return;
      let active: string | null = null;
      try {
        active = (JSON.parse(e.newValue ?? '{}') as { active?: string | null }).active ?? null;
      } catch {
        // unreadable: treat as signed out
      }
      if (active === myId) return;
      setConflictId(active);
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [client]);

  const hasConflict = conflictId !== undefined;

  useEffect(() => {
    if (!hasConflict) return;
    void endSessionForOtherTab();
    const timer = setTimeout(() => {
      window.location.replace('/');
    }, RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasConflict]);

  if (!hasConflict) return null;

  const accountLabel = conflictId ? localpart(conflictId) : null;

  return (
    <div className={css.overlay} role="alertdialog" aria-modal="true">
      <LogoLoader />
      <div className={css.box}>
        <h2 className={css.heading}>
          {accountLabel ? t('auth.accountSwitchedTitle') : t('auth.signedOutElsewhereTitle')}
        </h2>
        <p className={css.message}>
          {accountLabel
            ? t('auth.accountSwitchedMessage', { account: accountLabel })
            : t('auth.signedOutElsewhereMessage')}
        </p>
        <Button variant="primary" onClick={() => window.location.replace('/')}>
          {t('auth.reloadNow')}
        </Button>
      </div>
    </div>
  );
}
