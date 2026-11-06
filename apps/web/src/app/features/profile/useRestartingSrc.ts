import { useEffect, useState } from 'react';

/**
 * Gives every mount its own copy of the image so an animated APNG/GIF starts from its first frame
 * again. Browsers share one decoded animation per URL, so reopening a card would otherwise resume
 * mid-loop (or sit on the last frame) instead of replaying; and so would an image mounted while
 * another copy of the same URL is still on screen, which then skips its intro.
 */
export function useRestartingSrc(src: string | undefined): string | undefined {
  const [fresh, setFresh] = useState<{ from: string; url: string } | null>(null);

  useEffect(() => {
    if (!src || !src.startsWith('blob:')) return undefined;
    let cancelled = false;
    let created: string | undefined;
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setFresh({ from: src, url: created });
      })
      .catch(() => {
        // fall back to the shared copy
        if (!cancelled) setFresh({ from: src, url: src });
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  if (!src) return undefined;
  if (!src.startsWith('blob:')) return src;
  // Nothing until the private copy exists, so the shared (mid-loop) animation is never shown.
  return fresh?.from === src ? fresh.url : undefined;
}
