import { useState, useEffect, useCallback, useRef } from 'react';
import { GlobeSimpleIcon } from '@phosphor-icons/react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { PRESET_SERVERS } from '@/app/features/sso/presetServers';
import {
  discoverAuthCapabilities,
  DiscoveryStatus,
  type AuthCapabilities,
} from '@/app/features/sso/sso';
import { LogoHover } from '@/app/components/AppLoading';
import { Select } from '@/app/components/Select';
import { TitleBar } from '@/app/components/TitleBar';
import { isDesktop } from '@/bridge/desktop';
import { loadCredentials, loadCore, normalizeUrl } from '@/client/initMatrix';
import { languageAtom } from '@/app/store/atoms';
import { SUPPORTED_LANGUAGES } from '@/i18n/languages';
import * as css from './WelcomePage.css';

type View = 'login' | 'register' | 'reset';

export function WelcomePage() {
  const [searchParams] = useSearchParams();
  const addMode = searchParams.get('add') === '1';

  if (!addMode && loadCredentials()) {
    return <Navigate to="/" replace />;
  }

  return <WelcomeContent />;
}

function WelcomeContent() {
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

  const [serverSelect, setServerSelect] = useState(homeserver ? 'custom' : PRESET_SERVERS[0].value);
  const [customUrl, setCustomUrl] = useState(homeserver ?? '');
  const [version, setVersion] = useState(import.meta.env.APP_VERSION ?? 'unknown');

  useEffect(() => {
    window.desktopAPI?.getAppVersion?.().then((v) => v && setVersion(v));
  }, []);

  const rawServerUrl = serverSelect === 'custom' ? customUrl : serverSelect;
  const serverUrl = normalizeUrl(rawServerUrl);

  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
  const discoverSeq = useRef(0);
  // Address whose last check failed: only then does leaving the field retry
  const failedUrlRef = useRef<string | null>(null);

  const discover = useCallback(async (url: string) => {
    const seq = ++discoverSeq.current;
    if (!url) {
      setCapabilities(null);
      setCapabilitiesLoading(false);
      return;
    }
    setCapabilitiesLoading(true);
    setCapabilities(null);
    try {
      const caps = await discoverAuthCapabilities(url);
      if (seq !== discoverSeq.current) return;
      failedUrlRef.current = caps.discoveryStatus === DiscoveryStatus.Ok ? null : url;
      setCapabilities(caps);
    } catch (err) {
      console.warn('[auth] capability discovery failed', err);
      if (seq !== discoverSeq.current) return;
      failedUrlRef.current = url;
      setCapabilities(null);
    } finally {
      if (seq === discoverSeq.current) setCapabilitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => discover(serverUrl), 300);
    return () => clearTimeout(timer);
  }, [serverUrl, discover]);

  const effectiveServerUrl = capabilities?.resolvedBaseUrl ?? serverUrl;

  const retryDiscovery = useCallback(() => {
    if (failedUrlRef.current === serverUrl) void discover(serverUrl);
  }, [discover, serverUrl]);

  const onLoginSuccess = () => navigate('/', { replace: true });
  const onRegisterSuccess = () => navigate('/', { replace: true });

  return (
    <div className={css.page}>
      {isDesktop && <TitleBar fixed />}
      <div className={css.container}>
        <LogoHover size={72} />
        <h1 className={css.title}>{t('welcome.title')}</h1>
        <p className={css.tagline}>{t('welcome.tagline')}</p>

        {view === 'login' ? (
          <LoginForm
            onSuccess={onLoginSuccess}
            onShowRegister={() => setView('register')}
            onShowReset={() => setView('reset')}
            serverSelect={serverSelect}
            customUrl={customUrl}
            onServerSelect={setServerSelect}
            onCustomUrlChange={setCustomUrl}
            serverUrl={effectiveServerUrl}
            capabilities={capabilities}
            capabilitiesLoading={capabilitiesLoading}
            onRetryDiscovery={retryDiscovery}
          />
        ) : view === 'register' ? (
          <RegisterForm
            onSuccess={onRegisterSuccess}
            onShowLogin={() => setView('login')}
            serverSelect={serverSelect}
            customUrl={customUrl}
            onServerSelect={setServerSelect}
            onCustomUrlChange={setCustomUrl}
            serverUrl={effectiveServerUrl}
            capabilities={capabilities}
            capabilitiesLoading={capabilitiesLoading}
            onRetryDiscovery={retryDiscovery}
          />
        ) : (
          <ResetPasswordForm
            onBackToLogin={() => setView('login')}
            serverSelect={serverSelect}
            customUrl={customUrl}
            onServerSelect={setServerSelect}
            onCustomUrlChange={setCustomUrl}
            serverUrl={effectiveServerUrl}
            capabilities={capabilities}
            capabilitiesLoading={capabilitiesLoading}
            onRetryDiscovery={retryDiscovery}
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
        <p className={css.versionText}>v{version}</p>
      </div>
    </div>
  );
}
