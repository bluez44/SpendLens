import type { SQLiteDatabase } from 'expo-sqlite';

import { db as defaultDb } from './db';

export interface Settings {
  monthlyBudget: number;
  reminderEnabled: boolean;
  reminderHHMM: string | null;
  themeMode: 'auto' | 'light' | 'dark';
}

export const DEFAULTS: Settings = {
  monthlyBudget: 0,
  reminderEnabled: false,
  reminderHHMM: null,
  themeMode: 'auto',
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
  return result;
}

export function loadSettings(database: SQLiteDatabase = defaultDb): Settings {
  const rows = database.getAllSync<Row>('SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return decode(map);
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
}

export function resetSettings(database: SQLiteDatabase = defaultDb): void {
  database.runSync('DELETE FROM settings');
}
