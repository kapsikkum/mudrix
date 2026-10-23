import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import {
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  CodeIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button, CopyButton } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import * as settingsCss from '../Settings.css';
import * as css from './AccountDataExplorer.css';

type AccountDataType = Parameters<MatrixClient['setAccountData']>[0];

function listTypes(client: MatrixClient): string[] {
  return [...client.store.accountData.keys()].sort((a, b) => a.localeCompare(b));
}

export function AccountDataExplorer({ client }: { client: MatrixClient }) {
  const { t } = useTranslation();
  const [types, setTypes] = useState(() => listTypes(client));
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const onAccountData = useCallback(() => setTypes(listTypes(client)), [client]);
  useMatrixEvent(client, 'accountData', onAccountData);

  return (
    <div className={settingsCss.section}>
      <button
        type="button"
        className={settingsCss.accessTokenBtn}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
        {t('settings.developer.accountData')}
      </button>
      {expanded && (
        <div className={css.panel}>
          <div className={css.toolbar}>
            <span className={css.count}>
              {t('settings.developer.accountDataCount', { count: types.length })}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setEditing('')}>
              <PlusIcon size={14} />
              {t('settings.developer.accountDataAdd')}
            </Button>
          </div>
          {types.length === 0 ? (
            <div className={settingsCss.noResults}>{t('settings.developer.accountDataEmpty')}</div>
          ) : (
            <div className={css.list}>
              {types.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={css.row}
                  onClick={() => setEditing(type)}
                >
                  <code className={css.rowType}>{type}</code>
                  <CaretRightIcon size={14} className={css.rowCaret} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {editing !== null && (
        <AccountDataEditor
          client={client}
          type={editing || null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function readContent(event: MatrixEvent | undefined): string {
  return JSON.stringify(event?.getContent() ?? {}, null, 2);
}

function AccountDataEditor({
  client,
  type,
  onClose,
}: {
  client: MatrixClient;
  type: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const isNew = type === null;
  const [newType, setNewType] = useState('');
  const original = isNew ? '{}' : readContent(client.getAccountData(type as AccountDataType));
  const [json, setJson] = useState(original);
  const [saving, setSaving] = useState(false);

  let parsed: Record<string, unknown> | null = null;
  let jsonError: string | undefined;
  try {
    const value: unknown = JSON.parse(json);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>;
    } else {
      jsonError = t('settings.developer.accountDataNotObject');
    }
  } catch (err) {
    jsonError = getErrorMessage(err);
  }

  const targetType = isNew ? newType.trim() : type;
  const canSave = !!parsed && !!targetType && (isNew || json !== original);

  const save = async () => {
    if (!parsed || !targetType) return;
    setSaving(true);
    try {
      await client.setAccountData(targetType as AccountDataType, parsed as never);
      toast.success(t('settings.developer.accountDataSaved'));
      onClose();
    } catch (err) {
      toast.error(t('settings.developer.accountDataSaveFailed', { error: getErrorMessage(err) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? t('settings.developer.accountDataNew') : t('settings.developer.accountData')}
      titleIcon={<CodeIcon size={18} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={saving} disabled={!canSave} onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {isNew ? (
        <Input
          label={t('settings.developer.accountDataType')}
          placeholder="org.example.setting"
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          data-dialog-autofocus
        />
      ) : (
        <div className={css.typeRow}>
          <code className={css.typeValue}>{type}</code>
          <CopyButton text={type} />
        </div>
      )}
      <Textarea
        label={t('settings.developer.accountDataContent')}
        className={css.jsonEditor}
        value={json}
        onChange={(e) => setJson(e.target.value)}
        error={jsonError}
        spellCheck={false}
        rows={16}
      />
    </Modal>
  );
}
