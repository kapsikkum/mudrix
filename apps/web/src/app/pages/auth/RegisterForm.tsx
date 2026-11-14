import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
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
import { Spinner } from '@/app/components/Spinner';
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
  serverUrl: string;
  capabilities: AuthCapabilities | null;
  capabilitiesLoading: boolean;
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
  const [usernameRequired, setUsernameRequired] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const serverName = hs.serverName;
  const localpart = username.trim().replace(/^@/, '');
  const fullId = localpart && serverName ? `@${localpart}:${serverName}` : '';
  const strength = password ? passwordStrength(password) : null;
  const passwordTooShort = password.length > 0 && password.length < 8;

  const oidcMetadata = capabilities?.delegatedAuth ?? false;
  const ssoProviders = capabilities?.ssoProviders ?? [];
  const hasSso = !oidcMetadata && ssoProviders.length > 0;
  const idps = ssoProviders.flatMap((idp) => (idp.id ? [{ ...idp, id: idp.id }] : []));

  const registerStatus = capabilities?.registerStatus;
  const hasPasswordRegister = !oidcMetadata && registerStatus === RegisterStatus.Available;
  const isRateLimited = !oidcMetadata && registerStatus === RegisterStatus.RateLimited;
  const discoveryStatus = capabilities?.discoveryStatus;
  const serverUnreachable = discoveryStatus === DiscoveryStatus.Unreachable;
  const wellKnownInvalid = discoveryStatus === DiscoveryStatus.WellKnownInvalid;
  const isChecking = capabilitiesLoading && !capabilities;

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
        .then(() => WizardClient.usernameAvailable(serverUrl, localpart))
        .then((available) => {
          if (!cancelled) setUsernameState(available ? 'available' : 'taken');
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const errcode = matrixErrcode(err);
          if (errcode === MatrixErrorCode.USER_IN_USE) setUsernameState('taken');
          else if (errcode === MatrixErrorCode.INVALID_USERNAME) setUsernameState('invalid');
          else if (errcode === MatrixErrorCode.EXCLUSIVE) setUsernameState('reserved');
          else setUsernameState('idle');
        });
    }, USERNAME_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [localpart, serverUrl, hasPasswordRegister]);

  const usernameError =
    usernameState === 'taken'
      ? t('auth.usernameTaken')
      : usernameState === 'reserved'
        ? t('auth.usernameReserved')
        : usernameState === 'invalid'
          ? t('auth.usernameInvalidChars')
          : undefined;
  const usernameHint = !fullId
    ? undefined
    : usernameState === 'available'
      ? t('auth.usernameAvailable', { id: fullId })
      : usernameState === 'checking'
        ? t('auth.usernameChecking', { id: fullId })
        : t('auth.usernameHint', { id: fullId });

  const canSubmit =
    !!localpart &&
    password.length >= 8 &&
    usernameState !== 'taken' &&
    usernameState !== 'reserved' &&
    usernameState !== 'invalid';

  const handleRegister = async (e?: SyntheticEvent) => {
    e?.preventDefault();
    if (loading) return;
    setUsernameRequired(!localpart);
    setPasswordRequired(!password);
    if (!localpart || !password) {
      (localpart ? passwordRef : usernameRef).current?.focus();
      return;
    }
    if (!canSubmit) return;

    setLoading(true);
    setStatus('');

    try {
      const flows = capabilities?.registerFlows ?? [];
      const dummyOnly = (stages: string[]) => stages.length === 1 && stages[0] === 'm.login.dummy';
      if (flows.length > 0 && !flows.some(dummyOnly)) {
        const names = flows.map((stages) => stages.join(' -> ')).join(', ');
        throw new Error(t('auth.additionalVerification', { names: names || 'unknown' }));
      }

      const credentials = await register(serverUrl, localpart, password);
      setCredentials(credentials);
      onSuccess();
    } catch (err) {
      const message = getErrorMessage(err);
      const errcode = matrixErrcode(err);
      if (errcode === MatrixErrorCode.USER_IN_USE) {
        setStatus(t('auth.usernameTaken'));
      } else if (errcode === MatrixErrorCode.INVALID_USERNAME) {
        setStatus(t('auth.invalidUsername'));
      } else if (errcode === MatrixErrorCode.EXCLUSIVE) {
        setStatus(t('auth.usernameReserved'));
      } else if (errcode === MatrixErrorCode.WEAK_PASSWORD) {
        setStatus(t('auth.weakPassword', { error: message }));
      } else {
        setStatus(t('auth.registrationFailed', { error: message }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSso = (idpId?: string) => {
    setStatus('');
    startSsoPopupLogin(serverUrl, idpId).then(
      (credentials) => {
        setCredentials(credentials);
        onSuccess();
      },
      (err) => {
        if (isPopupClosed(err)) return;
        setStatus(t('auth.registrationFailed', { error: getErrorMessage(err) }));
      }
    );
  };

  const handleOidc = () => {
    if (!oidcMetadata) return;
    setLoading(true);
    setStatus('');
    startOAuthPopupLogin(serverUrl, true).then(
      (credentials) => {
        setCredentials(credentials);
        onSuccess();
      },
      (err) => {
        if (!isPopupClosed(err)) {
          setStatus(t('auth.registrationFailed', { error: getErrorMessage(err) }));
        }
        setLoading(false);
      }
    );
  };

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

  const formStatus =
    status ||
    (isRateLimited
      ? t('welcome.registrationRateLimited')
      : !hasPasswordRegister && !hasSso && !oidcMetadata && !capabilitiesLoading
        ? serverUnreachable
          ? t('auth.serverUnreachable')
          : wellKnownInvalid
            ? t('auth.notMatrixServer')
            : t('welcome.registrationUnavailable')
        : '');

  return (
    <form
      className={css.form}
      onSubmit={handleRegister}
      noValidate
      aria-label={t('welcome.registerTitle')}
    >
      <ServerPicker
        hs={hs}
        label={t('welcome.serverLabelRegister')}
        {...picker}
        onAddressEntered={() => usernameRef.current?.focus()}
      />

      {isChecking ? (
        <div className={css.checkingServer}>
          <Spinner size="sm" />
          <span>{t('auth.checkingServer')}</span>
        </div>
      ) : (
        <>
          {oidcMetadata && (
            <>
              <p className={css.note}>{t('welcome.browserSignUpNote', { server: hs.host })}</p>
              <Button
                fullWidth
                size="lg"
                variant="primary"
                className={css.submit}
                onClick={handleOidc}
                loading={loading}
                spinnerWhileLoading
              >
                {loading
                  ? t('welcome.redirecting')
                  : t('welcome.oidcRegisterOn', { server: hs.host })}
              </Button>
            </>
          )}

          {hasPasswordRegister && (
            <>
              <AuthField
                ref={usernameRef}
                label={t('welcome.username')}
                showRequired
                name="username"
                type="text"
                autoComplete="username"
                enterKeyHint="next"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameRequired(false);
                }}
                hint={usernameHint}
                error={usernameRequired ? t('welcome.usernameRequired') : usernameError}
              />
              <AuthField
                ref={passwordRef}
                label={t('welcome.password')}
                showRequired
                name="new-password"
                type="password"
                autoComplete="new-password"
                enterKeyHint="go"
                showPasswordToggle
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordRequired(false);
                }}
                hint={
                  strength && !passwordTooShort ? (
                    <span className={css.strength} aria-live="polite">
                      <span className={css.strengthBars} aria-hidden>
                        {[1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className={
                              i <= STRENGTH_BARS[strength]
                                ? STRENGTH_CLASS[strength]
                                : css.strengthBar
                            }
                          />
                        ))}
                      </span>
                      <span>{t(`welcome.passwordStrength.${strength}`)}</span>
                    </span>
                  ) : undefined
                }
                error={
                  passwordRequired
                    ? t('welcome.passwordRequired')
                    : passwordTooShort
                      ? t('welcome.passwordTooShort')
                      : undefined
                }
              />
              <div className={css.formError} role="alert">
                {formStatus}
              </div>
              <Button
                type="submit"
                fullWidth
                size="lg"
                variant="primary"
                className={css.submit}
                loading={loading}
                spinnerWhileLoading
                disabled={!canSubmit && !!(localpart && password)}
              >
                {loading ? t('welcome.registering') : t('welcome.registerSubmit')}
              </Button>
            </>
          )}

          {!hasPasswordRegister && (
            <div className={css.formError} role="alert">
              {formStatus}
            </div>
          )}

          {hasSso && (
            <>
              {hasPasswordRegister && <div className={css.divider}>{t('common.or')}</div>}
              <div className={css.altMethods}>{ssoButtons}</div>
            </>
          )}
        </>
      )}

      <p className={css.altText}>
        {t('welcome.haveAccount')}{' '}
        <button type="button" className={css.inlineLink} onClick={onShowLogin}>
          {t('welcome.loginLink')}
        </button>
      </p>
    </form>
  );
}
