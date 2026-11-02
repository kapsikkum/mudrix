import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SelectOption } from './Select.types';

interface UseSelectMenuOptions<T extends string> {
  options: readonly SelectOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

export function useSelectMenu<T extends string = string>({
  options,
  disabled,
  onChange,
}: UseSelectMenuOptions<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const enabledIndexes = options.reduce<number[]>((acc, option, i) => {
    if (!option.disabled) acc.push(i);
    return acc;
  }, []);

  const activeIndex = highlight;
  const activeId = activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  const openMenu = useCallback(() => {
    if (disabled) return;
    setHighlight(-1);
    setOpen(true);
  }, [disabled]);

  const closeMenu = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const select = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      closeMenu();
    },
    [options, onChange, closeMenu]
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      setHighlight((prev) => {
        if (enabledIndexes.length === 0) return -1;
        const position = enabledIndexes.indexOf(prev);
        const next =
          position === -1
            ? direction === 1
              ? 0
              : enabledIndexes.length - 1
            : (position + direction + enabledIndexes.length) % enabledIndexes.length;
        return enabledIndexes[next];
      });
    },
    [enabledIndexes]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      if (!open) {
        if (
          event.key === 'ArrowDown' ||
          event.key === 'ArrowUp' ||
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          openMenu();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          step(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          step(-1);
          break;
        case 'Home':
          event.preventDefault();
          setHighlight(enabledIndexes[0] ?? -1);
          break;
        case 'End':
          event.preventDefault();
          setHighlight(enabledIndexes[enabledIndexes.length - 1] ?? -1);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (activeIndex < 0) closeMenu();
          else select(activeIndex);
          break;
        case 'Escape':
          event.preventDefault();
          closeMenu();
          break;
        case 'Tab':
          closeMenu(false);
          break;
        default:
          break;
      }
    },
    [disabled, open, openMenu, step, enabledIndexes, select, activeIndex, closeMenu]
  );

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  return {
    open,
    openMenu,
    closeMenu,
    toggle: () => (open ? closeMenu() : openMenu()),
    select,
    setHighlight,
    handleKeyDown,
    activeIndex,
    activeId,
    listId,
    triggerRef,
    listRef,
  };
}
