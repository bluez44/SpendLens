import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import en from './locales/en.json';
import vi from './locales/vi.json';

i18next.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: { vi: { common: vi }, en: { common: en } },
  lng: 'vi',
  fallbackLng: 'vi',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const i18n = i18next;
export { useTranslation as useT };
