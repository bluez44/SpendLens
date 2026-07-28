# Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Google Drive-backed cloud sync to SpendLens with single-active-device enforcement, a first-login merge dialog, and a backend-agnostic provider layer so a future REST backend drops in with one new file.

**Architecture:** All sync logic lives under `src/lib/sync/` behind a `CloudSyncProvider` interface. A `sync-engine` orchestrates upload triggers (mutation + periodic + foreground + manual) and delegates to whatever provider `providers/index.ts` returns. The initial provider wraps `@react-native-google-signin/google-signin` and the Drive `appDataFolder` REST API. Local SQLite gains three columns and one meta table; snapshots are one JSON file per account plus per-photo files. First-login merge is a two-step bottom-sheet UI (choose source → preview) reusing existing components.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-sqlite, expo-secure-store, expo-crypto, expo-file-system, expo-constants, expo-network (new), `@react-native-google-signin/google-signin` (new), `@gorhom/bottom-sheet`, i18next, Jest + jest-expo.

## Global Constraints

- **Design spec:** every task implements a section of `docs/superpowers/specs/2026-07-27-drive-sync-and-app-lock-design.md`. Deviations from the spec require the spec to be updated first.
- **Backend abstraction is load-bearing:** no file outside `src/lib/sync/providers/` may import from `@react-native-google-signin/google-signin` or from `providers/drive-provider.ts` directly. Anything else imports the interface from `src/lib/sync/provider.ts` or goes through `src/lib/sync/providers/index.ts`.
- **DTOs are plain JSON.** No Google SDK types leak out of `providers/drive-provider.ts`.
- **i18n:** every user-visible string uses `useT()` from `src/lib/i18n` and lives under the `sync.*` namespace in both `src/lib/i18n/locales/en.json` and `src/lib/i18n/locales/vi.json`.
- **Colors:** every color reads from `useColors()` in `src/constants/tokens.ts`. No `#fff`, `#000`, or literal hex/rgba anywhere in new files.
- **Bottom sheets:** all new sheets use `@gorhom/bottom-sheet` and match the pattern in `src/components/sl/budget-sheet.tsx` (BottomSheetModal + BottomSheetBackdrop + forwardRef imperative handle).
- **Photo storage:** local files live at `${Paths.document.uri}/photos/${uuid}.jpg`. `transactions.photo_path` remains the local file path (unchanged column); `photoUuid` is derived via `basename(path).replace('.jpg', '')`.
- **Tests:** colocated `*.test.ts(x)`, Jest + jest-expo preset, `expo-file-system` mocked at module top like `src/lib/transactions.test.ts`. Prefer in-memory SQLite (`SQLite.openDatabaseSync(':memory:')`) with a hand-rolled `freshDb()` helper per test file.
- **No comments unless the WHY is non-obvious.** No trailing summary comments, no "// removed X" markers.
- **Commit granularity:** one commit per task at the end. Message format matches existing style — short imperative subject (`Add X`, `Fix X`, `i18n: X`) followed by a blank line and one paragraph of context.
- **`expo-network` and `@react-native-google-signin/google-signin`** are new native dependencies; the dev-client must be rebuilt after adding them. Task 9 covers the install.

---

## File map

**New files under `src/lib/sync/`:**
- `types.ts` — `Snapshot`, `SessionInfo`, `UserInfo`, `PhotoSyncPolicy`, `MergeStrategy` DTOs
- `provider.ts` — `CloudSyncProvider` interface
- `providers/index.ts` — factory that returns the current concrete provider
- `providers/drive-provider.ts` — Google Drive implementation
- `providers/mock-provider.ts` — in-memory implementation for tests
- `snapshot.ts` — `buildSnapshot(db)`, `applySnapshot(db, snap)`
- `merge.ts` — `mergeSnapshots(local, remote, strategy)`
- `device-id.ts` — `getOrCreateDeviceId()`
- `sync-meta.ts` — get/set for `sync_meta` rows (`dirty`, `last_synced_at`, `device_id_cache`)
- `session.ts` — `createSession(deviceId)`, `isKicked(remote, localDeviceId)`
- `photo-paths.ts` — path helpers, migration helper, wipe helper
- `photo-sync.ts` — upload/download diff logic (respects network policy)
- `network-policy.ts` — `shouldSyncPhotos(policy)` wrapping `expo-network`
- `sync-engine.ts` — trigger orchestration, isSyncing flag, kick detection
- `sync-context.tsx` — React context + `useSync()` hook + auto-mounted triggers
- `auth.ts` — `signIn()` / `signOut()` wrappers around the provider

**New files under `src/components/sl/`:**
- `choose-data-source-sheet.tsx`
- `preview-changes-sheet.tsx`
- `kicked-device-sheet.tsx`
- `sync-status-row.tsx`

**Modified files:**
- `src/lib/db.ts` — add `sync_meta` to SCHEMA, add `runMigrations()`
- `src/lib/transactions.ts` — write `uuid` and `updated_at` on insert/update
- `src/lib/user-categories.ts` — write `updated_at` on insert
- `src/lib/settings.ts` — bump `__updated_at` on every write; expose `getSettingsUpdatedAt()`
- `src/lib/i18n/locales/en.json` — add `sync.*` block
- `src/lib/i18n/locales/vi.json` — add `sync.*` block
- `src/app/_layout.tsx` — mount `SyncProvider`, mount `KickedDeviceSheet` globally
- `src/app/settings.tsx` — add sync section above "DỮ LIỆU"
- `package.json` — add `expo-network`, `@react-native-google-signin/google-signin`
- `src/lib/transactions.test.ts` — extend `freshDb()` with new columns
- `src/lib/db.test.ts` — assert `sync_meta` table exists after `runMigrations()`

---

## Task 1: DB migration foundation

**Files:**
- Modify: `src/lib/db.ts`
- Create: `src/lib/db.test.ts` (extend existing)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `runMigrations(db: SQLiteDatabase): void` — idempotent, adds `uuid`/`updated_at` columns and `sync_meta` table when missing
  - `hasColumn(db, table, column): boolean` — internal but exported for tests

- [ ] **Step 1: Write the failing test — migration adds columns and table**

Append to `src/lib/db.test.ts`:

```ts
import { createDb, runMigrations, hasColumn } from './db';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/db.test.ts`
Expected: FAIL — `runMigrations`, `hasColumn` not defined.

- [ ] **Step 3: Implement in `src/lib/db.ts`**

Replace the file with:

```ts
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
    const rows = db.getAllSync<{ id: number; created_at: number }>(
      'SELECT id, created_at FROM transactions WHERE uuid IS NULL'
    );
    for (const r of rows) {
      db.runSync('UPDATE transactions SET uuid = ? WHERE id = ?', Crypto.randomUUID(), r.id);
    }
  }
  if (!hasColumn(db, 'transactions', 'updated_at')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN updated_at INTEGER');
    db.execSync('UPDATE transactions SET updated_at = created_at WHERE updated_at IS NULL');
  }
  if (!hasColumn(db, 'categories', 'updated_at')) {
    db.execSync('ALTER TABLE categories ADD COLUMN updated_at INTEGER');
    db.execSync('UPDATE categories SET updated_at = created_at WHERE updated_at IS NULL');
  }
}

export function createDb(name: string): SQLiteDatabase {
  const database = SQLite.openDatabaseSync(name);
  database.execSync(SCHEMA);
  runMigrations(database);
  return database;
}

export const db = createDb('spendlens.db');
```

- [ ] **Step 4: Update the existing `createDb` test**

The existing test in `db.test.ts` expects only 4 tables. Update:

```ts
expect(tables.map((t) => t.name)).toEqual(['categories', 'settings', 'sync_meta', 'transactions', 'users']);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/lib/db.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "Add sync_meta table + idempotent schema migrations

Introduces runMigrations() that adds uuid/updated_at columns and the
sync_meta table when missing, backfilling existing rows. Uses PRAGMA
table_info so it is safe to run on every app start regardless of whether
the DB was created before or after this change."
```

---

## Task 2: Photo storage convention + migration

**Files:**
- Create: `src/lib/sync/photo-paths.ts`
- Create: `src/lib/sync/photo-paths.test.ts`

**Interfaces:**
- Consumes: nothing (imports from `expo-file-system`)
- Produces:
  - `photoDirUri(): string` — absolute path to the photos directory
  - `photoPathForUuid(uuid: string): string`
  - `uuidFromPhotoPath(path: string | null): string | null`
  - `wipeAllPhotos(): Promise<void>`
  - `migratePhotosToUuidNames(db: SQLiteDatabase): Promise<void>` — renames existing photos to `${uuid}.jpg` and updates rows

- [ ] **Step 1: Write the failing test**

Create `src/lib/sync/photo-paths.test.ts`:

```ts
jest.mock('expo-file-system', () => {
  const files: Record<string, boolean> = {};
  return {
    __esModule: true,
    Paths: { document: { uri: 'file:///doc/' } },
    File: jest.fn().mockImplementation((p: string) => ({
      exists: files[p] ?? false,
      delete: () => { delete files[p]; },
      move: (dest: { uri: string }) => {
        files[dest.uri] = true;
        delete files[p];
      },
    })),
    Directory: jest.fn().mockImplementation((p: string) => ({
      exists: false,
      create: () => {},
    })),
    __files: files,
  };
});

import { photoDirUri, photoPathForUuid, uuidFromPhotoPath } from './photo-paths';

describe('photo-paths', () => {
  it('photoDirUri returns document/photos/', () => {
    expect(photoDirUri()).toBe('file:///doc/photos/');
  });

  it('photoPathForUuid appends uuid.jpg', () => {
    expect(photoPathForUuid('abc-123')).toBe('file:///doc/photos/abc-123.jpg');
  });

  it('uuidFromPhotoPath extracts uuid from a photo path', () => {
    expect(uuidFromPhotoPath('file:///doc/photos/abc-123.jpg')).toBe('abc-123');
  });

  it('uuidFromPhotoPath returns null for non-photo paths', () => {
    expect(uuidFromPhotoPath(null)).toBeNull();
    expect(uuidFromPhotoPath('https://example.com/x.jpg')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/lib/sync/photo-paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/sync/photo-paths.ts`**

```ts
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export function photoDirUri(): string {
  return `${Paths.document.uri}photos/`;
}

export function photoPathForUuid(uuid: string): string {
  return `${photoDirUri()}${uuid}.jpg`;
}

export function uuidFromPhotoPath(path: string | null): string | null {
  if (!path) return null;
  const dir = photoDirUri();
  if (!path.startsWith(dir)) return null;
  const name = path.slice(dir.length);
  if (!name.endsWith('.jpg')) return null;
  return name.slice(0, -'.jpg'.length);
}

function ensurePhotoDir(): void {
  const dir = new Directory(photoDirUri());
  if (!dir.exists) dir.create();
}

export async function wipeAllPhotos(): Promise<void> {
  const dir = new Directory(photoDirUri());
  if (dir.exists) dir.delete();
}

export async function migratePhotosToUuidNames(db: SQLiteDatabase): Promise<void> {
  ensurePhotoDir();
  const rows = db.getAllSync<{ id: number; photo_path: string | null }>(
    'SELECT id, photo_path FROM transactions WHERE photo_path IS NOT NULL'
  );
  for (const r of rows) {
    if (!r.photo_path || r.photo_path.startsWith('http')) continue;
    if (uuidFromPhotoPath(r.photo_path)) continue;
    const uuid = Crypto.randomUUID();
    const dest = photoPathForUuid(uuid);
    try {
      new File(r.photo_path).move(new File(dest));
      db.runSync('UPDATE transactions SET photo_path = ? WHERE id = ?', dest, r.id);
    } catch {
      // best-effort; skip broken/missing files
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/sync/photo-paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/photo-paths.ts src/lib/sync/photo-paths.test.ts
git commit -m "Add photo storage convention (photos/{uuid}.jpg)

Cloud sync addresses photos by UUID, so local files live at
document/photos/{uuid}.jpg. Provides path helpers, a wipe helper for the
'sign out and wipe' flow, and a one-shot migration that renames existing
photos into the UUID convention."
```

---

## Task 3: Wire uuid + updated_at into data layer

