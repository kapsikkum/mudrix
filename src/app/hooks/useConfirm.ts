import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { confirmModalAtom } from '@/app/store/atoms';

interface ConfirmOptions {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  cancelPrimary?: boolean;
  alert?: boolean;
}

export function useConfirm() {
  const setConfirm = useSetAtom(confirmModalAtom);

  return useCallback(
    ({ title, message, danger, confirmLabel, cancelLabel, cancelPrimary, alert }: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirm({
          open: true,
          title,
          message,
          danger,
          confirmLabel,
          cancelLabel,
          cancelPrimary,
          alert,
          resolve,
        });
      }),
    [setConfirm]
  );
}
