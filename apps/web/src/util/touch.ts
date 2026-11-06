/** The primary pointer is a finger: hover and right-click wording and shortcuts do not apply. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}
