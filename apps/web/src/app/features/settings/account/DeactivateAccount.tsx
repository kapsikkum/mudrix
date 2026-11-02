import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMatrixClientOrNull, logout } from '@/client/initMatrix';
import { errorCode } from '@/core/client';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import { Button } from '@/app/components/Button';
import { ToggleRow } from '@/app/components/Toggle/Toggle';
import type { UiaOutcome } from '@wizardchat/core';
import {
  UiaPanel,
  confirmWithSso,
  isSsoCancelled,
  offersPassword,
  offersSso,
  passwordAuth,
  uiaChallenge,
  type UiaChallenge,
} from '../sessions/UiaPanel';
import * as css from '../Settings.css';

export function DeactivateAccount() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const confirm = useConfirm();

  const [expanded, setExpanded] = useState(false);
  const [erase, setErase] = useState(false);
  const [challenge, setChallenge] = useState<UiaChallenge | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!client) return null;

  const finish = async (outcome: UiaOutcome) => {
    if (outcome.status === 'authRequired') {
      const next = uiaChallenge(outcome);
      if (!offersPassword(next.flows) && !offersSso(next.flows)) {
        setChallenge(null);
        setError(t('settings.account.authMethodUnsupported'));
        return;
      }
      setChallenge(next);
      return;
    }
    toast.success(t('settings.account.accountDeactivated'));
    await logout();
  };

  const handleDeactivate = async () => {
    const ok = await confirm({
      title: t('settings.account.deactivateAccount'),
      message: t('settings.account.deactivateConfirm'),
      danger: true,
      confirmLabel: t('settings.account.deactivateAccount'),
    });
    if (!ok) return;

    setError('');
    setSubmitting(true);
    try {
      await finish(await client.deactivateAccountWithAuth(erase, null));
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUiaSubmit = async (pw: string) => {
    if (!challenge) return;
    setSubmitting(true);
    try {
      await finish(await client.deactivateAccountWithAuth(erase, passwordAuth(challenge, pw)));
    } catch (err: unknown) {
      if (errorCode(err) === 'invalidCredentials') throw err;
      setChallenge(null);
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSso = async () => {
    if (!challenge) return;
    setSubmitting(true);
    try {
      await finish(await client.deactivateAccountWithAuth(erase, await confirmWithSso(challenge)));
    } catch (err: unknown) {
      setChallenge(null);
      setError(isSsoCancelled(err) ? t('settings.sessions.ssoCancelled') : getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (challenge) {
    return (
      <UiaPanel
        challenge={challenge}
        onSubmitPassword={handleUiaSubmit}
        onSso={handleSso}
        onCancel={() => setChallenge(null)}
        submitting={submitting}
        description={t('settings.account.uiaPasswordDesc')}
        submitLabel={t('settings.account.deactivateAccount')}
      />
    );
  }

  if (!expanded) {
    return (
      <Button variant="danger" onClick={() => setExpanded(true)}>
        {t('settings.account.deactivateAccount')}
      </Button>
    );
  }

  return (
    <div className={css.fieldGroup}>
      <ToggleRow
        label={t('settings.account.eraseData')}
        checked={erase}
        onChange={setErase}
        disabled={submitting}
      />
      {error && <p className={css.warningBox}>{error}</p>}
      <div className={css.actions}>
        <Button variant="danger" loading={submitting} onClick={handleDeactivate}>
          {t('settings.account.deactivateAccount')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setExpanded(false);
            setErase(false);
            setError('');
          }}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
