import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { autoplayGifsAtom, reducedMotionAtom, type ReducedMotion } from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { Select } from '@/app/components/Select';
import { isTouchDevice } from '@/util/touch';
import * as css from '../Settings.css';

const REDUCED_MOTION_OPTIONS: Record<ReducedMotion, string> = {
  system: 'settings.accessibility.reducedMotionSystem',
  on: 'settings.accessibility.reducedMotionOn',
  off: 'settings.accessibility.reducedMotionOff',
};

export function Accessibility() {
  const { t } = useTranslation();
  const [reducedMotion, setReducedMotion] = useAtom(reducedMotionAtom);
  const [autoplayGifs, setAutoplayGifs] = useAtom(autoplayGifsAtom);

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.accessibility.title')}</h2>

      <div className={css.section}>
        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('settings.accessibility.reducedMotion')}</span>
            <span className={css.settingNote}>{t('settings.accessibility.reducedMotionNote')}</span>
          </div>
          <Select<ReducedMotion>
            aria-label={t('settings.accessibility.reducedMotion')}
            value={reducedMotion}
            options={Object.entries(REDUCED_MOTION_OPTIONS).map(([value, labelKey]) => ({
              value: value as ReducedMotion,
              label: t(labelKey),
            }))}
            onChange={setReducedMotion}
          />
        </div>

        <ToggleRow
          label={t('settings.accessibility.autoplayGifs')}
          description={t(
            isTouchDevice()
              ? 'settings.accessibility.autoplayGifsNoteTouch'
              : 'settings.accessibility.autoplayGifsNote'
          )}
          checked={autoplayGifs}
          onChange={setAutoplayGifs}
        />
      </div>
    </div>
  );
}
