/** Banner aspect ratio (width / height); matches the profile card cover (800x260 ~ 3:1). */
export const BANNER_ASPECT = 3;
const BANNER_MAX_WIDTH = 1500;

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
    const srcAspect = bitmap.width / bitmap.height;
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (srcAspect > aspect) {
      sw = Math.round(bitmap.height * aspect);
      sx = Math.round((bitmap.width - sw) * focus);
    } else if (srcAspect < aspect) {
      sh = Math.round(bitmap.width / aspect);
      sy = Math.round((bitmap.height - sh) * focus);
    }

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
