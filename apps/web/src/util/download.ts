import { downloadBlob } from '@/util/nativeApp';

/**
 * Saves `blob` as `filename`. Where the desktop shell offers `window.desktopAPI.saveDownload`
 * (webview `<a download>` links do nothing there) the bytes go to the Downloads folder and it
 * resolves with the saved path; the mobile app hands them to its own save dialog and a browser
 * starts a normal download, both resolving `null`.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<string | null> {
  const saveDownload = window.desktopAPI?.saveDownload;
  if (saveDownload) return saveDownload(new Uint8Array(await blob.arrayBuffer()), filename);
  downloadBlob(blob, filename);
  return null;
}
