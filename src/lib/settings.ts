import type { SQLiteDatabase } from 'expo-sqlite';

import { db as defaultDb } from './db';

export interface Settings {
  monthlyBudget: number;
  reminderEnabled: boolean;
  reminderHHMM: string | null;
  themeMode: 'auto' | 'light' | 'dark';
  budgetAlertsEnabled: boolean;
  budgetNotifiedMonth: string;
  language: 'auto' | 'vi' | 'en';
  appLockEnabled: boolean;
  appLockBiometricEnabled: boolean;
  photoSyncPolicy: 'wifi' | 'always' | 'off';
}

export const DEFAULTS: Settings = {
  monthlyBudget: 0,
  reminderEnabled: false,
  reminderHHMM: null,
  themeMode: 'auto',
  budgetAlertsEnabled: true,
  budgetNotifiedMonth: '',
  language: 'auto',
  appLockEnabled: false,
  appLockBiometricEnabled: false,
  photoSyncPolicy: 'wifi',
};

type Row = { key: string; value: string };

function encode<K extends keyof Settings>(key: K, value: Settings[K]): string {
  switch (key) {
    case 'monthlyBudget':
      return String(value as number);
    case 'reminderEnabled':
      return (value as boolean) ? '1' : '0';
    case 'reminderHHMM':
      return (value as string | null) ?? '';
    case 'themeMode':
      return value as string;
    case 'budgetAlertsEnabled':
      return (value as boolean) ? '1' : '0';
    case 'budgetNotifiedMonth':
      return value as string;
    case 'language':
      return value as string;
    case 'appLockEnabled':
      return (value as boolean) ? '1' : '0';
    case 'appLockBiometricEnabled':
      return (value as boolean) ? '1' : '0';
    case 'photoSyncPolicy':
      return value as string;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function decode(map: Map<string, string>): Settings {
  const result: Settings = { ...DEFAULTS };
  const budget = map.get('monthlyBudget');
  if (budget !== undefined) result.monthlyBudget = Number(budget) || 0;
  const enabled = map.get('reminderEnabled');
  if (enabled !== undefined) result.reminderEnabled = enabled === '1';
  const hhmm = map.get('reminderHHMM');
  if (hhmm !== undefined) result.reminderHHMM = hhmm === '' ? null : hhmm;
  const theme = map.get('themeMode');
  if (theme === 'auto' || theme === 'light' || theme === 'dark') result.themeMode = theme;
  const alerts = map.get('budgetAlertsEnabled');
  if (alerts !== undefined) result.budgetAlertsEnabled = alerts === '1';
  const notifiedMonth = map.get('budgetNotifiedMonth');
  if (notifiedMonth !== undefined) result.budgetNotifiedMonth = notifiedMonth;
  const lang = map.get('language');
  if (lang === 'auto' || lang === 'vi' || lang === 'en') result.language = lang;
  const appLockEnabled = map.get('appLockEnabled');
  if (appLockEnabled !== undefined) result.appLockEnabled = appLockEnabled === '1';
  const appLockBiometricEnabled = map.get('appLockBiometricEnabled');
  if (appLockBiometricEnabled !== undefined) result.appLockBiometricEnabled = appLockBiometricEnabled === '1';
  const photoPolicy = map.get('photoSyncPolicy');
  if (photoPolicy === 'wifi' || photoPolicy === 'always' || photoPolicy === 'off') {
    result.photoSyncPolicy = photoPolicy;
  }
  return result;
}

export function loadSettings(database: SQLiteDatabase = defaultDb): Settings {
  const rows = database.getAllSync<Row>('SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return decode(map);
}

const UPDATED_AT_KEY = '__updated_at';

export function getSettingsUpdatedAt(database: SQLiteDatabase = defaultDb): number {
  const row = database.getFirstSync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    UPDATED_AT_KEY,
  );
  return row ? Number(row.value) || 0 : 0;
}

export function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
  database: SQLiteDatabase = defaultDb,
): void {
  database.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    encode(key, value),
  );
  database.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    UPDATED_AT_KEY,
    String(Date.now()),
  );
}

export function resetSettings(database: SQLiteDatabase = defaultDb): void {
  database.runSync('DELETE FROM settings');
}
