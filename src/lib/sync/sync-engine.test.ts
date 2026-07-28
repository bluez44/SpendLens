jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn().mockImplementation(() => ({ exists: false })),
  Directory: jest.fn().mockImplementation(() => ({ exists: false, create() {}, delete() {} })),
}));
jest.mock('./network-policy', () => ({
  __esModule: true,
  shouldSyncPhotos: jest.fn(async () => false),
}));
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => 'gen-uuid'),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { deviceName: 'Test Device' },
}));

import * as SQLite from 'expo-sqlite';
import { runMigrations } from '../db';
import { SyncEngine } from './sync-engine';
import { MockCloudSyncProvider } from './providers/mock-provider';
import { getDirty, setDirty, getLastSyncedAt } from './sync-meta';

function db() {
  const d = SQLite.openDatabaseSync(':memory:');
  d.execSync(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, time TEXT NOT NULL,
      created_at INTEGER NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
      note TEXT, amount REAL NOT NULL, is_income INTEGER NOT NULL DEFAULT 0,
      photo_path TEXT
    );
    CREATE TABLE categories (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, google_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL, display_name TEXT, avatar_url TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  runMigrations(d);
  return d;
}

describe('SyncEngine.sync', () => {
  it('no-op when dirty=false and not forced', async () => {
    const d = db();
    const p = new MockCloudSyncProvider();
    const e = new SyncEngine(d, p, 'device-1', () => 'off');
    await e.sync();
    expect(p.snapshot).toBeNull();
  });

  it('writes session on first sync and uploads snapshot when dirty', async () => {
    const d = db();
    const p = new MockCloudSyncProvider();
    setDirty(d, true);
    const e = new SyncEngine(d, p, 'device-1', () => 'off');
    await e.sync();
    expect(p.session?.deviceId).toBe('device-1');
    expect(p.snapshot).not.toBeNull();
    expect(getDirty(d)).toBe(false);
    expect(getLastSyncedAt(d)).not.toBeNull();
  });

  it('transitions to kicked when remote session has a different deviceId', async () => {
    const d = db();
    const p = new MockCloudSyncProvider();
    p.session = { deviceId: 'other', deviceName: 'x', loggedInAt: 0 };
    const e = new SyncEngine(d, p, 'device-1', () => 'off');
    setDirty(d, true);
    await e.sync();
    expect(e.getState()).toBe('kicked');
    expect(p.snapshot).toBeNull();
  });

  it('overlapping calls: second call is a no-op while first runs', async () => {
    const d = db();
    const p = new MockCloudSyncProvider();
    setDirty(d, true);
    let uploads = 0;
    const originalUpload = p.uploadSnapshot.bind(p);
    p.uploadSnapshot = async (s) => { uploads++; await originalUpload(s); };
    const e = new SyncEngine(d, p, 'device-1', () => 'off');
    await Promise.all([e.sync(), e.sync()]);
    expect(uploads).toBe(1);
  });

  it('provider error → state="error", dirty preserved', async () => {
    const d = db();
    const p = new MockCloudSyncProvider();
    p.failNextUpload = true;
    setDirty(d, true);
    const e = new SyncEngine(d, p, 'device-1', () => 'off');
    await e.sync();
    expect(e.getState()).toBe('error');
    expect(getDirty(d)).toBe(true);
  });
});

describe('SyncEngine.handleKickedChoice', () => {
  it('keep signs out and clears sync_meta but keeps SQLite data', async () => {
    const d = db();
    d.runSync(
      `INSERT INTO transactions (uuid, date, time, created_at, updated_at, category, name, amount)
       VALUES ('t', '2026-07-01', '10:00', 100, 100, 'food', 'x', 5)`
    );
    const p = new MockCloudSyncProvider();
    await p.signIn();
    const e = new SyncEngine(d, p, 'device-1', () => 'off');
    await e.handleKickedChoice('keep');
    expect(await p.getCurrentUser()).toBeNull();
    const rows = d.getAllSync('SELECT * FROM transactions');
    expect(rows).toHaveLength(1);
  });

  it('wipe clears SQLite and photos', async () => {
    const d = db();
    d.runSync(
      `INSERT INTO transactions (uuid, date, time, created_at, updated_at, category, name, amount)
       VALUES ('t', '2026-07-01', '10:00', 100, 100, 'food', 'x', 5)`
    );
    const p = new MockCloudSyncProvider();
    await p.signIn();
    const e = new SyncEngine(d, p, 'device-1', () => 'off');
    await e.handleKickedChoice('wipe');
    const rows = d.getAllSync('SELECT * FROM transactions');
    expect(rows).toHaveLength(0);
  });
});
