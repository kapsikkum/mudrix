import type { MediaInfo } from '@mudrix/core';
import { blobToBase64 } from '@/util/nativeApp';

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
 * Saves every image of a gallery from one action. The desktop shell asks once for a folder and
 * writes them all there (a webview download per image would make WebView2 ask to download several
 * files); everywhere else each image is a normal browser download (the browser may ask once before
 * allowing several).
 */
export async function saveGalleryImages(files: GalleryFile[]): Promise<SaveAllResult> {
  const saveFiles = window.desktopAPI?.saveFiles;
  if (saveFiles) return saveGalleryImagesOnDesktop(saveFiles, files);

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

/** The desktop shell: load every image, then one save call with one folder dialog. */
async function saveGalleryImagesOnDesktop(
  saveFiles: NonNullable<DesktopAPI['saveFiles']>,
  files: GalleryFile[]
): Promise<SaveAllResult> {
  const result: SaveAllResult = { saved: 0, failed: 0 };
  const payload: { filename: string; data: string }[] = [];
  for (const file of files) {
    try {
      const url = await file.load();
      if (!url) throw new Error('Image unavailable');
      const blob = await (await fetch(url)).blob();
      payload.push({ filename: file.filename, data: await blobToBase64(blob) });
    } catch (err) {
      console.warn('[gallery] save failed', file.filename, err);
      result.failed += 1;
    }
  }
  if (payload.length === 0) return result;
  try {
    const paths = await saveFiles(payload);
    // No paths: the user cancelled the folder dialog and nothing was written.
    if (paths) result.saved = paths.length;
  } catch (err) {
    console.warn('[gallery] save failed', err);
    result.failed += payload.length;
  }
  return result;
}
