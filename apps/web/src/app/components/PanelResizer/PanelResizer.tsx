import { useCallback, useRef, useState } from 'react';
import * as css from './PanelResizer.css';

interface PanelResizerProps {
  width: number;
  onWidthChange: (width: number) => void;
  defaultWidth?: number;
  min?: number;
  max?: number;
}

export function PanelResizer({ width, onWidthChange, defaultWidth, min, max }: PanelResizerProps) {
  const stateRef = useRef({ width, min, max });
  stateRef.current.width = width;
  stateRef.current.min = min;
  stateRef.current.max = max;
  const [dragging, setDragging] = useState(false);

  const onDoubleClick = useCallback(() => {
    if (defaultWidth !== undefined) onWidthChange(defaultWidth);
  }, [defaultWidth, onWidthChange]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startWidth = stateRef.current.width;
      const onMove = (ev: PointerEvent) => {
        const { min, max } = stateRef.current;
        const next = startWidth + startX - ev.clientX;
        const clamped =
          min !== undefined && max !== undefined
            ? Math.round(Math.min(max, Math.max(min, next)))
            : Math.round(next);
        onWidthChange(clamped);
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onWidthChange]
  );

  return (
    <div
      className={css.handle}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      data-dragging={dragging ? 'true' : undefined}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
