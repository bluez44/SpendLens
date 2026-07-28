let mockSnapUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => `00000000-0000-0000-0000-${String(++mockSnapUuidCounter).padStart(12, '0')}`),
}));
jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn(),
  Directory: jest.fn(),
}));

import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from '../db';
import { buildSnapshot, applySnapshot, isEmptySnapshot } from './snapshot';
import type { Snapshot } from './types';

function freshDb(): SQLiteDatabase {
  const db = SQLite.openDatabaseSync(':memory:');
  db.execSync(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL, time TEXT NOT NULL,
      created_at INTEGER NOT NULL, category TEXT NOT NULL,
      name TEXT NOT NULL, note TEXT, amount REAL NOT NULL,
      is_income INTEGER NOT NULL DEFAULT 0, photo_path TEXT
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  runMigrations(db);
  return db;
}

describe('buildSnapshot', () => {
  it('returns an empty snapshot for an empty db', () => {
    const db = freshDb();
    const s = buildSnapshot(db, 'device-1');
    expect(s.version).toBe(1);
    expect(s.deviceId).toBe('device-1');
    expect(s.transactions).toEqual([]);
    expect(s.categories).toEqual([]);
    expect(s.settings.values).toEqual({});
    expect(s.photoManifest).toEqual([]);
  });

  it('serializes a transaction with photoUuid derived from path', () => {
    const db = freshDb();
    db.runSync(
      `INSERT INTO transactions
        (uuid, date, time, created_at, updated_at, category, name, note, amount, is_income, photo_path)
       VALUES ('t-1', '2026-07-01', '10:00', 100, 200, 'food', 'x', NULL, 50, 0, 'file:///doc/photos/photo-1.jpg')`
    );
    const s = buildSnapshot(db, 'device-1');
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0]).toMatchObject({
      uuid: 't-1', updatedAt: 200, photoUuid: 'photo-1',
    });
    expect(s.photoManifest).toEqual(['photo-1']);
  });
});

describe('applySnapshot', () => {
  it('replaces db contents wholesale', () => {
    const db = freshDb();
    db.runSync(
      `INSERT INTO transactions
        (uuid, date, time, created_at, updated_at, category, name, note, amount, is_income, photo_path)
       VALUES ('old', '2026-06-01', '10:00', 100, 200, 'food', 'x', NULL, 5, 0, NULL)`
    );
    const snap: Snapshot = {
      version: 1, generatedAt: 500, deviceId: 'device-1',
      transactions: [{
        uuid: 'new', date: '2026-07-01', time: '10:00',
        createdAt: 300, updatedAt: 400, category: 'food',
        name: 'y', note: null, amount: 10, isIncome: 0, photoUuid: null,
      }],
      categories: [], settings: { updatedAt: 0, values: {} }, photoManifest: [],
    };
    applySnapshot(db, snap);
    const rows = db.getAllSync<{ uuid: string }>('SELECT uuid FROM transactions');
    expect(rows.map(r => r.uuid)).toEqual(['new']);
  });

  it('is idempotent', () => {
    const db = freshDb();
    const snap: Snapshot = {
      version: 1, generatedAt: 500, deviceId: 'device-1',
      transactions: [{
        uuid: 'a', date: '2026-07-01', time: '10:00',
        createdAt: 300, updatedAt: 400, category: 'food',
        name: 'y', note: null, amount: 10, isIncome: 0, photoUuid: null,
      }],
      categories: [], settings: { updatedAt: 0, values: {} }, photoManifest: [],
    };
    applySnapshot(db, snap);
    applySnapshot(db, snap);
    const rows = db.getAllSync<{ uuid: string }>('SELECT uuid FROM transactions');
    expect(rows).toHaveLength(1);
  });
});

describe('isEmptySnapshot', () => {
  it('returns true for null', () => {
    expect(isEmptySnapshot(null)).toBe(true);
  });
  it('returns true for a snapshot with no txns and no categories', () => {
    expect(isEmptySnapshot({
      version: 1, generatedAt: 0, deviceId: 'x',
      transactions: [], categories: [],
      settings: { updatedAt: 0, values: {} }, photoManifest: [],
    })).toBe(true);
  });
  it('returns false if there is at least one txn', () => {
    expect(isEmptySnapshot({
      version: 1, generatedAt: 0, deviceId: 'x',
      transactions: [{
        uuid: 'a', date: '', time: '', createdAt: 0, updatedAt: 0,
        category: 'food', name: 'x', note: null, amount: 1, isIncome: 0, photoUuid: null,
      }],
      categories: [], settings: { updatedAt: 0, values: {} }, photoManifest: [],
    })).toBe(false);
  });
});
