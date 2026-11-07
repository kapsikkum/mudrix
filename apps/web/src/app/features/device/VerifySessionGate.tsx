import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { DevicesIcon, KeyIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { sessionVerificationAtom, verifySkippedDeviceAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull, logout } from '@/client/initMatrix';
import { Button } from '@/app/components/Button';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useSessionVerificationActions } from './useSessionVerificationActions';
import * as css from './VerifySessionGate.css';

export function VerifySessionGate() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const state = useAtomValue(sessionVerificationAtom);
  const [skippedDevice, setSkippedDevice] = useAtom(verifySkippedDeviceAtom);
  const confirm = useConfirm();
  const { busy, verifyWithOtherDevice, verifyWithRecoveryKey, resetIdentity, recovery } =
    useSessionVerificationActions(client);
  const setupLoading = recovery.loading;

  const deviceId = client?.session().deviceId ?? null;
  const needsGate = state.status === 'unverified' || state.status === 'no-identity';
  if (!client || !needsGate || (deviceId && skippedDevice === deviceId)) return null;

  const skip = async () => {
    const ok = await confirm({
      title: t('verification.session.skipConfirmTitle'),
      message: t('verification.session.skipConfirmBody'),
      confirmLabel: t('verification.session.skipConfirm'),
      danger: true,
      cancelPrimary: true,
    });
    if (ok && deviceId) setSkippedDevice(deviceId);
  };

  const noIdentity = state.status === 'no-identity';
  const cannotVerify = !noIdentity && !state.hasOtherVerifiedSession && !state.hasRecoveryKey;

  return (
    <div
      className={css.page}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-session-title"
    >
      <div className={css.card}>
        <span className={css.iconCircle}>
          <ShieldCheckIcon size={32} weight="fill" />
        </span>
        <h1 id="verify-session-title" className={css.title}>
          {noIdentity ? t('verification.session.setupTitle') : t('verification.session.title')}
        </h1>
        <p className={css.body}>
          {noIdentity
            ? t('verification.session.setupBody')
            : cannotVerify
              ? t('verification.session.noWayToVerify')
              : t('verification.session.body')}
        </p>

        <div className={css.actions}>
          {noIdentity ? (
            <Button variant="primary" size="lg" loading={setupLoading} onClick={resetIdentity}>
              {t('verification.session.setupButton')}
            </Button>
          ) : cannotVerify ? (
            <Button variant="primary" size="lg" loading={setupLoading} onClick={resetIdentity}>
              {t('verification.session.resetAndSetUp')}
            </Button>
          ) : (
            <>
              {state.hasOtherVerifiedSession && (
                <Button
                  variant="primary"
                  size="lg"
                  loading={busy === 'device'}
                  disabled={busy !== null}
                  onClick={verifyWithOtherDevice}
                >
                  <DevicesIcon size={18} />
                  {t('verification.session.useOtherDevice')}
                </Button>
              )}
              {state.hasRecoveryKey && (
                <Button
                  variant={state.hasOtherVerifiedSession ? 'secondary' : 'primary'}
                  size="lg"
                  loading={busy === 'key'}
                  disabled={busy !== null}
                  onClick={verifyWithRecoveryKey}
                >
                  <KeyIcon size={18} />
                  {t('verification.session.useRecoveryKey')}
                </Button>
              )}
              <button
                type="button"
                className={css.resetLink}
                disabled={busy !== null || setupLoading}
                onClick={resetIdentity}
              >
                {t('verification.session.reset')}
              </button>
            </>
          )}
        </div>

        <div className={css.footer}>
          <button type="button" className={css.footerLink} onClick={skip}>
            {t('verification.session.skip')}
          </button>
          <span aria-hidden>·</span>
          <button type="button" className={css.footerLink} onClick={() => void logout()}>
            {t('settings.account.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
