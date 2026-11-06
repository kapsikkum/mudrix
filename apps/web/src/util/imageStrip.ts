/**
 * Lossless metadata stripping for JPEG and PNG, on raw bytes (no DOM). Kept apart so the native apps
 * can mirror it: JPEG loses its Exif, XMP, IPTC and comment segments (APPn except ICC profile and
 * Adobe, COM) up to the start of scan; PNG loses eXIf, tEXt, zTXt, iTXt and tIME chunks. The EXIF
 * orientation is reported so the caller can redraw a rotated photo upright instead.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG chunks that carry text, EXIF or timestamps rather than picture data. */
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** The EXIF orientation (1-8) from the data of an APP1 "Exif" segment, or 1 when there is none. */
function readOrientation(segment: Uint8Array): number {
  // "Exif\0\0" then a TIFF header.
  const tiff = 6;
  if (segment.length < tiff + 8) return 1;
  const little = ascii(segment, tiff, 2) === 'II';
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > segment.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > segment.length) break;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 1;
}

/**
 * Cuts the Exif, XMP, IPTC and comment segments out of a JPEG without touching the picture. Colour
 * profiles and the markers a decoder needs stay. Null if the file isn't a JPEG this can read.
 */
export function stripJpeg(
  bytes: Uint8Array
): { data: Uint8Array<ArrayBuffer>; orientation: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation = 1;
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return null;
    const marker = bytes[pos + 1];
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: the rest is picture data.
      parts.push(bytes.subarray(pos));
      return { data: concat(parts), orientation };
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    const end = pos + 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3]);
    if (end > bytes.length) return null;
    const body = bytes.subarray(pos + 4, end);
    let keep = true;
    if (marker === 0xe1 && ascii(body, 0, 6) === 'Exif\0\0') {
      orientation = readOrientation(body);
      keep = false;
    } else if (marker === 0xe2) {
      keep = ascii(body, 0, 12) === 'ICC_PROFILE\0';
    } else if (marker === 0xee) {
      keep = ascii(body, 0, 5) === 'Adobe';
    } else if (marker === 0xfe || (marker >= 0xe1 && marker <= 0xef)) {
      keep = false;
    }
    if (keep) parts.push(bytes.subarray(pos, end));
    pos = end;
  }
  return null;
}

/** Whether a PNG is animated (APNG): it has an animation control chunk before its picture data. */
export function isAnimatedPng(bytes: Uint8Array): boolean {
  if (bytes.length < 20 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const type = ascii(bytes, pos + 4, 4);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    pos += 12 + view.getUint32(pos);
  }
  return false;
}

/** Cuts the text, EXIF and timestamp chunks out of a PNG. Null if it isn't a PNG this can read. */
export function stripPng(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes.length < 20 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const end = pos + 12 + view.getUint32(pos);
    if (end > bytes.length) return null;
    const type = ascii(bytes, pos + 4, 4);
    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(bytes.subarray(pos, end));
    pos = end;
    if (type === 'IEND') return concat(parts);
  }
  return null;
}
