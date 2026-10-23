import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import {
  themeAtom,
  messageLayoutAtom,
  languageAtom,
  preferencesAtom,
  DEFAULT_PREFERENCES,
} from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import i18n from '@/i18n';
import { SUPPORTED_LANGUAGES } from '@/i18n/languages';
import {
  SETTINGS_ACCOUNT_DATA_TYPE,
  SYNCED_PREFERENCE_KEYS,
  type SyncedPreferences,
  type SyncedSettings,
  parseSettings,
  pickSyncedPreferences,
  readSettingsFromClient,
  settingsEqual,
} from '@/client/settingsSync';

const PUSH_DEBOUNCE_MS = 500;

type WritableAccountDataEventKey = Parameters<MatrixClient['setAccountData']>[0];

export function useSettingsSync(client: MatrixClient | null): void {
  const [theme, setTheme] = useAtom(themeAtom);
  const [messageLayout, setMessageLayout] = useAtom(messageLayoutAtom);
  const [language, setLanguage] = useAtom(languageAtom);
  const [preferences, setPreferences] = useAtom(preferencesAtom);
  const syncReady = useSyncReady();
  const [remoteKnown, setRemoteKnown] = useState(false);

  const applyRemote = useCallback(
    (settings: Partial<SyncedSettings>) => {
      if (settings.theme) setTheme(settings.theme);
      if (settings.messageLayout) setMessageLayout(settings.messageLayout);
      if (settings.language && SUPPORTED_LANGUAGES.some((l) => l.code === settings.language)) {
        setLanguage(settings.language);
        if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
      }
      const remotePreferences = pickSyncedPreferences(settings);
      if (Object.keys(remotePreferences).length > 0) {
        setPreferences((prev) => ({ ...prev, ...remotePreferences }));
      }
    },
    [setTheme, setMessageLayout, setLanguage, setPreferences]
  );

  // Pull: server → local, live via account data events
  useMatrixEvent(client, 'accountData', (event: MatrixEvent) => {
    if (event.getType() !== SETTINGS_ACCOUNT_DATA_TYPE) return;
    const settings = parseSettings(event.getContent());
    if (Object.keys(settings).length > 0) {
      applyRemote(settings);
    }
    setRemoteKnown(true);
  });

  // Account data is always processed before the sync state reaches PREPARED,
  useEffect(() => {
    if (!client || !syncReady || remoteKnown) return;
    const settings = readSettingsFromClient(client);
    if (Object.keys(settings).length > 0) {
      applyRemote(settings);
    }
    setRemoteKnown(true);
  }, [client, syncReady, remoteKnown, applyRemote]);

  const syncedJson = JSON.stringify(
    Object.fromEntries(
      SYNCED_PREFERENCE_KEYS.map((key) => [key, preferences[key] ?? DEFAULT_PREFERENCES[key]])
    )
  );
  const syncedPreferences = useMemo(
    () => JSON.parse(syncedJson) as SyncedPreferences,
    [syncedJson]
  );

  useEffect(() => {
    if (!client || !syncReady || !remoteKnown) return;
    const timer = setTimeout(() => {
      const next: SyncedSettings = { theme, messageLayout, language, ...syncedPreferences };
      const current = readSettingsFromClient(client);
      if (settingsEqual(next, current)) return;
      client
        .setAccountData(SETTINGS_ACCOUNT_DATA_TYPE as WritableAccountDataEventKey, next)
        .catch(() => {
          // Non-fatal — the local value stays applied and the next change retries
        });
    }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [client, syncReady, remoteKnown, theme, messageLayout, language, syncedPreferences]);
}
