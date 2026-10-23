const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export function isModOnly(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

export function isTextFieldTarget(e: KeyboardEvent): boolean {
  const target = e.target instanceof Element ? e.target : null;
  return !!target?.closest('input, textarea, select');
}

export function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target instanceof Element ? e.target : null;
  return !!target?.closest('input, textarea, select, [contenteditable="true"]');
}
