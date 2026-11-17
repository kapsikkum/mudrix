/**
 * How long one pass of an animated PNG lasts, in milliseconds: the sum of its frame delays. Null when
 * the bytes are not a PNG; 0 when it is a plain, still one.
 */
export function apngDurationMs(buffer: ArrayBuffer): number | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // The PNG signature.
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || signature.some((b, i) => bytes[i] !== b)) return null;

  let animated = false;
  let totalMs = 0;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'acTL') animated = true;
    if (type === 'fcTL' && offset + 8 + 24 <= bytes.length) {
      const num = view.getUint16(offset + 8 + 20);
      // A zero denominator means hundredths of a second.
      const den = view.getUint16(offset + 8 + 22) || 100;
      totalMs += (num / den) * 1000;
    }
    // The pixel data comes after every frame header, so the headers are all behind us by now.
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return animated ? Math.round(totalMs) : 0;
}
