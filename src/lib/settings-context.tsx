import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

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
      return loadSettings();
    } catch {
      return DEFAULTS;
    }
  });

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    try {
      updateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
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
