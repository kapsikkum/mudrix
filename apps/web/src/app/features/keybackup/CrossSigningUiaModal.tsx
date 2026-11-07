import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { LockIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { crossSigningUiaAtom } from '@/app/store/atoms';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { vars } from '@/theme/vars.css';

type CloseResult =
  { type: 'password'; password: string } | { type: 'sso' } | { type: 'reset' } | null;

export function CrossSigningUiaModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(crossSigningUiaAtom);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state.open) {
      setPassword('');
      setSubmitting(false);
    }
  }, [state.open]);

  const close = (result: CloseResult) => {
    state.resolve?.(result);
    setState({ open: false, offerSso: false, resolve: undefined });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    // Resolve the promise - the callback will re-open the modal with an error
    // if the password is wrong, or close it permanently on success/cancel.
    close({ type: 'password', password: password.trim() });
  };

  if (state.resetUrl) {
    return (
      <Modal
        open={state.open}
        onClose={() => close(null)}
        title={t('settings.keyBackup.uiaResetTitle')}
        size="sm"
        zIndex={9000}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" onClick={() => close(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                window.open(state.resetUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <ArrowSquareOutIcon size={14} style={{ marginRight: 6 }} />
              {t('settings.keyBackup.uiaResetCta')}
            </Button>
            <Button variant="secondary" onClick={() => close({ type: 'reset' })}>
              {t('common.retry')}
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: '0.9rem', color: vars.color.textMuted }}>
          {t('settings.keyBackup.uiaResetDescription')}
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={state.open}
      onClose={() => close(null)}
      title={t('settings.keyBackup.uiaTitle')}
      size="sm"
      zIndex={9000}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={() => close(null)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={submitting || !password.trim()}
            loading={submitting}
          >
            <LockIcon size={14} style={{ marginRight: 6 }} />
            {t('common.confirm')}
          </Button>
        </div>
      }
    >
      <p style={{ marginBottom: 16, fontSize: '0.9rem', color: vars.color.textMuted }}>
        {t('settings.keyBackup.uiaDescription')}
      </p>

      <form onSubmit={handleSubmit}>
        <Input
          type="password"
          label={t('settings.keyBackup.uiaPasswordLabel')}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          disabled={submitting}
          autoComplete="current-password"
          data-dialog-autofocus
        />
        {state.error && (
          <p style={{ color: vars.color.error, fontSize: '0.85rem', marginTop: 6 }}>
            {state.error}
          </p>
        )}
      </form>

      {state.offerSso && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${vars.color.border}`, paddingTop: 16 }}>
          <p style={{ fontSize: '0.85rem', color: vars.color.textMuted, marginBottom: 8 }}>
            {t('common.or')}
          </p>
          <Button variant="secondary" onClick={() => close({ type: 'sso' })}>
            <ArrowSquareOutIcon size={14} style={{ marginRight: 6 }} />
            {t('common.continueWithSso')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
