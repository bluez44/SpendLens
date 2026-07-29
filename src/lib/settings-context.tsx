import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Localization from 'expo-localization';

import { i18n } from './i18n';
import { resolveLanguage } from './i18n/detect';
import { DEFAULTS, loadSettings, resetSettings, updateSetting, type Settings } from './settings';
import { FxService, type RateMap } from './fx';
import { changePrimaryCurrency } from './settings';
import { db } from './db';
import type { CurrencyCode } from './currency';

interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
  rates: RateMap;
  fxLastFetchedAt: number | null;
  getRateSource: (currency: Exclude<CurrencyCode, 'USD'>) => 'auto' | 'manual' | 'fallback' | null;
  changePrimary: (newPrimary: CurrencyCode) => Promise<void>;
  setManualRate: (currency: Exclude<CurrencyCode, 'USD'>, rate: number) => void;
  clearManualRate: (currency: Exclude<CurrencyCode, 'USD'>) => void;
  refetchRates: () => Promise<void>;
  onAfterPrimaryChange?: (cb: () => void) => () => void;
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

  const fxRef = useRef(new FxService(db));
  const [rates, setRates] = useState<RateMap>(() => fxRef.current.loadRates());
  const [fxLastFetchedAt, setFxLastFetchedAt] = useState<number | null>(
    () => fxRef.current.getLastFetchedAt()
  );
  const primaryChangeListeners = useRef(new Set<() => void>());

  const reloadRates = useCallback(() => {
    setRates(fxRef.current.loadRates());
    setFxLastFetchedAt(fxRef.current.getLastFetchedAt());
  }, []);

  const refetchRates = useCallback(async () => {
    try {
      await fxRef.current.fetchFromApi();
      reloadRates();
    } catch {
      // silent — surface via UI-level "fetch failed" toast if needed
    }
  }, [reloadRates]);

  useEffect(() => {
    const last = fxRef.current.getLastFetchedAt();
    const stale = last === null || Date.now() - last > 24 * 60 * 60 * 1000;
    if (stale) refetchRates();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        const cur = fxRef.current.getLastFetchedAt();
        if (cur === null || Date.now() - cur > 24 * 60 * 60 * 1000) refetchRates();
      }
    });
    return () => sub.remove();
  }, [refetchRates]);

  const setManualRate = useCallback((currency: Exclude<CurrencyCode, 'USD'>, rate: number) => {
    fxRef.current.setManualRate(currency, rate);
    reloadRates();
  }, [reloadRates]);

  const clearManualRate = useCallback((currency: Exclude<CurrencyCode, 'USD'>) => {
    fxRef.current.clearManualRate(currency);
    reloadRates();
  }, [reloadRates]);

  const getRateSource = useCallback(
    (currency: Exclude<CurrencyCode, 'USD'>) => fxRef.current.getSource(currency),
    [],
  );

  const changePrimary = useCallback(async (newPrimary: CurrencyCode) => {
    const old = settings.primaryCurrency;
    changePrimaryCurrency(db, old, newPrimary, fxRef.current.loadRates());
    setSettings(loadSettings());
    for (const cb of primaryChangeListeners.current) cb();
  }, [settings.primaryCurrency]);

  const onAfterPrimaryChange = useCallback((cb: () => void) => {
    primaryChangeListeners.current.add(cb);
    return () => { primaryChangeListeners.current.delete(cb); };
  }, []);

  return (
    <SettingsContext.Provider value={{
      settings, update, reset,
      rates, fxLastFetchedAt, getRateSource,
      changePrimary, setManualRate, clearManualRate, refetchRates,
      onAfterPrimaryChange,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside a SettingsProvider');
  return ctx;
}
