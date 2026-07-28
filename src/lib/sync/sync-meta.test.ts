import * as SQLite from 'expo-sqlite';
import {
  getSyncMeta, setSyncMeta, getDirty, setDirty,
  getLastSyncedAt, setLastSyncedAt, resetSyncMeta,
} from './sync-meta';

function db() {
  const d = SQLite.openDatabaseSync(':memory:');
  d.execSync('CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT)');
  return d;
}

describe('sync-meta', () => {
  it('get returns null for missing keys', () => {
    expect(getSyncMeta(db(), 'x')).toBeNull();
  });
  it('set then get roundtrips', () => {
    const d = db();
    setSyncMeta(d, 'x', 'value');
    expect(getSyncMeta(d, 'x')).toBe('value');
  });
  it('dirty defaults to false', () => {
    expect(getDirty(db())).toBe(false);
  });
  it('setDirty(true) makes getDirty return true', () => {
    const d = db();
    setDirty(d, true);
    expect(getDirty(d)).toBe(true);
  });
  it('setLastSyncedAt / getLastSyncedAt roundtrips number', () => {
    const d = db();
    setLastSyncedAt(d, 12345);
    expect(getLastSyncedAt(d)).toBe(12345);
  });
  it('resetSyncMeta clears dirty and last_synced_at only', () => {
    const d = db();
    setSyncMeta(d, 'device_id_cache', 'abc');
    setDirty(d, true);
    setLastSyncedAt(d, 999);
    resetSyncMeta(d);
    expect(getSyncMeta(d, 'device_id_cache')).toBe('abc');
    expect(getDirty(d)).toBe(false);
    expect(getLastSyncedAt(d)).toBeNull();
  });
});
