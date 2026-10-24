import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  linkNewDeviceByGeneratingQR,
  type MSC4108SignInWithQR,
} from 'matrix-js-sdk/lib/rendezvous';
import { CheckCircleIcon, QrCodeIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Spinner } from '@/app/components/Spinner';
import { QrCode } from './QrCode';
import { failureKey, reasonOf } from './failure';
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
  const flowRef = useRef<MSC4108SignInWithQR | null>(null);
  const approveUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const abort = new AbortController();
    const fail = (messageKey: string) => {
      if (!abort.signal.aborted) setPhase({ kind: 'error', messageKey });
    };
    (async () => {
      const flow = await linkNewDeviceByGeneratingQR(
        client,
        (reason) => fail(failureKey(reason)),
        abort.signal
      );
      flowRef.current = flow;
      if (abort.signal.aborted || !flow.code) return;
      setPhase({ kind: 'showQr', code: flow.code });
      await flow.negotiateProtocols();
      const { verificationUri } = await flow.deviceAuthorizationGrant();
      approveUrlRef.current = verificationUri;
      if (!abort.signal.aborted) setPhase({ kind: 'confirm' });
    })().catch((err: unknown) => fail(failureKey(reasonOf(err))));
    return () => abort.abort();
  }, [client]);

  const openApproval = () => {
    const url = approveUrlRef.current;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const confirmCode = async () => {
    const flow = flowRef.current;
    if (!flow) return;
    if (enteredCode.trim() !== flow.checkCode) {
      setCodeError(true);
      return;
    }
    setPhase({ kind: 'approve' });
    openApproval();
    try {
      await flow.shareSecrets();
      setPhase({ kind: 'done' });
    } catch (err) {
      setPhase({ kind: 'error', messageKey: failureKey(reasonOf(err)) });
    }
  };

  const decline = async () => {
    await flowRef.current?.declineLoginOnExistingDevice().catch(() => {});
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
