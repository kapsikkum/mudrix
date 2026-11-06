import {
  GifNotConfiguredError,
  GifRateLimitedError,
  type GifItem,
  type GifPage,
  type GifProvider,
} from './types';

const GIPHY_API = 'https://api.giphy.com/v1/gifs';

/** The key this app ships with; a build can bring its own with VITE_GIPHY_API_KEY. */
const DEFAULT_GIPHY_API_KEY = 'TGnndTV82UWqYITMnla1ZOiPBJBesE7x';
export const GIPHY_API_KEY =
  (import.meta.env.VITE_GIPHY_API_KEY ?? '').trim() || DEFAULT_GIPHY_API_KEY;
const LIMIT = 30;

interface GiphyImage {
  url: string;
  width: string;
  height: string;
  size?: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: GiphyImage;
    fixed_width?: GiphyImage;
    downsized?: GiphyImage;
    original: GiphyImage;
  };
}

function toItem(gif: GiphyGif): GifItem {
  const thumb = gif.images.fixed_width || gif.images.fixed_height;
  const src = gif.images.downsized?.url ?? gif.images.original.url;
  return {
    id: gif.id,
    title: gif.title,
    thumbUrl: src,
    sendUrl: src,
    width: Number(thumb.width) || 1,
    height: Number(thumb.height) || 1,
    provider: 'giphy',
  };
}

async function request(url: string, offset: number, signal?: AbortSignal): Promise<GifPage> {
  if (!GIPHY_API_KEY) throw new GifNotConfiguredError();
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new GifRateLimitedError();
  if (!res.ok) throw new Error(`Giphy request failed (${res.status})`);
  const data = await res.json();
  const list: GiphyGif[] = data.data || [];
  const total = Number(data.pagination?.total_count) || 0;
  const next = offset + list.length;
  return { items: list.map(toItem), nextCursor: list.length > 0 && next < total ? next : null };
}

export const giphyProvider: GifProvider = {
  id: 'giphy',
  displayName: 'GIPHY',
  hosts: ['api.giphy.com', '*.giphy.com'],
  trending: ({ cursor = 0, signal } = {}) =>
    request(
      `${GIPHY_API}/trending?api_key=${encodeURIComponent(GIPHY_API_KEY)}&limit=${LIMIT}&offset=${cursor}`,
      cursor,
      signal
    ),
  search: (query, { cursor = 0, signal } = {}) =>
    request(
      `${GIPHY_API}/search?api_key=${encodeURIComponent(GIPHY_API_KEY)}&q=${encodeURIComponent(query)}&limit=${LIMIT}&offset=${cursor}`,
      cursor,
      signal
    ),
};
