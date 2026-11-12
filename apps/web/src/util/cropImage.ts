/** Banner aspect ratio (width / height); matches the profile card cover (800x260 ~ 3:1). */
export const BANNER_ASPECT = 3;
const BANNER_MAX_WIDTH = 1500;

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * The part of a `width` x `height` image kept when cropping to `aspect` (width / height).
 * `focus` (0..1) picks the kept slice on the axis that overflows: 0 = top/left, 0.5 = centre,
 * 1 = bottom/right. Values outside 0..1 are clamped, so the rectangle stays inside the image.
 */
export function cropRect(width: number, height: number, aspect: number, focus: number): CropRect {
  const clamped = Math.min(Math.max(focus, 0), 1);
  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;
  const srcAspect = width / height;
  if (srcAspect > aspect) {
    sw = Math.round(height * aspect);
    sx = Math.round((width - sw) * clamped);
  } else if (srcAspect < aspect) {
    sh = Math.round(width / aspect);
    sy = Math.round((height - sh) * clamped);
  }
  return { sx, sy, sw, sh };
}

/**
 * Crop `file` to `aspect` (width / height). `focus` (0..1) picks which part of the overflowing
 * axis is kept: 0 = top/left, 0.5 = centre, 1 = bottom/right. The result is downscaled to at
 * most `maxWidth` wide. Animated GIFs are returned untouched so they keep animating.
 */
export async function cropImageToAspect(
  file: File,
  aspect: number,
  focus: number,
  maxWidth = BANNER_MAX_WIDTH
): Promise<File> {
  if (file.type === 'image/gif') return file;

  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, sw, sh } = cropRect(bitmap.width, bitmap.height, aspect, focus);

    const outW = Math.min(sw, maxWidth);
    const outH = Math.round(outW / aspect);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);

    const type = file.type === 'image/jpeg' || file.type === 'image/webp' ? file.type : 'image/png';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, 0.92);
    });
    if (!blob) return file;
    const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
    const base = file.name.replace(/\.[^.]+$/, '') || 'banner';
    return new File([blob], `${base}.${ext}`, { type });
  } finally {
    bitmap.close();
  }
}

export async function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = url;
  });
}