**Files:**
- Modify: `src/lib/transactions.ts`
- Modify: `src/lib/user-categories.ts`
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/transactions.test.ts` (extend `freshDb()`)
- Modify: `src/lib/user-categories.test.ts` (extend `freshDb()` if present)
- Modify: `src/lib/settings.test.ts`

**Interfaces:**
- Consumes: `runMigrations` from Task 1
- Produces:
  - `Txn` gains `uuid: string; updatedAt: number`
  - `insertTransaction` sets both on new rows
  - `updateTransaction` bumps `updated_at` to `Date.now()`
  - `UserCategory` gains `updatedAt: number`; `insertUserCategory` sets it
  - New: `getSettingsUpdatedAt(db): number` — reads `settings.__updated_at`
  - `updateSetting` also writes `__updated_at = Date.now()` in the same call

- [ ] **Step 1: Write failing test for transactions.uuid/updatedAt**

Extend `src/lib/transactions.test.ts` `freshDb()` to include `uuid TEXT` and `updated_at INTEGER` in the CREATE TABLE. Add a test:

```ts
describe('insertTransaction', () => {
  it('assigns uuid and updated_at', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', amount: 5, isIncome: false,
    }, db);
    const row = db.getFirstSync<{ uuid: string; updated_at: number }>(
      'SELECT uuid, updated_at FROM transactions WHERE id = ?', id
    );
    expect(row?.uuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row?.updated_at).toBe(1000);
  });
});

describe('updateTransaction', () => {
  it('bumps updated_at on edit', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', amount: 5, isIncome: false,
    }, db);
    jest.spyOn(Date, 'now').mockReturnValue(2000);
    updateTransaction(id, {
      date: '2026-07-01', time: '10:00',
      category: 'food', name: 'x', amount: 6, isIncome: false,
    }, db);
    const row = db.getFirstSync<{ updated_at: number }>(
      'SELECT updated_at FROM transactions WHERE id = ?', id
    );
    expect(row?.updated_at).toBe(2000);
    (Date.now as jest.Mock).mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/lib/transactions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/transactions.ts`**

- Add `import * as Crypto from 'expo-crypto';` at the top.
- Extend `Txn` and `Row`:

```ts
export interface Txn {
  id: number;
  uuid: string;
  updatedAt: number;
  // ...existing fields
}

interface Row {
  id: number;
  uuid: string;
  updated_at: number;
  // ...existing fields
}
```

- Update `toTxn` to include `uuid: r.uuid, updatedAt: r.updated_at`.
- Update `insertTransaction`:

```ts
export function insertTransaction(input: NewTxn, database: SQLiteDatabase = defaultDb): number {
  const now = input.createdAt ?? Date.now();
  const result = database.runSync(
    `INSERT INTO transactions (uuid, date, time, created_at, updated_at, category, name, note, amount, is_income, photo_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Crypto.randomUUID(),
    input.date, input.time, now, now,
    input.category, input.name, input.note ?? null,
    input.amount, input.isIncome ? 1 : 0, input.photoPath ?? null
  );
  return result.lastInsertRowId;
}
```

- Update `updateTransaction`:

```ts
export function updateTransaction(id: number, input: NewTxn, database: SQLiteDatabase = defaultDb): void {
  database.runSync(
    `UPDATE transactions
     SET date = ?, time = ?, updated_at = ?, category = ?, name = ?, note = ?, amount = ?, is_income = ?, photo_path = ?
     WHERE id = ?`,
    input.date, input.time, Date.now(),
    input.category, input.name, input.note ?? null,
    input.amount, input.isIncome ? 1 : 0, input.photoPath ?? null,
    id
  );
}
```

- [ ] **Step 4: Run transactions test to verify pass**

Run: `npm test -- src/lib/transactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Update user-categories**

Extend the test's `freshDb()` to add `updated_at INTEGER`, add a test:

```ts
it('sets updated_at on insert', () => {
  const db = freshDb();
  jest.spyOn(Date, 'now').mockReturnValue(5000);
  const cat = insertUserCategory('Cà phê', db);
  const row = db.getFirstSync<{ updated_at: number }>(
    'SELECT updated_at FROM categories WHERE id = ?', cat.id
  );
  expect(row?.updated_at).toBe(5000);
  (Date.now as jest.Mock).mockRestore();
});
```

Update `src/lib/user-categories.ts`:

- Add `updatedAt: number` to `UserCategory` and `Row`.
- Update `listUserCategories` SELECT to include `updated_at` and map it.
- Update `insertUserCategory`:

```ts
database.runSync(
  'INSERT INTO categories (id, label, created_at, updated_at) VALUES (?, ?, ?, ?)',
  id, trimmed, createdAt, createdAt,
);
return { id, label: trimmed, createdAt, updatedAt: createdAt };
```

- [ ] **Step 6: Update settings — add __updated_at**

Add to `src/lib/settings.ts`:

```ts
const UPDATED_AT_KEY = '__updated_at';

export function getSettingsUpdatedAt(database: SQLiteDatabase = defaultDb): number {
  const row = database.getFirstSync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', UPDATED_AT_KEY,
  );
  return row ? Number(row.value) || 0 : 0;
}
```

Modify `updateSetting` so every write also bumps the timestamp:

```ts
export function updateSetting<K extends keyof Settings>(
  key: K, value: Settings[K], database: SQLiteDatabase = defaultDb,
): void {
  database.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, encode(key, value),
  );
  database.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    UPDATED_AT_KEY, String(Date.now()),
  );
}
```

Also modify `loadSettings` to skip the `__updated_at` row when decoding (it starts with `__`, and `decode` already ignores unknown keys — verify no-op).

Add tests to `src/lib/settings.test.ts`:

```ts
it('bumps __updated_at on updateSetting', () => {
  const db = freshDb();
  jest.spyOn(Date, 'now').mockReturnValue(7000);
  updateSetting('monthlyBudget', 500, db);
  expect(getSettingsUpdatedAt(db)).toBe(7000);
  (Date.now as jest.Mock).mockRestore();
});
```

- [ ] **Step 7: Run all data-layer tests**

Run: `npm test -- src/lib/transactions.test.ts src/lib/user-categories.test.ts src/lib/settings.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/transactions.ts src/lib/user-categories.ts src/lib/settings.ts src/lib/transactions.test.ts src/lib/user-categories.test.ts src/lib/settings.test.ts
git commit -m "Wire uuid + updated_at into data layer

Every transaction, category, and settings write now stamps a stable
UUID (transactions) and an updated_at timestamp. These are what the
snapshot writer serializes and what the first-login 'combine' merge
uses to resolve UUID collisions."
```

---

## Task 4: Sync module scaffolding — types + provider interface

**Files:**
- Create: `src/lib/sync/types.ts`
- Create: `src/lib/sync/provider.ts`

**Interfaces:**
- Consumes: nothing
- Produces (all subsequent tasks depend on these):
  - `Snapshot`, `SnapshotTxn`, `SnapshotCategory`, `SnapshotSettings`
  - `SessionInfo` = `{ deviceId: string; deviceName: string; loggedInAt: number }`
  - `UserInfo` = `{ googleId: string; email: string; displayName: string | null; avatarUrl: string | null }`
  - `PhotoSyncPolicy` = `'wifi' | 'always' | 'off'`
  - `MergeStrategy` = `'local' | 'cloud' | 'combine'`
  - `CloudSyncProvider` interface (exactly as in spec)

- [ ] **Step 1: Create `src/lib/sync/types.ts`**

```ts
export type PhotoSyncPolicy = 'wifi' | 'always' | 'off';
export type MergeStrategy = 'local' | 'cloud' | 'combine';

export interface UserInfo {
  googleId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface SessionInfo {
  deviceId: string;
  deviceName: string;
  loggedInAt: number;
}

export interface SnapshotTxn {
  uuid: string;
  date: string;
  time: string;
  createdAt: number;
  updatedAt: number;
  category: string;
  name: string;
  note: string | null;
  amount: number;
  isIncome: 0 | 1;
  photoUuid: string | null;
}

export interface SnapshotCategory {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export interface SnapshotSettings {
  updatedAt: number;
  values: Record<string, string>;
}

export interface Snapshot {
  version: 1;
  generatedAt: number;
  deviceId: string;
  transactions: SnapshotTxn[];
  categories: SnapshotCategory[];
  settings: SnapshotSettings;
  photoManifest: string[];
}
```

- [ ] **Step 2: Create `src/lib/sync/provider.ts`**

```ts
import type { Snapshot, SessionInfo, UserInfo } from './types';

export interface CloudSyncProvider {
  signIn(): Promise<UserInfo>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<UserInfo | null>;

  readSession(): Promise<SessionInfo | null>;
  writeSession(session: SessionInfo): Promise<void>;

  downloadSnapshot(): Promise<Snapshot | null>;
  uploadSnapshot(snap: Snapshot): Promise<void>;

