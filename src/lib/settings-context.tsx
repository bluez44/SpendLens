import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import * as Localization from 'expo-localization';

import { i18n } from './i18n';
import { resolveLanguage } from './i18n/detect';
import { DEFAULTS, loadSettings, resetSettings, updateSetting, type Settings } from './settings';

interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const loaded = loadSettings();
      const device = Localization.getLocales()[0]?.languageCode ?? null;
      i18n.changeLanguage(resolveLanguage(loaded.language, device)).catch(() => {});
      return loaded;
    } catch {
      return DEFAULTS;
    }
  });

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    try {
      updateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
      if (key === 'language') {
        const device = Localization.getLocales()[0]?.languageCode ?? null;
        i18n.changeLanguage(resolveLanguage(value as Settings['language'], device)).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to persist setting', key, err);
    }
  }, []);

  const reset = useCallback(() => {
    try {
      resetSettings();
      setSettings(DEFAULTS);
    } catch (err) {
      console.warn('Failed to reset settings', err);
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside a SettingsProvider');
  return ctx;
}
