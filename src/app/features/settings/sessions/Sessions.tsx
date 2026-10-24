import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetAtom, useAtomValue } from 'jotai';
import {
  SpinnerGapIcon,
  ArrowClockwiseIcon,
  QrCodeIcon,
  SignOutIcon,
  DevicesIcon,
  KeyIcon,
} from '@phosphor-icons/react';
import type { MatrixClient } from 'matrix-js-sdk';
import { getMatrixClientOrNull, logout } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import {
  emojiVerificationAtom,
  sessionVerificationAtom,
  settingsPageAtom,
} from '@/app/store/atoms';
import { useConfirm } from '@/app/hooks/useConfirm';
import { AuthType } from 'matrix-js-sdk/lib/interactive-auth';
import type { IAuthData } from 'matrix-js-sdk/lib/interactive-auth';
import { MatrixError } from 'matrix-js-sdk/lib/http-api/errors';
import { VerificationPhase, CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';
import { startSasVerification } from '@/app/features/device/startSasVerification';
import { UiaPanel, offersPassword, offersSso } from './UiaPanel';
import type { UiaChallenge } from './UiaPanel';
import { Button } from '@/app/components/Button';
import { DeviceCard } from './DeviceCard';
import type { DeviceEntry } from './DeviceCard';
import { waitForSsoFallback } from '@/app/features/sso/sso';
import { isSignInWithQRAvailable } from 'matrix-js-sdk/lib/rendezvous';
import { LinkDeviceModal } from '@/app/features/qrLogin/LinkDeviceModal';
import { useSessionVerificationActions } from '@/app/features/device/useSessionVerificationActions';
import * as css from './Sessions.css';
import * as layoutCss from '../Settings.css';

const DEVICE_DELETE_ACTIONS = [
  'org.matrix.device_delete',
  'org.matrix.device_view',
  'org.matrix.session_view',
  'session_view',
];

interface AccountManagementInfo {
  url: string;
  actionsSupported?: string[];
}

async function getAccountManagementInfo(
  client: MatrixClient
): Promise<AccountManagementInfo | null> {
  try {
    const meta = await client.getAuthMetadata();
    if (!meta.account_management_uri) return null;
    return {
      url: meta.account_management_uri,
      actionsSupported: meta.account_management_actions_supported,
    };
  } catch {
    return null;
  }
}

function buildAccountManagementUrl(info: AccountManagementInfo, deviceId: string): string {
  const action =
    DEVICE_DELETE_ACTIONS.find(
      (a) => !info.actionsSupported || info.actionsSupported.includes(a)
    ) ?? 'org.matrix.device_delete';

  const url = new URL(info.url);
  url.searchParams.set('action', action);
  url.searchParams.set('device_id', deviceId);
  return url.toString();
}

function asMatrixError(err: unknown): MatrixError | null {
  return err instanceof MatrixError ? err : null;
}

export function Sessions() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const setEmojiModal = useSetAtom(emojiVerificationAtom);
  const confirmDialog = useConfirm();

  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uiaChallenge, setUiaChallenge] = useState<UiaChallenge | null>(null);
  const [uiaSubmitting, setUiaSubmitting] = useState(false);

  const {
    status: sessionStatus,
    hasOtherVerifiedSession,
    hasRecoveryKey,
  } = useAtomValue(sessionVerificationAtom);
  const canVerify = hasOtherVerifiedSession || hasRecoveryKey;
  const {
    busy: verifyBusy,
    verifyWithOtherDevice,
    verifyWithRecoveryKey,
  } = useSessionVerificationActions(client);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const [qrLinkAvailable, setQrLinkAvailable] = useState(false);
  const [linkingDevice, setLinkingDevice] = useState(false);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void isSignInWithQRAvailable(client)
      .catch(() => false)
      .then((available) => {
        if (!cancelled) setQrLinkAvailable(available);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const toastRef = useRef(toast);
  toastRef.current = toast;

  const emojiState = useAtomValue(emojiVerificationAtom);
  const verificationTeardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!emojiState.open) {
      verificationTeardownRef.current?.();
      verificationTeardownRef.current = null;
    }
  }, [emojiState.open]);

  useEffect(
    () => () => {
      verificationTeardownRef.current?.();
      verificationTeardownRef.current = null;
    },
    []
  );

  const confirm = useCallback(
    (title: string, message: string, danger = false): Promise<boolean> =>
      confirmDialog({ title, message, danger }),
    [confirmDialog]
  );

  const loadDevices = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const crypto = client.getCrypto();
      const ownDeviceId = client.getDeviceId() ?? '';
      const ownUserId = client.getUserId() ?? '';

      const res = await client.getDevices();
      const rawDevices: {
        device_id: string;
        display_name?: string;
        user_id?: string;
        last_seen_ip?: string;
        last_seen_ts?: number;
      }[] = res.devices ?? [];

      const verificationResults = await Promise.all(
        rawDevices.map(async (d) => {
          if (!crypto) return null;
          try {
            const status = await crypto.getDeviceVerificationStatus(
              d.user_id ?? ownUserId,
              d.device_id
            );
            if (!status) return false;
            if (d.device_id === ownDeviceId) {
              return status.crossSigningVerified;
            }
            return status.signedByOwner || status.localVerified;
          } catch {
            return false;
          }
        })
      );

      const entries: DeviceEntry[] = rawDevices.map((d, i) => ({
        deviceId: d.device_id,
        displayName: d.display_name || d.device_id,
        isCurrentDevice: d.device_id === ownDeviceId,
        isVerified: verificationResults[i] as boolean | null,
        lastSeenIp: d.last_seen_ip ?? null,
        lastSeenTs: d.last_seen_ts ?? null,
      }));

      entries.sort((a, b) => {
        if (a.isCurrentDevice) return -1;
        if (b.isCurrentDevice) return 1;
        if (a.isVerified === false && b.isVerified !== false) return -1;
        if (b.isVerified === false && a.isVerified !== false) return 1;
        return 0;
      });

      setDevices(entries);
    } catch (err) {
      toastRef.current.error(
        t('settings.sessions.loadSessionsFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const loadDevicesRef = useRef(loadDevices);
  loadDevicesRef.current = loadDevices;

  const reloadTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!client) return;
    const scheduleReload = () => {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => loadDevicesRef.current(), 300);
    };
    client.on(CryptoEvent.DevicesUpdated as Parameters<typeof client.on>[0], scheduleReload);
    return () => {
      client.off(CryptoEvent.DevicesUpdated as Parameters<typeof client.off>[0], scheduleReload);
      window.clearTimeout(reloadTimerRef.current);
    };
  }, [client]);

  const tryDeleteDevice = useCallback(
    async (deviceId: string, auth?: Record<string, unknown>): Promise<IAuthData | null> => {
      if (!client) return null;
      try {
        await client.deleteDevice(deviceId, auth as Parameters<typeof client.deleteDevice>[1]);
        return null;
      } catch (err) {
        const mErr = asMatrixError(err);
        if (mErr?.httpStatus === 401) return mErr.data as unknown as IAuthData;
        throw err;
      }
    },
    [client]
  );

  const handleUiaPassword = useCallback(
    async (password: string) => {
      if (!client || !uiaChallenge) return;
      setUiaSubmitting(true);
      try {
        const authDict = {
          type: AuthType.Password,
          identifier: { type: 'm.id.user', user: client.getUserId() ?? '' },
          password,
          session: uiaChallenge.authData.session ?? '',
        };
        const stillNeeded = await tryDeleteDevice(uiaChallenge.deviceId, authDict);
        if (stillNeeded) throw new Error('Additional auth stages required');
        toastRef.current.success(
          t('settings.sessions.sessionRemoved', { name: uiaChallenge.displayName })
        );
        setUiaChallenge(null);
        setActionLoading(null);
        await loadDevicesRef.current();
      } finally {
        setUiaSubmitting(false);
      }
    },
    [client, uiaChallenge, tryDeleteDevice, t]
  );

  const handleUiaSso = useCallback(async () => {
    if (!client || !uiaChallenge) return;
    const session = uiaChallenge.authData.session;
    if (!session) return;

    setUiaSubmitting(true);
    try {
      const fallbackUrl = client.getFallbackAuthUrl(AuthType.Sso, session);
      await waitForSsoFallback(fallbackUrl, client.getHomeserverUrl());

      const stillNeeded = await tryDeleteDevice(uiaChallenge.deviceId, { session });
      if (stillNeeded) throw new Error('Additional auth stages required');

      toastRef.current.success(
        t('settings.sessions.sessionRemoved', { name: uiaChallenge.displayName })
      );
      setUiaChallenge(null);
      setActionLoading(null);
      await loadDevicesRef.current();
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'sso_popup_closed'
          ? t('settings.sessions.ssoCancelled')
          : t('settings.sessions.removeSessionFailed', { error: getErrorMessage(err) });
      toastRef.current.error(message);
    } finally {
      setUiaSubmitting(false);
    }
  }, [client, uiaChallenge, tryDeleteDevice, t]);

  const handleUiaCancel = useCallback(() => {
    setUiaChallenge(null);
    setActionLoading(null);
  }, []);

  const handleNonUiaError = useCallback(
    async (deviceId: string, displayName: string, accountInfo: AccountManagementInfo | null) => {
      if (!client) return;
      if (accountInfo) {
        window.open(
          buildAccountManagementUrl(accountInfo, deviceId),
          '_blank',
          'noopener,noreferrer'
        );
        toastRef.current.info(t('settings.sessions.accountManagementOpened'));
        return;
      }
      try {
        const authData = await tryDeleteDevice(deviceId);
        if (authData === null) {
          await loadDevicesRef.current();
          return;
        }
        if (offersPassword(authData.flows) || offersSso(authData.flows)) {
          setUiaChallenge({ authData, deviceId, displayName });
          return;
        }
      } catch {
        // fall through to error toast
      }
      toastRef.current.error(t('settings.sessions.sessionNotSupported'));
    },
    [client, tryDeleteDevice, t]
  );

  const handleRemove = useCallback(
    async (deviceId: string, displayName: string) => {
      if (!client) return;
      const ok = await confirm(
        t('settings.sessions.removeSession'),
        t('settings.sessions.removeSessionConfirm', { name: displayName }),
        true
      );
      if (!ok) return;
      if (actionLoading) return;
      setActionLoading(deviceId);

      const accountInfo = await getAccountManagementInfo(client);
      if (accountInfo) {
        await handleNonUiaError(deviceId, displayName, accountInfo);
        setActionLoading(null);
        return;
      }

      try {
        const authData = await tryDeleteDevice(deviceId);
        if (authData === null) {
          toastRef.current.success(t('settings.sessions.sessionRemoved', { name: displayName }));
          await loadDevicesRef.current();
          setActionLoading(null);
          return;
        }
        const flows = authData.flows;
        if (!offersPassword(flows) && !offersSso(flows)) {
          await handleNonUiaError(deviceId, displayName, null);
          setActionLoading(null);
          return;
        }
        setUiaChallenge({ authData, deviceId, displayName });
      } catch (err) {
        const mErr = asMatrixError(err);
        if (!mErr || mErr.httpStatus !== 401) {
          await handleNonUiaError(deviceId, displayName, null);
        } else {
          toastRef.current.error(
            t('settings.sessions.removeSessionFailed', { error: getErrorMessage(err) })
          );
        }
        setActionLoading(null);
      }
    },
    [client, actionLoading, confirm, tryDeleteDevice, handleNonUiaError, t]
  );

  const handleRename = useCallback(
    async (deviceId: string, newName: string) => {
      if (!client) return;
      const trimmed = newName.trim();
      if (!trimmed) return;
      setActionLoading(deviceId);
      try {
        await client.setDeviceDetails(deviceId, { display_name: trimmed });
        await loadDevicesRef.current();
      } catch (err) {
        toastRef.current.error(
          t('settings.sessions.renameSessionFailed', { error: getErrorMessage(err) })
        );
      } finally {
        setActionLoading(null);
      }
    },
    [client, t]
  );

  const handleVerify = useCallback(
    async (deviceId: string) => {
      if (!client) return;
      const crypto = client.getCrypto();
      if (!crypto) {
        toastRef.current.error(t('settings.sessions.cryptoNotAvailable'));
        return;
      }
      setActionLoading(deviceId);
      try {
        const request = await crypto.requestDeviceVerification(client.getUserId() ?? '', deviceId);
        verificationTeardownRef.current?.();
        verificationTeardownRef.current = startSasVerification(request, setEmojiModal);
        const waitForDone = () =>
          new Promise<'done' | 'cancelled'>((resolve) => {
            const check = () => {
              const p = request.phase;
              if (p === VerificationPhase.Done || p === VerificationPhase.Cancelled)
                resolve(p === VerificationPhase.Done ? 'done' : 'cancelled');
              else request.once('change' as Parameters<typeof request.once>[0], check);
            };
            check();
          });
        waitForDone().then((outcome) => {
          if (outcome === 'done') loadDevicesRef.current();
        });
      } catch (err) {
        toastRef.current.error(
          t('settings.sessions.startVerificationFailed', { error: getErrorMessage(err) })
        );
      } finally {
        setActionLoading(null);
      }
    },
    [client, setEmojiModal, t]
  );

  return (
    <div>
      <h2 className={layoutCss.panelTitle}>{t('settings.sessions.title')}</h2>
      {linkingDevice && client && (
        <LinkDeviceModal
          client={client}
          onClose={() => {
            setLinkingDevice(false);
            void loadDevices();
          }}
        />
      )}

      {(() => {
        const currentDevice = devices.find((d) => d.isCurrentDevice);
        const otherDevices = devices.filter((d) => !d.isCurrentDevice);

        return (
          <>
            <div className={layoutCss.section}>
              <h3 className={layoutCss.sectionTitle}>{t('settings.sessions.currentDevice')}</h3>
              {loading ? (
                <div className={css.spinner}>
                  <SpinnerGapIcon size={20} className="icon-spin" />
                </div>
              ) : currentDevice ? (
                <DeviceCard
                  device={currentDevice}
                  actionLoading={actionLoading}
                  onVerify={handleVerify}
                  onRemove={handleRemove}
                  onRename={handleRename}
                  belowRow={
                    currentDevice.isVerified === false ? (
                      <div className={css.recoveryKeyBox}>
                        <p className={css.recoveryKeyHint}>
                          {canVerify
                            ? t('settings.sessions.verifyThisSession')
                            : t('settings.sessions.cannotVerifyThisSession')}
                        </p>
                        <div className={css.recoveryKeyActions}>
                          {hasOtherVerifiedSession && (
                            <Button
                              variant="primary"
                              size="sm"
                              loading={verifyBusy === 'device'}
                              disabled={verifyBusy !== null}
                              onClick={verifyWithOtherDevice}
                            >
                              <DevicesIcon size={14} />
                              {t('verifySession.useOtherDevice')}
                            </Button>
                          )}
                          {hasRecoveryKey && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={verifyBusy === 'key'}
                              disabled={verifyBusy !== null}
                              onClick={async () => {
                                await verifyWithRecoveryKey();
                                await loadDevices();
                              }}
                            >
                              <KeyIcon size={14} />
                              {t('verifySession.useRecoveryKey')}
                            </Button>
                          )}
                          {!canVerify && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setSettingsPage('encryption')}
                            >
                              {t('settings.encryption.title')}
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : null
                  }
                  extraMenuItems={[
                    {
                      label: t('settings.account.logout'),
                      icon: <SignOutIcon size={16} />,
                      danger: true,
                      onClick: () => logout(),
                    },
                  ]}
                />
              ) : (
                <p className={css.emptyState}>{t('settings.sessions.noSessionsFound')}</p>
              )}
            </div>

            <div className={layoutCss.divider} />

            <div className={layoutCss.section}>
              <h3 className={layoutCss.sectionTitle}>{t('settings.sessions.yourDevices')}</h3>
              <p className={css.sessionNote}>{t('settings.sessions.devicesDescription')}</p>

              {uiaChallenge && (
                <UiaPanel
                  challenge={uiaChallenge}
                  onSubmitPassword={handleUiaPassword}
                  onSso={handleUiaSso}
                  onCancel={handleUiaCancel}
                  submitting={uiaSubmitting}
                />
              )}

              {!uiaChallenge && (
                <div className={css.sessionActions}>
                  <button
                    type="button"
                    className={layoutCss.actionBtnSecondary}
                    onClick={loadDevices}
                    disabled={loading}
                  >
                    <ArrowClockwiseIcon size={14} />
                    {t('common.refresh')}
                  </button>
                  {qrLinkAvailable && sessionStatus === 'verified' && (
                    <button
                      type="button"
                      className={layoutCss.actionBtn}
                      onClick={() => setLinkingDevice(true)}
                    >
                      <QrCodeIcon size={14} />
                      {t('qrLogin.linkTitle')}
                    </button>
                  )}
                </div>
              )}

              {loading ? (
                <div className={css.spinner}>
                  <SpinnerGapIcon size={20} className="icon-spin" />
                </div>
              ) : otherDevices.length === 0 ? (
                <p className={css.emptyState}>{t('settings.sessions.noSessionsFound')}</p>
              ) : (
                <div className={css.deviceList}>
                  {otherDevices.map((d) => (
                    <DeviceCard
                      key={d.deviceId}
                      device={d}
                      actionLoading={actionLoading}
                      onVerify={handleVerify}
                      onRemove={handleRemove}
                      onRename={handleRename}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}
