import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeftIcon, GlobeSimpleIcon } from '@phosphor-icons/react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { initialHomeserver, rememberHomeserver, useHomeserver } from './useHomeserver';
import { LogoHover } from '@/app/components/AppLoading';
import { Button } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { TitleBar } from '@/app/components/TitleBar';
import { isDesktop } from '@/bridge/desktop';
import { loadCredentials, loadCore } from '@/client/initMatrix';
import { languageAtom } from '@/app/store/atoms';
import { SUPPORTED_LANGUAGES } from '@/i18n/languages';
import * as css from './WelcomePage.css';

type View = 'login' | 'register' | 'reset';

const TITLES: Record<View, [string, string]> = {
  login: ['welcome.title', 'welcome.tagline'],
  register: ['welcome.registerTitle', 'welcome.registerSubtitle'],
  reset: ['welcome.resetTitle', 'welcome.resetSubtitle'],
};

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
  const [view, setViewState] = useState<View>('login');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const switched = useRef(false);
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

  // After switching between sign in / sign up / reset, put focus (and the screen reader) on
  // the new heading, as a page change would.
  useEffect(() => {
    if (switched.current) titleRef.current?.focus({ preventScroll: false });
  }, [view]);

  const setView = (next: View) => {
    switched.current = true;
    setViewState(next);
  };
  const [titleKey, subtitleKey] = TITLES[view];

  const goBack = () => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  const done = () => {
    rememberHomeserver(hs.url);
    navigate('/', { replace: true });
  };

  const form = {
    hs,
    picker,
    serverUrl: effectiveServerUrl,
    capabilities,
    capabilitiesLoading,
  };

  return (
    <div className={css.page}>
      {isDesktop && <TitleBar fixed />}
      <div className={css.column}>
        {canGoBack && (
          <Button variant="ghost" size="sm" className={css.back} onClick={goBack}>
            <ArrowLeftIcon size={14} aria-hidden />
            {t('common.back')}
          </Button>
        )}
        <main className={css.card}>
          <header className={css.header}>
            <LogoHover size={64} />
            <h1 ref={titleRef} tabIndex={-1} className={css.title}>
              {t(titleKey)}
            </h1>
            <p className={css.subtitle}>{t(subtitleKey)}</p>
          </header>

          <div key={view} className={css.view}>
            {view === 'login' ? (
              <LoginForm
                {...form}
                onSuccess={done}
                onShowRegister={() => setView('register')}
                onShowReset={() => setView('reset')}
              />
            ) : view === 'register' ? (
              <RegisterForm {...form} onSuccess={done} onShowLogin={() => setView('login')} />
            ) : (
              <ResetPasswordForm {...form} onBackToLogin={() => setView('login')} />
            )}
          </div>
        </main>

        <footer className={css.footer}>
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
          <span>v{version}</span>
        </footer>
      </div>
    </div>
  );
}
