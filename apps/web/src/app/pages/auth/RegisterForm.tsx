import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WizardClient } from '@wizardchat/core';
import { loadCore, register } from '@/client/initMatrix';
import { useSetAtom } from 'jotai';
import { credentialsAtom } from '@/app/store/atoms';
import { getErrorMessage, MatrixErrorCode } from '@/util/error';
import { passwordStrength } from '@/util/password';
import { matrixErrcode } from '@/app/features/auth/matrixError';
import {
  resolveIdpIconUrl,
  isPopupClosed,
  startOAuthPopupLogin,
  startSsoPopupLogin,
  RegisterStatus,
  DiscoveryStatus,
  type AuthCapabilities,
} from '@/app/features/sso/sso';
import { Button } from '@/app/components/Button';
import { AuthField } from './AuthField';
import { ServerPicker, type ServerPickerState } from './ServerPicker';
import type { Homeserver } from './useHomeserver';
import * as css from './WelcomePage.css';

const LOCALPART_RE = /^[a-z0-9._=\-/+]+$/;
const USERNAME_CHECK_DELAY_MS = 500;

type UsernameState = 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid';

const STRENGTH_BARS = { weak: 1, okay: 2, strong: 3 } as const;
const STRENGTH_CLASS = {
  weak: css.strengthBarWeak,
  okay: css.strengthBarOkay,
  strong: css.strengthBarStrong,
} as const;

interface Props {
  onSuccess: () => void;
  onShowLogin: () => void;
  hs: Homeserver;
  picker: ServerPickerState;
  serverUrl?: string;
  capabilities?: AuthCapabilities | null;
  capabilitiesLoading?: boolean;
}

