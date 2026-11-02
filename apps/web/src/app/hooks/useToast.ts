import { useSetAtom } from 'jotai';
import { toastsAtom, type Toast } from '@/app/store/atoms';
import { useCallback, useMemo } from 'react';

let _counter = 0;

const MAX_VISIBLE = 5;

export interface ToastOptions {
  duration?: number;
  onClick?: () => void;
  actionLabel?: string;
}

type ToastArg = number | ToastOptions | undefined;

function normalize(arg: ToastArg): ToastOptions {
  if (typeof arg === 'number') return { duration: arg };
  return arg ?? {};
}

export function useToast() {
  const setToasts = useSetAtom(toastsAtom);

  const show = useCallback(
    (message: string, type: Toast['type'] = 'info', opts: ToastOptions = {}) => {
      const id = `toast-${++_counter}-${Date.now()}`;
      setToasts((prev) => {
        // Deduplicate: if same message+type already exists, skip
        if (prev.some((t) => t.message === message && t.type === type)) return prev;

        const next = [
          ...prev,
          {
            id,
            message,
            type,
            duration: opts.duration,
            onClick: opts.onClick,
            actionLabel: opts.actionLabel,
          },
        ];
        if (next.length > MAX_VISIBLE) next.splice(0, next.length - MAX_VISIBLE);
        return next;
      });
    },
    [setToasts]
  );

  return useMemo(
    () => ({
      info: (msg: string, arg?: ToastArg) => show(msg, 'info', normalize(arg)),
      success: (msg: string, arg?: ToastArg) => show(msg, 'success', normalize(arg)),
      error: (msg: string, arg?: ToastArg) => show(msg, 'error', normalize(arg)),
      warning: (msg: string, arg?: ToastArg) => show(msg, 'warning', normalize(arg)),
    }),
    [show]
  );
}
