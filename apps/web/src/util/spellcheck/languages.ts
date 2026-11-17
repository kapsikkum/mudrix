export type SpellcheckLanguage =
  'en' | 'de' | 'es' | 'fr' | 'it' | 'nl' | 'pl' | 'pt' | 'ru' | 'tr';

/**
 * Languages with a bundled Hunspell dictionary; `label` is the language's own name. `available` is false for a language the
 * engine cannot check; all ten bundled dictionaries currently work.
 */
export const SPELLCHECK_LANGUAGES: {
  code: SpellcheckLanguage;
  label: string;
  available: boolean;
}[] = [
  { code: 'en', label: 'English', available: true },
  { code: 'de', label: 'Deutsch', available: true },
  { code: 'es', label: 'Español', available: true },
  { code: 'fr', label: 'Français', available: true },
  { code: 'it', label: 'Italiano', available: true },
  { code: 'nl', label: 'Nederlands', available: true },
  { code: 'pl', label: 'Polski', available: true },
  { code: 'pt', label: 'Português', available: true },
  { code: 'ru', label: 'Русский', available: true },
  { code: 'tr', label: 'Türkçe', available: true },
];

/** True when the engine can actually check this language. */
export function isSpellcheckAvailable(code: string): boolean {
  return SPELLCHECK_LANGUAGES.some((l) => l.code === code && l.available);
}

export function isSpellcheckLanguage(code: string): code is SpellcheckLanguage {
  return SPELLCHECK_LANGUAGES.some((l) => l.code === code);
}

/** Maps an app UI locale (en, pt-BR, ...) to a dictionary; null when none exists (e.g. ja). */
export function dictionaryForLocale(appLocale: string): SpellcheckLanguage | null {
  const base = appLocale.trim().toLowerCase().split(/[-_]/)[0];
  return isSpellcheckLanguage(base) ? base : null;
}
