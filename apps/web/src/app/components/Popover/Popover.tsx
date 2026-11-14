import { useRef, useEffect, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  computePosition,
  autoUpdate,
  flip,
  shift,
  offset,
  size,
  type Placement,
} from '@floating-ui/dom';
import { useSwipeDownDismiss } from '@/app/hooks/useSwipeDownDismiss';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { useBackToClose } from '@/app/hooks/useBackToClose';
import { usePortalContainer } from '@/app/components/PortalContainer';
import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import * as css from './Popover.css';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: React.ReactNode;
  placement?: Placement;
  role?: string;
  id?: string;
  labelledBy?: string;
  matchAnchorWidth?: boolean;
  contentWidth?: boolean;
  dense?: boolean;
  shiftCrossAxis?: boolean;
  className?: string;
  popoverRef?: RefObject<HTMLDivElement | null>;
  maxHeight?: number;
}

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  placement = 'bottom-start',
  role = 'menu',
  id,
  labelledBy,
  matchAnchorWidth,
  contentWidth,
  dense,
  shiftCrossAxis,
  className,
  popoverRef: externalRef,
  maxHeight,
}: PopoverProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = externalRef ?? innerRef;
  // Same breakpoint as the context menu: phones and touch tablets get bottom sheets.
  const sheet = useMediaQuery(PANEL_OVERLAY_QUERY);
  const portalContainer = usePortalContainer();

  useBackToClose(open && sheet, onClose);
  useSwipeDownDismiss({ enabled: open && sheet, sheetRef: surfaceRef, onClose });

  useEffect(() => {
    if (!open || sheet || !anchorRef.current || !surfaceRef.current) return;
    const cleanup = autoUpdate(anchorRef.current, surfaceRef.current, () => {
      if (!anchorRef.current?.isConnected || !surfaceRef.current) return;
      const surface = surfaceRef.current;

      const sizing = size({
        padding: 8,
        apply({ availableWidth, availableHeight }) {
          if (matchAnchorWidth) {
            surface.style.minWidth = `${anchorRef.current!.getBoundingClientRect().width}px`;
          }
          surface.style.maxWidth = `${availableWidth}px`;
          surface.style.maxHeight = `${Math.min(availableHeight, maxHeight ?? Infinity)}px`;
        },
      });

      computePosition(anchorRef.current, surface, {
        placement,
        middleware: [offset(8), flip(), shift({ padding: 8, crossAxis: shiftCrossAxis }), sizing],
      }).then(({ x, y }) => {
        Object.assign(surface.style, { left: `${x}px`, top: `${y}px` });
      });
    });
    return cleanup;
  }, [open, sheet, placement, anchorRef, surfaceRef, matchAnchorWidth, shiftCrossAxis, maxHeight]);

  useEffect(() => {
    if (!open || sheet) return;
    const handleMouseDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (anchorRef.current?.contains(el)) return;
      if (surfaceRef.current?.contains(el)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const doc = portalContainer.ownerDocument;
    doc.addEventListener('mousedown', handleMouseDown);
    doc.addEventListener('keydown', handleKeyDown);
    return () => {
      doc.removeEventListener('mousedown', handleMouseDown);
      doc.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, sheet, onClose, anchorRef, surfaceRef, portalContainer]);

  // A sheet has no outside-press handler: its backdrop closes it, and Escape still does.
  useEffect(() => {
    if (!open || !sheet) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const doc = portalContainer.ownerDocument;
    doc.addEventListener('keydown', handleKeyDown);
    return () => doc.removeEventListener('keydown', handleKeyDown);
  }, [open, sheet, onClose, portalContainer]);

  if (!open) return null;

  return createPortal(
    <>
      {sheet && (
        <div className={css.sheetBackdrop} data-sheet-scrim onClick={onClose} aria-hidden="true" />
      )}
      <div
        ref={surfaceRef}
        id={id}
        role={role}
        data-popover
        aria-labelledby={labelledBy}
        className={[
          css.popover,
          sheet ? css.popoverSheet : undefined,
          dense ? css.popoverDense : undefined,
          matchAnchorWidth ? css.popoverMatchWidth : undefined,
          contentWidth ? css.popoverContentWidth : undefined,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {sheet && <div className={css.sheetHandle} aria-hidden="true" />}
        {children}
      </div>
    </>,
    portalContainer
  );
}
