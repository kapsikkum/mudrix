import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LogoHover } from '@/app/components/AppLoading';
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  GithubLogoIcon,
  DownloadSimpleIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { useSetAtom } from 'jotai';
import { getAppsOpenAtom, updateAvailableAtom, whatsNewOpenAtom } from '@/app/store/atoms';
import { isTauriDesktop } from '@/util/desktop';
import { checkForUpdate, type UpdateCheck } from '@/util/versionCheck';
import { latestWhatsNew } from '@/app/features/whatsNew';
import * as css from '../Settings.css';
import { SOURCE_URL } from '@/const/links';
import * as heroCss from './About.css';

const WIZARDCHAT_URL = 'https://gitlab.com/wizardchat/wizardchat-web';

export function About() {
  const { t } = useTranslation();
  // APP_VERSION is injected by Vite define (typed in src/vite-env.d.ts)
  const [version, setVersion] = useState(import.meta.env.APP_VERSION ?? 'unknown');
  const setWhatsNewOpen = useSetAtom(whatsNewOpenAtom);
  const setGetAppsOpen = useSetAtom(getAppsOpenAtom);
  const hasWhatsNew = !!latestWhatsNew('en');
  const setUpdateAvailable = useSetAtom(updateAvailableAtom);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | 'checking' | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const checking = updateCheck === 'checking';

  useEffect(() => {
    const stop = window.desktopAPI?.onUpdateProgress?.(({ percent }) =>
      setDownloadPercent(percent)
    );
    return () => stop?.();
  }, []);

  const [prereleases, setPrereleases] = useState(
    () => localStorage.getItem('mudrix.updates.prereleases') === '1'
  );
  const togglePrereleases = (on: boolean) => {
    setPrereleases(on);
    localStorage.setItem('mudrix.updates.prereleases', on ? '1' : '0');
  };

  const handleCheck = async () => {
    setUpdateCheck('checking');
    setDownloadPercent(null);
    let result: UpdateCheck;
    if (isTauriDesktop() && window.desktopAPI?.checkForUpdate) {
      try {
        const outcome = await window.desktopAPI.checkForUpdate(prereleases);
        result = outcome.status === 'upToDate' ? 'upToDate' : 'available';
      } catch {
        result = 'error';
      }
    } else {
      result = await checkForUpdate();
    }
    if (result === 'available') setUpdateAvailable(true);
    setUpdateCheck(result);
  };

  // "You're up to date" replaces the button's label for a few seconds, then it goes back.
  useEffect(() => {
    if (updateCheck !== 'upToDate') return undefined;
    const timer = window.setTimeout(() => setUpdateCheck(null), 4000);
    return () => window.clearTimeout(timer);
  }, [updateCheck]);

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
            {(!isTauriDesktop() || !!window.desktopAPI?.checkForUpdate) && (
              <button
                type="button"
                className={heroCss.downloadBtn}
                onClick={() => void handleCheck()}
                disabled={checking}
              >
                {updateCheck === 'upToDate' ? (
                  <>
                    <CheckCircleIcon size={16} />
                    {t('update.upToDate')}
                  </>
                ) : (
                  <>
                    <ArrowClockwiseIcon
                      size={16}
                      className={checking ? heroCss.spinning : undefined}
                    />
                    {checking
                      ? downloadPercent !== null
                        ? t('update.downloading', { percent: downloadPercent })
                        : t('update.checking')
                      : t('update.checkNow')}
                  </>
                )}
              </button>
            )}
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
            {hasWhatsNew && (
              <button
                type="button"
                className={heroCss.sourceBtn}
                onClick={() => setWhatsNewOpen(true)}
              >
                <SparkleIcon size={16} />
                {t('whatsNew.title')}
              </button>
            )}
          </div>
          {isTauriDesktop() && (
            <label className={css.settingLabel}>
              <input
                type="checkbox"
                checked={prereleases}
                onChange={(e) => togglePrereleases(e.target.checked)}
              />{' '}
              {t('update.includePrereleases')}
            </label>
          )}
          {(updateCheck === 'error' || updateCheck === 'available') && (
            <span className={css.settingLabel} role="status">
              {updateCheck === 'error' ? t('update.checkFailed') : t('update.available')}
            </span>
          )}
        </div>
      </div>

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.about.credits')}</h3>
        <div className={css.settingRow}>
          <span className={css.settingLabel}>
            Mudrix is a fork of{' '}
            <a
              href={WIZARDCHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={css.externalLink}
            >
              WizardChat
            </a>{' '}
            (AGPL-3.0).
          </span>
        </div>
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
        <div className={css.settingRow}>
          <span className={css.settingLabel}>
            <Trans
              i18nKey="settings.about.elementCall"
              components={{
                elementCallLink: (
                  // eslint-disable-next-line jsx-a11y/anchor-has-content
                  <a
                    href="https://github.com/element-hq/element-call"
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
    </div>
  );
}
