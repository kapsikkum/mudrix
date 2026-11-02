import { useEffect, useState } from 'react';
import { getInitialAndHue } from '@/app/components/Avatar';

const sampledColors = new Map<string, string>();

function rgbToHsl(r: number, g: number, b: number): string {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  const hue = Math.round(h * 360);
  const sat = Math.round(s * 100);
  const light = Math.round(l * 100);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

export function useBannerGradient(
  avatarSrc: string | null | undefined,
  displayName: string
): string {
  const [color, setColor] = useState<string | null>(() =>
    avatarSrc ? (sampledColors.get(avatarSrc) ?? null) : null
  );

  useEffect(() => {
    if (!avatarSrc) {
      setColor(null);
      return;
    }
    const cached = sampledColors.get(avatarSrc);
    if (cached) {
      setColor(cached);
      return;
    }
    setColor(null);

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      const mid = Math.floor(data.length / 4 / 2) * 4;
      const hsl = rgbToHsl(data[mid], data[mid + 1], data[mid + 2]);
      sampledColors.set(avatarSrc, hsl);
      setColor(hsl);
    };
    img.src = avatarSrc;

    return () => {
      cancelled = true;
    };
  }, [avatarSrc]);

  if (color) {
    return `linear-gradient(135deg, color-mix(in srgb, ${color} 55%, #000), color-mix(in srgb, ${color} 80%, #fff))`;
  }

  const { hue } = getInitialAndHue(displayName || '?');
  return `linear-gradient(135deg, hsl(${hue}, 60%, 38%), hsl(${hue}, 45%, 55%))`;
}
