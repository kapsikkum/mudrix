import { useState } from 'react';
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
import { SpinnerOverlay, Spinner } from '@/app/components/Spinner';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
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
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

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
  const idHint =
    identifier?.kind === 'email'
      ? t('welcome.idEmail')
      : identifier?.kind === 'phone'
        ? t('welcome.idPhone')
        : '';

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

  const handleLogin = async () => {
    if (!identifier || !password) {
      setStatus(t('welcome.fillAllFields'));
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

  return (
    <div className={css.formSection}>
      <h2 className={css.formTitle}>{t('welcome.login')}</h2>

      <ServerPicker hs={hs} label={t('welcome.serverLabelLogin')} {...picker} />

      {isChecking ? (
        <div className={css.checkingServer}>
          <Spinner size="sm" />
          <span>{t('welcome.checkingServer')}</span>
        </div>
      ) : (
        <>
          {oidcMetadata && (
            <Button
              fullWidth
              size="lg"
              variant="primary"
              onClick={handleOidc}
              disabled={oidcLoading}
            >
              {oidcLoading ? t('welcome.redirecting') : t('welcome.oidcLogin')}
            </Button>
          )}

          {oidcMetadata && qrAvailable && (
            <Button fullWidth size="lg" variant="secondary" onClick={() => setQrOpen(true)}>
              <QrCodeIcon size={18} />
              {t('qrLogin.signInTitle')}
            </Button>
          )}
          {qrOpen && (
            <SignInWithQrModal
              serverUrl={serverUrl}
              onClose={() => setQrOpen(false)}
              onSuccess={onSuccess}
            />
          )}

          {hasPassword && (
            <>
              <Input
                type="text"
                placeholder={t('welcome.username')}
                aria-label={t('welcome.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
              {idHint && <p className={css.switchText}>{idHint}</p>}
              <Input
                type="password"
                placeholder={t('welcome.password')}
                aria-label={t('welcome.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                showPasswordToggle
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />

              <p className={css.switchText}>
                <button type="button" className={css.switchLink} onClick={handleForgotPassword}>
                  {t('welcome.forgotPassword')}
                </button>
              </p>

              <Button
                fullWidth
                size="lg"
                variant="primary"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? t('welcome.loggingIn') : t('welcome.login')}
              </Button>
            </>
          )}

          {hasSso && (
            <>
              {hasPassword && <div className={css.divider}>{t('common.or')}</div>}
              {idps.length === 0 ? (
                <Button fullWidth size="lg" variant="secondary" onClick={() => handleSso()}>
                  {t('welcome.ssoLogin')}
                </Button>
              ) : (
                idps.map((idp) => {
                  const iconUrl = resolveIdpIconUrl(serverUrl, idp.icon);
                  return (
                    <Button
                      key={idp.id}
                      fullWidth
                      variant="secondary"
                      onClick={() => handleSso(idp.id)}
                    >
                      {iconUrl && <img src={iconUrl} alt="" className={css.idpIcon} />}
                      {t('welcome.continueWithIdp', { name: idp.name })}
                    </Button>
                  );
                })
              )}
            </>
          )}

          {!capabilitiesLoading && !hasPassword && !hasSso && !oidcMetadata && (
            <p className={css.statusText}>{t('welcome.noLoginMethod')}</p>
          )}
        </>
      )}

      {status && <p className={css.statusText}>{status}</p>}

      <p className={css.switchText}>
        {t('welcome.noAccount')}{' '}
        <button type="button" className={css.switchLink} onClick={onShowRegister}>
          {t('welcome.register')}
        </button>
      </p>

      {loading && <SpinnerOverlay />}
    </div>
  );
}
