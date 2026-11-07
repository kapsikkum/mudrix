import { WizardClient, type UiaAuth, type UiaOutcome } from '@wizardchat/core';
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
import { getMatrixClientOrNull, logout } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import {
  emojiVerificationAtom,
  sessionVerificationAtom,
  settingsPageAtom,
} from '@/app/store/atoms';
import { useConfirm } from '@/app/hooks/useConfirm';
import { startSasVerification } from '@/app/features/device/startSasVerification';
import {
  UiaPanel,
  confirmWithSso,
  isSsoCancelled,
  offersPassword,
  offersSso,
  passwordAuth,
  uiaChallenge as uiaChallengeOf,
} from './UiaPanel';
import type { UiaChallenge } from './UiaPanel';
import { Button } from '@/app/components/Button';
import { DeviceCard } from './DeviceCard';
import type { DeviceEntry } from './DeviceCard';
import { LinkDeviceModal } from '@/app/features/qrLogin/LinkDeviceModal';
import { useSessionVerificationActions } from '@/app/features/device/useSessionVerificationActions';
import * as css from './Sessions.css';
import * as layoutCss from '../Settings.css';

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
    setQrLinkAvailable(false);
    if (!client) return;
    let cancelled = false;
    let session;
    try {
      session = client.session();
    } catch {
      return;
    }
    if (!session.oauthClientId) return;
    void WizardClient.discover(session.homeserverUrl)
      .then((info) => {
        if (!cancelled) setQrLinkAvailable(info.qrLogin);
      })
      .catch(() => {});
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
      const entries: DeviceEntry[] = (await client.devices()).map((d) => ({
        deviceId: d.deviceId,
        displayName: d.displayName || d.deviceId,
        isCurrentDevice: d.isCurrent,
        isVerified: d.isVerified,
        lastSeenIp: d.lastSeenIp,
        lastSeenTs: d.lastSeenTs,
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
    const subscription = client.watchOwnDevices(() => {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => loadDevicesRef.current(), 300);
    });
    return () => {
      subscription.cancel();
      window.clearTimeout(reloadTimerRef.current);
    };
  }, [client]);

  const tryDeleteDevice = useCallback(
    async (deviceId: string, auth?: UiaAuth): Promise<UiaOutcome> => {
      if (!client) return { status: 'done' };
      return client.deleteDevicesWithAuth([deviceId], auth ?? null);
    },
    [client]
  );

  const handleUiaPassword = useCallback(
    async (password: string) => {
      if (!client || !uiaChallenge) return;
      setUiaSubmitting(true);
      try {
        const outcome = await tryDeleteDevice(
          uiaChallenge.deviceId,
          passwordAuth(uiaChallenge, password)
        );
        if (outcome.status !== 'done') throw new Error('Additional auth stages required');
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
    setUiaSubmitting(true);
    try {
      const auth = await confirmWithSso(uiaChallenge);
      const outcome = await tryDeleteDevice(uiaChallenge.deviceId, auth);
      if (outcome.status !== 'done') throw new Error('Additional auth stages required');

      toastRef.current.success(
        t('settings.sessions.sessionRemoved', { name: uiaChallenge.displayName })
      );
      setUiaChallenge(null);
      setActionLoading(null);
      await loadDevicesRef.current();
    } catch (err) {
      const message = isSsoCancelled(err)
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
    async (deviceId: string, displayName: string, managementUrl: string | null) => {
      if (!client) return;
      if (managementUrl) {
        window.open(managementUrl, '_blank', 'noopener,noreferrer');
        toastRef.current.info(t('settings.sessions.accountManagementOpened'));
        return;
      }
      try {
        const outcome = await tryDeleteDevice(deviceId);
        if (outcome.status === 'done') {
          await loadDevicesRef.current();
          return;
        }
        if (offersPassword(outcome.flows) || offersSso(outcome.flows)) {
          setUiaChallenge(uiaChallengeOf(outcome, deviceId, displayName));
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

      const managementUrl = await client.deviceManagementUrl(deviceId).catch(() => null);
      if (managementUrl) {
        await handleNonUiaError(deviceId, displayName, managementUrl);
        setActionLoading(null);
        return;
      }

      try {
        const outcome = await tryDeleteDevice(deviceId);
        if (outcome.status === 'done') {
          toastRef.current.success(t('settings.sessions.sessionRemoved', { name: displayName }));
          await loadDevicesRef.current();
          setActionLoading(null);
          return;
        }
        if (!offersPassword(outcome.flows) && !offersSso(outcome.flows)) {
          await handleNonUiaError(deviceId, displayName, null);
          setActionLoading(null);
          return;
        }
        setUiaChallenge(uiaChallengeOf(outcome, deviceId, displayName));
      } catch {
        await handleNonUiaError(deviceId, displayName, null);
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
        await client.renameDevice(deviceId, trimmed);
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
      setActionLoading(deviceId);
      try {
        const request = await client.requestDeviceVerification(deviceId);
        verificationTeardownRef.current?.();
        verificationTeardownRef.current = startSasVerification(request, setEmojiModal);
        request.watch((status) => {
          if (status.state === 'done') loadDevicesRef.current();
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
                              {t('verification.session.useOtherDevice')}
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
                              {t('verification.session.useRecoveryKey')}
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
                      {t('auth.qr.linkTitle')}
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
