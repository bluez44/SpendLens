let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => `00000000-0000-0000-0000-${String(++mockUuidCounter).padStart(12, '0')}`),
}));

import { createDb, runMigrations, hasColumn } from './db';

describe('createDb', () => {
  it('creates the expected tables on an in-memory database', () => {
    const database = createDb(':memory:');
    const tables = database.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    expect(tables.map((t) => t.name)).toEqual(['categories', 'settings', 'sync_meta', 'transactions', 'users']);
  });
});

describe('runMigrations', () => {
  it('adds uuid + updated_at to transactions', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    expect(hasColumn(db, 'transactions', 'uuid')).toBe(true);
    expect(hasColumn(db, 'transactions', 'updated_at')).toBe(true);
  });

  it('adds updated_at to categories', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    expect(hasColumn(db, 'categories', 'updated_at')).toBe(true);
  });

  it('creates sync_meta table', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const tables = db.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_meta'"
    );
    expect(tables).toHaveLength(1);
  });

  it('is idempotent (running twice does not error)', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('backfills uuid on existing rows', () => {
    const db = createDb(':memory:');
    db.runSync(
      `INSERT INTO transactions (date, time, created_at, category, name, amount)
       VALUES ('2026-07-01', '10:00', 1000, 'food', 'x', 5)`
    );
    runMigrations(db);
    const row = db.getFirstSync<{ uuid: string; updated_at: number }>(
      'SELECT uuid, updated_at FROM transactions LIMIT 1'
    );
    expect(row?.uuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row?.updated_at).toBe(1000);
  });
});
