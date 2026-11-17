/**
 * Files dragged in from the desktop (Explorer, Finder, a file manager).
 *
 * The desktop shell has to leave drag and drop to the webview for these to arrive: Tauri replaces
 * WebView2's drop target with its own on Windows (and hooks the one of WKWebView and WebKitGTK),
 * which turns off `AllowExternalDrop` and with it the `dragenter`/`dragover`/`drop` events a drop
 * zone needs. The main window says `"dragDropEnabled": false` for that reason, the same thing the
 * call window and the share bar ask of their builders.
 */

const FILES = 'Files';

/** Whether a drag carries files, as opposed to text, a link, or a row dragged inside the app. */
export function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const { types, items } = dataTransfer;
  for (let i = 0; i < (types?.length ?? 0); i++) {
    if (types[i] === FILES) return true;
  }
  // Some webviews fill `items` but not `types` while the drag is over the window.
  return Array.from(items ?? []).some((item) => item.kind === 'file');
}

/**
 * The files a drop carries, in the shape the picker hands the composer. Folders are left out: the
 * picker cannot choose one either, and attaching it would send an empty file.
 */
export function droppedFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === 'file');
  // Webviews without items still carry the files themselves.
  if (items.length === 0) return Array.from(dataTransfer.files ?? []);
  const files: File[] = [];
  for (const item of items) {
    if (item.webkitGetAsEntry?.()?.isDirectory) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

/**
 * A file dropped where nothing takes it would make the webview follow the file and leave the app
 * (the document counts as a drop target of its own). Refusing those drops keeps the message area
 * the only place a file is attached from, and a miss does nothing at all. Call once, before the
 * app renders.
 */
export function installFileDropGuard(): void {
  window.addEventListener('dragover', (event) => {
    if (hasDraggedFiles(event.dataTransfer)) event.preventDefault();
  });
  window.addEventListener('drop', (event) => {
    if (hasDraggedFiles(event.dataTransfer)) event.preventDefault();
  });
}