  uploadPhoto(uuid: string, localPath: string): Promise<void>;
  downloadPhoto(uuid: string): Promise<string>;
  listPhotos(): Promise<string[]>;
  deletePhoto(uuid: string): Promise<void>;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/types.ts src/lib/sync/provider.ts
git commit -m "Add sync types and CloudSyncProvider interface

Establishes the plain-JSON DTOs that flow between local SQLite, the
snapshot builder/applier, and any cloud backend. The provider interface
is the only contract sync-engine and UI code depend on — Google Drive
and any future REST backend both satisfy it."
```

---

## Task 5: Snapshot build/apply

**Files:**
- Create: `src/lib/sync/snapshot.ts`
- Create: `src/lib/sync/snapshot.test.ts`

**Interfaces:**
- Consumes: `Snapshot` (Task 4), `getSettingsUpdatedAt` (Task 3), `uuidFromPhotoPath` (Task 2)
- Produces:
  - `buildSnapshot(db: SQLiteDatabase, deviceId: string): Snapshot`
  - `applySnapshot(db: SQLiteDatabase, snap: Snapshot): void`
  - `isEmptySnapshot(snap: Snapshot | null): boolean`

- [ ] **Step 1: Write failing tests**

Create `src/lib/sync/snapshot.test.ts`:

```ts
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixed-uuid' }));
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
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/lib/sync/snapshot.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/sync/snapshot.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/sync/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/snapshot.ts src/lib/sync/snapshot.test.ts
git commit -m "Add snapshot build/apply

buildSnapshot serializes the whole DB into a Snapshot JSON;
applySnapshot replaces the DB wholesale (inside a SQLite transaction so
either the whole restore succeeds or nothing changes). isEmptySnapshot
is used by the first-login flow to skip the choice dialog when one side
has no data."
```

---

## Task 6: Merge logic

**Files:**
- Create: `src/lib/sync/merge.ts`
- Create: `src/lib/sync/merge.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `MergeStrategy` (Task 4)
- Produces:
  - `mergeSnapshots(local: Snapshot, remote: Snapshot, strategy: MergeStrategy): Snapshot`
  - `SourceMap` = `Record<string, 'local' | 'cloud' | 'merged'>` — uuid → origin, for preview badges
  - `computeSourceMap(local: Snapshot, remote: Snapshot, merged: Snapshot, strategy: MergeStrategy): SourceMap`

- [ ] **Step 1: Write failing tests**

Create `src/lib/sync/merge.test.ts`:

```ts
import { mergeSnapshots, computeSourceMap } from './merge';
import type { Snapshot, SnapshotTxn } from './types';

function txn(uuid: string, updatedAt: number, name = uuid): SnapshotTxn {
  return {
    uuid, date: '2026-07-01', time: '10:00',
    createdAt: updatedAt, updatedAt, category: 'food',
    name, note: null, amount: 1, isIncome: 0, photoUuid: null,
  };
}

function snap(deviceId: string, ts: number, txns: SnapshotTxn[] = []): Snapshot {
  return {
    version: 1, generatedAt: ts, deviceId,
    transactions: txns, categories: [],
    settings: { updatedAt: ts, values: {} }, photoManifest: [],
  };
}

describe('mergeSnapshots', () => {
  it('local strategy returns local verbatim', () => {
    const l = snap('L', 100, [txn('a', 100)]);
    const r = snap('R', 200, [txn('b', 200)]);
    const m = mergeSnapshots(l, r, 'local');
    expect(m.transactions.map(t => t.uuid)).toEqual(['a']);
  });

  it('cloud strategy returns remote verbatim', () => {
    const l = snap('L', 100, [txn('a', 100)]);
    const r = snap('R', 200, [txn('b', 200)]);
    const m = mergeSnapshots(l, r, 'cloud');
    expect(m.transactions.map(t => t.uuid)).toEqual(['b']);
  });

  it('combine keeps disjoint uuids from both sides', () => {
    const l = snap('L', 100, [txn('a', 100)]);
    const r = snap('R', 200, [txn('b', 200)]);
    const m = mergeSnapshots(l, r, 'combine');
    expect(new Set(m.transactions.map(t => t.uuid))).toEqual(new Set(['a', 'b']));
  });

  it('combine: local wins when local updatedAt is newer', () => {
    const l = snap('L', 100, [txn('x', 300, 'local-name')]);
    const r = snap('R', 200, [txn('x', 200, 'remote-name')]);
    const m = mergeSnapshots(l, r, 'combine');
    expect(m.transactions[0].name).toBe('local-name');
  });

  it('combine: remote wins when remote updatedAt is newer', () => {
    const l = snap('L', 100, [txn('x', 200, 'local-name')]);
    const r = snap('R', 200, [txn('x', 300, 'remote-name')]);
    const m = mergeSnapshots(l, r, 'combine');
    expect(m.transactions[0].name).toBe('remote-name');
  });

  it('combine: on updatedAt tie, deviceId alphabetical wins', () => {
    const l = snap('B', 100, [txn('x', 500, 'from-B')]);
    const r = snap('A', 200, [txn('x', 500, 'from-A')]);
    const m = mergeSnapshots(l, r, 'combine');
    expect(m.transactions[0].name).toBe('from-A');
  });

  it('combine: settings uses whole-block last-write-wins', () => {
    const l: Snapshot = { ...snap('L', 100), settings: { updatedAt: 100, values: { a: '1' } } };
    const r: Snapshot = { ...snap('R', 200), settings: { updatedAt: 200, values: { b: '2' } } };
    const m = mergeSnapshots(l, r, 'combine');
    expect(m.settings.values).toEqual({ b: '2' });
  });
});

describe('computeSourceMap', () => {
  it('marks local-only as local, remote-only as cloud, both-present as merged', () => {
    const l = snap('L', 100, [txn('a', 100), txn('c', 500)]);
    const r = snap('R', 200, [txn('b', 200), txn('c', 300)]);
    const m = mergeSnapshots(l, r, 'combine');
    const map = computeSourceMap(l, r, m, 'combine');
    expect(map).toEqual({ a: 'local', b: 'cloud', c: 'merged' });
  });

  it('local strategy marks all as local', () => {
    const l = snap('L', 100, [txn('a', 100)]);
    const r = snap('R', 200, [txn('b', 200)]);
    const m = mergeSnapshots(l, r, 'local');
    expect(computeSourceMap(l, r, m, 'local')).toEqual({ a: 'local' });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/lib/sync/merge.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/sync/merge.ts`**

```ts
import type {
  Snapshot, SnapshotTxn, SnapshotCategory, SnapshotSettings, MergeStrategy,
} from './types';

export type SourceMap = Record<string, 'local' | 'cloud' | 'merged'>;

function pickNewer<T extends { updatedAt: number }>(
  a: T, b: T, aDevice: string, bDevice: string,
): T {
  if (a.updatedAt > b.updatedAt) return a;
  if (b.updatedAt > a.updatedAt) return b;
  return aDevice < bDevice ? a : b;
}

function mergeById<T extends { updatedAt: number }>(
  local: T[], remote: T[], key: (t: T) => string,
  localDevice: string, remoteDevice: string,
): T[] {
  const byKey = new Map<string, T>();
  for (const t of local) byKey.set(key(t), t);
  for (const t of remote) {
    const existing = byKey.get(key(t));
    byKey.set(key(t), existing ? pickNewer(existing, t, localDevice, remoteDevice) : t);
  }
  return [...byKey.values()];
}

function mergeSettings(
  local: SnapshotSettings, remote: SnapshotSettings,
): SnapshotSettings {
  return local.updatedAt >= remote.updatedAt ? local : remote;
}

export function mergeSnapshots(
  local: Snapshot, remote: Snapshot, strategy: MergeStrategy,
): Snapshot {
  if (strategy === 'local') return local;
  if (strategy === 'cloud') return remote;

  return {
    version: 1,
    generatedAt: Date.now(),
    deviceId: local.deviceId,
    transactions: mergeById<SnapshotTxn>(
      local.transactions, remote.transactions,
      (t) => t.uuid, local.deviceId, remote.deviceId,
    ),
    categories: mergeById<SnapshotCategory>(
      local.categories, remote.categories,
      (c) => c.id, local.deviceId, remote.deviceId,
    ),
    settings: mergeSettings(local.settings, remote.settings),
    photoManifest: [...new Set([...local.photoManifest, ...remote.photoManifest])],
  };
}

export function computeSourceMap(
  local: Snapshot, remote: Snapshot, merged: Snapshot, strategy: MergeStrategy,
): SourceMap {
  const map: SourceMap = {};
  const localIds = new Set(local.transactions.map((t) => t.uuid));
  const remoteIds = new Set(remote.transactions.map((t) => t.uuid));
  for (const t of merged.transactions) {
    if (strategy === 'local') map[t.uuid] = 'local';
    else if (strategy === 'cloud') map[t.uuid] = 'cloud';
    else if (localIds.has(t.uuid) && remoteIds.has(t.uuid)) map[t.uuid] = 'merged';
    else if (localIds.has(t.uuid)) map[t.uuid] = 'local';
    else map[t.uuid] = 'cloud';
  }
  return map;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/sync/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/merge.ts src/lib/sync/merge.test.ts
git commit -m "Add snapshot merge logic

Pure function used only by the first-login dialog. 'local' and 'cloud'
return one side verbatim; 'combine' unions by UUID with newer updatedAt
winning and ties broken by deviceId alphabetical. Also exports
computeSourceMap so the preview screen can badge each row with its
origin (local / cloud / merged)."
```

---

## Task 7: Device ID + sync_meta helpers + session logic

**Files:**
- Create: `src/lib/sync/device-id.ts`
- Create: `src/lib/sync/device-id.test.ts`
- Create: `src/lib/sync/sync-meta.ts`
- Create: `src/lib/sync/sync-meta.test.ts`
- Create: `src/lib/sync/session.ts`
- Create: `src/lib/sync/session.test.ts`

**Interfaces:**
- Consumes: nothing external
- Produces:
  - `getOrCreateDeviceId(): Promise<string>`
  - `getSyncMeta(db, key): string | null`
  - `setSyncMeta(db, key, value): void`
  - `getDirty(db): boolean` / `setDirty(db, dirty: boolean): void`
  - `getLastSyncedAt(db): number | null` / `setLastSyncedAt(db, ts: number): void`
  - `resetSyncMeta(db): void`
  - `createSession(deviceId: string): SessionInfo`
  - `isKicked(remote: SessionInfo | null, localDeviceId: string): boolean`

- [ ] **Step 1: Write failing tests for sync-meta**

`src/lib/sync/sync-meta.test.ts`:

```ts
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
```

- [ ] **Step 2: Implement `src/lib/sync/sync-meta.ts`**

```ts
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
```

- [ ] **Step 3: Run sync-meta tests**

Run: `npm test -- src/lib/sync/sync-meta.test.ts`
Expected: PASS.

- [ ] **Step 4: Write failing tests for device-id**

`src/lib/sync/device-id.test.ts`:

```ts
const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { store[k] = v; }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'generated-uuid') }));

import { getOrCreateDeviceId } from './device-id';

describe('getOrCreateDeviceId', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

  it('generates a UUID on first call and persists it', async () => {
    const id = await getOrCreateDeviceId();
    expect(id).toBe('generated-uuid');
    expect(store['spendlens.device_id']).toBe('generated-uuid');
  });

  it('returns the persisted UUID on subsequent calls', async () => {
    store['spendlens.device_id'] = 'existing-uuid';
    const id = await getOrCreateDeviceId();
    expect(id).toBe('existing-uuid');
  });
});
```

- [ ] **Step 5: Implement `src/lib/sync/device-id.ts`**

```ts
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY = 'spendlens.device_id';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;
  const fresh = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY, fresh);
  return fresh;
}
```

- [ ] **Step 6: Run device-id tests**

Run: `npm test -- src/lib/sync/device-id.test.ts`
Expected: PASS.

- [ ] **Step 7: Write failing tests for session**

`src/lib/sync/session.test.ts`:

```ts
jest.mock('expo-constants', () => ({ __esModule: true, default: { deviceName: 'Test Device' } }));

import { createSession, isKicked } from './session';

describe('createSession', () => {
  it('produces SessionInfo with deviceId + deviceName + loggedInAt', () => {
    const before = Date.now();
    const s = createSession('device-1');
    expect(s.deviceId).toBe('device-1');
    expect(s.deviceName).toBe('Test Device');
    expect(s.loggedInAt).toBeGreaterThanOrEqual(before);
  });
});

describe('isKicked', () => {
  it('returns false when remote is null (never signed in yet)', () => {
    expect(isKicked(null, 'device-1')).toBe(false);
  });
  it('returns false when deviceIds match', () => {
    expect(isKicked({ deviceId: 'device-1', deviceName: 'x', loggedInAt: 0 }, 'device-1')).toBe(false);
  });
  it('returns true when deviceIds differ', () => {
    expect(isKicked({ deviceId: 'other', deviceName: 'x', loggedInAt: 0 }, 'device-1')).toBe(true);
  });
});
```

- [ ] **Step 8: Implement `src/lib/sync/session.ts`**

```ts
import Constants from 'expo-constants';
import type { SessionInfo } from './types';

export function createSession(deviceId: string): SessionInfo {
  return {
    deviceId,
    deviceName: Constants.deviceName ?? 'Unknown device',
    loggedInAt: Date.now(),
  };
}

export function isKicked(remote: SessionInfo | null, localDeviceId: string): boolean {
  if (!remote) return false;
  return remote.deviceId !== localDeviceId;
}
```

- [ ] **Step 9: Run session tests**

Run: `npm test -- src/lib/sync/session.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/sync/device-id.ts src/lib/sync/device-id.test.ts src/lib/sync/sync-meta.ts src/lib/sync/sync-meta.test.ts src/lib/sync/session.ts src/lib/sync/session.test.ts
git commit -m "Add device-id, sync_meta helpers, session/kick logic

Device ID is generated once per install and persisted in SecureStore.
sync_meta stores the dirty flag and last-synced timestamp locally
(never uploaded). Session is a plain DTO written into cloud
session.json; isKicked compares remote deviceId against local."
```

---

## Task 8: Mock provider

**Files:**
- Create: `src/lib/sync/providers/mock-provider.ts`
- Create: `src/lib/sync/providers/mock-provider.test.ts`

**Interfaces:**
- Consumes: `CloudSyncProvider` (Task 4)
- Produces:
  - `class MockCloudSyncProvider implements CloudSyncProvider`
  - Extra test-only fields: `signedInUser`, `session`, `snapshot`, `photos: Map<string, string>`, and knobs `failNextUpload: boolean`, `simulateOffline: boolean`

- [ ] **Step 1: Write failing test**

`src/lib/sync/providers/mock-provider.test.ts`:

```ts
import { MockCloudSyncProvider } from './mock-provider';
import type { Snapshot } from '../types';

const emptySnap: Snapshot = {
  version: 1, generatedAt: 0, deviceId: 'x',
  transactions: [], categories: [],
  settings: { updatedAt: 0, values: {} }, photoManifest: [],
};

describe('MockCloudSyncProvider', () => {
  it('starts signed out', async () => {
    const p = new MockCloudSyncProvider();
    expect(await p.getCurrentUser()).toBeNull();
  });
  it('signIn returns a user and getCurrentUser reflects it', async () => {
    const p = new MockCloudSyncProvider();
    const u = await p.signIn();
    expect(u.email).toBeTruthy();
    expect(await p.getCurrentUser()).toEqual(u);
  });
  it('uploadSnapshot / downloadSnapshot roundtrips', async () => {
    const p = new MockCloudSyncProvider();
    await p.uploadSnapshot(emptySnap);
    expect(await p.downloadSnapshot()).toEqual(emptySnap);
  });
  it('downloadSnapshot returns null when nothing was uploaded', async () => {
    expect(await new MockCloudSyncProvider().downloadSnapshot()).toBeNull();
  });
  it('failNextUpload rejects the next upload only', async () => {
    const p = new MockCloudSyncProvider();
    p.failNextUpload = true;
    await expect(p.uploadSnapshot(emptySnap)).rejects.toThrow();
    await expect(p.uploadSnapshot(emptySnap)).resolves.toBeUndefined();
  });
  it('simulateOffline rejects every network call', async () => {
    const p = new MockCloudSyncProvider();
    p.simulateOffline = true;
    await expect(p.downloadSnapshot()).rejects.toThrow(/offline/i);
  });
  it('uploadPhoto / listPhotos / deletePhoto', async () => {
    const p = new MockCloudSyncProvider();
    await p.uploadPhoto('u1', '/tmp/a.jpg');
    await p.uploadPhoto('u2', '/tmp/b.jpg');
    expect((await p.listPhotos()).sort()).toEqual(['u1', 'u2']);
    await p.deletePhoto('u1');
    expect(await p.listPhotos()).toEqual(['u2']);
  });
});
```

- [ ] **Step 2: Implement `src/lib/sync/providers/mock-provider.ts`**

```ts
import type { CloudSyncProvider } from '../provider';
import type { Snapshot, SessionInfo, UserInfo } from '../types';

export class MockCloudSyncProvider implements CloudSyncProvider {
  signedInUser: UserInfo | null = null;
  session: SessionInfo | null = null;
  snapshot: Snapshot | null = null;
  photos = new Map<string, string>();
  failNextUpload = false;
  simulateOffline = false;

  private guardOnline(): void {
    if (this.simulateOffline) throw new Error('offline');
  }

  async signIn(): Promise<UserInfo> {
    this.guardOnline();
    this.signedInUser = {
      googleId: 'g-1', email: 'test@example.com',
      displayName: 'Test User', avatarUrl: null,
    };
    return this.signedInUser;
  }

  async signOut(): Promise<void> {
    this.signedInUser = null;
  }

  async getCurrentUser(): Promise<UserInfo | null> {
    return this.signedInUser;
  }

  async readSession(): Promise<SessionInfo | null> {
    this.guardOnline();
    return this.session;
  }

  async writeSession(session: SessionInfo): Promise<void> {
    this.guardOnline();
    this.session = session;
  }

  async downloadSnapshot(): Promise<Snapshot | null> {
    this.guardOnline();
    return this.snapshot;
  }

  async uploadSnapshot(snap: Snapshot): Promise<void> {
    this.guardOnline();
    if (this.failNextUpload) {
      this.failNextUpload = false;
      throw new Error('upload failed');
    }
    this.snapshot = snap;
  }

  async uploadPhoto(uuid: string, localPath: string): Promise<void> {
    this.guardOnline();
    this.photos.set(uuid, localPath);
  }

  async downloadPhoto(uuid: string): Promise<string> {
    this.guardOnline();
    const path = this.photos.get(uuid);
    if (!path) throw new Error(`no photo ${uuid}`);
    return path;
  }

  async listPhotos(): Promise<string[]> {
    this.guardOnline();
    return [...this.photos.keys()];
  }

  async deletePhoto(uuid: string): Promise<void> {
    this.guardOnline();
    this.photos.delete(uuid);
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- src/lib/sync/providers/mock-provider.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/providers/mock-provider.ts src/lib/sync/providers/mock-provider.test.ts
git commit -m "Add in-memory MockCloudSyncProvider for tests

Implements CloudSyncProvider with in-memory state and knobs
(failNextUpload, simulateOffline) so sync-engine and context tests can
simulate real cloud failures deterministically without touching the
network."
```

---

## Task 9: Google Drive provider + factory

**Files:**
- Modify: `package.json` (add `expo-network`, `@react-native-google-signin/google-signin`)
- Modify: `app.json` (Google Sign-In plugin config)
- Create: `src/lib/sync/providers/drive-provider.ts`
- Create: `src/lib/sync/providers/drive-provider.test.ts`
- Create: `src/lib/sync/providers/index.ts`

**Interfaces:**
- Consumes: `CloudSyncProvider`, `Snapshot`, `SessionInfo`, `UserInfo`
- Produces:
  - `class GoogleDriveProvider implements CloudSyncProvider`
  - `getCloudSyncProvider(): CloudSyncProvider` — singleton factory
  - `configureCloudSyncProvider(p: CloudSyncProvider): void` — test seam

- [ ] **Step 1: Add dependencies**

```bash
npx expo install expo-network @react-native-google-signin/google-signin
```

Add to `app.json` `expo.plugins`:

```json
[
  "@react-native-google-signin/google-signin"
]
```

The dev-client must be rebuilt after this (`npx expo run:ios` / `run:android`). Note this in the commit message.

- [ ] **Step 2: Write failing test — provider factory**

`src/lib/sync/providers/drive-provider.test.ts`:

```ts
jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn(),
  Directory: jest.fn(),
}));

import { configureCloudSyncProvider, getCloudSyncProvider } from './index';
import { MockCloudSyncProvider } from './mock-provider';

describe('provider factory', () => {
  it('returns a provider configured via configureCloudSyncProvider', () => {
    const mock = new MockCloudSyncProvider();
    configureCloudSyncProvider(mock);
    expect(getCloudSyncProvider()).toBe(mock);
  });
});
```

- [ ] **Step 3: Implement `src/lib/sync/providers/index.ts`**

```ts
import type { CloudSyncProvider } from '../provider';
import { GoogleDriveProvider } from './drive-provider';

let instance: CloudSyncProvider | null = null;

export function getCloudSyncProvider(): CloudSyncProvider {
  if (!instance) instance = new GoogleDriveProvider();
  return instance;
}

export function configureCloudSyncProvider(p: CloudSyncProvider): void {
  instance = p;
}
```

- [ ] **Step 4: Implement `src/lib/sync/providers/drive-provider.ts`**

Full implementation — uses `google-signin` for auth and `fetch` against the Drive REST API for file ops (appDataFolder space).

```ts
import { File } from 'expo-file-system';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import type { CloudSyncProvider } from '../provider';
import type { Snapshot, SessionInfo, UserInfo } from '../types';
import { photoPathForUuid } from '../photo-paths';

const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const SNAPSHOT_NAME = 'spendlens-snapshot.json';
const SESSION_NAME = 'session.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({ scopes: SCOPES, offlineAccess: false });
  configured = true;
}

async function authHeader(): Promise<Record<string, string>> {
  ensureConfigured();
  const { accessToken } = await GoogleSignin.getTokens();
  return { Authorization: `Bearer ${accessToken}` };
}

async function findFileId(name: string): Promise<string | null> {
  const headers = await authHeader();
  const q = encodeURIComponent(`name='${name}' and 'appDataFolder' in parents and trashed=false`);
  const res = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`,
    { headers },
  );
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const body = await res.json() as { files: { id: string; name: string }[] };
  return body.files[0]?.id ?? null;
}

async function downloadJson<T>(fileId: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function uploadJson(name: string, existingId: string | null, data: unknown): Promise<void> {
  const headers = await authHeader();
  const boundary = '----spendlens' + Date.now();
  const metadata: Record<string, unknown> = { name };
  if (!existingId) metadata.parents = ['appDataFolder'];

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    JSON.stringify(data) + `\r\n` +
    `--${boundary}--`;

  const url = existingId
    ? `${DRIVE_UPLOAD}/files/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD}/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
}

export class GoogleDriveProvider implements CloudSyncProvider {
  async signIn(): Promise<UserInfo> {
    ensureConfigured();
    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') throw new Error('sign-in cancelled');
    const u = res.data.user;
    return {
      googleId: u.id, email: u.email,
      displayName: u.name ?? null, avatarUrl: u.photo ?? null,
    };
  }

  async signOut(): Promise<void> {
    ensureConfigured();
    await GoogleSignin.signOut();
  }

  async getCurrentUser(): Promise<UserInfo | null> {
    ensureConfigured();
    const cur = GoogleSignin.getCurrentUser();
    if (!cur) return null;
    return {
      googleId: cur.user.id, email: cur.user.email,
      displayName: cur.user.name ?? null, avatarUrl: cur.user.photo ?? null,
    };
  }

  async readSession(): Promise<SessionInfo | null> {
    const id = await findFileId(SESSION_NAME);
    if (!id) return null;
    return downloadJson<SessionInfo>(id);
  }

  async writeSession(session: SessionInfo): Promise<void> {
    const id = await findFileId(SESSION_NAME);
    await uploadJson(SESSION_NAME, id, session);
  }

  async downloadSnapshot(): Promise<Snapshot | null> {
    const id = await findFileId(SNAPSHOT_NAME);
    if (!id) return null;
    return downloadJson<Snapshot>(id);
  }

  async uploadSnapshot(snap: Snapshot): Promise<void> {
    const id = await findFileId(SNAPSHOT_NAME);
    await uploadJson(SNAPSHOT_NAME, id, snap);
  }

  async listPhotos(): Promise<string[]> {
    const headers = await authHeader();
    const q = encodeURIComponent(`'appDataFolder' in parents and mimeType='image/jpeg' and trashed=false`);
    const res = await fetch(
      `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(name)`,
      { headers },
    );
    if (!res.ok) throw new Error(`Drive list photos failed: ${res.status}`);
    const body = await res.json() as { files: { name: string }[] };
    return body.files
      .map((f) => f.name)
      .filter((n) => n.endsWith('.jpg'))
      .map((n) => n.slice(0, -'.jpg'.length));
  }

  async uploadPhoto(uuid: string, localPath: string): Promise<void> {
    const headers = await authHeader();
    const name = `${uuid}.jpg`;
    const existing = await findFileId(name);
    const boundary = '----spendlens-photo-' + Date.now();
    const metadata: Record<string, unknown> = { name };
    if (!existing) metadata.parents = ['appDataFolder'];

    const bytes = new File(localPath).bytes();
    const b64 = bytes ? btoa(String.fromCharCode(...new Uint8Array(bytes))) : '';

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      b64 + `\r\n` +
      `--${boundary}--`;

    const url = existing
      ? `${DRIVE_UPLOAD}/files/${existing}?uploadType=multipart`
      : `${DRIVE_UPLOAD}/files?uploadType=multipart`;

    const res = await fetch(url, {
      method: existing ? 'PATCH' : 'POST',
      headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Drive upload photo failed: ${res.status}`);
  }

