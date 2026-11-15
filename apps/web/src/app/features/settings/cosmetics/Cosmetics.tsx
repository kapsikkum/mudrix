import { Fragment } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { showCosmeticPacksAtom } from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { COSMETIC_KINDS } from '@/util/cosmeticPacks';
import { FavoritePacks } from '../emojis/FavoritePacks';
import * as panelCss from '@/app/components/Settings/Settings.css';

/** What you are subscribed to: every cosmetic pack you have picked from your rooms and spaces. */
export function Cosmetics() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  // Packs can be switched off (the owner wants that option kept); picking them stays available, so
  // a saved selection survives a round trip through the switch.
  const [showPacks, setShowPacks] = useAtom(showCosmeticPacksAtom);
  if (!client) return null;

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('settings.cosmetics.title')}</h2>
      <p className={panelCss.settingNote} style={{ marginBottom: 16 }}>
        {t('settings.cosmetics.note')}
      </p>

      <ToggleRow
        label={t('settings.cosmetics.showPacks')}
        description={t('settings.cosmetics.showPacksDescription')}
        checked={showPacks}
        onChange={setShowPacks}
      />

      {!showPacks && (
        <p className={panelCss.settingNote} style={{ marginTop: 12 }}>
          {t('settings.cosmetics.packsOff')}
        </p>
      )}

      {COSMETIC_KINDS.map((kind, i) => (
        <Fragment key={kind}>
          {i > 0 && <div className={panelCss.divider} />}
          <div className={panelCss.section}>
            <FavoritePacks
              client={client}
              kind={kind}
              title={t(`settings.cosmetics.kindPlural.${kind}`)}
              note={t('settings.cosmetics.hint')}
              empty={t('settings.cosmetics.empty')}
            />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
