export interface YouTubeVideo {
  id: string;
  /** Start offset in seconds (from `t=` / `start=`). */
  start: number;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** "90", "90s" or "1h2m3s" -> seconds. */
function parseTimestamp(raw: string | null): number {
  if (!raw) return 0;
  if (/^\d+s?$/.test(raw)) return parseInt(raw, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Recognises a link to a single YouTube video (watch, youtu.be, shorts, embed, live). */
export function parseYouTubeUrl(raw: string): YouTubeVideo | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  if (host === 'youtu.be') {
    id = parts[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') id = url.searchParams.get('v') ?? undefined;
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
  }
  if (!id || !VIDEO_ID.test(id)) return null;
  const start = parseTimestamp(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return { id, start };
}
