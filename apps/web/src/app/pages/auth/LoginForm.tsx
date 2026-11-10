import { useRef, useState, type SyntheticEvent } from 'react';
import { QrCodeIcon } from '@phosphor-icons/react';
import { SignInWithQrModal } from '@/app/features/qrLogin/SignInWithQrModal';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { credentialsAtom } from '@/app/store/atoms';
import { login } from '@/client/initMatrix';
import { getErrorMessage } from '@/util/error';
import { errorCode } from '@/core/client';
import { matrixErrcode } from '@/app/features/auth/matrixError';
import {
  resolveIdpIconUrl,
  isPopupClosed,
  startOAuthPopupLogin,
  startSsoPopupLogin,
  DiscoveryStatus,
  type AuthCapabilities,
} from '@/app/features/sso/sso';
import type { MatrixCredentials } from '@/client/types';
import { Spinner } from '@/app/components/Spinner';
import { Button } from '@/app/components/Button';
import { AuthField } from './AuthField';
import { ServerPicker, type ServerPickerState } from './ServerPicker';
import { interpretIdentifier, toLoginIdentifier } from './signInIdentifier';
import type { Homeserver } from './useHomeserver';
import * as css from './WelcomePage.css';

interface Props {
  onSuccess: () => void;
  onShowRegister: () => void;
  onShowReset: () => void;
  hs: Homeserver;
  picker: ServerPickerState;
  serverUrl: string;
  capabilities: AuthCapabilities | null;
  capabilitiesLoading: boolean;
}

