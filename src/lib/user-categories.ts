import type { SQLiteDatabase } from 'expo-sqlite';

import type { Category, CustomCategoryId } from './categories';
import { db as defaultDb } from './db';

export interface UserCategory {
  id: CustomCategoryId;
  label: string;
  createdAt: number;
}

type Row = { id: string; label: string; created_at: number };

export function listUserCategories(database: SQLiteDatabase = defaultDb): UserCategory[] {
  const rows = database.getAllSync<Row>(
    'SELECT id, label, created_at FROM categories ORDER BY created_at ASC',
  );
  return rows.map((r) => ({
    id: r.id as CustomCategoryId,
    label: r.label,
    createdAt: r.created_at,
  }));
}

let _seq = 0;

export function insertUserCategory(
  label: string,
  database: SQLiteDatabase = defaultDb,
): UserCategory {
  const trimmed = label.trim();
  if (!trimmed) throw new Error('label required');
  const createdAt = Date.now();
  const id: CustomCategoryId = `custom_${createdAt}_${++_seq}`;
  database.runSync(
    'INSERT INTO categories (id, label, created_at) VALUES (?, ?, ?)',
    id,
    trimmed,
    createdAt,
  );
  return { id, label: trimmed, createdAt };
}

export function deleteUserCategory(id: string, database: SQLiteDatabase = defaultDb): void {
  database.runSync('DELETE FROM categories WHERE id = ?', id);
}

export function resetUserCategories(database: SQLiteDatabase = defaultDb): void {
  database.runSync('DELETE FROM categories');
}

/** Convert a UserCategory to the unified Category shape used by chips. */
export function toCategoryObj(uc: UserCategory): Category {
  return {
    id: uc.id,
    labelKey: null,
    label: uc.label,
    chip: '#F3F4F6',
    fg: '#6B7280',
  };
}
