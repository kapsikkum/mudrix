import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { useContextMenu, syntheticMouseEvent } from '@/app/hooks/useContextMenu';
import { useToast } from '@/app/hooks/useToast';
import { saveBlob } from '@/util/download';

/** True for an address that only means something inside this app: a blob, or a page of its own origin. */
function isLocalAddress(src: string): boolean {
  if (src.startsWith('blob:') || src.startsWith('data:')) return true;
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** The clipboard only takes PNG images reliably, so anything else is redrawn as one. */
async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('png'))), 'image/png');
  });
}

/**
 * The webview's own right-click menu on a picture or video offers "Copy image address", which for anything
 * the app holds locally (every decrypted or authenticated one) is a blob:http://localhost/... link that is
 * useless anywhere else. For such media this opens a menu of the app's own instead (Copy image, Save).
 * Returns whether it took the right-click; pictures at a real address keep the built-in menu, where
 * "Copy image address" gives a link that works.
 */
export function useLocalMediaMenu(): (e: MouseEvent) => boolean {
  const { t } = useTranslation();
  const toast = useToast();
  const { openContextMenu } = useContextMenu();

  return useCallback(
    (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const media = target?.closest('img, video');
      if (!media) return false;
      const el = media as HTMLImageElement | HTMLVideoElement;
      const src = el.currentSrc || el.src;
      if (!src || !isLocalAddress(src)) return false;
      e.preventDefault();

      const isImage = el instanceof HTMLImageElement;
      const fetchBlob = () => fetch(src).then((r) => r.blob());
      openContextMenu(syntheticMouseEvent(e.clientX, e.clientY, null), [
        ...(isImage
          ? [
              {
                label: t('common.copyImage'),
                icon: <CopyIcon size={14} />,
                onClick: () => {
                  // The clipboard write has to start inside the click, so it is handed the promise.
                  const png = fetchBlob().then(toPng);
                  navigator.clipboard
                    .write([new ClipboardItem({ 'image/png': png })])
                    .then(() => toast.success(t('common.copied')))
                    .catch(() => toast.error(t('common.copyImageFailed')));
                },
              },
            ]
          : []),
        {
          label: isImage ? t('common.saveImage') : t('common.saveVideo'),
          icon: <DownloadSimpleIcon size={14} />,
          onClick: () => {
            fetchBlob()
              .then(async (blob) => {
                const ext = EXTENSIONS[blob.type] ?? (isImage ? 'png' : 'mp4');
                const path = await saveBlob(blob, `${isImage ? 'image' : 'video'}.${ext}`);
                if (path) toast.success(t('common.downloadSaved', { path }));
              })
              .catch(() => toast.error(t('common.downloadFailed')));
          },
        },
      ]);
      return true;
    },
    [openContextMenu, t, toast]
  );
}

/** Mounted once: covers every right-click that nothing else in the app has handled. */
export function LocalMediaMenu() {
  const openLocalMediaMenu = useLocalMediaMenu();

  useEffect(() => {
    // Bubble phase on the document, after React's own handlers, so only unhandled right-clicks arrive.
    const onContextMenu = (e: MouseEvent) => {
      if (!e.defaultPrevented) openLocalMediaMenu(e);
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [openLocalMediaMenu]);

  return null;
}
