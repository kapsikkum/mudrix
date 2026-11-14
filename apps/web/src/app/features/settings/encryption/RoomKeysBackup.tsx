import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadSimpleIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import {
  ROOM_KEYS_FILE_NAME,
  canExportKeys,
  coreErrorCode,
  isPassphraseLongEnough,
  keyFileName,
} from './roomKeys';
import * as css from '../Settings.css';
import * as keysCss from './RoomKeysBackup.css';

interface Props {
  client: MatrixClient;
}

/**
 * Exports this device's room keys into a passphrase-protected file and imports keys from one.
 * The core reads and writes the file itself, so the desktop shell supplies the path.
 */
export function RoomKeysBackup({ client }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const pickSave = window.desktopAPI?.pickKeyFileToSave;
  const pickOpen = window.desktopAPI?.pickKeyFileToOpen;

  const [exportPass, setExportPass] = useState('');
  const [exportPassConfirm, setExportPassConfirm] = useState('');
  const [exporting, setExporting] = useState(false);

  const [importPath, setImportPath] = useState<string | null>(null);
  const [importPass, setImportPass] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  const exportMismatch = exportPassConfirm.length > 0 && exportPass !== exportPassConfirm;
  const canExport = !!pickSave && !exporting && canExportKeys(exportPass, exportPassConfirm);
  const canImport =
    !!pickOpen && !importing && importPath !== null && isPassphraseLongEnough(importPass);

  const handleExport = async () => {
    if (!pickSave) return;
    setExporting(true);
    try {
      const path = await pickSave(ROOM_KEYS_FILE_NAME);
      if (!path) return;
      await client.exportRoomKeys(path, exportPass);
      setExportPass('');
      setExportPassConfirm('');
      toast.success(t('settings.roomKeys.exportSuccess'));
    } catch (err) {
      toast.error(
        coreErrorCode(err) === 'unsupported'
          ? t('settings.roomKeys.cryptoNotAvailable')
          : t('settings.roomKeys.exportFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setExporting(false);
    }
  };

  const handleChooseFile = async () => {
    if (!pickOpen) return;
    try {
      const path = await pickOpen();
      if (!path) return;
      setImportPath(path);
      setImported(null);
    } catch (err) {
      toast.error(t('settings.roomKeys.importFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleImport = async () => {
    if (!importPath) return;
    setImporting(true);
    try {
      const result = await client.importRoomKeys(importPath, importPass);
      setImported(result.imported);
      setImportPath(null);
      setImportPass('');
      toast.success(t('settings.roomKeys.importSuccess', { count: result.imported }));
    } catch (err) {
      const code = coreErrorCode(err);
      toast.error(
        code === 'wrongRecoveryKey'
          ? t('settings.roomKeys.error_password')
          : code === 'unsupported'
            ? t('settings.roomKeys.cryptoNotAvailable')
            : t('settings.roomKeys.importFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('settings.roomKeys.title')}</h3>
      <p className={css.settingNote}>{t('settings.roomKeys.description')}</p>

      <div className={keysCss.form}>
        <h4 className={keysCss.subtitle}>{t('settings.roomKeys.exportTitle')}</h4>
        <Input
          type="password"
          showPasswordToggle
          label={t('settings.roomKeys.passphrase')}
          value={exportPass}
          autoComplete="new-password"
          onChange={(e) => setExportPass(e.target.value)}
          disabled={exporting}
        />
        <Input
          type="password"
          label={t('settings.roomKeys.confirmPassphrase')}
          value={exportPassConfirm}
          autoComplete="new-password"
          error={exportMismatch ? t('settings.roomKeys.passphraseMismatch') : undefined}
          onChange={(e) => setExportPassConfirm(e.target.value)}
          disabled={exporting}
        />
        <div>
          <Button
            size="sm"
            onClick={() => void handleExport()}
            disabled={!canExport}
            loading={exporting}
          >
            <DownloadSimpleIcon size={14} />
            {t('settings.roomKeys.exportBtn')}
          </Button>
        </div>
      </div>

      <div className={css.divider} />

      <div className={keysCss.form}>
        <h4 className={keysCss.subtitle}>{t('settings.roomKeys.importTitle')}</h4>
        <div className={keysCss.fileRow}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleChooseFile()}
            disabled={importing}
          >
            {t('settings.roomKeys.chooseFile')}
          </Button>
          {importPath && (
            <span className={keysCss.fileName} title={importPath}>
              {keyFileName(importPath)}
            </span>
          )}
        </div>
        <Input
          type="password"
          showPasswordToggle
          label={t('settings.roomKeys.passphrase')}
          value={importPass}
          autoComplete="off"
          onChange={(e) => setImportPass(e.target.value)}
          disabled={importing}
        />
        <div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleImport()}
            disabled={!canImport}
            loading={importing}
          >
            <UploadSimpleIcon size={14} />
            {t('settings.roomKeys.importBtn')}
          </Button>
        </div>
        {imported !== null && !importing && (
          <p className={css.settingNote}>
            {t('settings.roomKeys.importSuccess', { count: imported })}
          </p>
        )}
      </div>
    </div>
  );
}
