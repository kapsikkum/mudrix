import { useEffect, useState } from 'react';
import { cssRgbToHex } from '@/theme/colorMath';

/** The operating system's accent colour as `#rrggbb`, from the CSS `AccentColor` keyword; null where unsupported. */
export function readSystemAccent(): string | null {
  if (typeof CSS === 'undefined' || !CSS.supports('color', 'AccentColor')) return null;
  const probe = document.createElement('span');
  probe.style.color = 'AccentColor';
  probe.style.display = 'none';
  document.body.appendChild(probe);
  try {
    return cssRgbToHex(getComputedStyle(probe).color);
  } finally {
    probe.remove();
  }
}

/**
 * The operating system's accent colour while `enabled`. It is read once, when the window regains
 * focus (where a change made in the system settings is noticed) and when the light/dark
 * preference changes.
 */
export function useSystemAccent(enabled: boolean): string | null {
  const [accent, setAccent] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setAccent(null);
      return undefined;
    }
    const refresh = () => setAccent(readSystemAccent());
    refresh();
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener('focus', refresh);
    scheme.addEventListener('change', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      scheme.removeEventListener('change', refresh);
    };
  }, [enabled]);

  return accent;
}
