jest.mock('expo-file-system', () => ({
  __esModule: true,
  File: jest.fn().mockImplementation((p: string) => ({
    delete: () => {
      if (p.startsWith('/tmp/does-not-exist')) throw new Error('ENOENT: mock');
    },
  })),
}));

import * as SQLite from 'expo-sqlite';

import { insertTransaction, listTransactions, resetTransactions } from './transactions';

function freshDb() {
  const database = SQLite.openDatabaseSync(':memory:');
  database.execSync(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
