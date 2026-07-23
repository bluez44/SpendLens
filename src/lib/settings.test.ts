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
    updateSetting('budgetAlertsEnabled', false, db);
    updateSetting('budgetNotifiedMonth', '2026-07:100', db);
    expect(loadSettings(db)).toEqual({
      monthlyBudget: 3_000_000,
      reminderEnabled: true,
      reminderHHMM: '21:00',
      themeMode: 'dark',
      budgetAlertsEnabled: false,
      budgetNotifiedMonth: '2026-07:100',
      language: 'auto',
    });
  });

  it('encodes booleans as "0"/"1" (not string "true"/"false")', () => {
    const db = freshDb();
    updateSetting('reminderEnabled', false, db);
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['reminderEnabled']);
    expect(row?.value).toBe('0');
  });

  it('round-trips budgetAlertsEnabled (default true)', () => {
    const db = freshDb();
    expect(loadSettings(db).budgetAlertsEnabled).toBe(true);
    updateSetting('budgetAlertsEnabled', false, db);
    expect(loadSettings(db).budgetAlertsEnabled).toBe(false);
    updateSetting('budgetAlertsEnabled', true, db);
    expect(loadSettings(db).budgetAlertsEnabled).toBe(true);
  });

  it('encodes budgetAlertsEnabled as "0"/"1"', () => {
    const db = freshDb();
    updateSetting('budgetAlertsEnabled', false, db);
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['budgetAlertsEnabled']);
    expect(row?.value).toBe('0');
  });

  it('round-trips budgetNotifiedMonth (default "")', () => {
    const db = freshDb();
    expect(loadSettings(db).budgetNotifiedMonth).toBe('');
    updateSetting('budgetNotifiedMonth', '2026-07:80', db);
    expect(loadSettings(db).budgetNotifiedMonth).toBe('2026-07:80');
    updateSetting('budgetNotifiedMonth', '2026-07:100', db);
    expect(loadSettings(db).budgetNotifiedMonth).toBe('2026-07:100');
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

describe('language setting', () => {
  it('defaults to auto', () => {
    const s = loadSettings(freshDb());
    expect(s.language).toBe('auto');
  });

  it('round-trips vi / en / auto', () => {
    const d = freshDb();
    updateSetting('language', 'vi', d);
    expect(loadSettings(d).language).toBe('vi');
    updateSetting('language', 'en', d);
    expect(loadSettings(d).language).toBe('en');
    updateSetting('language', 'auto', d);
    expect(loadSettings(d).language).toBe('auto');
  });

  it('unknown value falls back to auto', () => {
    const d = freshDb();
    d.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'language', 'zh');
    expect(loadSettings(d).language).toBe('auto');
  });
});
