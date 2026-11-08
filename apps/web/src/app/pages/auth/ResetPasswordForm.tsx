import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/util/error';
import { matrixErrcode } from '@/app/features/auth/matrixError';
import { checkPassword, isPasswordValid } from '@/util/password';
import { generateClientSecret } from '@/util/clientSecret';
import {
  requestPasswordReset,
  completePasswordReset,
  type AuthCapabilities,
} from '@/app/features/sso/sso';
import { Button } from '@/app/components/Button';
import { AuthField } from './AuthField';
import { PasswordChecklist } from './PasswordChecklist';
import { ServerPicker, type ServerPickerState } from './ServerPicker';
import type { Homeserver } from './useHomeserver';
import * as css from './WelcomePage.css';

type ResetStep = 'email' | 'password' | 'done';

interface Props {
  onBackToLogin: () => void;
  hs: Homeserver;
  picker: ServerPickerState;
  serverUrl?: string;
  capabilities?: AuthCapabilities | null;
  capabilitiesLoading?: boolean;
}

export function ResetPasswordForm({
  onBackToLogin,
  hs,
  picker,
  serverUrl,
  capabilities,
  capabilitiesLoading,
}: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<ResetStep>('email');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'error' | 'success'>('error');
  const [loading, setLoading] = useState(false);

  const resolvedServerUrl = serverUrl ?? hs.baseUrl;
  const resolvedCaps =
    capabilities !== undefined ? capabilities : (hs.current ?? (hs.checking ? hs.methods : null));
  const resolvedLoading = capabilitiesLoading !== undefined ? capabilitiesLoading : hs.checking;

  // Persist these during the flow
  const [clientSecret] = useState(generateClientSecret);
  const [sid, setSid] = useState('');

  // Check if this server uses delegated auth (OIDC/MAS)
  const isDelegatedAuth = resolvedCaps?.delegatedAuth && resolvedCaps.accountManagementUri;
  const isChecking = resolvedLoading && !resolvedCaps;

  const handleOpenAccountPortal = () => {
    if (resolvedCaps?.accountManagementUri) {
      window.open(resolvedCaps.accountManagementUri, '_blank', 'noopener');
    }
  };

  const handleRequestReset = async () => {
    if (!email.trim()) {
      setStatus(t('welcome.emailRequired'));
      setStatusType('error');
      return;
    }

    setLoading(true);
    setStatus('');
    try {
      const requestSid = await requestPasswordReset(resolvedServerUrl, email.trim(), clientSecret);
      setSid(requestSid);
      setStep('password');
      setStatus(t('welcome.resetLinkSent'));
      setStatusType('success');
    } catch (err) {
      const isNotSupported = matrixErrcode(err) === 'M_UNRECOGNIZED';
      if (isNotSupported) {
        setStatus(t('welcome.resetNotSupported'));
      } else {
        setStatus(getErrorMessage(err));
      }
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async () => {
    if (!newPassword || !confirmPassword) {
      setStatus(t('welcome.fillAllFields'));
      setStatusType('error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus(t('welcome.passwordsDoNotMatch'));
      setStatusType('error');
      return;
    }
    if (!isPasswordValid(checkPassword(newPassword))) {
      setStatus(t('welcome.passwordTooWeak'));
      setStatusType('error');
      return;
    }

    setLoading(true);
    setStatus('');
    try {
      await completePasswordReset(resolvedServerUrl, sid, clientSecret, newPassword);
      setStep('done');
      setStatus(t('welcome.resetSuccess'));
      setStatusType('success');
    } catch (err) {
      setStatus(getErrorMessage(err));
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className={css.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 'email') void handleRequestReset();
        else if (step === 'password') void handleCompleteReset();
      }}
      noValidate
      aria-label={t('welcome.resetTitle')}
    >
      <ServerPicker hs={hs} label={t('welcome.serverLabelReset')} {...picker} />

      {isChecking ? (
        <div className={css.status} aria-busy="true">
          <span className={css.statusMark} aria-hidden>
            <span className={css.spinner} />
          </span>
          <span className={css.statusText}>{t('welcome.checkingServer')}</span>
        </div>
      ) : (
        <>
          {isDelegatedAuth ? (
            <>
              <p className={css.note}>{t('welcome.resetDelegatedInfo')}</p>
              <Button
                fullWidth
                size="lg"
                variant="primary"
                className={css.submit}
                onClick={handleOpenAccountPortal}
              >
                {t('welcome.resetOpenAccountPortal')}
              </Button>
            </>
          ) : (
            <>
              {step === 'email' && (
                <>
                  <p className={css.note}>{t('welcome.resetEmailPrompt')}</p>
                  <AuthField
                    label="Email"
                    type="email"
                    placeholder={t('welcome.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    onKeyDown={(e) => e.key === 'Enter' && void handleRequestReset()}
                    showRequired
                  />
                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    variant="primary"
                    className={css.submit}
                    disabled={loading}
                    loading={loading}
                    spinnerWhileLoading
                  >
                    {loading ? t('welcome.sending') : t('welcome.resetSendCode')}
                  </Button>
                </>
              )}

              {step === 'password' && (
                <>
                  <p className={css.note}>{t('welcome.resetCheckEmail')}</p>
                  <AuthField
                    label={t('welcome.password')}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    showPasswordToggle
                    disabled={loading}
                    showRequired
                  />
                  <AuthField
                    label={t('welcome.confirmPassword')}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    showPasswordToggle
                    disabled={loading}
                    onKeyDown={(e) => e.key === 'Enter' && void handleCompleteReset()}
                    showRequired
                  />

                  <PasswordChecklist password={newPassword} />

                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    variant="primary"
                    className={css.submit}
                    disabled={loading}
                    loading={loading}
                    spinnerWhileLoading
                  >
                    {loading ? t('welcome.resetting') : t('welcome.resetComplete')}
                  </Button>
                </>
              )}

              {step === 'done' && (
                <>
                  <p className={css.formSuccess}>{t('welcome.resetSuccess')}</p>
                  <Button
                    type="button"
                    fullWidth
                    size="lg"
                    variant="primary"
                    className={css.submit}
                    onClick={onBackToLogin}
                  >
                    {t('welcome.backToLogin')}
                  </Button>
                </>
              )}
            </>
          )}

          {status && (
            <div
              className={statusType === 'success' ? css.formSuccess : css.formError}
              role="alert"
            >
              {status}
            </div>
          )}

          {!loading && step !== 'done' && (
            <p className={css.altText}>
              <button type="button" className={css.inlineLink} onClick={onBackToLogin}>
                {t('welcome.backToLogin')}
              </button>
            </p>
          )}
        </>
      )}
    </form>
  );
}
