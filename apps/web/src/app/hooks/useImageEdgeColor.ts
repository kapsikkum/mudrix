import { useEffect, useState } from 'react';

const SAMPLE_WIDTH = 48;
/** Share of the image, measured from the bottom edge, that is looked at. */
const BOTTOM_SHARE = 0.2;
const HUE_BUCKETS = 12;
/** Below this total weight the strip is grey, black or white and has no colour worth using. */
const MIN_COLOURFUL = 4;

const cache = new Map<string, string | null>();

function hslOf(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rf) h = (gf - bf) / d + (gf < bf ? 6 : 0);
  else if (max === gf) h = (bf - rf) / d + 2;
  else h = (rf - gf) / d + 4;
  return [h / 6, s, l];
}

/**
 * The prominent colour along the bottom edge of an image: the hue bucket with the most saturated,
 * mid-tone weight wins, and its pixels are averaged. Greys, near-black and near-white do not count,
 * so an image that is plain there gives null and the caller keeps its own colour.
 */
export function prominentBottomColor(data: Uint8ClampedArray, width: number, height: number) {
  const rows = Math.max(1, Math.round(height * BOTTOM_SHARE));
  const weight = new Array<number>(HUE_BUCKETS).fill(0);
  const sums = Array.from({ length: HUE_BUCKETS }, () => [0, 0, 0]);
  for (let y = height - rows; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const [h, s, l] = hslOf(data[i], data[i + 1], data[i + 2]);
      // Colourful and neither dark nor washed out.
      const w = s * (1 - Math.abs(2 * l - 1));
      if (w < 0.05) continue;
      const bucket = Math.min(HUE_BUCKETS - 1, Math.floor(h * HUE_BUCKETS));
      weight[bucket] += w;
      sums[bucket][0] += data[i] * w;
      sums[bucket][1] += data[i + 1] * w;
      sums[bucket][2] += data[i + 2] * w;
    }
  }
  let best = 0;
  for (let b = 1; b < HUE_BUCKETS; b++) if (weight[b] > weight[best]) best = b;
  if (weight[best] < MIN_COLOURFUL) return null;
  const [r, g, b] = sums[best].map((v) => Math.round(v / weight[best]));
  return `rgb(${r}, ${g}, ${b})`;
}

/** The prominent colour at the bottom of the image at `src`, or null (no image, or no colour in it). */
export function useImageEdgeColor(src: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(() => (src ? (cache.get(src) ?? null) : null));

  useEffect(() => {
    if (!src) {
      setColor(null);
      return undefined;
    }
    if (cache.has(src)) {
      setColor(cache.get(src) ?? null);
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
      const width = SAMPLE_WIDTH;
      const height = Math.max(8, Math.round((SAMPLE_WIDTH * img.naturalHeight) / img.naturalWidth));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      let result: string | null = null;
      try {
        ctx.drawImage(img, 0, 0, width, height);
        result = prominentBottomColor(ctx.getImageData(0, 0, width, height).data, width, height);
      } catch {
        // A cross-origin image cannot be read back; keep the card's own colour.
      }
      cache.set(src, result);
      setColor(result);
    };
    img.onerror = () => {
      if (!cancelled) setColor(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return color;
}