export function RegisterForm({
  onSuccess,
  onShowLogin,
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
  const [usernameState, setUsernameState] = useState<UsernameState>('idle');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'error' | 'success'>('error');
  const [loading, setLoading] = useState(false);

  const resolvedServerUrl = serverUrl ?? hs.baseUrl;
  const resolvedCaps =
    capabilities !== undefined ? capabilities : (hs.current ?? (hs.checking ? hs.methods : null));
  const resolvedLoading = capabilitiesLoading !== undefined ? capabilitiesLoading : hs.checking;

  const localpart = username.trim().replace(/^@/, '');
  const strength = password ? passwordStrength(password) : null;
  const passwordTooShort = password.length > 0 && password.length < 8;

  const oidcMetadata = resolvedCaps?.delegatedAuth ?? false;
  const ssoProviders = resolvedCaps?.ssoProviders ?? [];
  const hasSso = !oidcMetadata && ssoProviders.length > 0;
  const idps = ssoProviders.flatMap((idp) => (idp.id ? [{ ...idp, id: idp.id }] : []));

  const registerStatus = resolvedCaps?.registerStatus;
  const hasPasswordRegister = !oidcMetadata && registerStatus === RegisterStatus.Available;
  const isRateLimited = !oidcMetadata && registerStatus === RegisterStatus.RateLimited;
  const discoveryStatus = resolvedCaps?.discoveryStatus;
  const serverUnreachable = discoveryStatus === DiscoveryStatus.Unreachable;
  const wellKnownInvalid = discoveryStatus === DiscoveryStatus.WellKnownInvalid;
  const isChecking = resolvedLoading && !resolvedCaps;

  useEffect(() => {
    if (!localpart || !hasPasswordRegister) {
      setUsernameState('idle');
      return;
    }
    if (!LOCALPART_RE.test(localpart)) {
      setUsernameState('invalid');
      return;
    }
    setUsernameState('checking');
    let cancelled = false;
    const timer = setTimeout(() => {
      loadCore()
        .then(() => WizardClient.usernameAvailable(resolvedServerUrl, localpart))
        .then((available) => {
          if (!cancelled) setUsernameState(available ? 'available' : 'taken');
        })
        .catch(() => {
          if (!cancelled) setUsernameState('idle');
        });
    }, USERNAME_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [localpart, hasPasswordRegister, resolvedServerUrl]);

  const usernameHint =
    usernameState === 'checking'
      ? t('welcome.checkingUsername')
      : usernameState === 'available'
        ? t('welcome.usernameAvailable')
        : '';
  const usernameError =
    usernameState === 'invalid'
      ? t('welcome.usernameInvalid')
      : usernameState === 'taken'
        ? t('welcome.usernameTaken')
        : '';

  const canSubmit =
    localpart &&
    password &&
    !passwordTooShort &&
    (usernameState === 'available' || usernameState === 'idle');

  const registerErrorMessage = (err: unknown): string => {
    const errcode = matrixErrcode(err);
    if (errcode === MatrixErrorCode.USER_IN_USE) return t('welcome.usernameTaken');
    if (errcode === MatrixErrorCode.INVALID_USERNAME) return t('welcome.usernameInvalid');
    if (errcode === MatrixErrorCode.EXCLUSIVE) return t('welcome.usernameReserved');
    return getErrorMessage(err);
  };

  const handleRegister = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setStatus('');
    try {
      const credentials = await register(resolvedServerUrl, localpart, password);
      setCredentials(credentials);
      onSuccess();
    } catch (err) {
      setStatus(t('welcome.registrationFailed', { error: registerErrorMessage(err) }));
      setStatusType('error');
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
        if (!isPopupClosed(err)) {
          setStatus(t('welcome.registrationFailed', { error: getErrorMessage(err) }));
          setStatusType('error');
        }
        done();
      }
    );
  };

  const handleSso = (idpId?: string) =>
    finishPopupLogin(startSsoPopupLogin(resolvedServerUrl, idpId), () => {});

  const handleOidc = () => {
    if (!oidcMetadata) return;
    setLoading(true);
    setStatus('');
    finishPopupLogin(startOAuthPopupLogin(resolvedServerUrl, true), () => setLoading(false));
  };

  return (
    <form
      className={css.form}
      onSubmit={(e) => {
        e.preventDefault();
        void handleRegister();
      }}
      noValidate
      aria-label={t('welcome.registerTitle')}
    >
      <ServerPicker hs={hs} label={t('welcome.serverLabelRegister')} {...picker} />

      {isChecking ? (
        <div className={css.status} aria-busy="true">
          <span className={css.statusMark} aria-hidden>
            <span className={css.spinner} />
          </span>
          <span className={css.statusText}>{t('welcome.checkingServer')}</span>
        </div>
      ) : (
        <>
          {oidcMetadata && (
            <Button
              fullWidth
              size="lg"
              variant="primary"
              className={css.submit}
              onClick={handleOidc}
              disabled={loading}
            >
              {loading ? t('welcome.redirecting') : t('welcome.oidcRegister')}
            </Button>
          )}

          {hasPasswordRegister && (
            <>
              <AuthField
                label={t('welcome.username')}
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                hint={usernameError ? undefined : usernameHint}
                error={usernameError}
                showRequired
              />
              <AuthField
                label={t('welcome.password')}
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                showPasswordToggle
                error={passwordTooShort ? t('welcome.passwordTooShort') : undefined}
                onKeyDown={(e) => e.key === 'Enter' && void handleRegister()}
                showRequired
              />

              {strength && !passwordTooShort && (
                <div className={css.strength} aria-live="polite">
                  <div className={css.strengthBars}>
                    {[1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={
                          i <= STRENGTH_BARS[strength] ? STRENGTH_CLASS[strength] : css.strengthBar
                        }
                      />
                    ))}
                  </div>
                  <span>{t(`welcome.passwordStrength.${strength}`)}</span>
                </div>
              )}

              <div
                className={statusType === 'success' ? css.formSuccess : css.formError}
                role="alert"
              >
                {status}
              </div>

              <Button
                type="submit"
                fullWidth
                size="lg"
                variant="primary"
                className={css.submit}
                disabled={loading || !canSubmit}
                loading={loading}
                spinnerWhileLoading
              >
                {loading ? t('welcome.registering') : t('welcome.registerSubmit')}
              </Button>
            </>
          )}

          {hasSso && (
            <>
              {hasPasswordRegister && <div className={css.divider}>{t('common.or')}</div>}
              <div className={css.altMethods}>
                {idps.length === 0 ? (
                  <Button
                    fullWidth
                    size="lg"
                    variant="secondary"
                    className={css.submit}
                    onClick={() => handleSso()}
                  >
                    {t('welcome.ssoLogin')}
                  </Button>
                ) : (
                  idps.map((idp) => {
                    const iconUrl = resolveIdpIconUrl(resolvedServerUrl, idp.icon);
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
                )}
              </div>
            </>
          )}

          {isRateLimited && (
            <p className={css.statusText}>{t('welcome.registrationRateLimited')}</p>
          )}

          {!resolvedLoading &&
            !hasPasswordRegister &&
            !hasSso &&
            !isRateLimited &&
            !oidcMetadata && (
              <p className={css.statusText}>
                {serverUnreachable && t('welcome.serverUnreachable')}
                {wellKnownInvalid && t('welcome.notMatrixServer')}
                {!serverUnreachable && !wellKnownInvalid && t('welcome.registrationUnavailable')}
              </p>
            )}
        </>
      )}

      <p className={css.altText}>
        {t('welcome.haveAccount')}{' '}
        <button type="button" className={css.inlineLink} onClick={onShowLogin}>
          {t('welcome.login')}
        </button>
      </p>
    </form>
  );
}
