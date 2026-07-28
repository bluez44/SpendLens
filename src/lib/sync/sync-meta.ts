import type { SQLiteDatabase } from 'expo-sqlite';

const DIRTY = 'dirty';
const LAST_SYNCED = 'last_synced_at';
const DEVICE_ID = 'device_id_cache';

export function getSyncMeta(db: SQLiteDatabase, key: string): string | null {
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?', key
  );
  return row?.value ?? null;
}

export function setSyncMeta(db: SQLiteDatabase, key: string, value: string): void {
  db.runSync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

function clearKey(db: SQLiteDatabase, key: string): void {
  db.runSync('DELETE FROM sync_meta WHERE key = ?', key);
}

export function getDirty(db: SQLiteDatabase): boolean {
  return getSyncMeta(db, DIRTY) === '1';
}
export function setDirty(db: SQLiteDatabase, dirty: boolean): void {
  setSyncMeta(db, DIRTY, dirty ? '1' : '0');
}
export function getLastSyncedAt(db: SQLiteDatabase): number | null {
  const v = getSyncMeta(db, LAST_SYNCED);
  return v ? Number(v) : null;
}
export function setLastSyncedAt(db: SQLiteDatabase, ts: number): void {
  setSyncMeta(db, LAST_SYNCED, String(ts));
}
export function getDeviceIdCache(db: SQLiteDatabase): string | null {
  return getSyncMeta(db, DEVICE_ID);
}
export function setDeviceIdCache(db: SQLiteDatabase, id: string): void {
  setSyncMeta(db, DEVICE_ID, id);
}
export function resetSyncMeta(db: SQLiteDatabase): void {
  clearKey(db, DIRTY);
  clearKey(db, LAST_SYNCED);
}
