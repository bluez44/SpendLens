import { createDb, runMigrations, hasColumn } from './db';

describe('createDb', () => {
  it('creates the expected tables on an in-memory database', () => {
    const database = createDb(':memory:');
    runMigrations(database);
    const tables = database.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    expect(tables.map((t) => t.name)).toEqual(['categories', 'fx_rates', 'settings', 'transactions', 'users']);
  });
});

describe('runMigrations currency columns', () => {
  it('adds currency/original_amount/original_currency to transactions', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    expect(hasColumn(db, 'transactions', 'currency')).toBe(true);
    expect(hasColumn(db, 'transactions', 'original_amount')).toBe(true);
    expect(hasColumn(db, 'transactions', 'original_currency')).toBe(true);
  });

  it('creates fx_rates table', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const t = db.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='fx_rates'"
    );
    expect(t).toHaveLength(1);
  });

  it('seeds fallback fx_rates rows for VND/EUR/JPY/GBP/KRW', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const rows = db.getAllSync<{ currency: string; source: string }>(
      "SELECT currency, source FROM fx_rates ORDER BY currency"
    );
    expect(rows.map(r => r.currency).sort())
      .toEqual(['EUR', 'GBP', 'JPY', 'KRW', 'VND']);
    expect(rows.every(r => r.source === 'fallback' || r.source === 'auto' || r.source === 'manual')).toBe(true);
  });

  it('backfills VND on existing rows', () => {
    const db = createDb(':memory:');
    db.runSync(
      `INSERT INTO transactions (date, time, created_at, category, name, amount)
       VALUES ('2026-07-01', '10:00', 1000, 'food', 'x', 5000)`
    );
    runMigrations(db);
    const row = db.getFirstSync<{
      currency: string; original_amount: number; original_currency: string;
    }>('SELECT currency, original_amount, original_currency FROM transactions LIMIT 1');
    expect(row?.currency).toBe('VND');
    expect(row?.original_amount).toBe(5000);
    expect(row?.original_currency).toBe('VND');
  });

  it('does not overwrite manual fx_rates on second run', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    db.runSync(
      "UPDATE fx_rates SET rate_to_usd = 999, source = 'manual' WHERE currency = 'VND'"
    );
    runMigrations(db);
    const row = db.getFirstSync<{ rate_to_usd: number; source: string }>(
      "SELECT rate_to_usd, source FROM fx_rates WHERE currency = 'VND'"
    );
    expect(row?.rate_to_usd).toBe(999);
    expect(row?.source).toBe('manual');
  });
});
