import { useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { QrLoginControl, WizardClient } from '@wizardchat/core';
import { QrCodeIcon } from '@phosphor-icons/react';
import { credentialsAtom } from '@/app/store/atoms';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Spinner } from '@/app/components/Spinner';
import { appInfo, loadCore } from '@/client/initMatrix';
import { toCredentials } from '@/client/accounts';
import { activeAccount, deleteStore, newStoreConfig } from '@/core/storage';
import { rememberSignIn } from '@/core/client';
import { QrCode } from './QrCode';
import { decodeQrData, failureKey, reasonOf } from './failure';
import * as css from './QrLogin.css';

type Phase =
  | { kind: 'starting' }
  | { kind: 'showQr'; code: Uint8Array }
  | { kind: 'enterCheckCode' }
  | { kind: 'showCheckCode'; checkCode: string }
  | { kind: 'waitingForApproval'; checkCode?: string; userCode?: string }
  | { kind: 'finishing' }
  | { kind: 'error'; messageKey: string };

export function SignInWithQrModal({
  serverUrl,
  onClose,
  onSuccess,
}: {
  serverUrl: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const setCredentials = useSetAtom(credentialsAtom);
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const controlRef = useRef<QrLoginControl | null>(null);

  useEffect(() => {
    let aborted = false;
    const fail = (messageKey: string) => {
      if (!aborted) setPhase({ kind: 'error', messageKey });
    };
    const control = new QrLoginControl();
    controlRef.current = control;
    const store = newStoreConfig();
    (async () => {
      await loadCore();
      const client = await WizardClient.loginWithQr(
        serverUrl,
        store,
        appInfo(),
        null,
        control,
        (status) => {
          if (aborted) return;
          switch (status.type) {
            case 'showQr':
              setPhase({ kind: 'showQr', code: decodeQrData(status.data) });
              return;
            case 'enterCheckCode':
              setPhase({ kind: 'enterCheckCode' });
              return;
            case 'showCheckCode':
              setPhase({ kind: 'showCheckCode', checkCode: String(status.code).padStart(2, '0') });
              return;
            case 'waitingForApproval':
              setPhase((current) => ({
                kind: 'waitingForApproval',
                checkCode: current.kind === 'showCheckCode' ? current.checkCode : undefined,
                userCode: status.user_code ?? undefined,
              }));
              return;
            case 'syncingSecrets':
            case 'done':
              setPhase({ kind: 'finishing' });
              return;
          }
        }
      );
      if (aborted) {
        await client.logout().catch(() => {});
        client.free();
        await deleteStore(store);
        return;
      }
      setPhase({ kind: 'finishing' });
      rememberSignIn(client.session(), store);
      client.free();
      setCredentials(toCredentials(activeAccount()!));
      onSuccessRef.current();
    })().catch(async (err: unknown) => {
      console.error('[qrLogin]', err);
      await deleteStore(store);
      fail(failureKey(reasonOf(err)));
    });
    return () => {
      aborted = true;
      void control.cancel().catch(() => {});
    };
  }, [serverUrl, setCredentials]);

  const sendCheckCode = async () => {
    const control = controlRef.current;
    if (!control) return;
    if (!/^\d{2}$/.test(enteredCode.trim())) {
      setCodeError(true);
      return;
    }
    setPhase({ kind: 'finishing' });
    try {
      await control.sendCheckCode(Number(enteredCode.trim()));
    } catch (err) {
      setPhase({ kind: 'error', messageKey: failureKey(reasonOf(err)) });
    }
  };

  const renderBody = () => {
    switch (phase.kind) {
      case 'starting':
      case 'finishing':
        return <Spinner />;
      case 'showQr':
        return (
          <>
            <QrCode data={phase.code} label={t('qrLogin.qrLabel')} />
            <ol className={css.steps}>
              <li>{t('qrLogin.signInStep1')}</li>
              <li>{t('qrLogin.signInStep2')}</li>
              <li>{t('qrLogin.signInStep3')}</li>
            </ol>
          </>
        );
      case 'enterCheckCode':
        return (
          <>
            <p className={css.text}>{t('qrLogin.enterCode')}</p>
            <Input
              className={css.codeInput}
              inputMode="numeric"
              maxLength={2}
              value={enteredCode}
              onChange={(e) => {
                setEnteredCode(e.target.value.replace(/\D/g, ''));
                setCodeError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendCheckCode();
              }}
              error={codeError ? t('qrLogin.codeMismatch') : undefined}
              aria-label={t('qrLogin.enterCode')}
              data-dialog-autofocus
            />
          </>
        );
      case 'showCheckCode':
        return (
          <>
            <p className={css.text}>{t('qrLogin.showCode')}</p>
            <span className={css.checkCode}>{phase.checkCode}</span>
            <p className={css.text}>{t('qrLogin.waitingForApproval')}</p>
          </>
        );
      case 'waitingForApproval':
        return (
          <>
            {phase.checkCode && (
              <>
                <p className={css.text}>{t('qrLogin.showCode')}</p>
                <span className={css.checkCode}>{phase.checkCode}</span>
              </>
            )}
            {phase.userCode && (
              <>
                <p className={css.text}>{t('qrLogin.showApprovalCode')}</p>
                <span className={css.checkCode}>{phase.userCode}</span>
              </>
            )}
            <p className={css.text}>{t('qrLogin.waitingForApproval')}</p>
          </>
        );
      case 'error':
        return <p className={css.error}>{t(phase.messageKey)}</p>;
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('qrLogin.signInTitle')}
      titleIcon={<QrCodeIcon size={18} />}
      footer={
        phase.kind === 'enterCheckCode' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={enteredCode.length !== 2} onClick={sendCheckCode}>
              {t('common.continue')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {phase.kind === 'error' ? t('common.close') : t('common.cancel')}
          </Button>
        )
      }
    >
      <div className={css.body}>{renderBody()}</div>
    </Modal>
  );
}
