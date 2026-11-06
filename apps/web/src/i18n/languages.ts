export const SUPPORTED_LANGUAGES = [
  { code: 'en', labelKey: 'settings.language.languageEn' },
  { code: 'de', labelKey: 'settings.language.languageDe' },
  { code: 'es', labelKey: 'settings.language.languageEs' },
  { code: 'fr', labelKey: 'settings.language.languageFr' },
  { code: 'it', labelKey: 'settings.language.languageIt' },
  { code: 'pt', labelKey: 'settings.language.languagePt' },
  { code: 'ru', labelKey: 'settings.language.languageRu' },
  { code: 'ja', labelKey: 'settings.language.languageJa' },
  { code: 'tr', labelKey: 'settings.language.languageTr' },
  { code: 'nl', labelKey: 'settings.language.languageNl' },
  { code: 'pl', labelKey: 'settings.language.languagePl' },
] as const;

export function detectBrowserLanguage(): string {
  const candidates =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
  const supported = SUPPORTED_LANGUAGES.map((l) => l.code) as readonly string[];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    if (supported.includes(lower)) return lower;
    const base = lower.split('-')[0];
    if (supported.includes(base)) return base;
  }
  return 'en';
}
