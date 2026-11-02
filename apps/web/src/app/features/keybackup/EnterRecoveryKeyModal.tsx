import { useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { LockOpenIcon } from '@phosphor-icons/react';
import { enterRecoveryKeyModalAtom } from '@/app/store/atoms';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import * as css from './EnterRecoveryKeyModal.css';

export function EnterRecoveryKeyModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(enterRecoveryKeyModalAtom);
  const [value, setValue] = useState('');

  const close = (result: string | null) => {
    state.resolve?.(result);
    setState({ open: false, resolve: undefined });
    setValue('');
  };

  const trimmed = value.trim();

  return (
    <Modal
      open={state.open}
      onClose={() => close(null)}
      title={t('settings.keyBackup.enterRecoveryKeyTitle')}
      size="md"
      zIndex={8500}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={() => close(null)}>
            {t('common.cancel')}
          </Button>

          <Button
            variant="primary"
            size="md"
            disabled={trimmed.length === 0}
            onClick={() => close(trimmed)}
          >
            <LockOpenIcon size={14} className={css.iconMargin} />
            {t('settings.keyBackup.restoreBtn')}
          </Button>
        </>
      }
    >
      <textarea
        data-dialog-autofocus
        className={css.textarea}
        placeholder={'EsTq XofW VuGm Tele ...'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </Modal>
  );
}
