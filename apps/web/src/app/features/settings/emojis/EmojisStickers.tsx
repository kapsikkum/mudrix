import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { UserPack } from './UserPack';
import { FavoritePacks } from './FavoritePacks';
import * as css from '@/app/components/Settings/Settings.css';

export function EmojisStickers() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const [editing, setEditing] = useState(false);
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
        </>
      )}
    </div>
  );
}
