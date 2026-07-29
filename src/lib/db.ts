import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

export const FALLBACK_RATES: Record<'VND'|'EUR'|'JPY'|'GBP'|'KRW', number> = {
  VND: 1 / 24500,
  EUR: 1.09,
  JPY: 0.0068,
  GBP: 1.27,
  KRW: 0.00072,
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transactions (
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
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fx_rates (
    currency TEXT PRIMARY KEY,
    rate_to_usd REAL NOT NULL,
    source TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

export function hasColumn(db: SQLiteDatabase, table: string, column: string): boolean {
  const result = db.getFirstSync<{ name: string }>(
    `PRAGMA table_info(${table})`
  );
  if (!result) return false;

  const columns = db.getAllSync<{ name: string }>(
    `PRAGMA table_info(${table})`
  );
  return columns.some(c => c.name === column);
}

export function createDb(name: string): SQLiteDatabase {
  const database = SQLite.openDatabaseSync(name);
  database.execSync(SCHEMA);
  return database;
}

export function runMigrations(db: SQLiteDatabase): void {
  if (!hasColumn(db, 'transactions', 'currency')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN currency TEXT');
  }
  db.execSync("UPDATE transactions SET currency = 'VND' WHERE currency IS NULL");

  if (!hasColumn(db, 'transactions', 'original_amount')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN original_amount REAL');
  }
  db.execSync('UPDATE transactions SET original_amount = amount WHERE original_amount IS NULL');

  if (!hasColumn(db, 'transactions', 'original_currency')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN original_currency TEXT');
  }
  db.execSync("UPDATE transactions SET original_currency = 'VND' WHERE original_currency IS NULL");

  const now = Date.now();
  for (const [currency, rate] of Object.entries(FALLBACK_RATES)) {
    db.runSync(
      `INSERT INTO fx_rates (currency, rate_to_usd, source, updated_at)
       VALUES (?, ?, 'fallback', ?)
       ON CONFLICT(currency) DO NOTHING`,
      currency, rate, now,
    );
  }
}

export const db = createDb('spendlens.db');
runMigrations(db);
