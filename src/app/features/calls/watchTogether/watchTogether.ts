import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { STORAGE_KEY_YOUTUBE_CONSENT } from '@/const/storageKeys';

export const WATCH_TOPIC = 'org.wizardchat.watch';

export interface WatchState {
  videoId: string;
  startedBy: string;
  playing: boolean;
  position: number;
  at: number;
}

export type WatchMessage =
  | { t: 'state'; state: WatchState; sentAt: number }
  | { t: 'stop'; sentAt: number }
  | { t: 'request' };

export interface WatchActions {
  start: (videoId: string) => void;
  update: (playing: boolean, position: number) => void;
  stop: () => void;
}

export const watchStateAtom = atom<WatchState | null>(null);
export const watchActionsAtom = atom<WatchActions | null>(null);
export const watchDialogOpenAtom = atom(false);

export const watchingVideoIdAtom = atom<string | null>(null);

export const youtubeConsentAtom = atomWithStorage(STORAGE_KEY_YOUTUBE_CONSENT, false);

export function youtubeWatchUrl(videoId: string, seconds = 0): string {
  const t = Math.floor(seconds);
  return `https://www.youtube.com/watch?v=${videoId}${t > 0 ? `&t=${t}s` : ''}`;
}

export function expectedPosition(state: WatchState, now = Date.now()): number {
  return state.playing ? state.position + (now - state.at) / 1000 : state.position;
}

const ID_RE = /^[\w-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (ID_RE.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id =
      url.searchParams.get('v') ??
      /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ??
      null;
  }
  return id && ID_RE.test(id) ? id : null;
}

export function parseWatchMessage(payload: unknown): WatchMessage | null {
  if (!payload || typeof payload !== 'object') return null;
  const msg = payload as Record<string, unknown>;
  if (msg.t === 'request') return { t: 'request' };
  if (msg.t === 'stop' && typeof msg.sentAt === 'number') return { t: 'stop', sentAt: msg.sentAt };
  if (msg.t !== 'state' || typeof msg.sentAt !== 'number') return null;
  const s = msg.state as Record<string, unknown> | undefined;
  if (
    !s ||
    typeof s.videoId !== 'string' ||
    !ID_RE.test(s.videoId) ||
    typeof s.startedBy !== 'string' ||
    typeof s.playing !== 'boolean' ||
    typeof s.position !== 'number' ||
    !Number.isFinite(s.position) ||
    typeof s.at !== 'number'
  ) {
    return null;
  }
  return {
    t: 'state',
    sentAt: msg.sentAt,
    state: {
      videoId: s.videoId,
      startedBy: s.startedBy,
      playing: s.playing,
      position: Math.max(0, s.position),
      at: s.at,
    },
  };
}
