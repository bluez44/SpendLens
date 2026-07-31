jest.mock('expo-file-system', () => ({
  __esModule: true,
  File: jest.fn().mockImplementation((p: string) => ({
    delete: () => {
      if (p.startsWith('/tmp/does-not-exist')) throw new Error('ENOENT: mock');
    },
  })),
}));

import * as SQLite from 'expo-sqlite';

import { insertTransaction, listTransactions, resetTransactions, updateTransaction } from './transactions';

function freshDb() {
  const database = SQLite.openDatabaseSync(':memory:');
  database.execSync(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT,
      updated_at INTEGER,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      note TEXT,
      amount REAL NOT NULL,
      is_income INTEGER NOT NULL DEFAULT 0,
      photo_path TEXT,
      currency TEXT,
      original_amount REAL,
      original_currency TEXT,
      subscription_uuid TEXT
    );
  `);
  return database;
}

const IDENTITY_RATES = { VND: 1 / 25000, EUR: 1.10, JPY: 0.0067, GBP: 1.25, KRW: 0.00075 };

describe('insertTransaction currency', () => {
  it('same as primary: amount and original are equal', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', originalAmount: 45000,
      originalCurrency: 'VND', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    const row = db.getFirstSync<{
      amount: number; currency: string; original_amount: number; original_currency: string;
    }>('SELECT amount, currency, original_amount, original_currency FROM transactions WHERE id = ?', id);
    expect(row?.amount).toBe(45000);
    expect(row?.currency).toBe('VND');
    expect(row?.original_amount).toBe(45000);
    expect(row?.original_currency).toBe('VND');
  });

  it('different from primary: amount converted, original preserved', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', originalAmount: 20,
      originalCurrency: 'USD', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    const row = db.getFirstSync<{ amount: number; currency: string; original_amount: number; original_currency: string; }>(
      'SELECT amount, currency, original_amount, original_currency FROM transactions WHERE id = ?', id,
    );
    expect(row?.amount).toBeCloseTo(20 * 25000, 0);
    expect(row?.currency).toBe('VND');
    expect(row?.original_amount).toBe(20);
    expect(row?.original_currency).toBe('USD');
  });
});

describe('updateTransaction currency', () => {
  it('recomputes amount from originals on edit', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', originalAmount: 20,
      originalCurrency: 'USD', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    updateTransaction(id, {
      date: '2026-07-01', time: '10:00',
      category: 'food', name: 'x', originalAmount: 25,
      originalCurrency: 'USD', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    const row = db.getFirstSync<{ amount: number; original_amount: number }>(
      'SELECT amount, original_amount FROM transactions WHERE id = ?', id,
    );
    expect(row?.original_amount).toBe(25);
    expect(row?.amount).toBeCloseTo(25 * 25000, 0);
  });
});

describe('subscriptionUuid on insert/list', () => {
  it('default null when omitted', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-08-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x',
      originalAmount: 45000, originalCurrency: 'VND', isIncome: false,
    }, db);
    const list = listTransactions(db);
    expect(list.find((t) => t.id === id)?.subscriptionUuid).toBeNull();
  });

  it('stores non-null uuid when provided', () => {
    const db = freshDb();
    insertTransaction({
      date: '2026-08-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'Claude Pro',
      originalAmount: 20, originalCurrency: 'USD', isIncome: false,
      subscriptionUuid: 'sub-abc',
    }, db);
    expect(listTransactions(db)[0].subscriptionUuid).toBe('sub-abc');
  });
});

describe('resetTransactions', () => {
  it('deletes every row', () => {
    const db = freshDb();
    insertTransaction({
      date: '2026-07-23', time: '10:00', createdAt: Date.now(),
      category: 'food', name: 'Coffee', originalAmount: 45000, originalCurrency: 'VND', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    resetTransactions(db);
    expect(listTransactions(db)).toEqual([]);
  });

  it('skips remote photo URLs and swallows local-file delete errors', () => {
    const db = freshDb();
    insertTransaction({
      date: '2026-07-23', time: '10:00', createdAt: Date.now(),
      category: 'food', name: 'Cà phê', originalAmount: 45000, originalCurrency: 'VND', isIncome: false,
      photoPath: 'https://example.com/receipt.jpg',
    }, db, 'VND', IDENTITY_RATES);
    insertTransaction({
      date: '2026-07-23', time: '11:00', createdAt: Date.now(),
      category: 'food', name: 'Cà phê', originalAmount: 30000, originalCurrency: 'VND', isIncome: false,
      photoPath: '/tmp/does-not-exist.jpg',
    }, db, 'VND', IDENTITY_RATES);
    // Should not throw — remote URL is skipped, missing local file is swallowed.
    expect(() => resetTransactions(db)).not.toThrow();
    expect(listTransactions(db)).toEqual([]);
  });
});