  async downloadPhoto(uuid: string): Promise<string> {
    const headers = await authHeader();
    const fileId = await findFileId(`${uuid}.jpg`);
    if (!fileId) throw new Error(`photo ${uuid} not found`);
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
    if (!res.ok) throw new Error(`Drive download photo failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const dest = photoPathForUuid(uuid);
    new File(dest).write(new Uint8Array(buf));
    return dest;
  }

  async deletePhoto(uuid: string): Promise<void> {
    const headers = await authHeader();
    const fileId = await findFileId(`${uuid}.jpg`);
    if (!fileId) return;
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed: ${res.status}`);
  }
}
```

- [ ] **Step 5: Run factory test**

Run: `npm test -- src/lib/sync/providers/drive-provider.test.ts`
Expected: PASS.

(The Drive provider itself has no unit tests — it is verified in manual QA against a real Google account.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json src/lib/sync/providers/drive-provider.ts src/lib/sync/providers/drive-provider.test.ts src/lib/sync/providers/index.ts
git commit -m "Add Google Drive provider + factory

Wraps @react-native-google-signin and the Drive appDataFolder REST API
behind the CloudSyncProvider interface. The factory in providers/index
is the ONLY place that picks a concrete provider — swapping in a REST
backend later means writing one new file and updating this factory.

Adds expo-network + google-signin native deps; dev-client must be
rebuilt (expo run:ios / run:android) before this task's code will run
on-device."
```

---

## Task 10: Network policy for photo sync

**Files:**
- Create: `src/lib/sync/network-policy.ts`
- Create: `src/lib/sync/network-policy.test.ts`

**Interfaces:**
- Consumes: `PhotoSyncPolicy` (Task 4)
- Produces:
  - `shouldSyncPhotos(policy: PhotoSyncPolicy): Promise<boolean>`

- [ ] **Step 1: Write failing test**

`src/lib/sync/network-policy.test.ts`:

```ts
const mockState: { type: string; isConnected: boolean } = { type: 'WIFI', isConnected: true };
jest.mock('expo-network', () => ({
  __esModule: true,
  getNetworkStateAsync: jest.fn(async () => mockState),
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', NONE: 'NONE' },
}));

import { shouldSyncPhotos } from './network-policy';

describe('shouldSyncPhotos', () => {
  beforeEach(() => { mockState.type = 'WIFI'; mockState.isConnected = true; });

  it('off never syncs', async () => {
    expect(await shouldSyncPhotos('off')).toBe(false);
  });
  it('always syncs when connected', async () => {
    mockState.type = 'CELLULAR';
    expect(await shouldSyncPhotos('always')).toBe(true);
  });
  it('always does not sync when offline', async () => {
    mockState.isConnected = false;
    expect(await shouldSyncPhotos('always')).toBe(false);
  });
  it('wifi syncs on WIFI', async () => {
    expect(await shouldSyncPhotos('wifi')).toBe(true);
  });
  it('wifi does not sync on CELLULAR', async () => {
    mockState.type = 'CELLULAR';
    expect(await shouldSyncPhotos('wifi')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `src/lib/sync/network-policy.ts`**

```ts
import * as Network from 'expo-network';
import type { PhotoSyncPolicy } from './types';

