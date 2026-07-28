jest.mock('expo-file-system', () => ({
  __esModule: true,
  File: jest.fn().mockImplementation((p: string) => ({
    delete: () => {
      if (p.startsWith('/tmp/does-not-exist')) throw new Error('ENOENT: mock');
    },
  })),
}));

let mockTxnUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => `00000000-0000-0000-0000-${String(++mockTxnUuidCounter).padStart(12, '0')}`),
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
      photo_path TEXT
    );
  `);
  return database;
}

describe('resetTransactions', () => {
  it('deletes every row', () => {
    const db = freshDb();
    insertTransaction({
      date: '2026-07-23', time: '10:00', createdAt: Date.now(),
      category: 'food', name: 'Coffee', amount: 45000, isIncome: false,
    }, db);
    resetTransactions(db);
    expect(listTransactions(db)).toEqual([]);
  });

  it('skips remote photo URLs and swallows local-file delete errors', () => {
    const db = freshDb();
    insertTransaction({
      date: '2026-07-23', time: '10:00', createdAt: Date.now(),
      category: 'food', name: 'Cà phê', amount: 45000, isIncome: false,
      photoPath: 'https://example.com/receipt.jpg',
    }, db);
    insertTransaction({
      date: '2026-07-23', time: '11:00', createdAt: Date.now(),
      category: 'food', name: 'Cà phê', amount: 30000, isIncome: false,
      photoPath: '/tmp/does-not-exist.jpg',
    }, db);
    // Should not throw — remote URL is skipped, missing local file is swallowed.
    expect(() => resetTransactions(db)).not.toThrow();
    expect(listTransactions(db)).toEqual([]);
  });
});

describe('insertTransaction', () => {
  it('assigns uuid and updated_at', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', amount: 5, isIncome: false,
    }, db);
    const row = db.getFirstSync<{ uuid: string; updated_at: number }>(
      'SELECT uuid, updated_at FROM transactions WHERE id = ?', id
    );
    expect(row?.uuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row?.updated_at).toBe(1000);
  });
});

describe('updateTransaction', () => {
  it('bumps updated_at on edit', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', amount: 5, isIncome: false,
    }, db);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(2000);
    updateTransaction(id, {
      date: '2026-07-01', time: '10:00',
      category: 'food', name: 'x', amount: 6, isIncome: false,
    }, db);
    const row = db.getFirstSync<{ updated_at: number }>(
      'SELECT updated_at FROM transactions WHERE id = ?', id
    );
    expect(row?.updated_at).toBe(2000);
    nowSpy.mockRestore();
  });
});
