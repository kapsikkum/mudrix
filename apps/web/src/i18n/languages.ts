export const SUPPORTED_LANGUAGES = [
  { code: 'en', labelKey: 'settings.language.languageEn' },
  { code: 'de', labelKey: 'settings.language.languageDe' },
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