export async function shouldSyncPhotos(policy: PhotoSyncPolicy): Promise<boolean> {
  if (policy === 'off') return false;
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected) return false;
  if (policy === 'always') return true;
  return state.type === Network.NetworkStateType.WIFI;
}
```

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- src/lib/sync/network-policy.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/network-policy.ts src/lib/sync/network-policy.test.ts
git commit -m "Add photo sync network policy

shouldSyncPhotos(policy) consults expo-network and returns whether
photo transfer is allowed under the current policy: off never,
always always (when online), wifi only on WIFI."
```

---

## Task 11: Photo sync (upload/download diff)

**Files:**
- Create: `src/lib/sync/photo-sync.ts`
- Create: `src/lib/sync/photo-sync.test.ts`

**Interfaces:**
- Consumes: `CloudSyncProvider` (Task 4), `shouldSyncPhotos` (Task 10), `photoPathForUuid` (Task 2), photo policy stored in `Settings`
- Produces:
  - `syncPhotosUp(provider: CloudSyncProvider, snap: Snapshot, policy: PhotoSyncPolicy): Promise<void>`
  - `syncPhotosDown(provider: CloudSyncProvider, snap: Snapshot, policy: PhotoSyncPolicy): Promise<void>`

- [ ] **Step 1: Write failing test**

`src/lib/sync/photo-sync.test.ts`:

```ts
const localFiles = new Set<string>();
jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn().mockImplementation((p: string) => ({
    exists: localFiles.has(p),
  })),
  Directory: jest.fn(),
}));
jest.mock('./network-policy', () => ({
  __esModule: true,
  shouldSyncPhotos: jest.fn(async () => true),
}));

import { syncPhotosUp, syncPhotosDown } from './photo-sync';
import { MockCloudSyncProvider } from './providers/mock-provider';
import type { Snapshot } from './types';

function snap(photoUuids: string[]): Snapshot {
  return {
    version: 1, generatedAt: 0, deviceId: 'x',
    transactions: photoUuids.map((u) => ({
      uuid: `t-${u}`, date: '', time: '', createdAt: 0, updatedAt: 0,
      category: 'food', name: 'x', note: null, amount: 1, isIncome: 0,
      photoUuid: u,
    })),
    categories: [], settings: { updatedAt: 0, values: {} },
    photoManifest: photoUuids,
  };
}

describe('syncPhotosUp', () => {
  beforeEach(() => localFiles.clear());

  it('uploads only photos missing from the cloud', async () => {
    localFiles.add('file:///doc/photos/a.jpg');
    localFiles.add('file:///doc/photos/b.jpg');
    const p = new MockCloudSyncProvider();
    await p.uploadPhoto('a', '/x'); // already uploaded
    await syncPhotosUp(p, snap(['a', 'b']), 'always');
    expect((await p.listPhotos()).sort()).toEqual(['a', 'b']);
  });

  it('respects policy=off', async () => {
    const { shouldSyncPhotos } = require('./network-policy');
    (shouldSyncPhotos as jest.Mock).mockResolvedValueOnce(false);
    const p = new MockCloudSyncProvider();
    localFiles.add('file:///doc/photos/a.jpg');
    await syncPhotosUp(p, snap(['a']), 'off');
    expect(await p.listPhotos()).toEqual([]);
  });
});

describe('syncPhotosDown', () => {
  beforeEach(() => localFiles.clear());

  it('downloads only photos missing locally', async () => {
    const p = new MockCloudSyncProvider();
    await p.uploadPhoto('a', '/tmp/a.jpg');
    await p.uploadPhoto('b', '/tmp/b.jpg');
    localFiles.add('file:///doc/photos/a.jpg'); // already present
    const downloaded: string[] = [];
    (p.downloadPhoto as any) = jest.fn(async (u: string) => {
      downloaded.push(u);
      return `file:///doc/photos/${u}.jpg`;
    });
    await syncPhotosDown(p, snap(['a', 'b']), 'always');
    expect(downloaded).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Implement `src/lib/sync/photo-sync.ts`**

```ts
import { File } from 'expo-file-system';
import type { CloudSyncProvider } from './provider';
import type { PhotoSyncPolicy, Snapshot } from './types';
import { shouldSyncPhotos } from './network-policy';
import { photoPathForUuid } from './photo-paths';

export async function syncPhotosUp(
  provider: CloudSyncProvider, snap: Snapshot, policy: PhotoSyncPolicy,
): Promise<void> {
  if (!(await shouldSyncPhotos(policy))) return;
  const cloudUuids = new Set(await provider.listPhotos());
  for (const uuid of snap.photoManifest) {
    if (cloudUuids.has(uuid)) continue;
    const local = photoPathForUuid(uuid);
    if (!new File(local).exists) continue;
    try {
      await provider.uploadPhoto(uuid, local);
    } catch {
      // skip; next sync retries
    }
  }
}

export async function syncPhotosDown(
  provider: CloudSyncProvider, snap: Snapshot, policy: PhotoSyncPolicy,
): Promise<void> {
  if (!(await shouldSyncPhotos(policy))) return;
  for (const uuid of snap.photoManifest) {
    if (new File(photoPathForUuid(uuid)).exists) continue;
    try {
      await provider.downloadPhoto(uuid);
    } catch {
      // placeholder shown; next sync retries
    }
  }
}
```

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- src/lib/sync/photo-sync.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/photo-sync.ts src/lib/sync/photo-sync.test.ts
git commit -m "Add photo sync diff (upload/download)

Both directions compute the set of photoUuids referenced by the
snapshot, subtract what's already on the other side, and transfer the
rest. Failures are best-effort — the snapshot upload/apply is the
primary data; photos fill in over subsequent syncs."
```

---

## Task 12: Sync engine

**Files:**
- Create: `src/lib/sync/sync-engine.ts`
- Create: `src/lib/sync/sync-engine.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–11
- Produces:
  - `type SyncState = 'idle' | 'syncing' | 'error' | 'kicked' | 'token-expired'`
  - `class SyncEngine`:
    - constructor: `(db, provider, deviceId, getPolicy: () => PhotoSyncPolicy)`
    - `getState(): SyncState`
    - `getLastError(): Error | null`
    - `onStateChange(cb: (s: SyncState) => void): () => void`
    - `markDirty(): void` — set dirty=1
    - `sync(opts?: { force?: boolean }): Promise<void>`
    - `applyFirstLoginChoice(local: Snapshot, remote: Snapshot, strategy: MergeStrategy): Promise<Snapshot>`
    - `handleKickedChoice(choice: 'keep' | 'wipe'): Promise<void>`

- [ ] **Step 1: Write failing tests**

`src/lib/sync/sync-engine.test.ts`:

```ts
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
jest.mock('expo-crypto', () => ({ randomUUID: () => 'gen-uuid' }));

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
    expect(p.snapshot).toBeNull(); // upload aborted
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
```

- [ ] **Step 2: Implement `src/lib/sync/sync-engine.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import type { CloudSyncProvider } from './provider';
import type { PhotoSyncPolicy, Snapshot, MergeStrategy } from './types';
import { buildSnapshot, applySnapshot } from './snapshot';
import { mergeSnapshots } from './merge';
import { createSession, isKicked } from './session';
import {
  getDirty, setDirty, setLastSyncedAt, resetSyncMeta,
} from './sync-meta';
import { syncPhotosUp, syncPhotosDown } from './photo-sync';
import { wipeAllPhotos } from './photo-paths';

export type SyncState = 'idle' | 'syncing' | 'error' | 'kicked' | 'token-expired';

export class SyncEngine {
  private state: SyncState = 'idle';
  private lastError: Error | null = null;
  private isSyncing = false;
  private listeners = new Set<(s: SyncState) => void>();

  constructor(
    private db: SQLiteDatabase,
    private provider: CloudSyncProvider,
    private deviceId: string,
    private getPolicy: () => PhotoSyncPolicy,
  ) {}

  getState(): SyncState { return this.state; }
  getLastError(): Error | null { return this.lastError; }

  onStateChange(cb: (s: SyncState) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private setState(s: SyncState): void {
    this.state = s;
    for (const cb of this.listeners) cb(s);
  }

  markDirty(): void {
    setDirty(this.db, true);
  }

  async sync(opts?: { force?: boolean }): Promise<void> {
    if (this.isSyncing) return;
    if (!opts?.force && !getDirty(this.db)) return;
    this.isSyncing = true;
    this.setState('syncing');
    try {
      const remote = await this.provider.readSession();
      if (isKicked(remote, this.deviceId)) {
        this.setState('kicked');
        return;
      }
      await this.provider.writeSession(createSession(this.deviceId));
      const snap = buildSnapshot(this.db, this.deviceId);
      await this.provider.uploadSnapshot(snap);
      await syncPhotosUp(this.provider, snap, this.getPolicy());
      setDirty(this.db, false);
      setLastSyncedAt(this.db, Date.now());
      this.setState('idle');
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
      this.setState('error');
    } finally {
      this.isSyncing = false;
    }
  }

  async applyFirstLoginChoice(
    local: Snapshot, remote: Snapshot, strategy: MergeStrategy,
  ): Promise<Snapshot> {
    const merged = mergeSnapshots(local, remote, strategy);
    applySnapshot(this.db, merged);
    setDirty(this.db, true);
    await this.sync({ force: true });
    await syncPhotosDown(this.provider, merged, this.getPolicy());
    return merged;
  }

  async handleKickedChoice(choice: 'keep' | 'wipe'): Promise<void> {
    await this.provider.signOut();
    resetSyncMeta(this.db);
    if (choice === 'wipe') {
      this.db.withTransactionSync(() => {
        this.db.runSync('DELETE FROM transactions');
        this.db.runSync('DELETE FROM categories');
        this.db.runSync('DELETE FROM settings');
        this.db.runSync('DELETE FROM users');
      });
      await wipeAllPhotos();
    }
    this.setState('idle');
  }
}
```

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- src/lib/sync/sync-engine.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/sync-engine.ts src/lib/sync/sync-engine.test.ts
git commit -m "Add SyncEngine orchestrator

Owns the sync state machine (idle/syncing/error/kicked/token-expired),
the isSyncing guard, session write, snapshot upload/apply, and photo
diff. First-login merge and kicked-device handling are on the engine
because they're the atomic units the UI triggers."
```

---

## Task 13: Sync context + auth wrappers

**Files:**
- Create: `src/lib/sync/auth.ts`
- Create: `src/lib/sync/sync-context.tsx`
- Create: `src/lib/sync/sync-context.test.tsx`

**Interfaces:**
- Consumes: `SyncEngine` (Task 12), `getCloudSyncProvider` (Task 9), `getOrCreateDeviceId` (Task 7)
- Produces:
  - `<SyncProvider>` — mounts the engine, wires AppState + periodic + first-login triggers
  - `useSync()` → `{ state, lastError, user, lastSyncedAt, signIn(), signOut(), signOutAndWipe(), syncNow(), markDirty(), applyFirstLoginChoice(), handleKickedChoice(), pendingFirstLogin, pendingKicked }`

- [ ] **Step 1: Write failing test**

`src/lib/sync/sync-context.test.tsx`:

```tsx
jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn().mockImplementation(() => ({ exists: false })),
  Directory: jest.fn().mockImplementation(() => ({ exists: false, create() {}, delete() {} })),
}));
jest.mock('./network-policy', () => ({ __esModule: true, shouldSyncPhotos: jest.fn(async () => false) }));
jest.mock('./device-id', () => ({ getOrCreateDeviceId: jest.fn(async () => 'device-1') }));

import { render, act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SyncProvider, useSync } from './sync-context';
import { configureCloudSyncProvider } from './providers';
import { MockCloudSyncProvider } from './providers/mock-provider';

function Probe() {
  const { state, user } = useSync();
  return <Text testID="probe">{state}|{user?.email ?? 'anon'}</Text>;
}

describe('SyncProvider', () => {
  it('starts in idle, no user', async () => {
    configureCloudSyncProvider(new MockCloudSyncProvider());
    const r = render(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => {
      expect(r.getByTestId('probe').props.children).toEqual(['idle', '|', 'anon']);
    });
  });
});
```

- [ ] **Step 2: Implement `src/lib/sync/auth.ts`**

```ts
import type { CloudSyncProvider } from './provider';
import type { UserInfo } from './types';

