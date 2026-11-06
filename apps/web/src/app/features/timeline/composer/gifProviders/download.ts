import { KLIPY_MAX_GIF_BYTES, isAllowedKlipyUrl } from './klipy';
import type { GifItem } from './types';

function isGif(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  const head = String.fromCharCode(...Array.from(bytes.subarray(0, 6)));
  return head === 'GIF87a' || head === 'GIF89a';
}

/** Downloads the GIF to send. Klipy downloads are host-checked, size-capped and magic-byte verified. */
export async function downloadGif(
  item: GifItem,
  signal?: AbortSignal
): Promise<{ blob: Blob; fileName: string }> {
  if (item.provider !== 'klipy') {
    const res = await fetch(item.sendUrl, { signal });
    const blob = await res.blob();
    return { blob, fileName: item.sendUrl.split('/').pop() || 'gif' };
  }

  if (!isAllowedKlipyUrl(item.sendUrl)) throw new Error('Untrusted GIF URL');
  const res = await fetch(item.sendUrl, { signal });
  if (!res.ok) throw new Error(`GIF download failed (${res.status})`);
  const declared = Number(res.headers.get('content-length'));
  if (declared > KLIPY_MAX_GIF_BYTES) throw new Error('GIF is too large');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > KLIPY_MAX_GIF_BYTES) throw new Error('GIF is too large');
  if (!isGif(new Uint8Array(buf, 0, Math.min(6, buf.byteLength)))) {
    throw new Error('Downloaded file is not a GIF');
  }
  return {
    blob: new Blob([buf], { type: 'image/gif' }),
    fileName: `klipy-${item.id.replace(/[^\w-]/g, '_')}.gif`,
  };
}
