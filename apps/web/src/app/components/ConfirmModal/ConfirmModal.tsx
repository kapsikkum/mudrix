import { useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { confirmModalAtom } from '@/app/store/atoms';
import { Modal } from '@/app/components/Modal/Modal';
import { Button } from '@/app/components/Button/Button';
import * as dialogCss from '@/app/components/Dialog/Dialog.css';

export function ConfirmModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(confirmModalAtom);

  const close = (confirmed: boolean) => {
    state.resolve?.(confirmed);
    setState({ open: false, title: '', message: '' });
  };

  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!state.open) return;
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (target?.isContentEditable) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') {
        return;
      }
      closeRef.current(true);
    };
    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  }, [state.open]);

  return (
    <Modal
      open={state.open}
      onClose={() => close(false)}
      title={state.title}
      size="sm"
      zIndex={8000}
      footer={
        <>
          {!state.alert && (
            <Button
              variant={state.cancelPrimary ? 'primary' : 'secondary'}
              size="md"
              onClick={() => close(false)}
            >
              {state.cancelLabel ?? t('common.cancel')}
            </Button>
          )}
          <Button
            variant={state.danger ? 'danger' : state.cancelPrimary ? 'secondary' : 'primary'}
            size="md"
            onClick={() => close(true)}
          >
            {state.confirmLabel ?? (state.alert ? t('common.ok') : t('common.confirm'))}
          </Button>
        </>
      }
    >
      <p className={dialogCss.dialogMessage}>{state.message}</p>
    </Modal>
  );
}
