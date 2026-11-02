import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { promptModalAtom } from '@/app/store/atoms';
import { useEffect, useState } from 'react';
import * as dialogCss from '@/app/components/Dialog/Dialog.css';
import { Modal } from '@/app/components/Modal/Modal';
import { Button } from '@/app/components/Button/Button';
import { Input } from '@/app/components/Input/Input';

export function PromptModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(promptModalAtom);
  const [value, setValue] = useState(state.defaultValue ?? '');

  useEffect(() => {
    if (state.open) setValue(state.defaultValue ?? '');
  }, [state.open, state.defaultValue]);

  const close = (submit: boolean) => {
    state.resolve?.(submit ? value : null);
    setState({ open: false, title: '', message: '' });
  };

  return (
    <Modal
      open={state.open}
      onClose={() => close(false)}
      title={state.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={() => close(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="md" onClick={() => close(true)}>
            {t('common.ok')}
          </Button>
        </>
      }
    >
      {state.message && <p className={dialogCss.dialogMessage}>{state.message}</p>}
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && close(true)}
        data-dialog-autofocus
      />
    </Modal>
  );
}
