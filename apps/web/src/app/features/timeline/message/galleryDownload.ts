import type { MediaInfo } from '@wizardchat/core';

export interface SaveAllResult {
  saved: number;
  failed: number;
}

/** File name for the `index`-th image of a gallery. */
export function galleryFileName(media: MediaInfo | null, index: number): string {
  const name = media?.filename;
  // A name that does not look like a file name (a caption, say) is not trusted.
  if (name && /\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const ext = media?.mimetype?.split('/')[1]?.replace('jpeg', 'jpg').replace(/\+.*$/, '') || 'png';
  return `image-${index + 1}.${ext}`;
}

export interface GalleryFile {
  filename: string;
  /** The full-size file as an object URL (owned by the media cache: never revoked here). */
  load: () => Promise<string | null>;
}

/**
 * Saves every image of a gallery, one at a time, each as a normal browser download (the browser
 * may ask once before allowing several).
 */
export async function saveGalleryImages(files: GalleryFile[]): Promise<SaveAllResult> {
  const result: SaveAllResult = { saved: 0, failed: 0 };
  for (const file of files) {
    try {
      const url = await file.load();
      if (!url) throw new Error('Image unavailable');
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      result.saved += 1;
      // Give the browser a moment per file; firing many downloads at once gets some dropped.
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (err) {
      console.warn('[gallery] save failed', file.filename, err);
      result.failed += 1;
    }
  }
  return result;
}
