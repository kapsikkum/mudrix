import type { ImageEntry, PackData } from './PackEditor';

/**
 * Matrix caps a whole event (content plus envelope: ids, hashes, signatures, auth/prev events) at
 * 65,536 bytes of canonical JSON. A pack is one state event, so the pack content must leave room
 * for the envelope. 60 KiB of content leaves ~5 KiB, which is comfortably more than Synapse's
 * envelope for a state event in a busy room.
 */
export const EVENT_CAP_BYTES = 65536;
export const PACK_BUDGET_BYTES = 60 * 1024;
/** Show a warning from this fraction of the budget. */
export const PACK_WARN_RATIO = 0.8;

const encoder = new TextEncoder();

export function utf8Size(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

export function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/**
 * One image as it is serialised in the event. Fields equal to what a reader would infer are left
 * out: an empty `usage`, and a `usage` identical to the pack's (MSC2545: absent means "inherit").
 */
export function buildImageContent(
  shortcode: string,
  img: ImageEntry,
  packUsage: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = { url: img.url };
  if (img.usage && img.usage.length > 0 && !sameSet(img.usage, packUsage)) out.usage = img.usage;
  out.body = img.body ?? shortcode;
  if (img.mimetype) out.mimetype = img.mimetype;
  if (img.info && Object.keys(img.info).length > 0) out.info = img.info;
  return out;
}

/** The content of the pack's state event. */
export function buildPackContent(pack: PackData): Record<string, unknown> {
  const images: Record<string, Record<string, unknown>> = {};
  for (const [key, img] of Object.entries(pack.images)) {
    images[key] = buildImageContent(key, img, pack.usage);
  }
  return {
    pack: {
      display_name: pack.displayName,
      usage: pack.usage,
      avatar_url: pack.avatarUrl,
      attribution: pack.attribution || undefined,
    },
    images,
  };
}

export function packContentSize(pack: PackData): number {
  return utf8Size(buildPackContent(pack));
}

/** Bytes one new image will add, assuming an mxc URI of a typical length for this server. */
export function estimateEntryBytes(
  shortcode: string,
  packUsage: readonly string[],
  homeserverDomain: string,
  withInfo = true
): number {
  const entry = buildImageContent(
    shortcode,
    {
      shortcode,
      url: `mxc://${homeserverDomain}/${'x'.repeat(24)}`,
      usage: [],
      mimetype: 'image/png',
      info: withInfo ? { w: 1024, h: 1024, mimetype: 'image/png' } : undefined,
    },
    packUsage
  );
  // key + ":" + value + ","
  return utf8Size(shortcode) + 1 + utf8Size(entry) + 1;
}

/** Splits an image map into chunks whose pack events each fit within `budget` bytes. */
export function splitImagesBySize(
  pack: PackData,
  budget: number = PACK_BUDGET_BYTES
): Record<string, ImageEntry>[] {
  const headerBytes = utf8Size(buildPackContent({ ...pack, images: {} })) + 32;
  const chunks: Record<string, ImageEntry>[] = [];
  let current: Record<string, ImageEntry> = {};
  let used = headerBytes;
  for (const [key, img] of Object.entries(pack.images)) {
    const bytes = utf8Size(key) + 1 + utf8Size(buildImageContent(key, img, pack.usage)) + 1;
    if (used + bytes > budget && Object.keys(current).length > 0) {
      chunks.push(current);
      current = {};
      used = headerBytes;
    }
    current[key] = img;
    used += bytes;
  }
  if (Object.keys(current).length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
}

export function numberedPackName(name: string, index: number, total: number): string {
  return total > 1 ? `${name} (${index + 1})` : name;
}

/** The server refused the event for its size (M_TOO_LARGE, or HTTP 413). */
export function isTooLargeError(err: unknown): boolean {
  const e = err as {
    errcode?: string;
    code?: string;
    httpStatus?: number;
    message?: string;
  } | null;
  return (
    !!e &&
    (e.errcode === 'M_TOO_LARGE' ||
      e.code === 'M_TOO_LARGE' ||
      e.httpStatus === 413 ||
      /M_TOO_LARGE|too large/i.test(e.message ?? ''))
  );
}
