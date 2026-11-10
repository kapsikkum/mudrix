import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LogoHover } from '@/app/components/AppLoading';
import {
  GithubLogoIcon,
  DownloadSimpleIcon,
  HeartStraightIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { useSetAtom } from 'jotai';
import { getAppsOpenAtom, whatsNewOpenAtom } from '@/app/store/atoms';
import { latestWhatsNew } from '@/app/features/whatsNew';
import * as css from '../Settings.css';
import { SOURCE_URL } from '@/const/links';
import * as heroCss from './About.css';

const LIBERAPAY_URL = 'https://liberapay.com/JPK/donate';

export function About() {
  const { t } = useTranslation();
  // APP_VERSION is injected by Vite define (typed in src/vite-env.d.ts)
  const [version, setVersion] = useState(import.meta.env.APP_VERSION ?? 'unknown');
  const setWhatsNewOpen = useSetAtom(whatsNewOpenAtom);
  const setGetAppsOpen = useSetAtom(getAppsOpenAtom);
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
            <button
              type="button"
              className={heroCss.downloadBtn}
              onClick={() => setGetAppsOpen(true)}
            >
              <DownloadSimpleIcon size={16} />
              {t('getApps.title')}
            </button>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={heroCss.sourceBtn}
            >
              <GithubLogoIcon size={16} />
              {t('settings.about.viewSourceOnGitHub')}
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
      </div>
    </div>
  );
}
