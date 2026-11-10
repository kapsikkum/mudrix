import { useRef, useState, type SyntheticEvent } from 'react';
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
import { Spinner } from '@/app/components/Spinner';
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
  serverUrl: string;
  capabilities: AuthCapabilities | null;
  capabilitiesLoading: boolean;
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
  const [errors, setErrors] = useState<Partial<Record<'email' | 'password' | 'confirm', string>>>(
    {}
  );
  const [formError, setFormError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Persist these during flow
  const [clientSecret] = useState(generateClientSecret);
  const [sid, setSid] = useState('');

  // Check if server uses delegated auth (OIDC/MAS)
  const isDelegatedAuth = capabilities?.delegatedAuth && capabilities.accountManagementUri;
  const isChecking = capabilitiesLoading && !capabilities;

  const handleOpenAccountPortal = () => {
    if (capabilities?.accountManagementUri) {
      window.open(capabilities.accountManagementUri, '_blank', 'noopener');
    }
  };

  const handleRequestReset = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email.trim()) {
      setErrors({ email: t('welcome.emailRequired') });
      emailRef.current?.focus();
      return;
    }

    setLoading(true);
    setFormError('');
    try {
      const requestSid = await requestPasswordReset(serverUrl, email.trim(), clientSecret);
      setSid(requestSid);
      setStep('password');
      setInfo(t('welcome.resetLinkSent', { email: email.trim() }));
    } catch (err) {
      // Check for 404/M_UNRECOGNIZED (password reset not supported)
      if (matrixErrcode(err) === 'M_UNRECOGNIZED') {
        setFormError(t('welcome.resetNotSupported'));
      } else if (matrixErrcode(err) === 'M_THREEPID_NOT_FOUND') {
        setErrors({ email: t('welcome.resetEmailUnknown', { server: hs.host }) });
        emailRef.current?.focus();
      } else {
        setFormError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (loading) return;
    const next: typeof errors = {};
    if (!newPassword) next.password = t('welcome.passwordRequired');
    else if (!isPasswordValid(checkPassword(newPassword))) {
      next.password = t('welcome.passwordTooWeak');
    }
    if (newPassword && confirmPassword !== newPassword) {
      next.confirm = t('welcome.passwordMismatch');
    }
    setErrors(next);
    if (next.password || next.confirm) {
      (next.password ? pwRef : confirmRef).current?.focus();
      return;
    }

    setLoading(true);
    setFormError('');
    try {
      await completePasswordReset(serverUrl, sid, clientSecret, newPassword);
      setStep('done');
      setInfo('');
    } catch (err) {
      // Check common password reset errors
      if (matrixErrcode(err) === 'M_UNAUTHORIZED') {
        setFormError(t('welcome.resetClickLinkFirst'));
      } else {
        setFormError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const serverPicker = (
    <ServerPicker
      hs={hs}
      label={t('welcome.serverLabelReset')}
      open={picker.open && step === 'email'}
      onOpenChange={picker.onOpenChange}
      onAddressEntered={() => emailRef.current?.focus()}
      disabled={step !== 'email'}
    />
  );

  const backLink = (
    <p className={css.altText}>
      <button type="button" className={css.inlineLink} onClick={onBackToLogin}>
        {t('welcome.backToLogin')}
      </button>
    </p>
  );

  if (isChecking) {
    return (
      <div className={css.form}>
        {serverPicker}
        <div className={css.checkingServer}>
          <Spinner size="sm" />
          <span>{t('auth.checkingServer')}</span>
        </div>
      </div>
    );
  }

  if (isDelegatedAuth && step === 'email') {
    return (
      <div className={css.form}>
        {serverPicker}
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
        {backLink}
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className={css.form}>
        <p className={css.formSuccess} role="status">
          {t('welcome.resetSuccess')}
        </p>
        <Button
          fullWidth
          size="lg"
          variant="primary"
          className={css.submit}
          onClick={onBackToLogin}
        >
          {t('welcome.backToLogin')}
        </Button>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <form
        className={css.form}
        onSubmit={handleCompleteReset}
        noValidate
        aria-label={t('welcome.resetTitle')}
      >
        {serverPicker}
        <p className={css.note} role="status">
          {info}
        </p>
        <AuthField
          ref={pwRef}
          label={t('welcome.newPassword')}
          showRequired
          name="new-password"
          type="password"
          autoComplete="new-password"
          showPasswordToggle
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setErrors((p) => ({ ...p, password: undefined }));
          }}
          error={errors.password}
        />
        <PasswordChecklist password={newPassword} />
        <AuthField
          ref={confirmRef}
          label={t('welcome.confirmPassword')}
          showRequired
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          enterKeyHint="go"
          showPasswordToggle
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setErrors((p) => ({ ...p, confirm: undefined }));
          }}
          error={errors.confirm}
        />
        <div className={css.formError} role="alert">
          {formError}
        </div>
        <Button
          type="submit"
          fullWidth
          size="lg"
          variant="primary"
          className={css.submit}
          loading={loading}
          spinnerWhileLoading
        >
          {loading ? t('welcome.resetting') : t('welcome.resetComplete')}
        </Button>
        {backLink}
      </form>
    );
  }

  return (
    <form
      className={css.form}
      onSubmit={handleRequestReset}
      noValidate
      aria-label={t('welcome.resetTitle')}
    >
      {serverPicker}
      <p className={css.note}>{t('welcome.resetEmailPrompt')}</p>
      <AuthField
        ref={emailRef}
        label={t('welcome.email')}
        showRequired
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        enterKeyHint="send"
        placeholder={t('welcome.emailPlaceholder')}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setErrors({});
        }}
        error={errors.email}
      />
      <div className={css.formError} role="alert">
        {formError}
      </div>
      <Button
        type="submit"
        fullWidth
        size="lg"
        variant="primary"
        className={css.submit}
        loading={loading}
        spinnerWhileLoading
      >
        {loading ? t('welcome.sending') : t('welcome.resetSendCode')}
      </Button>
      {backLink}
    </form>
  );
}
