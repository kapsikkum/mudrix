import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QrLoginControl, type WizardClient as MatrixClient } from '@wizardchat/core';
import { CheckCircleIcon, QrCodeIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Spinner } from '@/app/components/Spinner';
import { QrCode } from './QrCode';
import { decodeQrData, failureKey, reasonOf } from './failure';
import * as css from './QrLogin.css';

type Phase =
  | { kind: 'starting' }
  | { kind: 'showQr'; code: Uint8Array }
  | { kind: 'confirm' }
  | { kind: 'approve' }
  | { kind: 'done' }
  | { kind: 'error'; messageKey: string };

export function LinkDeviceModal({
  client,
  onClose,
}: {
  client: MatrixClient;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const controlRef = useRef<QrLoginControl | null>(null);
  const approveUrlRef = useRef<string | undefined>(undefined);

  const openApproval = () => {
    const url = approveUrlRef.current;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    let aborted = false;
    const control = new QrLoginControl();
    controlRef.current = control;
    const fail = (messageKey: string) => {
      if (!aborted) setPhase({ kind: 'error', messageKey });
    };
    client
      .grantLoginWithQr(null, control, (status) => {
        if (aborted) return;
        switch (status.type) {
          case 'showQr':
            setPhase({ kind: 'showQr', code: decodeQrData(status.data) });
            return;
          case 'enterCheckCode':
            setPhase({ kind: 'confirm' });
            return;
          case 'approveInBrowser':
            approveUrlRef.current = status.url;
            setPhase({ kind: 'approve' });
            openApproval();
            control.confirm().catch((err: unknown) => fail(failureKey(reasonOf(err))));
            return;
          case 'done':
            setPhase({ kind: 'done' });
            return;
        }
      })
      .then(() => {
        if (!aborted) setPhase({ kind: 'done' });
      })
      .catch((err: unknown) => fail(failureKey(reasonOf(err))));
    return () => {
      aborted = true;
      void control.cancel().catch(() => {});
    };
  }, [client]);

  const confirmCode = async () => {
    const control = controlRef.current;
    if (!control) return;
    if (!/^\d{2}$/.test(enteredCode.trim())) {
      setCodeError(true);
      return;
    }
    setPhase({ kind: 'approve' });
    try {
      await control.sendCheckCode(Number(enteredCode.trim()));
    } catch (err) {
      setPhase({ kind: 'error', messageKey: failureKey(reasonOf(err)) });
    }
  };

  const decline = async () => {
    await controlRef.current?.cancel().catch(() => {});
    onClose();
  };

  const renderBody = () => {
    switch (phase.kind) {
      case 'starting':
        return <Spinner />;
      case 'showQr':
        return (
          <>
            <QrCode data={phase.code} label={t('qrLogin.qrLabel')} />
            <ol className={css.steps}>
              <li>{t('qrLogin.linkStep1')}</li>
              <li>{t('qrLogin.linkStep2')}</li>
              <li>{t('qrLogin.linkStep3')}</li>
            </ol>
          </>
        );
      case 'confirm':
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
                if (e.key === 'Enter') void confirmCode();
              }}
              error={codeError ? t('qrLogin.codeMismatch') : undefined}
              aria-label={t('qrLogin.enterCode')}
              data-dialog-autofocus
            />
          </>
        );
      case 'approve':
        return (
          <>
            <Spinner />
            <p className={css.text}>{t('qrLogin.approveInBrowser')}</p>
            <Button variant="secondary" size="sm" onClick={openApproval}>
              {t('qrLogin.openApproval')}
            </Button>
          </>
        );
      case 'done':
        return (
          <>
            <CheckCircleIcon size={40} weight="fill" />
            <p className={css.text}>{t('qrLogin.linkDone')}</p>
          </>
        );
      case 'error':
        return <p className={css.error}>{t(phase.messageKey)}</p>;
    }
  };

  const footer =
    phase.kind === 'confirm' ? (
      <>
        <Button variant="secondary" onClick={decline}>
          {t('qrLogin.decline')}
        </Button>
        <Button variant="primary" disabled={enteredCode.length !== 2} onClick={confirmCode}>
          {t('common.continue')}
        </Button>
      </>
    ) : (
      <Button
        variant={phase.kind === 'done' ? 'primary' : 'secondary'}
        onClick={phase.kind === 'showQr' || phase.kind === 'approve' ? decline : onClose}
      >
        {phase.kind === 'done' || phase.kind === 'error' ? t('common.close') : t('common.cancel')}
      </Button>
    );

  return (
    <Modal
      open
      onClose={phase.kind === 'done' || phase.kind === 'error' ? onClose : decline}
      size="sm"
      title={t('qrLogin.linkTitle')}
      titleIcon={<QrCodeIcon size={18} />}
      footer={footer}
    >
      <div className={css.body}>{renderBody()}</div>
    </Modal>
  );
}
