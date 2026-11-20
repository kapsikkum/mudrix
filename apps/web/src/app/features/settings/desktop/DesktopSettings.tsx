import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleRow } from '@/app/components/Toggle';
import { getErrorMessage } from '@/util/error';
import * as css from '../Settings.css';
import * as desktopCss from './DesktopSettings.css';

/**
 * Settings for the native shell: starting with the computer and closing to the tray. The shell
 * owns these values (the tray can change them too), so every change goes through the bridge and
 * the page follows its `desktop://settings-changed` events.
 */
export function DesktopSettings() {
  const { t } = useTranslation();
  const api = window.desktopAPI;
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMac = api?.getPlatform?.() === 'darwin';

  useEffect(() => {
    if (!api?.getSettings) return undefined;
    let cancelled = false;
    api
      .getSettings()
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(t('settings.desktop.loadFailed', { error: getErrorMessage(reason) }));
      });
    const stop = api.onSettingsChange?.((next) => {
      if (!cancelled) setSettings(next);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [api, t]);

  const update = (patch: Partial<DesktopSettings>) => {
    if (!settings || !api?.setSettings) return;
    setSettings({ ...settings, ...patch });
    setError(null);
    api
      .setSettings(patch)
      .then(setSettings)
      .catch((reason: unknown) => {
        setError(t('settings.desktop.saveFailed', { error: String(reason) }));
        void api.getSettings?.().then(setSettings);
      });
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.desktop.title')}</h2>

      {!settings ? (
        <p className={css.settingNote}>{t('common.loading')}</p>
      ) : (
        <>
          <div className={css.section}>
            <p className={css.settingNote}>{t('settings.desktop.note')}</p>
            <ToggleRow
              label={t('settings.desktop.launchAtLogin')}
              description={t('settings.desktop.launchAtLoginNote')}
              checked={settings.launchAtLogin}
              onChange={(on) => update({ launchAtLogin: on })}
            />
            <ToggleRow
              label={t('settings.desktop.startMinimized')}
              description={t('settings.desktop.startMinimizedNote')}
              checked={settings.startMinimized}
              disabled={!settings.launchAtLogin}
              onChange={(on) => update({ startMinimized: on })}
            />
            {!isMac && (
              <ToggleRow
                label={t('settings.desktop.closeToTray')}
                description={t('settings.desktop.closeToTrayNote')}
                checked={settings.keepRunningInBackground}
                onChange={(on) => update({ keepRunningInBackground: on })}
              />
            )}
            <ToggleRow
              label={t('settings.desktop.muteNotifications')}
              description={t('settings.desktop.muteNotificationsNote')}
              checked={settings.notificationsMuted}
              onChange={(on) => update({ notificationsMuted: on })}
            />
          </div>
        </>
      )}
      {error && <p className={desktopCss.errorText}>{error}</p>}
    </div>
  );
}
