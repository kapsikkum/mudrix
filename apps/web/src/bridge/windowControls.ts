/**
 * The window buttons the desktop app draws, as the shell's `windowControls` setting says. The shell
 * decides at start-up whether the window has a frame; this keeps the title bar in step with it and
 * follows the setting when it changes.
 */
import { useSyncExternalStore } from 'react';
import { desktopApi, onDesktopEvent } from './desktopApi';
import {
  desktopPlatform,
  drawnControls,
  type DrawnControls,
  type WindowControlsSetting,
} from './windowControlsStyle';

const isDesktop = import.meta.env.DESKTOP;
const platform = desktopPlatform(navigator.userAgent);
const listeners = new Set<() => void>();

// Until the shell answers, the platform's own style: what most people have
let current: DrawnControls | null = isDesktop ? drawnControls('auto', platform) : null;

function applyClasses(): void {
  const root = document.documentElement;
  root.classList.toggle('desktop-controls-right', current === 'windows' || current === 'kde');
  root.classList.toggle('desktop-controls-left', current === 'mac');
}

function set(setting: WindowControlsSetting | undefined): void {
  const next = drawnControls(setting, platform);
  if (next === current) return;
  current = next;
  applyClasses();
  for (const listener of listeners) listener();
}

/** Reads the setting and follows its changes; call once on desktop. */
export function startWindowControls(): void {
  applyClasses();
  desktopApi.getSettings?.().then(
    (settings) => set(settings.windowControls),
    () => {}
  );
  onDesktopEvent<DesktopSettings>('desktop://settings-changed', (settings) =>
    set(settings.windowControls)
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The style of window buttons the title bar draws, or null when the window frame has them. */
export function useDrawnWindowControls(): DrawnControls | null {
  return useSyncExternalStore(subscribe, () => current);
}
