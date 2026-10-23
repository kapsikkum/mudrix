export const IMAGE_MIMETYPES_MAY_BE_ANIMATED = [
  'image/gif',
  'image/webp',
  'image/apng',
  'image/avif',
];

export function mayBeAnimated(mimetype?: string): boolean {
  return !!mimetype && IMAGE_MIMETYPES_MAY_BE_ANIMATED.includes(mimetype.toLowerCase());
}

function arrayBufferRead(arr: ArrayBuffer, start: number, len: number): Uint8Array {
  return new Uint8Array(arr.slice(start, start + len));
}

function arrayBufferReadInt(arr: ArrayBuffer, start: number): number {
  return new DataView(arr, start, 4).getUint32(0);
}

function arrayBufferReadStr(arr: ArrayBuffer, start: number, len: number): string {
  return String.fromCharCode.apply(null, Array.from(arrayBufferRead(arr, start, len)));
}

function gifIsAnimated(bytes: Uint8Array): boolean | undefined {
  const header = String.fromCharCode(...bytes.subarray(0, 6));
  if (header !== 'GIF87a' && header !== 'GIF89a') return undefined;

  const colorTableSize = (packed: number) => (packed & 0x80 ? 3 * 2 ** ((packed & 0x7) + 1) : 0);
  const skipSubBlocks = (pos: number): number => {
    while (pos < bytes.length) {
      const size = bytes[pos];
      pos += 1;
      if (size === 0) return pos;
      pos += size;
    }
    return pos;
  };

  let pos = 13 + colorTableSize(bytes[10]);
  let frames = 0;
  while (pos < bytes.length) {
    const block = bytes[pos];
    if (block === 0x2c) {
      frames += 1;
      if (frames > 1) return true;
      pos += 10 + colorTableSize(bytes[pos + 9]) + 1;
      pos = skipSubBlocks(pos);
    } else if (block === 0x21) {
      pos = skipSubBlocks(pos + 2);
    } else if (block === 0x3b) {
      return false;
    } else {
      return undefined;
    }
  }
  return undefined;
}

export async function probeIsAnimated(
  mimeType: string | undefined,
  blob: Blob
): Promise<boolean | undefined> {
  try {
    switch (mimeType?.toLowerCase()) {
      case 'image/webp': {
        const arr = await blob.slice(0, 21).arrayBuffer();
        if (arrayBufferReadStr(arr, 0, 4) !== 'RIFF' || arrayBufferReadStr(arr, 8, 4) !== 'WEBP') {
          return undefined;
        }
        if (arrayBufferReadStr(arr, 12, 4) !== 'VP8X') return false;
        const [flags] = arrayBufferRead(arr, 20, 1);
        return (flags & (1 << 1)) !== 0;
      }

      case 'image/gif':
        return gifIsAnimated(new Uint8Array(await blob.arrayBuffer()));

      case 'image/png':
      case 'image/apng': {
        const arr = await blob.arrayBuffer();
        const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        const actual = Array.from(arrayBufferRead(arr, 0, 8));
        if (!signature.every((byte, i) => byte === actual[i])) return undefined;
        for (let i = 8; i + 8 <= arr.byteLength; ) {
          const length = arrayBufferReadInt(arr, i);
          const type = arrayBufferReadStr(arr, i + 4, 4);
          if (type === 'acTL') return true;
          if (type === 'IDAT') return false;
          i += 12 + length;
        }
        return undefined;
      }

      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

const ALPHA_FORMATS = ['image/gif', 'image/apng', 'image/png', 'image/webp'];

export function stillExportFormat(mimetype?: string): string {
  return ALPHA_FORMATS.includes(mimetype ?? '') ? 'image/png' : 'image/jpeg';
}

export function firstFrameToBlobUrl(
  img: HTMLImageElement,
  mimetype?: string
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        resolve(null);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, stillExportFormat(mimetype));
    } catch {
      resolve(null);
    }
  });
}
