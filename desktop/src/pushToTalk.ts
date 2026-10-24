import { BrowserWindow, ipcMain, systemPreferences } from 'electron';
import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi';

export type PushToTalkStatus = 'active' | 'no-permission' | 'unsupported';

type Modifier = 'Ctrl' | 'Alt' | 'Shift' | 'Meta';

interface WatchedCombo {
  keycode: number;
  ownModifier: Modifier | null;
  modifiers: Modifier[];
}

let watched: WatchedCombo | null = null;
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

const MODIFIER_OF_CODE: Record<string, Modifier> = {
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  MetaLeft: 'Meta',
  MetaRight: 'Meta',
};

const MODIFIER_KEYCODES: Record<Modifier, number[]> = {
  Ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  Alt: [UiohookKey.Alt, UiohookKey.AltRight],
  Shift: [UiohookKey.Shift, UiohookKey.ShiftRight],
  Meta: [UiohookKey.Meta, UiohookKey.MetaRight],
};

function parseCombo(value: string): WatchedCombo | null {
  const parts = value.split('+');
  const code = parts[parts.length - 1];
  const keycode = code ? keycodeFor(code) : null;
  if (keycode === null) return null;
  const modifiers = parts
    .slice(0, -1)
    .filter((part): part is Modifier => ['Ctrl', 'Alt', 'Shift', 'Meta'].includes(part));
  return { keycode, ownModifier: MODIFIER_OF_CODE[code] ?? null, modifiers };
}

function heldModifiers(e: UiohookKeyboardEvent): Modifier[] {
  const held: Modifier[] = [];
  if (e.ctrlKey) held.push('Ctrl');
  if (e.altKey) held.push('Alt');
  if (e.shiftKey) held.push('Shift');
  if (e.metaKey) held.push('Meta');
  return held;
}

function matchesDown(e: UiohookKeyboardEvent, combo: WatchedCombo): boolean {
  if (e.keycode !== combo.keycode) return false;
  const held = heldModifiers(e).filter((m) => m !== combo.ownModifier);
  return held.length === combo.modifiers.length && combo.modifiers.every((m) => held.includes(m));
}

function isComboKeyUp(e: UiohookKeyboardEvent, combo: WatchedCombo): boolean {
  if (e.keycode === combo.keycode) return true;
  return combo.modifiers.some((m) => MODIFIER_KEYCODES[m].includes(e.keycode));
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
    if (!watched || pressed || !matchesDown(e, watched)) return;
    pressed = true;
    send(true);
  });
  uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
    if (!watched || !pressed || !isComboKeyUp(e, watched)) return;
    pressed = false;
    send(false);
  });

  ipcMain.handle('push-to-talk-set-key', (_e, code: string | null): PushToTalkStatus => {
    if (pressed) send(false);
    pressed = false;
    watched = code ? parseCombo(code) : null;
    if (watched === null) {
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