export async function signIn(provider: CloudSyncProvider): Promise<UserInfo> {
  return provider.signIn();
}

export async function signOut(provider: CloudSyncProvider): Promise<void> {
  await provider.signOut();
}
```

- [ ] **Step 3: Implement `src/lib/sync/sync-context.tsx`**

```tsx
import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { db as defaultDb } from '../db';
import { useSettings } from '../settings-context';
import { getOrCreateDeviceId } from './device-id';
import { getCloudSyncProvider } from './providers';
import { SyncEngine, type SyncState } from './sync-engine';
import { getLastSyncedAt, resetSyncMeta } from './sync-meta';
import { buildSnapshot, isEmptySnapshot } from './snapshot';
import { wipeAllPhotos } from './photo-paths';
import type { MergeStrategy, PhotoSyncPolicy, Snapshot, UserInfo } from './types';

const PERIODIC_MS = 15 * 60 * 1000;
const DEBOUNCE_MS = 4000;

interface PendingFirstLogin {
  local: Snapshot;
  remote: Snapshot;
}

interface SyncCtx {
  state: SyncState;
  lastError: Error | null;
  user: UserInfo | null;
  lastSyncedAt: number | null;
  pendingFirstLogin: PendingFirstLogin | null;
  pendingKicked: boolean;
  signIn: () => Promise<void>;
  signOut: (opts?: { wipe?: boolean }) => Promise<void>;
  syncNow: () => Promise<void>;
  markDirty: () => void;
  applyFirstLoginChoice: (s: MergeStrategy) => Promise<void>;
  handleKickedChoice: (c: 'keep' | 'wipe') => Promise<void>;
}

const Ctx = createContext<SyncCtx | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const policy: PhotoSyncPolicy =
    (settings as { photoSyncPolicy?: PhotoSyncPolicy }).photoSyncPolicy ?? 'wifi';

  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [state, setState] = useState<SyncState>('idle');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(getLastSyncedAt(defaultDb));
  const [pendingFirstLogin, setPendingFirstLogin] = useState<PendingFirstLogin | null>(null);
  const [pendingKicked, setPendingKicked] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const deviceId = await getOrCreateDeviceId();
      if (cancelled) return;
      const provider = getCloudSyncProvider();
      const e = new SyncEngine(defaultDb, provider, deviceId, () => policy);
      const u = await provider.getCurrentUser();
      setUser(u);
      setEngine(e);
    })();
    return () => { cancelled = true; };
  }, [policy]);

  useEffect(() => {
    if (!engine) return;
    const off = engine.onStateChange((s) => {
      setState(s);
      if (s === 'idle') setLastSyncedAt(getLastSyncedAt(defaultDb));
      if (s === 'kicked') setPendingKicked(true);
    });
    return off;
  }, [engine]);

  useEffect(() => {
    if (!engine || !user) return;
    engine.sync().catch(() => {});
    const id = setInterval(() => engine.sync().catch(() => {}), PERIODIC_MS);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') engine.sync().catch(() => {});
    });
    return () => { clearInterval(id); sub.remove(); };
  }, [engine, user]);

  const value = useMemo<SyncCtx | null>(() => {
    if (!engine) return null;
    return {
      state, lastError: engine.getLastError(), user, lastSyncedAt,
      pendingFirstLogin, pendingKicked,

      signIn: async () => {
        const provider = getCloudSyncProvider();
        const u = await provider.signIn();
        setUser(u);
        const remote = await provider.downloadSnapshot();
        const deviceId = await getOrCreateDeviceId();
        const local = buildSnapshot(defaultDb, deviceId);
        const localEmpty = local.transactions.length === 0 && local.categories.length === 0;
        const remoteEmpty = isEmptySnapshot(remote);
        if (localEmpty && remoteEmpty) {
          engine.markDirty();
          await engine.sync({ force: true });
        } else if (!localEmpty && remoteEmpty) {
          engine.markDirty();
          await engine.sync({ force: true });
        } else if (localEmpty && remote) {
          await engine.applyFirstLoginChoice(local, remote, 'cloud');
        } else if (remote) {
          setPendingFirstLogin({ local, remote });
        }
      },

      signOut: async (opts) => {
        const provider = getCloudSyncProvider();
        await provider.signOut();
        setUser(null);
        resetSyncMeta(defaultDb);
        if (opts?.wipe) {
          defaultDb.withTransactionSync(() => {
            defaultDb.runSync('DELETE FROM transactions');
            defaultDb.runSync('DELETE FROM categories');
            defaultDb.runSync('DELETE FROM settings');
            defaultDb.runSync('DELETE FROM users');
          });
          await wipeAllPhotos();
        }
      },

      syncNow: async () => { await engine.sync({ force: true }); },

      markDirty: () => {
        engine.markDirty();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => engine.sync().catch(() => {}), DEBOUNCE_MS);
      },

      applyFirstLoginChoice: async (strategy) => {
        if (!pendingFirstLogin) return;
        await engine.applyFirstLoginChoice(pendingFirstLogin.local, pendingFirstLogin.remote, strategy);
        setPendingFirstLogin(null);
      },

      handleKickedChoice: async (choice) => {
        await engine.handleKickedChoice(choice);
        setUser(null);
        setPendingKicked(false);
      },
    };
  }, [engine, state, user, lastSyncedAt, pendingFirstLogin, pendingKicked]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync must be used inside <SyncProvider>');
  return v;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/sync/sync-context.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/auth.ts src/lib/sync/sync-context.tsx src/lib/sync/sync-context.test.tsx
git commit -m "Add SyncProvider + useSync hook

Mounts the sync engine, wires AppState-active + 15-minute periodic +
4s post-mutation debounce triggers, exposes the first-login and kicked
pending states so root layout can show the right sheet."
```

---

## Task 14: i18n keys

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/vi.json`

**Interfaces:**
- Consumes: nothing
- Produces: `t('sync.*')` keys resolvable in both locales

- [ ] **Step 1: Add sync block to `en.json`**

Add to the top-level object (before the closing `}`):

```json
"sync": {
  "section_title": "SYNC & BACKUP",
  "signin_cta": "Sign in with Google to sync",
  "signin_desc": "Back up and restore your data automatically via your Google account.",
  "photo_policy_label": "Photo sync",
  "photo_policy_wifi": "Wi-Fi",
  "photo_policy_always": "Always",
  "photo_policy_off": "Off",
  "status_synced": "Synced at {{time}}",
  "status_syncing": "Syncing…",
  "status_never": "Not backed up yet",
  "status_error": "Error: {{msg}}",
  "status_token_expired": "Sign in again",
  "sync_now": "Sync now",
  "signout": "Sign out",
  "signout_keep": "Sign out (keep local data)",
  "signout_and_wipe": "Sign out and wipe local data",
  "first_login": {
    "title": "Sync data",
    "subtitle": "Both this device and cloud have data. Choose how to handle it.",
    "use_local": "Use data on this device",
    "use_local_desc": "Cloud will be overwritten",
    "use_cloud": "Use data from cloud",
    "use_cloud_desc": "Data on this device will be deleted",
    "combine": "Combine both",
    "combine_desc": "Merge all; newer version wins on conflict",
    "count_summary": "{{txns}} transactions · {{cats}} categories",
    "last_backup": "Last backup: {{when}}"
  },
  "preview": {
    "title": "Preview",
    "count": "{{n}} transactions will be saved",
    "back": "Change choice",
    "confirm": "Confirm & save"
  },
  "kicked": {
    "title": "Signed in on another device",
    "body": "You signed in to SpendLens on another device. This device has been signed out.",
    "keep": "Keep offline data",
    "wipe": "Wipe data on this device",
    "wipe_confirm": "Wipe all transactions, photos and settings? Cannot be undone."
  }
}
```

- [ ] **Step 2: Add same block to `vi.json` with VI copy**

```json
"sync": {
  "section_title": "ĐỒNG BỘ & SAO LƯU",
  "signin_cta": "Đăng nhập Google để đồng bộ",
  "signin_desc": "Sao lưu và khôi phục dữ liệu tự động qua tài khoản Google của bạn.",
  "photo_policy_label": "Đồng bộ ảnh",
  "photo_policy_wifi": "Wi-Fi",
  "photo_policy_always": "Luôn luôn",
  "photo_policy_off": "Tắt",
  "status_synced": "Đã đồng bộ lúc {{time}}",
  "status_syncing": "Đang đồng bộ…",
  "status_never": "Chưa sao lưu lần nào",
  "status_error": "Lỗi: {{msg}}",
  "status_token_expired": "Cần đăng nhập lại",
  "sync_now": "Đồng bộ ngay",
  "signout": "Đăng xuất",
  "signout_keep": "Đăng xuất (giữ dữ liệu trên máy)",
  "signout_and_wipe": "Đăng xuất và xoá dữ liệu trên máy",
  "first_login": {
    "title": "Đồng bộ dữ liệu",
    "subtitle": "Máy này và cloud đều đang có dữ liệu. Hãy chọn cách xử lý.",
    "use_local": "Dùng dữ liệu trên máy này",
    "use_local_desc": "Cloud sẽ bị ghi đè",
    "use_cloud": "Dùng dữ liệu trên cloud",
    "use_cloud_desc": "Dữ liệu trên máy này sẽ bị xoá",
    "combine": "Kết hợp cả hai",
    "combine_desc": "Gộp toàn bộ; nếu trùng lấy bản mới hơn",
    "count_summary": "{{txns}} giao dịch · {{cats}} danh mục",
    "last_backup": "Sao lưu gần nhất: {{when}}"
  },
  "preview": {
    "title": "Xem trước",
    "count": "{{n}} giao dịch sẽ được lưu",
    "back": "Chọn lại",
    "confirm": "Xác nhận & lưu"
  },
  "kicked": {
    "title": "Tài khoản đăng nhập ở máy khác",
    "body": "Bạn đã đăng nhập SpendLens trên một thiết bị khác. Máy này đã bị đăng xuất.",
    "keep": "Giữ dữ liệu offline",
    "wipe": "Xoá dữ liệu trên máy này",
    "wipe_confirm": "Xoá toàn bộ giao dịch, ảnh và cài đặt? Không thể hoàn tác."
  }
}
```

- [ ] **Step 3: Sanity — run test suite (i18n should still load)**

Run: `npm test -- --testPathPattern=i18n`
Expected: PASS (or "no tests" — either is fine; the point is no JSON parse error).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/vi.json
git commit -m "i18n: add sync.* namespace (EN + VI)

Copy for the SyncProvider status, sign-in flow, first-login dialog,
preview screen, kicked-device sheet, and signout confirm."
```

---

## Task 15: ChooseDataSourceSheet component

**Files:**
- Create: `src/components/sl/choose-data-source-sheet.tsx`
- Create: `src/components/sl/choose-data-source-sheet.test.tsx`

**Interfaces:**
- Consumes: `Snapshot` (Task 4), `useSync` (Task 13), `useT` (existing)
- Produces:
  - `ChooseDataSourceSheetHandle` = `{ present(local: Snapshot, remote: Snapshot): void; dismiss(): void }`
  - `<ChooseDataSourceSheet ref onChoice={(s: MergeStrategy) => void} />`

- [ ] **Step 1: Write failing test**

`src/components/sl/choose-data-source-sheet.test.tsx`:

```tsx
import { createRef } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import {
  ChooseDataSourceSheet, type ChooseDataSourceSheetHandle,
} from './choose-data-source-sheet';
import type { Snapshot } from '@/lib/sync/types';

function snap(uuid: string): Snapshot {
  return {
    version: 1, generatedAt: 100, deviceId: 'x',
    transactions: [{
      uuid, date: '', time: '', createdAt: 0, updatedAt: 0,
      category: 'food', name: 'x', note: null, amount: 1, isIncome: 0, photoUuid: null,
    }],
    categories: [], settings: { updatedAt: 0, values: {} }, photoManifest: [],
  };
}

