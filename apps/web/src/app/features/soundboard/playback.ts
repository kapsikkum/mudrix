import type { WizardClient } from '@wizardchat/core';
import { STORAGE_KEY_CALL_DEVICES } from '@/const/storageKeys';
import { getSoundboardDevicePrefs, soundboardRuntime } from './runtime';
import {
  SOUNDBOARD_MAX_DURATION_MS,
  SOUNDBOARD_MAX_SIZE_BYTES,
  type SoundboardMimetype,
} from './types';
import { addSoundboardPlaying, clearSoundboardPlaying, removeSoundboardPlaying } from './playing';

/** Decoded-enough clips kept for instant replay (the blob behind an object URL). */
const CACHE_SIZE = 20;
/** A little over the upload limit, so a server re-encoding a clip does not make it unplayable. */
const MAX_DOWNLOAD_BYTES = SOUNDBOARD_MAX_SIZE_BYTES * 1.5;
/** A clip never plays longer than this, whatever its file says. */
const MAX_PLAY_MS = SOUNDBOARD_MAX_DURATION_MS + 1000;
const MAX_CONCURRENT = 4;
const REVOKE_DELAY_MS = 15_000;

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();
const active = new Map<string, { audio: HTMLAudioElement; stop: () => void }>();
let playCounter = 0;

function remember(url: string, objectUrl: string): void {
  cache.delete(url);
  cache.set(url, objectUrl);
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value as string;
    const evicted = cache.get(oldest);
    cache.delete(oldest);
    // Revoke late: the evicted clip may still be playing.
    if (evicted) window.setTimeout(() => URL.revokeObjectURL(evicted), REVOKE_DELAY_MS);
  }
}

async function download(
  client: WizardClient | null,
  url: string,
  mimetype: SoundboardMimetype
): Promise<string> {
  let bytes: Uint8Array | ArrayBuffer;
  if (url.startsWith('mxc://')) {
    if (!client) throw new Error('no client');
    bytes = await client.media({ url });
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const length = Number(res.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_DOWNLOAD_BYTES) throw new Error('clip too large');
    bytes = await res.arrayBuffer();
  }
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('clip too large');
  // The element wants the real type, not whatever the server answered.
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimetype }));
}

/** Downloads (or reuses) a clip and returns an object URL for it. Rejects on any failure. */
export function loadClip(
  client: WizardClient | null,
  url: string,
  mimetype: SoundboardMimetype
): Promise<string> {
  const cached = cache.get(url);
  if (cached) {
    remember(url, cached);
    return Promise.resolve(cached);
  }
  let pending = inFlight.get(url);
  if (!pending) {
    pending = download(client, url, mimetype)
      .then((objectUrl) => {
        remember(url, objectUrl);
        return objectUrl;
      })
      .finally(() => inFlight.delete(url));
    inFlight.set(url, pending);
  }
  return pending;
}

/** Warms the cache for a clip about to be used. Never throws. */
export function prefetchClip(
  client: WizardClient | null,
  url: string,
  mimetype: SoundboardMimetype
): void {
  loadClip(client, url, mimetype).catch(() => {});
}

/** Sends the clip to the speaker chosen for calls on this device, when there is one. */
function routeToCallSpeaker(audio: HTMLAudioElement): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_CALL_DEVICES) ?? '{}') as {
      audiooutput?: unknown;
    };
    const sink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (typeof saved.audiooutput === 'string' && saved.audiooutput && sink.setSinkId) {
      sink.setSinkId(saved.audiooutput).catch(() => {});
    }
  } catch {
    // the default speaker it is
  }
}

export interface LocalPlayRequest {
  client: WizardClient | null;
  /** Who pressed it (shown in the "playing" list). */
  senderId: string;
  soundId: string;
  name: string;
  emoji?: string;
  /** mxc:// URI or an http(s) URL of a bundled clip. */
  url: string;
  mimetype: SoundboardMimetype;
  /** The clip's own gain, 0..1. */
  volume: number;
  durationMs?: number;
}

/**
 * Plays a clip on this device at the soundboard volume. Resolves to false (never rejects) when it
 * did not play: soundboard off, too many clips at once, download failed.
 */
export async function playClipLocal(req: LocalPlayRequest): Promise<boolean> {
  try {
    if (active.size >= MAX_CONCURRENT) return false;
    const objectUrl = await loadClip(req.client, req.url, req.mimetype);
    // Things may have changed while the clip downloaded.
    const prefs = getSoundboardDevicePrefs();
    if (!prefs.enabled || soundboardRuntime.deafened || active.size >= MAX_CONCURRENT) return false;

    // One clip per person at a time: a new press cuts off that person's previous one.
    active.forEach((entry, activeKey) => {
      if (activeKey.startsWith(`${req.senderId}:`)) entry.stop();
    });

    const audio = new Audio(objectUrl);
    const gain =
      Math.min(1, Math.max(0, req.volume)) * (Math.min(100, Math.max(0, prefs.volume)) / 100);
    audio.volume = gain;
    routeToCallSpeaker(audio);

    playCounter += 1;
    const key = `${req.senderId}:${req.soundId}:${playCounter}`;
    const declared = req.durationMs && req.durationMs > 0 ? req.durationMs : MAX_PLAY_MS;
    const durationMs = Math.min(declared, MAX_PLAY_MS);
    addSoundboardPlaying({
      key,
      senderId: req.senderId,
      soundId: req.soundId,
      name: req.name,
      emoji: req.emoji,
      startedAt: Date.now(),
      durationMs,
    });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', finish);
      active.delete(key);
      removeSoundboardPlaying(key);
      audio.pause();
    };
    active.set(key, { audio, stop: finish });
    // A file claiming 5 s but actually running longer is cut off.
    const timer = window.setTimeout(finish, durationMs + 400);
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', finish);
    await audio.play().catch(() => finish());
    return !done;
  } catch (err) {
    console.warn('[soundboard] could not play a clip', err);
    return false;
  }
}

/** Stops every clip now (call ended, deafened, soundboard turned off). */
export function stopAllSoundboard(): void {
  active.forEach((entry) => {
    try {
      entry.stop();
    } catch {
      // ignore
    }
  });
  active.clear();
  clearSoundboardPlaying();
}