export function LoginForm({
  onSuccess,
  onShowRegister,
  onShowReset,
  hs,
  picker,
  serverUrl,
  capabilities,
  capabilitiesLoading,
}: Props) {
  const { t } = useTranslation();
  const setCredentials = useSetAtom(credentialsAtom);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [idError, setIdError] = useState('');
  const [pwError, setPwError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const oidcMetadata = capabilities?.delegatedAuth ?? false;
  const hasPassword =
    !oidcMetadata &&
    (!capabilities ||
      capabilities.discoveryStatus !== DiscoveryStatus.Ok ||
      capabilities.hasPasswordLogin);
  const ssoProviders = capabilities?.ssoProviders ?? [];
  const hasSso = !oidcMetadata && ssoProviders.length > 0;
  const idps = ssoProviders.flatMap((idp) => (idp.id ? [{ ...idp, id: idp.id }] : []));
  const isChecking = capabilitiesLoading && !capabilities;
  const qrAvailable = oidcMetadata && !!serverUrl && !!capabilities?.qrLogin;

  const identifier = interpretIdentifier(username, hs.serverName);
  const byEmail = identifier?.kind === 'email' || identifier?.kind === 'phone';
  let idHint = '';
  if (identifier?.kind === 'email') idHint = t('welcome.idEmail');
  else if (identifier?.kind === 'phone') idHint = t('welcome.idPhone');
  else if (identifier?.kind === 'mxid') idHint = t('welcome.idPreview', { id: identifier.user });
  else if (identifier?.kind === 'user' && hs.serverName && !identifier.user.includes(':')) {
    idHint = t('welcome.idPreview', { id: `@${identifier.user}:${hs.serverName}` });
  }

  const loginErrorMessage = (err: unknown): string => {
    const code = errorCode(err);
    if (code === 'notMatrix') return t('welcome.errNotAServer');
    if (byEmail) {
      if (code === 'invalidCredentials') {
        return t('welcome.errWrongEmail', { server: hs.host });
      }
      const errcode = matrixErrcode(err);
      if (
        errcode === 'M_INVALID_USERNAME' ||
        errcode === 'M_INVALID_PARAM' ||
        errcode === 'M_UNKNOWN' ||
        errcode === 'M_UNRECOGNIZED'
      ) {
        return t('welcome.errNoEmailLogin');
      }
    }
    return getErrorMessage(err);
  };

  const handleLogin = async (e?: SyntheticEvent) => {
    e?.preventDefault();
    if (loading) return;
    const missingId = !username.trim();
    const missingPw = !password;
    setIdError(missingId ? t('welcome.idRequired') : '');
    setPwError(missingPw ? t('welcome.passwordRequired') : '');
    if (missingId || missingPw || !identifier) {
      (missingId ? idRef : pwRef).current?.focus();
      return;
    }
    if (capabilities?.discoveryStatus === DiscoveryStatus.NotMatrix) {
      setStatus(t('welcome.errNotAServer'));
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const credentials = await login(serverUrl, toLoginIdentifier(identifier), password);
      setCredentials(credentials);
      onSuccess();
    } catch (err) {
      setStatus(loginErrorMessage(err));
      pwRef.current?.select();
    } finally {
      setLoading(false);
    }
  };

  const finishPopupLogin = (signIn: Promise<MatrixCredentials>, done: () => void) => {
    setStatus('');
    signIn.then(
      (credentials) => {
        setCredentials(credentials);
        onSuccess();
      },
      (err) => {
        if (!isPopupClosed(err)) setStatus(getErrorMessage(err));
        done();
      }
    );
  };

  const handleSso = (idpId?: string) =>
    finishPopupLogin(startSsoPopupLogin(serverUrl, idpId), () => {});

  const handleOidc = () => {
    if (!oidcMetadata) return;
    setOidcLoading(true);
    finishPopupLogin(startOAuthPopupLogin(serverUrl), () => setOidcLoading(false));
  };

  const handleForgotPassword = () => {
    if (capabilities?.delegatedAuth && capabilities.accountManagementUri) {
      window.open(capabilities.accountManagementUri, '_blank', 'noopener');
    } else {
      onShowReset();
    }
  };

  const oidcButton = (primary: boolean) => (
    <Button
      fullWidth
      size="lg"
      variant={primary ? 'primary' : 'secondary'}
      className={css.submit}
      onClick={handleOidc}
      loading={oidcLoading}
      spinnerWhileLoading
    >
      {oidcLoading ? t('welcome.redirecting') : t('auth.oidcLogin')}
    </Button>
  );

  const qrButton = qrAvailable ? (
    <Button
      fullWidth
      size="lg"
      variant="secondary"
      className={css.submit}
      onClick={() => setQrOpen(true)}
    >
      <QrCodeIcon size={18} />
      {t('auth.qr.signInTitle')}
    </Button>
  ) : null;

  const ssoButtons =
    idps.length === 0 ? (
      <Button
        fullWidth
        size="lg"
        variant="secondary"
        className={css.submit}
        onClick={() => handleSso()}
      >
        {t('common.continueWithSso')}
      </Button>
    ) : (
      idps.map((idp) => {
        const iconUrl = resolveIdpIconUrl(serverUrl, idp.icon);
        return (
          <Button
            key={idp.id}
            fullWidth
            size="lg"
            variant="secondary"
            className={css.submit}
            onClick={() => handleSso(idp.id)}
          >
            {iconUrl && <img src={iconUrl} alt="" className={css.idpIcon} />}
            {t('welcome.continueWithIdp', { name: idp.name })}
          </Button>
        );
      })
    );

  const browserMethods = oidcMetadata || hasSso;
  const altMethods = (
    <div className={css.altMethods}>
      {oidcMetadata && oidcButton(!hasPassword)}
      {oidcMetadata && qrButton}
      {hasSso && ssoButtons}
    </div>
  );

  const registerLine = (
    <p className={css.altText}>
      {t('welcome.noAccount')}{' '}
      <button type="button" className={css.inlineLink} onClick={onShowRegister}>
        {t('welcome.registerLink')}
      </button>
    </p>
  );

  return (
    <form
      className={css.form}
      onSubmit={handleLogin}
      noValidate
      aria-label={t('welcome.loginTitle')}
    >
      <ServerPicker
        hs={hs}
        label={t('welcome.serverLabelLogin')}
        {...picker}
        onAddressEntered={() => (hasPassword ? idRef.current?.focus() : undefined)}
      />

      {isChecking ? (
        <div className={css.checkingServer}>
          <Spinner size="sm" />
          <span>{t('auth.checkingServer')}</span>
        </div>
      ) : (
        <>
          {hasPassword ? (
            <>
              <AuthField
                ref={idRef}
                label={t('welcome.identifier')}
                name="username"
                type="text"
                inputMode="email"
                autoComplete="username"
                enterKeyHint="next"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setIdError('');
                }}
                hint={idHint}
                error={idError}
              />
              <AuthField
                ref={pwRef}
                label={t('welcome.password')}
                name="password"
                type="password"
                autoComplete="current-password"
                enterKeyHint="go"
                showPasswordToggle
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPwError('');
                }}
                error={pwError}
                hint={
                  <button type="button" className={css.textLink} onClick={handleForgotPassword}>
                    {t('welcome.forgotPassword')}
                  </button>
                }
              />
              <div className={css.formError} role="alert">
                {status}
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
                {loading ? t('welcome.loggingIn') : t('welcome.loginSubmit')}
              </Button>
              {registerLine}
              {browserMethods && (
                <>
                  <div className={css.divider}>{t('common.or')}</div>
                  {altMethods}
                </>
              )}
            </>
          ) : (
            <>
              {browserMethods
                ? altMethods
                : !capabilitiesLoading && <p className={css.note}>{t('auth.noLoginMethod')}</p>}
              <div className={css.formError} role="alert">
                {status}
              </div>
              {registerLine}
            </>
          )}
        </>
      )}

      {qrOpen && (
        <SignInWithQrModal
          serverUrl={serverUrl}
          onClose={() => setQrOpen(false)}
          onSuccess={onSuccess}
        />
      )}
    </form>
  );
}
