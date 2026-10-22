import type { IndexedDBStore, MatrixClient } from 'matrix-js-sdk';
import type { MessageLayout, ThemeName } from '@/app/store/atoms';
import { THEMES } from '@/theme/themes.css';
import {
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_MESSAGE_LAYOUT,
  STORAGE_KEY_THEME,
} from '@/const/storageKeys';

export const SETTINGS_ACCOUNT_DATA_TYPE = 'org.wizardchat.settings';

export interface SyncedSettings {
  theme: ThemeName;
  messageLayout: MessageLayout;
  language: string;
}

const MESSAGE_LAYOUTS: MessageLayout[] = ['classic', 'modern'];

type AccountDataEventKey = Parameters<MatrixClient['getAccountData']>[0];

export function parseSettings(raw: unknown): Partial<SyncedSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const content = raw as Record<string, unknown>;
  const settings: Partial<SyncedSettings> = {};

  if (typeof content.theme === 'string' && content.theme in THEMES) {
    settings.theme = content.theme as ThemeName;
  }

  if (
    typeof content.messageLayout === 'string' &&
    (MESSAGE_LAYOUTS as string[]).includes(content.messageLayout)
  ) {
    settings.messageLayout = content.messageLayout as MessageLayout;
  }

  if (typeof content.language === 'string' && content.language.trim() !== '') {
    settings.language = content.language;
  }

  return settings;
}

export function readSettingsFromClient(client: MatrixClient): Partial<SyncedSettings> {
  const event = client.getAccountData(SETTINGS_ACCOUNT_DATA_TYPE as AccountDataEventKey);
  if (!event) return {};
  return parseSettings(event.getContent());
}

export function writeSettingsToLocalStorage(settings: Partial<SyncedSettings>): void {
  if (settings.theme) localStorage.setItem(STORAGE_KEY_THEME, settings.theme);
  if (settings.messageLayout)
    localStorage.setItem(STORAGE_KEY_MESSAGE_LAYOUT, settings.messageLayout);
  if (settings.language) localStorage.setItem(STORAGE_KEY_LANGUAGE, settings.language);
}

export function settingsEqual(a: Partial<SyncedSettings>, b: Partial<SyncedSettings>): boolean {
  return (
    (a.theme ?? null) === (b.theme ?? null) &&
    (a.messageLayout ?? null) === (b.messageLayout ?? null) &&
    (a.language ?? null) === (b.language ?? null)
  );
}

export async function applySavedSettingsToLocalStorage(store: IndexedDBStore): Promise<void> {
  try {
    const saved = await store.getSavedSync();
    const raw = saved?.accountData?.find((e) => e.type === SETTINGS_ACCOUNT_DATA_TYPE);
    if (!raw) return;
    writeSettingsToLocalStorage(parseSettings(raw.content));
  } catch {
    // best effort — the live sync applies settings once connected
  }
}
