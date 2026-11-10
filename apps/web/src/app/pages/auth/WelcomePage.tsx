import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftIcon, GlobeSimpleIcon } from '@phosphor-icons/react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { initialHomeserver, rememberHomeserver, useHomeserver } from './useHomeserver';
import { LogoHover } from '@/app/components/AppLoading';
import { Select } from '@/app/components/Select';
import { TitleBar } from '@/app/components/TitleBar';
import { isDesktop } from '@/bridge/desktop';
import { loadCredentials, loadCore } from '@/client/initMatrix';
import { languageAtom } from '@/app/store/atoms';
import { SUPPORTED_LANGUAGES } from '@/i18n/languages';
import { SOURCE_URL } from '@/const/links';
import * as css from './WelcomePage.css';

type View = 'login' | 'register' | 'reset';

export function WelcomePage() {
  const [searchParams] = useSearchParams();
  const addMode = searchParams.get('add') === '1';
  const signedIn = !!loadCredentials();

  if (!addMode && signedIn) {
    return <Navigate to="/" replace />;
  }

  return <WelcomeContent canGoBack={addMode && signedIn} />;
}

function WelcomeContent({ canGoBack }: { canGoBack: boolean }) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<View>('login');
  const navigate = useNavigate();
  const setLanguage = useSetAtom(languageAtom);
  const { homeserver } = useParams<{ homeserver?: string }>();

  const handleLanguageChange = useCallback(
    (code: string) => {
      if (code === i18n.language) return;
      i18n.changeLanguage(code);
      setLanguage(code);
    },
    [i18n, setLanguage]
  );

  useEffect(() => {
    void loadCore();
  }, []);

  const [version, setVersion] = useState(import.meta.env.APP_VERSION ?? 'unknown');

  useEffect(() => {
    window.desktopAPI?.getAppVersion?.().then((v) => v && setVersion(v));
  }, []);

  // A configured server (`/welcome/:homeserver`) wins over the last one used and the default.
  const [initial] = useState(() => initialHomeserver(homeserver));
  const hs = useHomeserver(initial);
  const [serverOpen, setServerOpen] = useState(false);
  const picker = { open: serverOpen, onOpenChange: setServerOpen };

  // The sign-in methods follow the last server that answered while a new address is checked, so
  // the form does not rearrange itself for every half-typed address.
  const capabilities = hs.current ?? (hs.checking ? hs.methods : null);
  const capabilitiesLoading = hs.complete && !hs.current && !hs.methods;
  // Always the address in the box, never the stale server's: that is where the password goes.
  const effectiveServerUrl = hs.baseUrl;

  const goBack = () => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  const done = () => {
    rememberHomeserver(hs.url);
    navigate('/', { replace: true });
  };

  return (
    <div className={css.page}>
      {isDesktop && <TitleBar fixed />}
      {canGoBack && (
        <button type="button" className={css.backButton} onClick={goBack}>
          <ArrowLeftIcon size={16} />
          {t('common.back')}
        </button>
      )}
      <div className={css.container}>
        <LogoHover size={72} />
        <h1 className={css.title}>{t('auth.title')}</h1>
        <p className={css.tagline}>{t('auth.tagline')}</p>

        {view === 'login' ? (
          <LoginForm
            onSuccess={done}
            onShowRegister={() => setView('register')}
            onShowReset={() => setView('reset')}
            hs={hs}
            picker={picker}
            serverUrl={effectiveServerUrl}
            capabilities={capabilities}
            capabilitiesLoading={capabilitiesLoading}
          />
        ) : view === 'register' ? (
          <RegisterForm
            onSuccess={done}
            onShowLogin={() => setView('login')}
            hs={hs}
            picker={picker}
            serverUrl={effectiveServerUrl}
            capabilities={capabilities}
            capabilitiesLoading={capabilitiesLoading}
          />
        ) : (
          <ResetPasswordForm
            onBackToLogin={() => setView('login')}
            hs={hs}
            picker={picker}
            serverUrl={effectiveServerUrl}
            capabilities={capabilities}
            capabilitiesLoading={capabilitiesLoading}
          />
        )}

        <Select
          icon={<GlobeSimpleIcon size={16} weight="regular" />}
          aria-label={t('settings.language.languageDisplay')}
          value={i18n.language}
          options={SUPPORTED_LANGUAGES.map(({ code, labelKey }) => ({
            value: code,
            label: t(labelKey),
          }))}
          onChange={handleLanguageChange}
        />
      </div>
      <footer className={css.footer}>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className={css.footerLink}>
          {t('auth.sourceCode')}
        </a>
        <a
          href={`${SOURCE_URL}/releases/tag/v${version}`}
          target="_blank"
          rel="noopener noreferrer"
          className={css.footerLink}
        >
          v{version}
        </a>
        <a
          href="https://matrix.org"
          target="_blank"
          rel="noopener noreferrer"
          className={css.footerLink}
        >
          {t('auth.poweredByMatrix')}
        </a>
      </footer>
    </div>
  );
}
