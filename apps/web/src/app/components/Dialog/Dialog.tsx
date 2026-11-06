import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { XIcon } from '@phosphor-icons/react';
import { FocusTrap } from 'focus-trap-react';
import { IconButton } from '@/app/components/Button';
import { useBackToClose } from '@/app/hooks/useBackToClose';
import * as css from './Dialog.css';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

function isEditableField(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return el.type !== 'hidden' && !el.disabled && !el.readOnly;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  return false;
}

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  titleIcon?: React.ReactNode;
  size?: DialogSize;
  zIndex?: number;
  surface?: 'secondary' | 'primary';
  fullscreenOnMobile?: boolean;
  swipeBack?: boolean;
  maxWidth?: string;
  height?: string;
  ariaLabel?: string;
  className?: string;
  overlayClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  titleIcon,
  size = 'md',
  zIndex,
  surface = 'secondary',
  fullscreenOnMobile,
  swipeBack = false,
  maxWidth,
  height,
  className,
  overlayClassName,
  bodyClassName,
  ariaLabel,
  children,
  footer,
}: DialogProps) {
  const { t } = useTranslation();
  const generatedTitleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const panelRef = useRef<HTMLDivElement>(null);
  const pressedOnOverlay = useRef(false);
  // The back button or an edge swipe closes the dialog instead of leaving the page behind it.
  useBackToClose(open && !!onClose, () => onCloseRef.current?.());

  const rendered = open;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (!rendered) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [rendered]);

  useEffect(() => {
    if (!rendered) return;
    let disposed = false;
    let disarmed = false;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const root = panelRef.current;

    const disarm = () => {
      disarmed = true;
    };

    const focusAutofocus = () => {
      if (disposed || disarmed || !root || !root.isConnected) return;
      const el = root.querySelector<HTMLElement>('[data-dialog-autofocus]');
      if (!isEditableField(el)) return;
      const active = document.activeElement;
      if (active === el) return;
      if (active instanceof HTMLElement && root.contains(active)) return;
      el.focus();
    };

    focusAutofocus();
    raf = requestAnimationFrame(focusAutofocus);
    timer = setTimeout(focusAutofocus, 50);

    const observer = new MutationObserver(focusAutofocus);
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
      root.addEventListener('pointerdown', disarm, true);
      root.addEventListener('keydown', disarm, true);
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      observer.disconnect();
      if (root) {
        root.removeEventListener('pointerdown', disarm, true);
        root.removeEventListener('keydown', disarm, true);
      }
    };
  }, [rendered]);

  if (!rendered) return null;

  const titleId = title ? `dialog-title-${generatedTitleId}` : undefined;

  const sizeClass = css.sizes[size];
  const surfaceClass = surface === 'primary' ? css.panelPrimary : undefined;
  const fullscreenClass = fullscreenOnMobile ? css.panelFullscreenMobile : undefined;
  const panelStyle: React.CSSProperties = {};
  if (maxWidth) panelStyle.maxWidth = maxWidth;
  if (height) panelStyle.height = height;

  const overlay = (
    <div
      className={`${css.overlay}${overlayClassName ? ` ${overlayClassName}` : ''}`}
      style={zIndex !== undefined ? { zIndex } : undefined}
      role="presentation"
      data-swipe-back={swipeBack ? 'panel' : undefined}
      onPointerDown={(e) => {
        pressedOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Dragging a text selection out of the dialog ends on the overlay, which counts as a click
        // there; only a press that also began on the overlay closes it.
        const pressed = pressedOnOverlay.current;
        pressedOnOverlay.current = false;
        if (pressed && e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      <FocusTrap
        active={rendered}
        focusTrapOptions={{
          initialFocus: () => {
            const root = panelRef.current;
            const el = root?.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? null;
            return isEditableField(el) ? el : false;
          },
          fallbackFocus: () => panelRef.current ?? document.body,
          escapeDeactivates: false,
          allowOutsideClick: true,
        }}
      >
        <div
          ref={panelRef}
          className={[css.panel, sizeClass, surfaceClass, fullscreenClass, className]
            .filter(Boolean)
            .join(' ')}
          style={panelStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-label={title ? undefined : ariaLabel}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className={css.header}>
              <span className={css.title} id={titleId}>
                {titleIcon && <span className={css.titleIcon}>{titleIcon}</span>}
                {title}
              </span>
              {onClose && (
                <IconButton size="sm" onClick={onClose} aria-label={t('common.close')}>
                  <XIcon size={16} />
                </IconButton>
              )}
            </div>
          )}

          <div className={`${css.body}${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>

          {footer && <div className={css.footer}>{footer}</div>}
        </div>
      </FocusTrap>
    </div>
  );

  return createPortal(overlay, document.body);
}
