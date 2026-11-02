import { Dialog } from '@/app/components/Dialog/Dialog';
import type { DialogSize } from '@/app/components/Dialog/Dialog';

export type ModalSize = DialogSize;

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  titleIcon?: React.ReactNode;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  zIndex?: number;
}

export function Modal({
  open,
  onClose,
  title,
  titleIcon,
  size = 'md',
  children,
  footer,
  zIndex,
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={titleIcon}
      size={size}
      zIndex={zIndex}
      footer={footer}
    >
      {children}
    </Dialog>
  );
}
