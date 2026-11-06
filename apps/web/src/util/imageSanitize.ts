import { stripJpeg, stripPng } from './imageStrip';

export interface ImageUploadOptions {
  /** Remove location, camera and other embedded details. */
  stripMetadata: boolean;
  /** Longest side a bigger photo is scaled down to; null leaves the size alone. */
  maxSide: number | null;
}

const JPEG_QUALITY = 0.86;
/** A scaled-down copy is only worth sending if it saves at least this much. */
const MIN_SAVING = 0.05;
/** Only these are processed: anything else (GIF, WebP, SVG, ...) may be animated or isn't worth the risk. */
export function isProcessableImage(file: File): boolean {
  return file.type === 'image/jpeg' || file.type === 'image/png';
}

export function willProcessImage(file: File, options: ImageUploadOptions): boolean {
  return isProcessableImage(file) && (options.stripMetadata || options.maxSide !== null);
}

/** Draws the picture again, upright and at most `maxSide` on its long side; nothing else survives. */
async function redraw(file: File, maxSide: number | null): Promise<Blob> {
  // The browser applies the EXIF rotation when decoding.
  const bitmap = await createImageBitmap(file);
  try {
    const scale = maxSide ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
        file.type,
        JPEG_QUALITY
      );
    });
  } finally {
    bitmap.close();
  }
}

async function longestSide(file: File): Promise<number> {
  const bitmap = await createImageBitmap(file);
  const side = Math.max(bitmap.width, bitmap.height);
  bitmap.close();
  return side;
}

/**
 * Removes the metadata from a JPEG or PNG and/or scales it down, per `options`. The metadata is cut
 * out of the file itself when that leaves the picture exactly as it was; otherwise (a JPEG that relies
 * on EXIF to be upright, or one that is scaled) it is drawn again. Throws if that can't be done.
 * Resolves with the original file when there is nothing to change.
 */
export async function prepareImage(file: File, options: ImageUploadOptions): Promise<File> {
  if (!willProcessImage(file, options)) return file;
  const { stripMetadata, maxSide } = options;
  const jpeg = file.type === 'image/jpeg';
  const bytes = new Uint8Array(await file.arrayBuffer());

  const scaleDown = maxSide !== null && (await longestSide(file)) > maxSide;
  let blob: Blob | null = null;
  if (scaleDown) {
    blob = await redraw(file, maxSide);
  } else if (stripMetadata) {
    if (jpeg) {
      const stripped = stripJpeg(bytes);
      // Without its EXIF orientation a rotated photo would show sideways, so it is drawn upright.
      if (stripped && stripped.orientation === 1)
        blob = new Blob([stripped.data], { type: file.type });
    } else {
      const stripped = stripPng(bytes);
      if (stripped) blob = new Blob([stripped], { type: file.type });
    }
    blob ??= await redraw(file, null);
  }
  if (!blob) return file;
  // A scaled copy that isn't clearly smaller isn't worth it, unless the metadata had to go anyway.
  if (!stripMetadata && blob.size > file.size * (1 - MIN_SAVING)) return file;
  return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
}
