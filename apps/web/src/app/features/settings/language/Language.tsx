import { useEffect, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { languageAtom, spellcheckEnabledAtom, spellcheckLanguagesAtom } from '@/app/store/atoms';
import { SUPPORTED_LANGUAGES } from '@/i18n/languages';
import { Select } from '@/app/components/Select';
import { ToggleRow } from '@/app/components/Toggle';
import { isMobileDevice } from '@/util/desktop';
import {
  SPELLCHECK_LANGUAGES,
  getPersonalWords,
  removePersonalWord,
  subscribePersonalWords,
} from '@/util/spellcheck/spellcheck';
import * as css from '../Settings.css';
import * as spellCss from './Language.css';

// phones keep the keyboard's own spellcheck
const SHOW_SPELLCHECK = !isMobileDevice();

function Spellcheck() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useAtom(spellcheckEnabledAtom);
  const [languages, setLanguages] = useAtom(spellcheckLanguagesAtom);
  const [words, setWords] = useState(getPersonalWords);

  useEffect(() => {
    const refresh = () => setWords(getPersonalWords());
    refresh();
    return subscribePersonalWords(refresh);
  }, []);

  const toggleLanguage = (code: string) => {
    const next = languages.includes(code)
      ? languages.filter((c) => c !== code)
      : [...languages, code];
    if (next.length > 0) setLanguages(next);
  };

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('spellcheck.title')}</h3>
      <ToggleRow
        label={t('spellcheck.enabled')}
        description={t('spellcheck.enabledNote')}
        checked={enabled}
        onChange={setEnabled}
      />

      {enabled && (
        <>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('spellcheck.languages')}</span>
            <span className={css.settingNote}>{t('spellcheck.languagesNote')}</span>
          </div>
          <div className={spellCss.chips} role="group" aria-label={t('spellcheck.languages')}>
            {SPELLCHECK_LANGUAGES.filter((l) => l.available).map(({ code, label }) => {
              const on = languages.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  className={on ? `${spellCss.chip} ${spellCss.chipOn}` : spellCss.chip}
                  aria-pressed={on}
                  // at least one dictionary stays selected
                  disabled={on && languages.length === 1}
                  onClick={() => toggleLanguage(code)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('spellcheck.yourDictionary')}</span>
          </div>
          {words.length === 0 ? (
            <span className={css.settingNote}>{t('spellcheck.empty')}</span>
          ) : (
            <div className={spellCss.wordList}>
              {words.map((word) => (
                <div key={word} className={spellCss.wordRow}>
                  <span className={spellCss.word}>{word}</span>
                  <button
                    type="button"
                    className={spellCss.removeBtn}
                    aria-label={`${t('spellcheck.remove')}: ${word}`}
                    onClick={() => removePersonalWord(word)}
                  >
                    {t('spellcheck.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Language() {
  const { t, i18n } = useTranslation();
  const setLanguage = useSetAtom(languageAtom);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setLanguage(lang);
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.language.title')}</h2>

      <div className={css.section}>
        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('settings.language.languageDisplay')}</span>
          </div>
          <Select
            aria-label={t('settings.language.languageDisplay')}
            value={i18n.language}
            options={SUPPORTED_LANGUAGES.map(({ code, labelKey }) => ({
              value: code,
              label: t(labelKey),
            }))}
            onChange={handleLanguageChange}
          />
        </div>
      </div>

      {SHOW_SPELLCHECK && <Spellcheck />}
    </div>
  );
}
