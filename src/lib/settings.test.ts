import * as SQLite from 'expo-sqlite';

import { DEFAULTS, loadSettings, resetSettings, updateSetting, changePrimaryCurrency } from './settings';
import { createDb, runMigrations } from './db';
import { insertTransaction } from './transactions';

const RATES = { VND: 1/25000, EUR: 1.10, JPY: 0.0067, GBP: 1.25, KRW: 0.00075 };

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
    updateSetting('appLockEnabled', true, db);
    updateSetting('appLockBiometricEnabled', true, db);
    updateSetting('primaryCurrency', 'USD', db);
    expect(loadSettings(db)).toEqual({
      monthlyBudget: 3_000_000,
      reminderEnabled: true,
      reminderHHMM: '21:00',
      themeMode: 'dark',
      budgetAlertsEnabled: false,
      budgetNotifiedMonth: '2026-07:100',
      language: 'auto',
      appLockEnabled: true,
      appLockBiometricEnabled: true,
      primaryCurrency: 'USD',
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

describe('app lock settings', () => {
  it('default to false', () => {
    const s = loadSettings(freshDb());
    expect(s.appLockEnabled).toBe(false);
    expect(s.appLockBiometricEnabled).toBe(false);
  });

  it('round-trip independently of each other', () => {
    const db = freshDb();
    updateSetting('appLockEnabled', true, db);
    expect(loadSettings(db).appLockEnabled).toBe(true);
    expect(loadSettings(db).appLockBiometricEnabled).toBe(false);
    updateSetting('appLockBiometricEnabled', true, db);
    expect(loadSettings(db).appLockBiometricEnabled).toBe(true);
  });

  it('encode as "0"/"1"', () => {
    const db = freshDb();
    updateSetting('appLockEnabled', true, db);
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['appLockEnabled']);
    expect(row?.value).toBe('1');
  });
});

describe('primaryCurrency setting', () => {
  it('defaults to VND', () => {
    expect(loadSettings(freshDb()).primaryCurrency).toBe('VND');
  });
  it('round-trips', () => {
    const db = freshDb();
    updateSetting('primaryCurrency', 'USD', db);
    expect(loadSettings(db).primaryCurrency).toBe('USD');
  });
  it('unknown value falls back to VND', () => {
    const db = freshDb();
    db.runSync("INSERT INTO settings (key, value) VALUES ('primaryCurrency', 'XXX')");
    expect(loadSettings(db).primaryCurrency).toBe('VND');
  });
});

describe('changePrimaryCurrency', () => {
  it('recomputes every txn amount from originals; converts budget', () => {
    const d = createDb(':memory:');
    runMigrations(d);
    insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'a', originalAmount: 50000,
      originalCurrency: 'VND', isIncome: false,
    }, d, 'VND', RATES);
    insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'b', originalAmount: 20,
      originalCurrency: 'USD', isIncome: false,
    }, d, 'VND', RATES);
    updateSetting('monthlyBudget', 5_000_000, d);
    updateSetting('primaryCurrency', 'VND', d);

    changePrimaryCurrency(d, 'VND', 'USD', RATES);

    const rows = d.getAllSync<any>(
      'SELECT amount, currency, original_amount, original_currency FROM transactions ORDER BY id'
    );
    expect(rows[0].amount).toBeCloseTo(2, 5);
    expect(rows[0].currency).toBe('USD');
    expect(rows[1].amount).toBeCloseTo(20, 5);
    expect(rows[1].currency).toBe('USD');

    const s = loadSettings(d);
    expect(s.primaryCurrency).toBe('USD');
    expect(s.monthlyBudget).toBeCloseTo(200, 1);
  });

  it('back-and-forth is close to identity', () => {
    const d = createDb(':memory:');
    runMigrations(d);
    insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'a', originalAmount: 50000,
      originalCurrency: 'VND', isIncome: false,
    }, d, 'VND', RATES);
    changePrimaryCurrency(d, 'VND', 'USD', RATES);
    changePrimaryCurrency(d, 'USD', 'VND', RATES);
    const row = d.getFirstSync<{ amount: number }>('SELECT amount FROM transactions LIMIT 1');
    expect(row?.amount).toBeCloseTo(50000, 0);
  });
});
