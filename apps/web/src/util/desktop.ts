export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isTauriMobile(): boolean {
  return (
    isTauri() &&
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

export function isTauriDesktop(): boolean {
  return isTauri() && !isTauriMobile();
}

export function isMobileDevice(): boolean {
  if (isTauriMobile()) return true;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    Math.min(window.screen.width, window.screen.height) <= 820
  );
}
