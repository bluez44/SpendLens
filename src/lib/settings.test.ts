import * as SQLite from 'expo-sqlite';

import { DEFAULTS, loadSettings, resetSettings, updateSetting } from './settings';

function freshDb() {
  const database = SQLite.openDatabaseSync(':memory:');
  database.execSync(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  return database;
}

describe('loadSettings', () => {
  it('returns DEFAULTS when the table is empty', () => {
    expect(loadSettings(freshDb())).toEqual(DEFAULTS);
  });

  it('round-trips every key type', () => {
    const db = freshDb();
    updateSetting('monthlyBudget', 3_000_000, db);
    updateSetting('reminderEnabled', true, db);
    updateSetting('reminderHHMM', '21:00', db);
    updateSetting('themeMode', 'dark', db);
    expect(loadSettings(db)).toEqual({
      monthlyBudget: 3_000_000,
      reminderEnabled: true,
      reminderHHMM: '21:00',
      themeMode: 'dark',
    });
  });

  it('encodes booleans as "0"/"1" (not string "true"/"false")', () => {
    const db = freshDb();
    updateSetting('reminderEnabled', false, db);
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['reminderEnabled']);
    expect(row?.value).toBe('0');
  });
});

describe('resetSettings', () => {
  it('clears every row so the next load returns DEFAULTS', () => {
    const db = freshDb();
    updateSetting('monthlyBudget', 1_000_000, db);
    resetSettings(db);
    expect(loadSettings(db)).toEqual(DEFAULTS);
  });
});
