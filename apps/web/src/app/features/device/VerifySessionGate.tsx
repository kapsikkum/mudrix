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
      title: t('verifySession.skipConfirmTitle'),
      message: t('verifySession.skipConfirmBody'),
      confirmLabel: t('verifySession.skipConfirm'),
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
          {noIdentity ? t('verifySession.setupTitle') : t('verifySession.title')}
        </h1>
        <p className={css.body}>
          {noIdentity
            ? t('verifySession.setupBody')
            : cannotVerify
              ? t('verifySession.noWayToVerify')
              : t('verifySession.body')}
        </p>

        <div className={css.actions}>
          {noIdentity ? (
            <Button variant="primary" size="lg" loading={setupLoading} onClick={resetIdentity}>
              {t('verifySession.setupButton')}
            </Button>
          ) : cannotVerify ? (
            <Button variant="primary" size="lg" loading={setupLoading} onClick={resetIdentity}>
              {t('verifySession.resetAndSetUp')}
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
                  {t('verifySession.useOtherDevice')}
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
                  {t('verifySession.useRecoveryKey')}
                </Button>
              )}
              <button
                type="button"
                className={css.resetLink}
                disabled={busy !== null || setupLoading}
                onClick={resetIdentity}
              >
                {t('verifySession.reset')}
              </button>
            </>
          )}
        </div>

        <div className={css.footer}>
          <button type="button" className={css.footerLink} onClick={skip}>
            {t('verifySession.skip')}
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
