import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

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
  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

export function hasColumn(db: SQLiteDatabase, table: string, column: string): boolean {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

export function runMigrations(db: SQLiteDatabase): void {
  if (!hasColumn(db, 'transactions', 'uuid')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN uuid TEXT');
  }
  const nullUuidRows = db.getAllSync<{ id: number }>(
    'SELECT id FROM transactions WHERE uuid IS NULL'
  );
  for (const r of nullUuidRows) {
    db.runSync('UPDATE transactions SET uuid = ? WHERE id = ?', Crypto.randomUUID(), r.id);
  }

  if (!hasColumn(db, 'transactions', 'updated_at')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN updated_at INTEGER');
  }
  db.execSync('UPDATE transactions SET updated_at = created_at WHERE updated_at IS NULL');

  if (!hasColumn(db, 'categories', 'updated_at')) {
    db.execSync('ALTER TABLE categories ADD COLUMN updated_at INTEGER');
  }
  db.execSync('UPDATE categories SET updated_at = created_at WHERE updated_at IS NULL');
}

export function createDb(name: string): SQLiteDatabase {
  const database = SQLite.openDatabaseSync(name);
  database.execSync(SCHEMA);
  runMigrations(database);
  return database;
}

export const db = createDb('spendlens.db');
