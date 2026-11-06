import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { gifProviderAtom } from '@/app/store/atoms';
import { Select } from '@/app/components/Select';
import { UserPack } from './UserPack';
import { FavoritePacks } from './FavoritePacks';
import { EmojiStyleSection } from './EmojiStyleSection';
import * as css from '@/app/components/Settings/Settings.css';

export function EmojisStickers() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const [editing, setEditing] = useState(false);
  const [gifProvider, setGifProvider] = useAtom(gifProviderAtom);
  if (!client) return null;

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.emojisStickers.title')}</h2>

      {editing ? (
        <UserPack
          client={client}
          editing
          onEdit={() => setEditing(true)}
          onBack={() => setEditing(false)}
        />
      ) : (
        <>
          <EmojiStyleSection />

          <div className={css.divider} />

          <div className={css.section}>
            <UserPack
              client={client}
              editing={false}
              onEdit={() => setEditing(true)}
              onBack={() => setEditing(false)}
            />
          </div>

          <div className={css.divider} />

          <div className={css.section}>
            <FavoritePacks client={client} />
          </div>

          <div className={css.divider} />

          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('settings.emojisStickers.gifs')}</h3>
            <div className={css.settingRow}>
              <div className={css.settingInfo}>
                <span className={css.settingLabel}>{t('settings.emojisStickers.gifProvider')}</span>
              </div>
              <Select
                aria-label={t('settings.emojisStickers.gifProvider')}
                value={gifProvider}
                options={[
                  { value: 'giphy', label: 'GIPHY' },
                  { value: 'klipy', label: 'KLIPY' },
                ]}
                onChange={(v) => setGifProvider(v === 'klipy' ? 'klipy' : 'giphy')}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
