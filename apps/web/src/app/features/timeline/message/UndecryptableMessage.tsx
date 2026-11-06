import { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  ArrowClockwiseIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretUpIcon,
  DownloadSimpleIcon,
  LockIcon,
  LockOpenIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import type { KeyRestoreProgress, UtdReason, WizardClient as MatrixClient } from '@wizardchat/core';
import { Button } from '@/app/components/Button';
import { sessionVerificationAtom } from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { useSessionVerificationActions } from '@/app/features/device/useSessionVerificationActions';
import { expandedUndecryptableRoomsAtom, undecryptableHelpKind } from './undecryptable';
import * as css from './UndecryptableMessage.css';

interface HelpProps {
  client: MatrixClient;
  roomId: string;
  reason: UtdReason | null;
  /** Extra buttons shown after the recovery actions. */
  children?: React.ReactNode;
}

/** Why a message cannot be read here and what can be done, only mounted while it is open. */
function UndecryptableHelp({ client, roomId, reason, children }: HelpProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const verification = useAtomValue(sessionVerificationAtom);
  const { busy, verifyWithOtherDevice, verifyWithRecoveryKey } =
    useSessionVerificationActions(client);
  const kind = undecryptableHelpKind(reason, verification.status !== 'unverified');
  const canAct = kind === 'unverified';
  const canRetry = kind === 'unverified' || kind === 'waiting' || kind === 'noBackup';
  const [backupReadable, setBackupReadable] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [restore, setRestore] = useState<KeyRestoreProgress | null>(null);
  const restoring = restore !== null;

  // Only a backup whose key is on this device can be restored from
  useEffect(() => {
    let alive = true;
    client
      .encryptionStatus()
      .then((status) => alive && setBackupReadable(status.backupEnabled))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, verification.status]);

  const retry = async () => {
    setRetrying(true);
    try {
      await client.retryDecryption(roomId);
    } catch (err) {
      toast.error(t('timeline.undecryptable.retryFailed', { error: getErrorMessage(err) }));
    } finally {
      setRetrying(false);
    }
  };

  const restoreBackup = async () => {
    setRestore({ roomsDone: 0, roomsTotal: 0, keysRestored: 0 });
    try {
      const result = await client.restoreKeyBackup(setRestore);
      toast.success(t('timeline.undecryptable.restored', { keys: result.keysRestored }));
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      toast.error(
        code === 'noKeyBackup'
          ? t('timeline.undecryptable.restoreNeedsKey')
          : t('timeline.undecryptable.restoreFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setRestore(null);
    }
  };

  return (
    <div className={css.help}>
      <p className={css.helpText}>{t(`timeline.undecryptable.help.${kind}`)}</p>
      {restoring && (
        <p className={css.helpText} role="status">
          {t('timeline.undecryptable.restoreProgress', {
            done: restore.roomsDone,
            total: restore.roomsTotal,
          })}
        </p>
      )}
      <div className={css.helpActions}>
        {canAct && verification.hasOtherVerifiedSession && (
          <Button
            variant="primary"
            size="sm"
            onClick={verifyWithOtherDevice}
            disabled={busy !== null}
          >
            <ShieldCheckIcon size={14} />
            {t('timeline.undecryptable.verifySession')}
          </Button>
        )}
        {canAct && verification.hasRecoveryKey && (
          <Button
            variant={verification.hasOtherVerifiedSession ? 'secondary' : 'primary'}
            size="sm"
            onClick={verifyWithRecoveryKey}
            disabled={busy !== null}
          >
            <LockOpenIcon size={14} />
            {t('settings.keyBackup.enterRecoveryKeyBtn')}
          </Button>
        )}
        {canRetry && backupReadable && (
          <Button variant="primary" size="sm" onClick={restoreBackup} disabled={restoring}>
            <DownloadSimpleIcon size={14} />
            {t('timeline.undecryptable.restoreBackup')}
          </Button>
        )}
        {canRetry && (
          <Button variant="ghost" size="sm" onClick={retry} disabled={retrying || restoring}>
            <ArrowClockwiseIcon size={14} />
            {t('timeline.undecryptable.retry')}
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

interface NoteProps {
  client: MatrixClient;
  roomId: string;
  reason: UtdReason | null;
  /** The sentence for this message (already translated). */
  text: string;
}

/** The line of one message this device cannot read, with a way to open the help for it. */
export function UndecryptableNote({ client, roomId, reason, text }: NoteProps) {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <span className={css.note}>
      <span className={css.noteLine}>
        <span className={css.title}>
          <LockIcon size={14} /> {text}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((open) => !open)}
        >
          {helpOpen ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />}
          {t('timeline.undecryptable.howToFix')}
        </Button>
      </span>
      {helpOpen && <UndecryptableHelp client={client} roomId={roomId} reason={reason} />}
    </span>
  );
}

interface FoldProps {
  client: MatrixClient;
  roomId: string;
  count: number;
  reason: UtdReason | null;
}

/** Stands in for a run of unreadable messages: one row that says how many, and how to fix it. */
export function UndecryptableFold({ client, roomId, count, reason }: FoldProps) {
  const { t } = useTranslation();
  const [, setExpandedRooms] = useAtom(expandedUndecryptableRoomsAtom);
  const [helpOpen, setHelpOpen] = useState(false);

  const showAll = () =>
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      next.add(roomId);
      return next;
    });

  return (
    <div className={css.fold}>
      <div className={css.header}>
        <span className={css.title}>
          <LockIcon size={14} />
          {t('timeline.undecryptable.group', { count })}
        </span>
        <span className={css.headerActions}>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((open) => !open)}
          >
            {helpOpen ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />}
            {t('timeline.undecryptable.howToFix')}
          </Button>
          <Button variant="ghost" size="sm" onClick={showAll}>
            {t('timeline.undecryptable.showAll')}
          </Button>
        </span>
      </div>
      {helpOpen && <UndecryptableHelp client={client} roomId={roomId} reason={reason} />}
    </div>
  );
}

/** The "Collapse" button that follows the first message of an expanded run. */
export function UndecryptableCollapse({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const [, setExpandedRooms] = useAtom(expandedUndecryptableRoomsAtom);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        setExpandedRooms((prev) => {
          const next = new Set(prev);
          next.delete(roomId);
          return next;
        })
      }
    >
      {t('timeline.undecryptable.collapse')}
    </Button>
  );
}

interface HistoryNoticeProps {
  client: MatrixClient;
  roomId: string;
  reason: UtdReason | null;
  loading: boolean;
  onLoadOlder: () => void;
}

/**
 * Shown at the top of the timeline once loading older history stopped because it was all messages
 * this device cannot decrypt. Says why, once, with the same recovery actions as a single message,
 * instead of fetching page after page nobody can read here.
 */
export function UndecryptableHistoryNotice({
  client,
  roomId,
  reason,
  loading,
  onLoadOlder,
}: HistoryNoticeProps) {
  const { t } = useTranslation();
  return (
    <div className={css.historyNotice} role="status">
      <span className={css.historyNoticeTitle}>
        <LockIcon size={14} />
        {t('timeline.undecryptable.historyPaused')}
      </span>
      <div className={css.reason}>{t('timeline.undecryptable.historyPausedReason')}</div>
      <UndecryptableHelp client={client} roomId={roomId} reason={reason}>
        <Button variant="ghost" size="sm" onClick={onLoadOlder} disabled={loading}>
          <ArrowUpIcon size={14} />
          {t('timeline.undecryptable.loadOlder')}
        </Button>
      </UndecryptableHelp>
    </div>
  );
}
