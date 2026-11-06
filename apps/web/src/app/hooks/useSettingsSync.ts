import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  themeAtom,
  customThemesAtom,
  messageLayoutAtom,
  languageAtom,
  preferencesAtom,
  keybindsAtom,
} from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import i18n from '@/i18n';
import { SUPPORTED_LANGUAGES } from '@/i18n/languages';
import {
  SETTINGS_READ_TYPES,
  SETTINGS_WRITE_TYPES,
  hasMudrixSettings,
  mergeSettingsForWrite,
  readSettings,
  settingsEqual,
  syncablePreferences,
  type SettingsContents,
  type SyncedSettings,
} from '@/client/settingsSync';

const PUSH_DEBOUNCE_MS = 500;

/** Applies settings that came from the account to the local atoms (and the display language) */
export function useApplySettings(): (settings: Partial<SyncedSettings>) => void {
  const setTheme = useSetAtom(themeAtom);
  const setCustomThemes = useSetAtom(customThemesAtom);
  const setMessageLayout = useSetAtom(messageLayoutAtom);
  const setLanguage = useSetAtom(languageAtom);
  const setPreferences = useSetAtom(preferencesAtom);
  const setKeybinds = useSetAtom(keybindsAtom);
  return useCallback(
    (settings) => {
      if (settings.customThemes) setCustomThemes(settings.customThemes);
      if (settings.theme) setTheme(settings.theme);
      if (settings.messageLayout) setMessageLayout(settings.messageLayout);
      if (settings.language && SUPPORTED_LANGUAGES.some((l) => l.code === settings.language)) {
        setLanguage(settings.language);
        if (i18n.language !== settings.language) void i18n.changeLanguage(settings.language);
      }
      const remotePrefs = settings.preferences;
      if (remotePrefs) setPreferences((prev) => ({ ...prev, ...remotePrefs }));
      if (settings.keybinds) setKeybinds(settings.keybinds);
    },
    [setTheme, setCustomThemes, setMessageLayout, setLanguage, setPreferences, setKeybinds]
  );
}

/** What the account has stored in each settings event, as the core has it now */
export async function loadSettingsContents(client: MatrixClient): Promise<SettingsContents> {
  const entries = await Promise.all(
    SETTINGS_READ_TYPES.map(
      async (type) => [type, await client.cachedAccountData(type).catch(() => null)] as const
    )
  );
  return Object.fromEntries(entries);
}

/**
 * Mirrors theme, layout, language, every preference and keybinds to private account data (see
 * settingsSync.ts for what is deliberately left out and who can read it).
 */
export function useSettingsSync(client: MatrixClient | null): void {
  const [theme] = useAtom(themeAtom);
  const [customThemes] = useAtom(customThemesAtom);
  const [messageLayout] = useAtom(messageLayoutAtom);
  const [language] = useAtom(languageAtom);
  const [preferences] = useAtom(preferencesAtom);
  const [keybinds] = useAtom(keybindsAtom);
  const syncReady = useSyncReady();
  const applyRemote = useApplySettings();
  const contentsRef = useRef<SettingsContents>({});
  // Bumped whenever the account's settings change, which re-runs the push below
  const [revision, setRevision] = useState<number | null>(null);

  // Pull: server -> local, live via account data
  useEffect(() => {
    setRevision(null);
    contentsRef.current = {};
    if (!client || !syncReady) return;
    let cancelled = false;
    const subscriptions = SETTINGS_READ_TYPES.map((type) =>
      client.watchAccountData(type, (content) => {
        if (cancelled) return;
        contentsRef.current = { ...contentsRef.current, [type]: content };
        const settings = readSettings(contentsRef.current);
        if (Object.keys(settings).length > 0) applyRemote(settings);
        setRevision((r) => (r ?? 0) + 1);
      })
    );
    void loadSettingsContents(client).then((initial) => {
      if (cancelled) return;
      contentsRef.current = { ...initial, ...contentsRef.current };
      setRevision((r) => r ?? 0);
    });
    return () => {
      cancelled = true;
      subscriptions.forEach((subscription) => subscription.cancel());
    };
  }, [client, syncReady, applyRemote]);

  // Push: local -> server, only the keys that changed
  useEffect(() => {
    if (!client || !syncReady || revision === null) return;
    const timer = setTimeout(() => {
      const contents = contentsRef.current;
      const next: Partial<SyncedSettings> = {
        theme,
        customThemes,
        messageLayout,
        language,
        preferences: syncablePreferences(preferences),
        keybinds,
      };
      const current = readSettings(contents);
      // Until the first save there is no Mudrix event, only (maybe) WizardChat's copy to carry over.
      const hasSaved = hasMudrixSettings(contents);
      if (hasSaved && settingsEqual(next, current)) return;
      // Under the current name and the one earlier versions read, so devices not updated yet
      // keep following the account.
      Promise.all(
        SETTINGS_WRITE_TYPES.map((type) =>
          client.setAccountData(
            type,
            mergeSettingsForWrite(contents, type, next, current, !hasSaved) as never
          )
        )
      ).catch(() => {
        // Non-fatal - the local value stays applied and the next change retries
      });
    }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    client,
    syncReady,
    revision,
    theme,
    customThemes,
    messageLayout,
    language,
    preferences,
    keybinds,
  ]);
}
