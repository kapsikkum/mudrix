import { useEffect, useState } from 'react';

/** Big enough for the largest avatar in a call tile at 2x. */
const MAX_SIZE = 256;

/**
 * A still picture of an image's first frame, so an animated avatar or decoration can stand still
 * until it is needed. Undefined until the frame is ready; an image that cannot be redrawn is
 * returned as it is.
 */
export function useStillFrame(src: string | undefined): string | undefined {
  const [still, setStill] = useState<{ from: string; url: string } | null>(null);

  useEffect(() => {
    if (!src) return undefined;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const scale = Math.min(1, MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        setStill({ from: src, url: canvas.toDataURL('image/png') });
      } catch {
        setStill({ from: src, url: src });
      }
    };
    image.onerror = () => {
      if (!cancelled) setStill({ from: src, url: src });
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src) return undefined;
  return still?.from === src ? still.url : undefined;
}
