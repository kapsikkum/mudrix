import { useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  customActivityAppsAtom,
  hiddenActivitiesAtom,
  shareActivityAtom,
  shareActivityGamesAtom,
  shareActivityMusicAtom,
} from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { Button } from '@/app/components/Button';
import { isActivityHidden, useDetectedActivity } from '@/app/hooks/useActivitySharing';
import { AddApplication } from './AddApplication';
import * as css from '../Settings.css';
import * as ownCss from './Activity.css';

/** Desktop app: show what this computer is playing and listening to. Off until switched on. */
export function Activity() {
  const { t } = useTranslation();
  const [share, setShare] = useAtom(shareActivityAtom);
  const [games, setGames] = useAtom(shareActivityGamesAtom);
  const [music, setMusic] = useAtom(shareActivityMusicAtom);
  const [hidden, setHidden] = useAtom(hiddenActivitiesAtom);
  const [apps, setApps] = useAtom(customActivityAppsAtom);
  const [adding, setAdding] = useState(false);
  const taken = useMemo(() => new Set(apps.map((a) => a.exe.toLowerCase())), [apps]);
  const detected = useDetectedActivity();
  const shown = share ? detected.filter((a) => !isActivityHidden(a.name, hidden)) : [];

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.activity.title')}</h2>
      <div className={css.section}>
        <ToggleRow
          label={t('settings.activity.share')}
          description={t('settings.activity.shareNote')}
          checked={share}
          onChange={setShare}
        />
        {share && (
          <>
            <ToggleRow label={t('settings.activity.games')} checked={games} onChange={setGames} />
            <ToggleRow
              label={t('settings.activity.music')}
              description={t('settings.activity.musicNote')}
              checked={music}
              onChange={setMusic}
            />
            <p className={css.settingNote}>{t('settings.activity.simultaneous')}</p>
          </>
        )}
      </div>

      {share && (
        <>
          <div className={css.divider} />
          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('settings.activity.apps.title')}</h3>
            <p className={ownCss.note}>{t('settings.activity.apps.note')}</p>
            {apps.map((app) => (
              <div key={app.exe} className={css.settingRow}>
                <div className={css.settingInfo}>
                  <span className={css.settingLabel}>{app.name}</span>
                  <span className={css.settingNote}>{app.exe}</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setApps(apps.filter((a) => a.exe !== app.exe))}
                >
                  {t('settings.activity.apps.remove')}
                </Button>
              </div>
            ))}
            <div className={css.settingRow}>
              <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                {t('settings.activity.apps.add')}
              </Button>
            </div>
            <AddApplication
              open={adding}
              taken={taken}
              onClose={() => setAdding(false)}
              onAdd={(app) => {
                setApps([
                  ...apps.filter((a) => a.exe.toLowerCase() !== app.exe.toLowerCase()),
                  app,
                ]);
                setAdding(false);
              }}
            />
          </div>
          <div className={css.divider} />
          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('settings.activity.detected')}</h3>
            {shown.length === 0 ? (
              <div className={css.settingRow}>
                <div className={css.settingInfo}>
                  <span className={css.settingLabel}>{t('settings.activity.nothing')}</span>
                </div>
              </div>
            ) : (
              shown.map((activity) => (
                <div key={`${activity.kind}:${activity.name}`} className={css.settingRow}>
                  <div className={css.settingInfo}>
                    <span className={css.settingLabel}>
                      {t(
                        activity.kind === 'game'
                          ? 'settings.activity.nowPlaying'
                          : 'settings.activity.nowListening',
                        {
                          name: activity.details
                            ? `${activity.name} - ${activity.details}`
                            : activity.name,
                        }
                      )}
                    </span>
                    <span className={css.settingNote}>{t('settings.activity.hiddenNote')}</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setHidden([...hidden, activity.name.trim().toLowerCase()])}
                  >
                    {t('settings.activity.hideThis')}
                  </Button>
                </div>
              ))
            )}
            {hidden.length > 0 && (
              <div className={css.settingRow}>
                <div className={css.settingInfo}>
                  <span className={css.settingLabel}>
                    {t('settings.activity.hiddenCount', { count: hidden.length })}
                  </span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setHidden([])}>
                  {t('settings.activity.showAgain')}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
