import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleRow } from '@/app/components/Toggle';
import * as css from '../Settings.css';

/** Native desktop-shell settings; renders nothing in a browser. */
export function DesktopPreferences() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const api = window.desktopAPI;

  useEffect(() => {
    if (!api?.getSettings) return;
    api
      .getSettings()
      .then(setSettings)
      .catch(() => {});
    return api.onSettingsChange?.(setSettings);
  }, [api]);

  if (!api?.setSettings || !settings) return null;
  const setRemote = api.setSettings;

  const update = (patch: Partial<DesktopSettings>) => {
    setSettings({ ...settings, ...patch });
    setRemote(patch)
      .then(setSettings)
      .catch(() => api.getSettings?.().then(setSettings));
  };

  return (
    <>
      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.notifications.desktop')}</h3>

        <ToggleRow
          label={t('settings.notifications.desktopKeepRunning')}
          description={t('settings.notifications.desktopKeepRunningNote')}
          checked={settings.keepRunningInBackground}
          onChange={(v) => update({ keepRunningInBackground: v })}
        />
        <ToggleRow
          label={t('settings.notifications.desktopLaunchAtLogin')}
          description={t('settings.notifications.desktopLaunchAtLoginNote')}
          checked={settings.launchAtLogin}
          onChange={(v) => update({ launchAtLogin: v })}
        />
        <ToggleRow
          label={t('settings.notifications.desktopStartMinimized')}
          description={t('settings.notifications.desktopStartMinimizedNote')}
          checked={settings.startMinimized}
          disabled={!settings.launchAtLogin}
          onChange={(v) => update({ startMinimized: v })}
        />
      </div>
    </>
  );
}
