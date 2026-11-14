import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import type {
  EncryptionStatus,
  ServerFeatures,
  WizardClient as MatrixClient,
} from '@wizardchat/core';
import { syncStateAtom } from '@/app/store/atoms';
import { slidingSyncAtom } from '@/app/store/atoms/settings';
import { useAllRooms } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { CopyButton } from '@/app/components/Button';
import { clearMediaCache } from '@/app/features/timeline/message/mediaCache';
import { CURRENT_VERSION } from '@/util/versionCheck';
import * as css from '../Settings.css';

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono = true }: InfoRowProps) {
  return (
    <div className={css.tokenRow}>
      <span className={css.settingLabel} style={{ minWidth: 150 }}>
        {label}
      </span>
      {mono ? <code className={css.tokenField}>{value}</code> : <span>{value}</span>}
      <CopyButton text={value} />
    </div>
  );
}

interface CollapsibleProps {
  title: string;
  children: React.ReactNode;
}

function Collapsible({ title, children }: CollapsibleProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className={css.accessTokenBtn} onClick={() => setOpen(!open)}>
        {open ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
        {title}
      </button>
      {open && <div className={css.tokenSection}>{children}</div>}
    </div>
  );
}

function useCryptoInfo(client: MatrixClient): EncryptionStatus | null {
  const [info, setInfo] = useState<EncryptionStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    client
      .encryptionStatus()
      .then((status) => {
        if (!cancelled) setInfo(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);
  return info;
}

function useServerInfo(client: MatrixClient): ServerFeatures | null {
  const [info, setInfo] = useState<ServerFeatures | null>(null);
  useEffect(() => {
    let cancelled = false;
    client
      .serverFeatures()
      .then((features) => {
        if (!cancelled) setInfo(features);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);
  return info;
}

/** Diagnostics and maintenance tools, shown only while developer mode is on. */
export function DeveloperTools({ client }: { client: MatrixClient }) {
  const { t } = useTranslation();
  const toast = useToast();
  const syncState = useAtomValue(syncStateAtom);
  const sliding = useAtomValue(slidingSyncAtom);
  const rooms = useAllRooms();
  const crypto = useCryptoInfo(client);
  const server = useServerInfo(client);

  const userId = client.userId() ?? '';
  const deviceId = client.session().deviceId;
  const joined = rooms.filter((room) => !room.isInvite).length;
  const invited = rooms.filter((room) => room.isInvite).length;
  const featureList = server ? server.unstableFeatures : [];
  const yes = t('settings.developer.ready');
  const no = t('settings.developer.notReady');

  const debugInfo = () =>
    JSON.stringify(
      {
        app: CURRENT_VERSION,
        userAgent: navigator.userAgent,
        userId,
        deviceId,
        homeserver: client.session().homeserverUrl,
        syncMode: sliding ? 'sliding' : 'classic',
        syncState,
        rooms: { joined, invited },
        crypto,
        serverVersions: server?.versions,
        serverFeatures: server?.unstableFeatures,
      },
      null,
      2
    );

  const copyDebug = () => {
    navigator.clipboard
      .writeText(debugInfo())
      .then(() => toast.success(t('common.copied')))
      .catch(() => toast.error(t('common.copyFailed')));
  };

  const clearMedia = async () => {
    await clearMediaCache();
    toast.success(t('settings.developer.clearMediaDone'));
  };

  return (
    <>
      <div className={css.divider} />
      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.developer.session')}</h3>
        <InfoRow label={t('settings.developer.userId')} value={userId} />
        <InfoRow label={t('settings.developer.deviceId')} value={deviceId} />
        <InfoRow label={t('settings.developer.appVersion')} value={CURRENT_VERSION} />
        <InfoRow
          label={t('settings.developer.syncMode')}
          value={
            sliding ? t('settings.developer.syncSliding') : t('settings.developer.syncClassic')
          }
          mono={false}
        />
        <InfoRow label={t('settings.developer.syncState')} value={syncState ?? '-'} />
        <InfoRow
          label={t('settings.developer.rooms')}
          value={t('settings.developer.roomsValue', { joined, invited })}
          mono={false}
        />
        {server && (
          <InfoRow
            label={t('settings.developer.specVersion')}
            value={server.versions[server.versions.length - 1] ?? '-'}
          />
        )}
      </div>

      <div className={css.divider} />
      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.developer.encryption')}</h3>
        {crypto ? (
          <>
            <InfoRow
              label={t('settings.developer.crossSigning')}
              value={crypto.crossSigningComplete ? yes : no}
              mono={false}
            />
            <InfoRow
              label={t('settings.developer.secretStorage')}
              value={crypto.recovery === 'enabled' ? yes : no}
              mono={false}
            />
            <InfoRow
              label={t('settings.developer.keyBackup')}
              value={crypto.backupEnabled ? yes : no}
              mono={false}
            />
          </>
        ) : (
          <span className={css.settingNote}>{t('settings.developer.cryptoUnavailable')}</span>
        )}
      </div>

      <div className={css.divider} />
      <div className={css.section}>
        <Collapsible title={t('settings.developer.serverFeatures', { count: featureList.length })}>
          <div className={css.tokenRow}>
            <code className={css.tokenField} style={{ whiteSpace: 'pre', overflow: 'auto' }}>
              {featureList.map((name) => `+ ${name}`).join('\n')}
            </code>
            <CopyButton text={featureList.join('\n')} />
          </div>
        </Collapsible>
      </div>

      <div className={css.divider} />
      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.developer.tools')}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className={css.actionBtnSecondary} onClick={copyDebug}>
            {t('settings.developer.copyDebugInfo')}
          </button>
          <button type="button" className={css.actionBtnSecondary} onClick={clearMedia}>
            {t('settings.developer.clearMedia')}
          </button>
        </div>
      </div>
    </>
  );
}
