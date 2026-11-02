export async function getImageDimensions(blob: Blob): Promise<{ w: number; h: number } | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bitmap = await createImageBitmap(blob);
    const dims = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    if (dims.w > 0 && dims.h > 0) return dims;
  } catch {
    // Not every image format decodes via createImageBitmap; fall back to no dimensions.
  }
  return null;
}
