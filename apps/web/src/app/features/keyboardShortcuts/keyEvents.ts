import { IS_MAC } from '@/app/util/platform';

export function isModOnly(e: KeyboardEvent): boolean {
  return IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

export function isTextFieldTarget(e: KeyboardEvent): boolean {
  const target = e.target instanceof Element ? e.target : null;
  return !!target?.closest('input, textarea, select');
}

export function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target instanceof Element ? e.target : null;
  return !!target?.closest('input, textarea, select, [contenteditable="true"]');
}