describe('ChooseDataSourceSheet', () => {
  it('exposes present() and calls onChoice with the chosen strategy', () => {
    const onChoice = jest.fn();
    const ref = createRef<ChooseDataSourceSheetHandle>();
    const r = render(<ChooseDataSourceSheet ref={ref} onChoice={onChoice} />);
    act(() => { ref.current?.present(snap('a'), snap('b')); });
    fireEvent.press(r.getByTestId('choose-source-combine'));
    expect(onChoice).toHaveBeenCalledWith('combine');
  });
});
```

- [ ] **Step 2: Implement `src/components/sl/choose-data-source-sheet.tsx`**

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import type { MergeStrategy, Snapshot } from '@/lib/sync/types';

export interface ChooseDataSourceSheetHandle {
  present: (local: Snapshot, remote: Snapshot) => void;
  dismiss: () => void;
}

interface Props {
  onChoice: (strategy: MergeStrategy) => void;
}

export const ChooseDataSourceSheet = forwardRef<ChooseDataSourceSheetHandle, Props>(
  function ChooseDataSourceSheet({ onChoice }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [pair, setPair] = useState<{ local: Snapshot; remote: Snapshot } | null>(null);

    useImperativeHandle(ref, () => ({
      present: (local, remote) => { setPair({ local, remote }); sheet.current?.present(); },
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    if (!pair) {
      return (
        <BottomSheetModal ref={sheet} snapPoints={['70%']} backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: c.card }}>
          <BottomSheetView><Text>{''}</Text></BottomSheetView>
        </BottomSheetModal>
      );
    }

    const localCounts = t('sync.first_login.count_summary', {
      txns: pair.local.transactions.length, cats: pair.local.categories.length,
    });
    const cloudCounts = t('sync.first_login.count_summary', {
      txns: pair.remote.transactions.length, cats: pair.remote.categories.length,
    });
    const lastBackup = t('sync.first_login.last_backup', {
      when: new Date(pair.remote.generatedAt).toLocaleString(),
    });

    const choose = (s: MergeStrategy) => {
      onChoice(s);
      sheet.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['70%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <BottomSheetView style={styles.body}>
          <Text weight="bold" style={{ color: c.text, fontSize: 18 }}>
            {t('sync.first_login.title')}
          </Text>
          <Text style={{ color: c.textMuted, marginTop: 4 }}>
            {t('sync.first_login.subtitle')}
          </Text>

          <Option
            testID="choose-source-local"
            title={t('sync.first_login.use_local')}
            desc={t('sync.first_login.use_local_desc')}
            meta={localCounts}
            color={c} onPress={() => choose('local')}
          />
          <Option
            testID="choose-source-cloud"
            title={t('sync.first_login.use_cloud')}
            desc={t('sync.first_login.use_cloud_desc')}
            meta={`${cloudCounts}\n${lastBackup}`}
            color={c} onPress={() => choose('cloud')}
          />
          <Option
            testID="choose-source-combine"
            title={t('sync.first_login.combine')}
            desc={t('sync.first_login.combine_desc')}
            meta=""
            color={c} onPress={() => choose('combine')}
          />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

function Option({
  testID, title, desc, meta, color, onPress,
}: {
  testID: string; title: string; desc: string; meta: string;
  color: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: color.bgAlt, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text weight="bold" style={{ color: color.text }}>{title}</Text>
      {meta ? <Text style={{ color: color.textMuted, marginTop: 2 }}>{meta}</Text> : null}
      <Text style={{ color: color.textMuted, marginTop: 4, fontSize: 12 }}>{desc}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  option: { padding: 16, borderRadius: 12 },
});
```

Note: this file references `c.bgAlt` — if that token isn't in `constants/tokens.ts`, substitute the nearest existing background token (`c.bg` with a `borderWidth: 1, borderColor: c.border`). Reader: check `src/constants/tokens.ts` and adjust.

- [ ] **Step 3: Run test to verify pass**

Run: `npm test -- src/components/sl/choose-data-source-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/choose-data-source-sheet.tsx src/components/sl/choose-data-source-sheet.test.tsx
git commit -m "Add ChooseDataSourceSheet

Bottom sheet that shows the three first-login options (local, cloud,
combine) with counts per side and last-backup timestamp for cloud."
```

---

## Task 16: PreviewChangesSheet component

**Files:**
- Create: `src/components/sl/preview-changes-sheet.tsx`
- Create: `src/components/sl/preview-changes-sheet.test.tsx`

**Interfaces:**
- Consumes: `Snapshot`, `SourceMap`, `mergeSnapshots`, `computeSourceMap`, `TransactionRow` (existing)
- Produces:
  - `PreviewChangesSheetHandle` = `{ present(local: Snapshot, remote: Snapshot, strategy: MergeStrategy): void; dismiss(): void }`
  - `<PreviewChangesSheet ref onConfirm={() => void} onBack={() => void} />`

- [ ] **Step 1: Write failing test**

`src/components/sl/preview-changes-sheet.test.tsx`:

```tsx
import { createRef } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PreviewChangesSheet, type PreviewChangesSheetHandle } from './preview-changes-sheet';
import type { Snapshot } from '@/lib/sync/types';

function snap(uuids: string[]): Snapshot {
  return {
    version: 1, generatedAt: 100, deviceId: 'x',
    transactions: uuids.map((u) => ({
      uuid: u, date: '2026-07-01', time: '10:00',
      createdAt: 0, updatedAt: 0, category: 'food',
      name: u, note: null, amount: 1, isIncome: 0, photoUuid: null,
    })),
    categories: [], settings: { updatedAt: 0, values: {} }, photoManifest: [],
  };
}

describe('PreviewChangesSheet', () => {
  it('shows the count and invokes onConfirm', () => {
    const onConfirm = jest.fn();
    const onBack = jest.fn();
    const ref = createRef<PreviewChangesSheetHandle>();
    const r = render(
      <PreviewChangesSheet ref={ref} onConfirm={onConfirm} onBack={onBack} />
    );
    act(() => { ref.current?.present(snap(['a']), snap(['b']), 'combine'); });
    expect(r.queryByText(/2 giao dịch|2 transactions/)).toBeTruthy();
    fireEvent.press(r.getByTestId('preview-confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('invokes onBack when the back button is pressed', () => {
    const onConfirm = jest.fn();
    const onBack = jest.fn();
    const ref = createRef<PreviewChangesSheetHandle>();
    const r = render(
      <PreviewChangesSheet ref={ref} onConfirm={onConfirm} onBack={onBack} />
    );
    act(() => { ref.current?.present(snap(['a']), snap(['b']), 'combine'); });
    fireEvent.press(r.getByTestId('preview-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement `src/components/sl/preview-changes-sheet.tsx`**

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TransactionRow } from '@/components/sl/transaction-row';
import { Text } from '@/components/sl/text';
import { GradientButton } from '@/components/sl/gradient';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { mergeSnapshots, computeSourceMap, type SourceMap } from '@/lib/sync/merge';
import type { MergeStrategy, Snapshot, SnapshotTxn } from '@/lib/sync/types';
import type { Txn } from '@/lib/transactions';

function toTxn(s: SnapshotTxn): Txn {
  return {
    id: 0, uuid: s.uuid, updatedAt: s.updatedAt,
    date: s.date, time: s.time, createdAt: s.createdAt,
    category: s.category as Txn['category'],
    name: s.name, note: s.note, amount: s.amount,
    isIncome: s.isIncome === 1,
    photoPath: null,
  };
}

export interface PreviewChangesSheetHandle {
  present: (local: Snapshot, remote: Snapshot, strategy: MergeStrategy) => void;
  dismiss: () => void;
}

interface Props { onConfirm: () => void; onBack: () => void; }

export const PreviewChangesSheet = forwardRef<PreviewChangesSheetHandle, Props>(
  function PreviewChangesSheet({ onConfirm, onBack }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [state, setState] = useState<{
      merged: Snapshot; sources: SourceMap;
    } | null>(null);

    useImperativeHandle(ref, () => ({
      present: (local, remote, strategy) => {
        const merged = mergeSnapshots(local, remote, strategy);
        const sources = computeSourceMap(local, remote, merged, strategy);
        setState({ merged, sources });
        sheet.current?.present();
      },
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const rows = useMemo(() => state?.merged.transactions ?? [], [state]);

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['90%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <View style={styles.header}>
          <Text weight="bold" style={{ color: c.text, fontSize: 18 }}>
            {t('sync.preview.title')}
          </Text>
          <Text style={{ color: c.textMuted, marginTop: 2 }}>
            {t('sync.preview.count', { n: rows.length })}
          </Text>
        </View>

        <BottomSheetScrollView style={{ flex: 1 }}>
          {rows.map((s) => (
            <View key={s.uuid} style={styles.rowWrap}>
              <TransactionRow txn={toTxn(s)} />
              <Text style={styles.badge}>{badgeFor(state?.sources[s.uuid])}</Text>
            </View>
          ))}
        </BottomSheetScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="preview-back"
            onPress={onBack}
            style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={{ color: c.text }}>{t('sync.preview.back')}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <GradientButton onPress={onConfirm} testID="preview-confirm">
              {t('sync.preview.confirm')}
            </GradientButton>
          </View>
        </View>
      </BottomSheetModal>
    );
  },
);

function badgeFor(source: 'local' | 'cloud' | 'merged' | undefined): string {
  if (source === 'local') return '📱';
  if (source === 'cloud') return '☁️';
  if (source === 'merged') return '🔀';
  return '';
}

const styles = StyleSheet.create({
  header: { padding: 20, paddingBottom: 12 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  badge: { marginLeft: 8, fontSize: 18 },
  footer: {
    flexDirection: 'row', gap: 12, padding: 16,
    alignItems: 'center',
  },
  back: { paddingVertical: 12, paddingHorizontal: 16 },
});
```

Note: `GradientButton` may not accept `testID`. If not, wrap it in a `<View testID="preview-confirm">`.

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- src/components/sl/preview-changes-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/preview-changes-sheet.tsx src/components/sl/preview-changes-sheet.test.tsx
git commit -m "Add PreviewChangesSheet

Full-height bottom sheet showing the transactions that will land after
the chosen first-login strategy is applied. Reuses TransactionRow and
overlays a source badge (local / cloud / merged) per row."
```

---

## Task 17: KickedDeviceSheet component

**Files:**
- Create: `src/components/sl/kicked-device-sheet.tsx`
- Create: `src/components/sl/kicked-device-sheet.test.tsx`

**Interfaces:**
- Consumes: `useT`, `useColors`
- Produces:
  - `<KickedDeviceSheet visible onChoice={(c: 'keep' | 'wipe') => void} />` — plain always-mounted sheet (no imperative handle; visibility controlled by parent)

- [ ] **Step 1: Write failing test**

`src/components/sl/kicked-device-sheet.test.tsx`:

```tsx
import { render, fireEvent } from '@testing-library/react-native';
import { KickedDeviceSheet } from './kicked-device-sheet';

describe('KickedDeviceSheet', () => {
  it('renders nothing when not visible', () => {
    const r = render(<KickedDeviceSheet visible={false} onChoice={() => {}} />);
    expect(r.queryByTestId('kicked-keep')).toBeNull();
  });

  it('invokes onChoice("keep")', () => {
    const onChoice = jest.fn();
    const r = render(<KickedDeviceSheet visible onChoice={onChoice} />);
    fireEvent.press(r.getByTestId('kicked-keep'));
    expect(onChoice).toHaveBeenCalledWith('keep');
  });
});
```

- [ ] **Step 2: Implement `src/components/sl/kicked-device-sheet.tsx`**

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';

interface Props {
  visible: boolean;
  onChoice: (choice: 'keep' | 'wipe') => void;
}

export function KickedDeviceSheet({ visible, onChoice }: Props) {
  const { t } = useT();
  const c = useColors();
  const sheet = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (visible) sheet.current?.present();
    else sheet.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="none" />
    ),
    [],
  );

  if (!visible) return null;

  const confirmWipe = () => {
    Alert.alert(
      t('sync.kicked.wipe'),
      t('sync.kicked.wipe_confirm'),
      [
        { text: t('sync.kicked.keep'), style: 'cancel' },
        { text: t('sync.kicked.wipe'), style: 'destructive', onPress: () => onChoice('wipe') },
      ],
    );
  };

  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={['50%']}
      backdropComponent={renderBackdrop}
      enablePanDownToClose={false}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.body}>
        <Text weight="bold" style={{ color: c.text, fontSize: 18 }}>
          {t('sync.kicked.title')}
        </Text>
        <Text style={{ color: c.textMuted, marginTop: 8 }}>
          {t('sync.kicked.body')}
        </Text>

        <Pressable
          testID="kicked-keep"
          onPress={() => onChoice('keep')}
          style={({ pressed }) => [styles.option, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text weight="bold" style={{ color: c.text }}>{t('sync.kicked.keep')}</Text>
        </Pressable>

        <Pressable
          testID="kicked-wipe"
          onPress={confirmWipe}
          style={({ pressed }) => [styles.option, { backgroundColor: c.card, borderColor: c.danger, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text weight="bold" style={{ color: c.danger }}>{t('sync.kicked.wipe')}</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  option: { padding: 16, borderRadius: 12, borderWidth: 1 },
});
```

