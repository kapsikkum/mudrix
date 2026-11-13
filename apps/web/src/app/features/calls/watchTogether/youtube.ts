export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData?(): { video_id?: string; title?: string };
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getLoadedFraction(): number | null;
  /** An advert is playing in place of the video: its time and length are not the video's. */
  isAdvert(): boolean;
  supportsRate(): boolean;
  destroy(): void;
}

const SOURCE = 'wizardchat-youtube';
const BRIDGE_TIMEOUT_MS = 10_000;

function bridgeUrl(): URL {
  if (!window.desktopAPI) return new URL('/youtube-player.html', window.location.origin);
  const host = import.meta.env.APP_VERSION?.includes('-next') ? 'next' : 'app';
  return new URL(`https://${host}.wizardchat.org/youtube-player.html`);
}

interface PlayerOptions {
  videoId: string;
  autoplay: boolean;
  /** Asked for when the player is told what to play, which is after it has finished loading. */
  start: () => number;
  onReady: () => void;
  onStateChange: (state: number) => void;
  onRateChange?: (rate: number) => void;
  onError: (kind: 'video' | 'bridge') => void;
}

export function createYouTubePlayer(host: HTMLElement, options: PlayerOptions): YTPlayer {
  const url = bridgeUrl();
  // The player's page talks to the window that holds it, which is the call's pop-out window while
  // the call is popped out, not the main one.
  const hostWindow = host.ownerDocument.defaultView ?? window;
  const iframe = host.ownerDocument.createElement('iframe');
  iframe.src = url.href;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.style.visibility = 'hidden';
  host.appendChild(iframe);

  const status = {
    time: options.start(),
    state: YT_STATE.UNSTARTED as number,
    duration: 0,
    videoId: options.videoId,
    rate: 1,
    advert: false,
    loaded: null as number | null,
    reportsRate: false,
  };
  const send = (command: Record<string, unknown>) =>
    iframe.contentWindow?.postMessage({ ...command, target: SOURCE }, url.origin);

  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.origin !== url.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.source !== SOURCE) return;
    if (data.type === 'loaded') {
      clearTimeout(bridgeTimeout);
      iframe.style.visibility = '';
      const start = options.start();
      status.time = start;
      send({
        type: 'init',
        videoId: options.videoId,
        autoplay: options.autoplay,
        start,
      });
    } else if (data.type === 'ready') {
      options.onReady();
    } else if (data.type === 'status') {
      if (typeof data.time === 'number') status.time = data.time;
      if (typeof data.state === 'number') status.state = data.state;
      if (typeof data.duration === 'number') status.duration = data.duration;
      if (typeof data.videoId === 'string') status.videoId = data.videoId;
      if (typeof data.advert === 'boolean') status.advert = data.advert;
      if (typeof data.rate === 'number') {
        status.rate = data.rate;
        status.reportsRate = true;
      }
      if (typeof data.loaded === 'number') status.loaded = data.loaded;
    } else if (data.type === 'rate' && typeof data.rate === 'number') {
      status.rate = data.rate;
      options.onRateChange?.(data.rate);
    } else if (data.type === 'state' && typeof data.state === 'number') {
      status.state = data.state;
      options.onStateChange(data.state);
    } else if (data.type === 'error') {
      options.onError('video');
    }
  };
  hostWindow.addEventListener('message', onMessage);
  const bridgeTimeout = setTimeout(() => options.onError('bridge'), BRIDGE_TIMEOUT_MS);

  return {
    playVideo: () => send({ type: 'play' }),
    pauseVideo: () => send({ type: 'pause' }),
    seekTo: (seconds) => {
      status.time = seconds;
      send({ type: 'seek', seconds });
    },
    loadVideoById: ({ videoId, startSeconds = 0 }) => {
      status.videoId = videoId;
      status.time = startSeconds;
      send({ type: 'load', videoId, seconds: startSeconds });
    },
    cueVideoById: ({ videoId, startSeconds = 0 }) => {
      status.videoId = videoId;
      status.time = startSeconds;
      send({ type: 'cue', videoId, seconds: startSeconds });
    },
    getCurrentTime: () => status.time,
    getDuration: () => status.duration,
    getPlayerState: () => status.state,
    getVideoData: () => ({ video_id: status.videoId }),
    setPlaybackRate: (rate) => send({ type: 'rate', rate }),
    getPlaybackRate: () => status.rate,
    getLoadedFraction: () => status.loaded,
    supportsRate: () => status.reportsRate,
    isAdvert: () => status.advert,
    destroy: () => {
      clearTimeout(bridgeTimeout);
      hostWindow.removeEventListener('message', onMessage);
      iframe.remove();
    },
  };
}
