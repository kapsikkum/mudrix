/**
 * The stretch and snap-back of a panel pulled past where it stops (a drawer past open, a sheet
 * pulled up past its top). Everything here is off when the user asks for reduced motion.
 */

/** How far a panel stretches at most, as a fraction of its size. */
const MAX_STRETCH = 0.14;
/** How long the snap back wobbles. */
const WOBBLE_MS = 520;

/** True when the user (or their system) wants less motion; follows the `reduce-motion` class. */
export function motionReduced(): boolean {
  return (
    document.documentElement.classList.contains('reduce-motion') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The scale for a pull of `over` px past the limit on a panel `size` px across; 1 means none. */
export function stretchScale(over: number, size: number): number {
  if (over <= 0 || motionReduced()) return 1;
  return 1 + MAX_STRETCH * Math.tanh((over / Math.max(1, size)) * 1.5);
}

/**
 * Snaps a stretched element back with a small wobble: a little narrower than normal, a touch wider,
 * then at rest. `rest` is the transform it ends on and `at` builds one at a given scale.
 */
export function wobbleBack(
  el: HTMLElement,
  from: number,
  at: (scale: number) => string,
  done: () => void
): void {
  if (motionReduced()) {
    done();
    return;
  }
  const over = from - 1;
  const wobble = el.animate(
    [
      { transform: at(from) },
      { transform: at(1 - over * 0.35), offset: 0.35 },
      { transform: at(1 + over * 0.12), offset: 0.65 },
      { transform: at(1) },
    ],
    { duration: WOBBLE_MS, easing: 'ease-out' }
  );
  wobble.onfinish = done;
  wobble.oncancel = done;
}