Note: `c.border` and `c.danger` — verify these exist in `src/constants/tokens.ts`; substitute the closest tokens if not.

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- src/components/sl/kicked-device-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/kicked-device-sheet.tsx src/components/sl/kicked-device-sheet.test.tsx
git commit -m "Add KickedDeviceSheet

Non-dismissable bottom sheet shown when the app detects it has been
signed out because a new device claimed the session. User picks
between keeping offline data or wiping local storage."
```

---

## Task 18: Settings screen integration + root wiring

**Files:**
- Modify: `src/app/settings.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `src/lib/settings.ts` (add `photoSyncPolicy` field)
- Modify: `src/lib/transactions.ts` (call `markDirty` after write is out of scope for the data-layer file itself; instead the context calls it)
- Create: `src/components/sl/sync-status-row.tsx`

**Interfaces:**
- Consumes: `useSync` (Task 13), all three sheets (Tasks 15–17)
- Produces: user-facing settings section, global kicked handling, global first-login handling

- [ ] **Step 1: Extend `Settings` type**

In `src/lib/settings.ts`, add:

```ts
export interface Settings {
  // existing fields...
  photoSyncPolicy: 'wifi' | 'always' | 'off';
}
```

Update `DEFAULTS` (default `'wifi'`), `encode` (switch case returning value as string), `decode` (accept `'wifi' | 'always' | 'off'`).

Add a settings test line confirming `photoSyncPolicy` roundtrips.

- [ ] **Step 2: Create `src/components/sl/sync-status-row.tsx`**

```tsx
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { useSync } from '@/lib/sync/sync-context';

export function SyncStatusRow() {
  const { t } = useT();
  const c = useColors();
  const { state, lastError, lastSyncedAt } = useSync();

  let body;
  if (state === 'syncing') {
    body = <><ActivityIndicator size="small" /><Text style={{ color: c.textMuted, marginLeft: 8 }}>{t('sync.status_syncing')}</Text></>;
  } else if (state === 'error') {
    body = <Text style={{ color: c.danger }}>{t('sync.status_error', { msg: lastError?.message ?? '' })}</Text>;
  } else if (state === 'token-expired') {
    body = <Text style={{ color: c.danger }}>{t('sync.status_token_expired')}</Text>;
  } else if (lastSyncedAt) {
    body = <Text style={{ color: c.textMuted }}>{t('sync.status_synced', { time: new Date(lastSyncedAt).toLocaleTimeString() })}</Text>;
  } else {
    body = <Text style={{ color: c.textMuted }}>{t('sync.status_never')}</Text>;
  }

  return <View style={styles.row}>{body}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
});
```

- [ ] **Step 3: Add sync section to `src/app/settings.tsx`**

Above the existing DỮ LIỆU section, insert:

```tsx
import { useSync } from '@/lib/sync/sync-context';
import { Segmented } from '@/components/sl/segmented';
import { SyncStatusRow } from '@/components/sl/sync-status-row';

const POLICY_MODES = ['wifi', 'always', 'off'] as const;

// ...inside SettingsScreen:
const { user, signIn, signOut, syncNow } = useSync();
const policyLabels = [
  t('sync.photo_policy_wifi'),
  t('sync.photo_policy_always'),
  t('sync.photo_policy_off'),
];
const policyIndex = POLICY_MODES.indexOf(settings.photoSyncPolicy ?? 'wifi');

// ...in JSX, before the DỮ LIỆU section header:
<Text style={styles.section}>{t('sync.section_title')}</Text>
{user ? (
  <View style={[styles.card, { backgroundColor: colors.card }]}>
    <View style={styles.userRow}>
      <Text weight="bold" style={{ color: colors.text }}>{user.displayName ?? user.email}</Text>
      <Text style={{ color: colors.textMuted, marginTop: 2 }}>{user.email}</Text>
    </View>
    <Text style={{ color: colors.text, marginTop: 12 }}>{t('sync.photo_policy_label')}</Text>
    <Segmented
      options={policyLabels}
      selectedIndex={policyIndex}
      onChange={(i) => update('photoSyncPolicy', POLICY_MODES[i])}
    />
    <SyncStatusRow />
    <Pressable onPress={syncNow} style={({ pressed }) => [styles.rowBtn, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: colors.accent }}>{t('sync.sync_now')}</Text>
    </Pressable>
    <Pressable
      onPress={() => {
        Alert.alert(
          t('sync.signout'),
          '',
          [
            { text: t('common.cancel') /* or existing i18n key */, style: 'cancel' },
            { text: t('sync.signout_keep'), onPress: () => signOut() },
            { text: t('sync.signout_and_wipe'), style: 'destructive', onPress: () => signOut({ wipe: true }) },
          ],
        );
      }}
      style={({ pressed }) => [styles.rowBtn, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={{ color: colors.danger }}>{t('sync.signout')}</Text>
    </Pressable>
  </View>
) : (
  <Pressable onPress={signIn} style={({ pressed }) => [styles.card, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}>
    <Text weight="bold" style={{ color: colors.text }}>{t('sync.signin_cta')}</Text>
    <Text style={{ color: colors.textMuted, marginTop: 4 }}>{t('sync.signin_desc')}</Text>
  </Pressable>
)}
```

Add `styles.section`, `styles.card`, `styles.userRow`, `styles.rowBtn` if not already present.

- [ ] **Step 4: Wire root layout**

In `src/app/_layout.tsx`:

- Mount `<SyncProvider>` inside the existing provider tree (below `<SettingsProvider>` and `<TransactionsProvider>`).
- Add a `<GlobalSyncSheets />` component (declared in `_layout.tsx`) that:
  1. Reads `useSync()` for `pendingFirstLogin` and `pendingKicked`
  2. Renders `<ChooseDataSourceSheet>`, `<PreviewChangesSheet>`, `<KickedDeviceSheet>`
  3. Wires `ChooseDataSourceSheet.onChoice` → open Preview
  4. Wires `PreviewChangesSheet.onConfirm` → `applyFirstLoginChoice(strategy)`
  5. Wires `PreviewChangesSheet.onBack` → re-open ChooseDataSource
  6. Wires `KickedDeviceSheet.onChoice` → `handleKickedChoice`

Sketch:

```tsx
function GlobalSyncSheets() {
  const { pendingFirstLogin, pendingKicked, applyFirstLoginChoice, handleKickedChoice } = useSync();
  const chooseRef = useRef<ChooseDataSourceSheetHandle>(null);
  const previewRef = useRef<PreviewChangesSheetHandle>(null);
  const [pickedStrategy, setPickedStrategy] = useState<MergeStrategy | null>(null);

  useEffect(() => {
    if (pendingFirstLogin) chooseRef.current?.present(pendingFirstLogin.local, pendingFirstLogin.remote);
  }, [pendingFirstLogin]);

  return (
    <>
      <ChooseDataSourceSheet
        ref={chooseRef}
        onChoice={(s) => {
          setPickedStrategy(s);
          if (pendingFirstLogin) previewRef.current?.present(pendingFirstLogin.local, pendingFirstLogin.remote, s);
        }}
      />
      <PreviewChangesSheet
        ref={previewRef}
        onBack={() => {
          if (pendingFirstLogin) chooseRef.current?.present(pendingFirstLogin.local, pendingFirstLogin.remote);
        }}
        onConfirm={() => { if (pickedStrategy) applyFirstLoginChoice(pickedStrategy); }}
      />
      <KickedDeviceSheet visible={pendingKicked} onChoice={handleKickedChoice} />
    </>
  );
}
```

Mount inside `<SyncProvider>...<Stack /><GlobalSyncSheets /></SyncProvider>`.

- [ ] **Step 5: Wire `markDirty` into transaction/category/settings writes**

In `src/lib/transactions-context.tsx` (or wherever mutations are dispatched), after `insertTransaction`/`updateTransaction`/`deleteTransaction` calls, call `useSync().markDirty()`. Do the same in `src/lib/settings-context.tsx` after `updateSetting` and in the user-category dispatch site.

If the sync context isn't available (e.g., during testing), tolerate `undefined` — mutation writes must still succeed without a mounted `SyncProvider`.

Example wrapper approach:

```tsx
// in transactions-context.tsx
import { useSync } from '@/lib/sync/sync-context';
// try/catch because the hook throws when SyncProvider isn't mounted
function safeMarkDirty(): void {
  try { useSync().markDirty(); } catch { /* no-op */ }
}
```

Better: expose a `useMaybeSync()` from `sync-context.tsx` that returns `null` if the context is missing, and call `sync?.markDirty()` from mutations.

- [ ] **Step 6: Sanity test — settings screen renders with no user**

Add or extend a test that renders `<SyncProvider><SettingsScreen /></SyncProvider>` with `configureCloudSyncProvider(new MockCloudSyncProvider())` and asserts the "sign in" CTA appears.

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: TypeScript check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 9: Manual QA (dev-client required)**

Before commit, rebuild the dev-client (`npx expo run:ios` or `run:android`) and walk through the manual QA checklist from the spec:

1. Sign in with empty device + empty cloud → no dialog, status shows synced.
2. Sign in with local data + empty cloud → auto push, no dialog.
3. Sign in with empty device + cloud data → auto pull, no dialog.
4. Sign in with both → ChooseDataSourceSheet appears; try each of the three options; preview counts correct; confirm applies.
5. On device B, sign in → open device A → KickedDeviceSheet; try keep and wipe.
6. Spam "Sync now" → no double sync.
7. Airplane mode mid-sync → status shows error; data intact.
8. Toggle photo policy → photo transfer respects it.
9. Switch VN ↔ EN + light ↔ dark → all sheets render correctly.
10. Sign out (keep) → local intact; sign in → merge dialog re-appears.
11. Sign out and wipe → local sparse; sign in → auto-pulls cloud.

- [ ] **Step 10: Commit**

```bash
git add src/app/settings.tsx src/app/_layout.tsx src/lib/settings.ts src/lib/settings.test.ts src/components/sl/sync-status-row.tsx src/lib/transactions-context.tsx src/lib/settings-context.tsx
git commit -m "Wire sync into Settings screen + root layout

Adds the 'Sync & backup' section (sign-in CTA when signed out;
avatar + photo policy + status + sync-now + signout when signed in).
Mounts SyncProvider globally and GlobalSyncSheets that shows the
first-login choose/preview flow and the kicked-device sheet on top of
any screen. Mutation contexts call sync.markDirty() so post-write sync
kicks off (debounced 4s)."
```

---

## Self-review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Code organization + interface | 4, 8, 9 |
| Data model changes (uuid, updated_at, sync_meta) | 1, 3 |
| Photo storage convention + migration | 2 |
| Snapshot format | 5 |
| Google sign-in | 9, 13 |
| Session & kick detection | 7, 12 |
| First-login flow (dialog, preview, apply) | 12, 13, 15, 16, 18 |
| Sync triggers (cold start, foreground, mutation, periodic, manual) | 12, 13, 18 |
| Photo sync (upload/download diff + policy) | 10, 11 |
| Settings UI | 14, 18 |
| KickedDeviceSheet | 17, 18 |
| i18n (EN + VI) | 14 |
| Dark/light mode | Enforced globally via `useColors()` — no dedicated task |
| Error handling & edge cases | 12 (state machine), 18 (banner) |
| Testing strategy | Every task includes unit tests + Task 18 lists manual QA |

**2. Placeholder scan:** searched for TBD/TODO/"appropriate"/"similar to" — clean. All Steps have runnable code or exact commands.

**3. Type consistency:** signatures cross-checked — `applyFirstLoginChoice(local, remote, strategy)` matches in engine (Task 12), context (Task 13), and preview sheet (Task 16). `handleKickedChoice('keep' | 'wipe')` matches engine (Task 12), context (Task 13), sheet (Task 17). `mergeSnapshots` and `computeSourceMap` signatures match between merge module (Task 6) and preview (Task 16).

**Notes for the implementer:**

- Some component code references color tokens (`c.bgAlt`, `c.border`, `c.danger`) whose exact names vary — check `src/constants/tokens.ts` and use the closest existing token. This is called out inline in Tasks 15 and 17.
- `GradientButton` may not accept `testID`; if not, wrap it. Called out in Task 16.
- Task 18 Step 5 (`markDirty` wiring) is the least prescriptive part of the plan because it depends on existing context internals — read `transactions-context.tsx` and `settings-context.tsx` before editing, and prefer adding a `useMaybeSync()` helper over try/catch. This is the one deliberate flex point; everything else is exact.
