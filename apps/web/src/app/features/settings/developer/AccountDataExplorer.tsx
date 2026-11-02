import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
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
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import * as settingsCss from '../Settings.css';
import * as css from './AccountDataExplorer.css';

async function listTypes(client: MatrixClient): Promise<string[]> {
  const types = await client.accountDataTypes();
  return [...types].sort((a, b) => a.localeCompare(b));
}

export function AccountDataExplorer({ client }: { client: MatrixClient }) {
  const { t } = useTranslation();
  const [types, setTypes] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(() => {
    void listTypes(client)
      .then(setTypes)
      .catch(() => {});
  }, [client]);
  useEffect(() => {
    if (expanded && editing === null) refresh();
  }, [expanded, editing, refresh]);

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

function readContent(content: unknown): string {
  return JSON.stringify(content ?? {}, null, 2);
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
  const [original, setOriginal] = useState<string | null>(isNew ? '{}' : null);
  const [json, setJson] = useState(original ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (type === null) return;
    let cancelled = false;
    void client
      .accountData(type)
      .catch(() => null)
      .then((content) => {
        if (cancelled) return;
        const text = readContent(content);
        setOriginal(text);
        setJson(text);
      });
    return () => {
      cancelled = true;
    };
  }, [client, type]);

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
  const canSave = !!parsed && !!targetType && original !== null && (isNew || json !== original);

  const save = async () => {
    if (!parsed || !targetType) return;
    setSaving(true);
    try {
      await client.setAccountData(targetType, parsed);
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
