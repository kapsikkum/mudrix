import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from '@mudrix/i18n/locales/de.json';
import en from '@mudrix/i18n/locales/en.json';
import es from '@mudrix/i18n/locales/es.json';
import fr from '@mudrix/i18n/locales/fr.json';
import it from '@mudrix/i18n/locales/it.json';
import pt from '@mudrix/i18n/locales/pt.json';
import ru from '@mudrix/i18n/locales/ru.json';
import ja from '@mudrix/i18n/locales/ja.json';
import tr from '@mudrix/i18n/locales/tr.json';
import nl from '@mudrix/i18n/locales/nl.json';
import pl from '@mudrix/i18n/locales/pl.json';
import { STORAGE_KEY_LANGUAGE } from '@/const/storageKeys';
import { detectBrowserLanguage } from '@/i18n/languages';

const STORAGE_KEY = STORAGE_KEY_LANGUAGE;
const savedLang = localStorage.getItem(STORAGE_KEY) ?? detectBrowserLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: it },
    pt: { translation: pt },
    ru: { translation: ru },
    ja: { translation: ja },
    tr: { translation: tr },
    nl: { translation: nl },
    pl: { translation: pl },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export { STORAGE_KEY };
export default i18n;
