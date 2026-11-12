import { invoke } from '@tauri-apps/api/core';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isTauriMobile(): boolean {
  return (
    isTauri() &&
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

export function isTauriDesktop(): boolean {
  return isTauri() && !isTauriMobile();
}

export function isMobileDevice(): boolean {
  if (isTauriMobile()) return true;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    Math.min(window.screen.width, window.screen.height) <= 820
  );
}

/** A game or track the desktop app sees on this computer. */
export interface DesktopActivity {
  kind: 'game' | 'music';
  /** The game, or the track title. */
  name: string;
  /** The artist, for a track. */
  details: string;
  /** Epoch ms since when it has been going, 0 when unknown. */
  startedAt: number;
}

/**
 * Starts or stops looking for games and music on this computer. Nothing is looked at until this
 * is called with something on; turning both off stops the scan. Resolves false when the desktop
 * build is too old (or not a desktop build) to know how.
 */
export async function setDesktopActivityDetection(
  games: boolean,
  music: boolean,
  custom: DesktopCustomApp[] = []
): Promise<boolean> {
  if (!isTauriDesktop()) return false;
  try {
    await invoke('set_activity_detection', { games, music, custom });
    return true;
  } catch {
    return false;
  }
}

/** A program the user added by hand: when `exe` is open it counts as the game `name`. */
export interface DesktopCustomApp {
  exe: string;
  name: string;
}

/** A program that is open on this computer. */
export interface DesktopProgram {
  exe: string;
  title: string;
}

/** The programs with a window open right now, to pick one to add. Empty on older builds. */
export async function listDesktopPrograms(): Promise<DesktopProgram[]> {
  if (!isTauriDesktop()) return [];
  try {
    const list = await invoke<unknown>('list_running_programs');
    return Array.isArray(list)
      ? list.filter(
          (p): p is DesktopProgram => !!p && typeof (p as DesktopProgram).exe === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

/** The list from the desktop app (older builds sent one activity or null). */
function activityList(payload: unknown): DesktopActivity[] {
  const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
  return items.filter(
    (a): a is DesktopActivity =>
      !!a && typeof a === 'object' && typeof (a as DesktopActivity).name === 'string'
  );
}

/** Everything the scan sees right now: a game and a track can both be there. */
export async function getDesktopActivity(): Promise<DesktopActivity[]> {
  if (!isTauriDesktop()) return [];
  try {
    return activityList(await invoke<unknown>('get_activity'));
  } catch {
    return [];
  }
}

/** Fires when the detected games or tracks change (empty: nothing any more). Returns an unsubscribe. */
export function onDesktopActivity(cb: (activities: DesktopActivity[]) => void): () => void {
  if (!isTauriDesktop()) return () => {};
  let disposed = false;
  let unlisten: (() => void) | null = null;
  import('@tauri-apps/api/event')
    .then(({ listen }) => listen<unknown>('desktop://activity', (e) => cb(activityList(e.payload))))
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    })
    .catch(() => {});
  return () => {
    disposed = true;
    unlisten?.();
    unlisten = null;
  };
}
