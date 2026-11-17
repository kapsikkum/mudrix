import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

/**
 * Pads a PNG image to the target width and height with transparent pixels.
 */
function padImage(src, targetWidth, targetHeight) {
  if (src.width === targetWidth && src.height === targetHeight) {
    return src;
  }
  const dst = new PNG({ width: targetWidth, height: targetHeight, fill: true });
  // dst is initialized with all zeros (transparent black)
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (src.width * y + x) << 2;
      const dstIdx = (targetWidth * y + x) << 2;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return dst;
}

/**
 * Compares two PNG files and writes a diff image.
 * Returns { numDiffPixels, totalPixels, diffPercent }.
 */
export function compareImages(oldPath, newPath, diffPath, threshold = 0.1) {
  if (!existsSync(oldPath) || !existsSync(newPath)) {
    return { numDiffPixels: 0, totalPixels: 0, diffPercent: 100, error: 'File missing' };
  }

  const rawOld = PNG.sync.read(readFileSync(oldPath));
  const rawNew = PNG.sync.read(readFileSync(newPath));

  const width = Math.max(rawOld.width, rawNew.width);
  const height = Math.max(rawOld.height, rawNew.height);

  const imgOld = padImage(rawOld, width, height);
  const imgNew = padImage(rawNew, width, height);

  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(imgOld.data, imgNew.data, diff.data, width, height, {
    threshold,
    includeAA: false,
  });

  const totalPixels = width * height;
  const diffPercent = totalPixels > 0 ? (numDiffPixels / totalPixels) * 100 : 0;

  writeFileSync(diffPath, PNG.sync.write(diff));
  return { numDiffPixels, totalPixels, diffPercent };
}
