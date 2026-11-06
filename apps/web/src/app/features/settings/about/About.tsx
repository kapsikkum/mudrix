import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LogoHover } from '@/app/components/AppLoading';
import {
  GitlabLogoSimpleIcon,
  DownloadSimpleIcon,
  HeartStraightIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { useSetAtom } from 'jotai';
import { whatsNewOpenAtom } from '@/app/store/atoms';
import { latestWhatsNew } from '@/app/features/whatsNew';
import * as css from '../Settings.css';
import { GITLAB_URL, PRIVACY_POLICY_URL } from '@/const/links';
import * as heroCss from './About.css';

const DOWNLOAD_URL = 'https://wizardchat.org';
const LIBERAPAY_URL = 'https://liberapay.com/JPK/donate';

export function About() {
  const { t } = useTranslation();
  // APP_VERSION is injected by Vite define (typed in src/vite-env.d.ts)
  const [version, setVersion] = useState(import.meta.env.APP_VERSION ?? 'unknown');
  const setWhatsNewOpen = useSetAtom(whatsNewOpenAtom);
  const hasWhatsNew = !!latestWhatsNew('en');

  useEffect(() => {
    window.desktopAPI?.getAppVersion?.().then((v) => v && setVersion(v));
  }, []);

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.about.title')}</h2>

      <div className={heroCss.hero}>
        <LogoHover size={64} />
        <div className={heroCss.heroInfo}>
          <div className={heroCss.nameRow}>
            <span className={heroCss.appName}>Mudrix</span>
            <span className={heroCss.versionTag}>v{version}</span>
          </div>
          <div className={heroCss.heroActions}>
            <a
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={heroCss.downloadBtn}
            >
              <DownloadSimpleIcon size={16} />
              {t('settings.about.downloadDesktop')}
            </a>
            <a
              href={GITLAB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={heroCss.sourceBtn}
            >
              <GitlabLogoSimpleIcon size={16} />
              {t('settings.about.viewSourceOnGitLab')}
            </a>
            <a
              href={LIBERAPAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={heroCss.donateBtn}
            >
              <HeartStraightIcon size={16} />
              {t('settings.about.donate')}
            </a>
          </div>
        </div>
      </div>

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.about.credits')}</h3>
        <div className={css.settingRow}>
          <span className={css.settingLabel}>
            <Trans
              i18nKey="settings.about.matrixSdk"
              components={{
                sdkLink: (
                  // eslint-disable-next-line jsx-a11y/anchor-has-content
                  <a
                    href="https://github.com/matrix-org/matrix-rust-sdk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={css.externalLink}
                  />
                ),
              }}
            />
          </span>
        </div>
        <div className={css.settingRow}>
          <span className={css.settingLabel}>
            <Trans
              i18nKey="settings.about.phosphorIcons"
              components={{
                phosphorLink: (
                  // eslint-disable-next-line jsx-a11y/anchor-has-content
                  <a
                    href="https://phosphoricons.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={css.externalLink}
                  />
                ),
              }}
            />
          </span>
        </div>
      </div>

      <div className={heroCss.footerLinks}>
        {hasWhatsNew && (
          <button
            type="button"
            className={heroCss.footerLink}
            onClick={() => setWhatsNewOpen(true)}
          >
            <SparkleIcon size={14} />
            {t('whatsNew.title')}
          </button>
        )}
        <a
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={heroCss.footerLink}
        >
          <ShieldCheckIcon size={14} />
          {t('settings.about.privacyPolicy')}
        </a>
      </div>
    </div>
  );
}
