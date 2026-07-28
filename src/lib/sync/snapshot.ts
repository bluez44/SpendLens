import type { SQLiteDatabase } from 'expo-sqlite';

import { getSettingsUpdatedAt } from '../settings';
import { uuidFromPhotoPath, photoPathForUuid } from './photo-paths';
import type { Snapshot, SnapshotTxn, SnapshotCategory } from './types';

export function buildSnapshot(db: SQLiteDatabase, deviceId: string): Snapshot {
  const txnRows = db.getAllSync<{
    uuid: string; date: string; time: string;
    created_at: number; updated_at: number;
    category: string; name: string; note: string | null;
    amount: number; is_income: number; photo_path: string | null;
  }>('SELECT * FROM transactions ORDER BY created_at ASC');

  const transactions: SnapshotTxn[] = txnRows.map((r) => ({
    uuid: r.uuid,
    date: r.date, time: r.time,
    createdAt: r.created_at, updatedAt: r.updated_at,
    category: r.category, name: r.name, note: r.note,
    amount: r.amount, isIncome: r.is_income === 1 ? 1 : 0,
    photoUuid: uuidFromPhotoPath(r.photo_path),
  }));

  const catRows = db.getAllSync<{
    id: string; label: string; created_at: number; updated_at: number;
  }>('SELECT id, label, created_at, updated_at FROM categories ORDER BY created_at ASC');

  const categories: SnapshotCategory[] = catRows.map((r) => ({
    id: r.id, label: r.label,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));

  const settingRows = db.getAllSync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key != '__updated_at'"
  );
  const values: Record<string, string> = {};
  for (const r of settingRows) values[r.key] = r.value;

  const photoManifest = transactions
    .map((t) => t.photoUuid)
    .filter((u): u is string => u !== null);

  return {
    version: 1,
    generatedAt: Date.now(),
    deviceId,
    transactions,
    categories,
    settings: { updatedAt: getSettingsUpdatedAt(db), values },
    photoManifest,
  };
}

export function applySnapshot(db: SQLiteDatabase, snap: Snapshot): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM transactions');
    db.runSync('DELETE FROM categories');
    db.runSync('DELETE FROM settings');

    for (const t of snap.transactions) {
      db.runSync(
        `INSERT INTO transactions
          (uuid, date, time, created_at, updated_at, category, name, note, amount, is_income, photo_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        t.uuid, t.date, t.time, t.createdAt, t.updatedAt,
        t.category, t.name, t.note, t.amount, t.isIncome,
        t.photoUuid ? photoPathForUuid(t.photoUuid) : null,
      );
    }
    for (const c of snap.categories) {
      db.runSync(
        'INSERT INTO categories (id, label, created_at, updated_at) VALUES (?, ?, ?, ?)',
        c.id, c.label, c.createdAt, c.updatedAt,
      );
    }
    for (const [k, v] of Object.entries(snap.settings.values)) {
      db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', k, v);
    }
    db.runSync(
      'INSERT INTO settings (key, value) VALUES (?, ?)',
      '__updated_at', String(snap.settings.updatedAt),
    );
  });
}

export function isEmptySnapshot(snap: Snapshot | null): boolean {
  if (!snap) return true;
  return snap.transactions.length === 0 && snap.categories.length === 0;
}
