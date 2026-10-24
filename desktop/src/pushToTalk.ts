import { BrowserWindow, ipcMain, systemPreferences } from 'electron';
import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi';

export type PushToTalkStatus = 'active' | 'no-permission' | 'unsupported';

let watchedKey: number | null = null;
let pressed = false;
let hookRunning = false;

function keycodeFor(code: string): number | null {
  const names: Record<string, string> = {
    ControlLeft: 'Ctrl',
    ControlRight: 'CtrlRight',
    AltLeft: 'Alt',
    AltRight: 'AltRight',
    ShiftLeft: 'Shift',
    ShiftRight: 'ShiftRight',
    MetaLeft: 'Meta',
    MetaRight: 'MetaRight',
  };
  const name = names[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');
  const keycode = (UiohookKey as Record<string, number>)[name];
  return typeof keycode === 'number' ? keycode : null;
}

function hasPermission(prompt: boolean): boolean {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.isTrustedAccessibilityClient(prompt);
}

function supported(): boolean {
  return !(process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland');
}

function startHook(): void {
  if (hookRunning) return;
  uIOhook.start();
  hookRunning = true;
}

function stopHook(): void {
  if (!hookRunning) return;
  uIOhook.stop();
  hookRunning = false;
}

export function setupPushToTalk(getWindow: () => BrowserWindow | null): void {
  const send = (down: boolean) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('push-to-talk', down);
  };

  uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
    if (e.keycode !== watchedKey || pressed) return;
    pressed = true;
    send(true);
  });
  uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
    if (e.keycode !== watchedKey || !pressed) return;
    pressed = false;
    send(false);
  });

  ipcMain.handle('push-to-talk-set-key', (_e, code: string | null): PushToTalkStatus => {
    if (pressed) send(false);
    pressed = false;
    watchedKey = code ? keycodeFor(code) : null;
    if (watchedKey === null) {
      stopHook();
      return code ? 'unsupported' : 'active';
    }
    if (!supported()) return 'unsupported';
    if (!hasPermission(false)) return 'no-permission';
    try {
      startHook();
      return 'active';
    } catch (err) {
      console.error('[push-to-talk] starting the keyboard hook failed', err);
      return 'unsupported';
    }
  });

  ipcMain.handle('push-to-talk-permission', () => hasPermission(false));
  ipcMain.handle('push-to-talk-request-permission', () => hasPermission(true));
}

export function stopPushToTalk(): void {
  stopHook();
}
