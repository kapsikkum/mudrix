import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { TrashIcon } from '@phosphor-icons/react';
import { Button, IconButton } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import * as css from '@/app/components/Settings/Settings.css';
import { vars } from '@/theme/vars.css';
import type { RoomAliases } from './useRoomAliases';

function isValidAlias(value: string): boolean {
  return /^#[A-Za-z0-9.\-_/=]+:[A-Za-z0-9.\-_]+$/.test(value);
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 8,
  backgroundColor: vars.color.bgSecondary,
  marginBottom: 6,
};

const ALIAS_STYLE: CSSProperties = {
  flex: 1,
  fontSize: '0.9rem',
  fontFamily: 'monospace',
  color: vars.color.textPrimary,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** A room's or space's published addresses: the list, and a field to add one. */
export function AddressesSection({ aliases }: { aliases: RoomAliases }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { canonicalAlias, canEdit, onAdd, onRemove, onSetCanonical } = aliases;
  const [newAlias, setNewAlias] = useState('');
  const [adding, setAdding] = useState(false);

  const canAdd = canEdit && isValidAlias(newAlias.trim());

  const add = async () => {
    const trimmed = newAlias.trim();
    if (!isValidAlias(trimmed)) return;
    setAdding(true);
    try {
      await onAdd(trimmed);
      setNewAlias('');
    } catch (err) {
      toast.error(
        getErrorMessage(err).includes('already in use')
          ? t('room.settings.addresses.aliasInUse')
          : t('room.settings.addresses.invalidFormat')
      );
    } finally {
      setAdding(false);
    }
  };

  const guarded = (action: (alias: string) => Promise<void>) => async (alias: string) => {
    try {
      await action(alias);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  const remove = guarded(onRemove);
  const setMain = guarded(onSetCanonical);

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('room.settings.addresses.title')}</h3>

      {canonicalAlias ? (
        <div style={ROW_STYLE}>
          <span style={ALIAS_STYLE}>{canonicalAlias}</span>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 10,
              backgroundColor: vars.color.accent,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {t('room.settings.general.title')}
          </span>
        </div>
      ) : (
        <p className={css.settingNote}>{t('room.settings.addresses.noAddresses')}</p>
      )}

      {aliases.aliases.map((alias) => (
        <div key={alias} style={ROW_STYLE}>
          <span style={ALIAS_STYLE}>{alias}</span>
          <Button variant="secondary" size="sm" onClick={() => setMain(alias)} disabled={!canEdit}>
            {t('room.settings.addresses.mainAddress')}
          </Button>
          <IconButton
            size="sm"
            onClick={() => remove(alias)}
            aria-label={t('common.remove')}
            disabled={!canEdit}
          >
            <TrashIcon size={14} />
          </IconButton>
        </div>
      ))}

      <div className={css.flexRowWrap} style={{ marginTop: 16 }}>
        <div className={css.flexOne}>
          <Input
            placeholder={t('room.settings.addresses.addressPlaceholder')}
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <Button variant="primary" loading={adding} onClick={add} disabled={!canAdd}>
          {t('room.settings.addresses.addAddress')}
        </Button>
      </div>
    </div>
  );
}
