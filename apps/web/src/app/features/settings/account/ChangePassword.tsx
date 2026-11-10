import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { errorCode } from '@/core/client';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Input } from '@/app/components/Input';
import { Button } from '@/app/components/Button';
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

export function ChangePassword() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [challenge, setChallenge] = useState<UiaChallenge | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!client) return null;

  const finish = (outcome: UiaOutcome) => {
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
    toast.success(t('settings.account.passwordChanged'));
    setChallenge(null);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError(t('settings.account.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('common.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      finish(await client.changePasswordWithAuth(newPassword, null));
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUiaSubmit = async (password: string) => {
    if (!challenge) return;
    setSubmitting(true);
    try {
      finish(await client.changePasswordWithAuth(newPassword, passwordAuth(challenge, password)));
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
      finish(await client.changePasswordWithAuth(newPassword, await confirmWithSso(challenge)));
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
        submitLabel={t('settings.account.changePassword')}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className={css.fieldGroup}>
      <Input
        label={t('settings.account.newPassword')}
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className={css.inputFull}
        autoComplete="new-password"
        disabled={submitting}
      />
      <Input
        label={t('settings.account.confirmNewPassword')}
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className={css.inputFull}
        autoComplete="new-password"
        disabled={submitting}
      />
      {error && <p className={css.warningBox}>{error}</p>}
      <Button type="submit" variant="primary" loading={submitting}>
        {t('settings.account.changePassword')}
      </Button>
    </form>
  );
}
