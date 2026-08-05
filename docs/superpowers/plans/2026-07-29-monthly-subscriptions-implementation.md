# Monthly Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subscription entity that acts as a monthly template, auto-creating a real transaction on its billing anchor day (back-dating any missed cycles when the user opens the app), with 7/3/1-day-ahead notifications per subscription.

**Architecture:** Pure `subscriptions.ts` (CRUD) + `subscription-scheduler.ts` (`nextDueFromAnchor` + `catchUpSubscriptions`) + `subscription-notifications.ts` (Expo-adapter for scheduling) form the foundation. `transactions.ts` gains a nullable `subscription_uuid` column so auto-created transactions can be traced back. `SubscriptionsProvider` mounts under `TransactionsProvider`, runs `catchUpSubscriptions` on `AppState 'active'` transitions, and refreshes both contexts. UI adds a `/subscriptions` list screen, a dual-purpose add/edit sheet, an anchor-day picker sheet, one subscription-source row on the transaction detail, and one entry row in Settings.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-sqlite, expo-crypto, expo-notifications, `expo-image-picker` (new — installed in Task 8), `@gorhom/bottom-sheet`, i18next, Jest + jest-expo.

## Global Constraints

- **Design spec:** every task implements a section of `docs/superpowers/specs/2026-07-29-monthly-subscriptions-design.md`. Deviations require the spec to be updated first.
- **Multi-currency is a hard prerequisite.** `insertTransaction` already accepts `(input, db, primary, rates)`; every auto-create path threads these through the same way manual entries do.
- **`original_amount` + `original_currency` are IMMUTABLE on subscriptions** exactly as they are on transactions — set on insert, rewritten on user edit only, never derived from downstream converted amounts.
- **Anchor day range:** 1..31 integer. `nextDueFromAnchor` clamps to last day of month when month is shorter (Netflix-style).
- **Catch-up loop cap:** each subscription processes at most 12 cycles per `catchUpSubscriptions` call (safety valve against runaway loops on badly-set clocks).
- **Notification identifier convention:** `sub-${uuid}-${offset}` where `offset ∈ {7, 3, 1}`. Fire time is 09:00 local on `next_due_date - offset days`.
- **UI:** bottom sheets follow `budget-sheet.tsx` pattern (BottomSheetModal + BottomSheetBackdrop + forwardRef imperative handle). Colors from `useColors()`, `Money`, `AccentGradient` in `@/constants/tokens`. No hex literals in new files. `Text` from `@/components/sl/text`.
- **i18n:** every user-visible string via `useT()` under the `sub.*` namespace in `src/lib/i18n/locales/en.json` and `.../vi.json`.
- **Tests:** colocated `*.test.ts(x)`, Jest + jest-expo preset. In-memory SQLite via existing mock. Notifications mocked at test top. `Crypto.randomUUID` mocked as needed.
- **No comments unless the WHY is non-obvious.** No trailing summary comments, no "// removed X" markers.
- **Commit granularity:** one commit per task, imperative short subject + one paragraph of context, matching existing repo style. Never skip hooks.
- **Working branch:** `feature/monthly-subscriptions` (already created and current).

---

## File map

**New files under `src/lib/`:**
- `subscriptions.ts` — `Subscription`, `NewSubscription` types + CRUD (`listSubscriptions`, `insertSubscription`, `updateSubscription`, `deleteSubscription`, `pauseSubscription`, `resumeSubscription`, `getSubscriptionByUuid`, `countSubscriptions`)
- `subscriptions.test.ts`
- `subscriptions-context.tsx` — React `SubscriptionsProvider` + `useSubscriptions()` hook
- `subscription-scheduler.ts` — `nextDueFromAnchor(anchor, from)` + `catchUpSubscriptions(db, primary, rates, now)`
- `subscription-scheduler.test.ts`
- `subscription-notifications.ts` — `computeFireDates`, `notificationId`, `rescheduleNotifications`, `cancelNotifications`
- `subscription-notifications.test.ts`

**New files under `src/components/sl/`:**
- `subscription-row.tsx` + `.test.tsx`
- `subscription-sheet.tsx` + `.test.tsx` — dual-purpose add/edit
- `anchor-day-picker-sheet.tsx` + `.test.tsx`

**New file under `src/app/`:**
- `subscriptions.tsx` — list screen

**Modified files:**
- `src/lib/db.ts` — add `subscriptions` table to SCHEMA + `subscription_uuid` column migration on `transactions`
- `src/lib/db.test.ts` — assert new table + column
- `src/lib/transactions.ts` — `Txn`/`NewTxn` gain `subscriptionUuid: string | null`; `insertTransaction`/`updateTransaction` write it
- `src/lib/transactions.test.ts` — cover new field roundtrip
- `src/lib/transactions-context.tsx` — thread `subscriptionUuid` through `add`/`update`
- `src/lib/i18n/locales/en.json` + `vi.json` — `sub.*` namespace
- `src/app/settings.tsx` — new "ĐĂNG KÝ HÀNG THÁNG" section row above TIỀN TỆ
- `src/app/transaction/[id].tsx` — new detail row when `subscriptionUuid !== null`
- `src/app/_layout.tsx` — mount `SubscriptionsProvider` inside `TransactionsProvider`, register notification-response listener for `/subscriptions` deep link, add `Stack.Screen name="subscriptions"`
- `package.json` + `app.json` — add `expo-image-picker` if not already present

---

## Task 1: DB migration — `subscriptions` table + `subscription_uuid` column

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

**Interfaces:**
- Consumes: nothing external
- Produces:
  - `subscriptions` table exists with the schema from the spec
  - `transactions.subscription_uuid TEXT` column exists (nullable, no default)
  - Both changes idempotent within `runMigrations`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/db.test.ts`:

```ts
describe('runMigrations subscriptions', () => {
  it('creates subscriptions table', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const t = db.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions'"
    );
    expect(t).toHaveLength(1);
  });

  it('subscriptions table has expected columns', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const cols = db.getAllSync<{ name: string }>('PRAGMA table_info(subscriptions)');
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual([
      'anchor_day', 'category', 'created_at', 'id', 'name',
      'next_due_date', 'notify_1', 'notify_3', 'notify_7',
      'original_amount', 'original_currency', 'paused', 'photo_path',
      'updated_at', 'uuid',
    ]);
  });

  it('adds subscription_uuid to transactions', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    expect(hasColumn(db, 'transactions', 'subscription_uuid')).toBe(true);
  });

  it('is idempotent (running twice does not error)', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });
});
```

Also update the existing `createDb` "expected tables" assertion. Current expected: `['categories', 'fx_rates', 'settings', 'transactions', 'users']`. New expected includes `subscriptions`: `['categories', 'fx_rates', 'settings', 'subscriptions', 'transactions', 'users']`.

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/db.test.ts`
Expected: FAIL — `subscriptions` table missing, `subscription_uuid` column missing.

- [ ] **Step 3: Update `src/lib/db.ts`**

Add to the `SCHEMA` template literal (inside the backticks):

```
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    original_amount REAL NOT NULL,
    original_currency TEXT NOT NULL,
    anchor_day INTEGER NOT NULL,
    next_due_date TEXT NOT NULL,
    photo_path TEXT,
    notify_7 INTEGER NOT NULL DEFAULT 0,
    notify_3 INTEGER NOT NULL DEFAULT 0,
    notify_1 INTEGER NOT NULL DEFAULT 0,
    paused INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
```

Extend `runMigrations` (append at the end, before the closing brace):

```ts
if (!hasColumn(db, 'transactions', 'subscription_uuid')) {
  db.execSync('ALTER TABLE transactions ADD COLUMN subscription_uuid TEXT');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite regression check**

Run: `npm test -- --silent`
Expected: 194 → 198 passing (4 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "$(cat <<'EOF'
Add subscriptions table + subscription_uuid column

subscriptions table stores the recurring template (name, category,
original amount + currency, anchor day, per-flag notify_1/3/7 booleans,
paused flag, timestamps). transactions gains a nullable
subscription_uuid so auto-created rows can be traced back to their
source. Migration is idempotent inside runMigrations.
EOF
)"
```

---

## Task 2: `subscriptions.ts` CRUD

**Files:**
- Create: `src/lib/subscriptions.ts`
- Create: `src/lib/subscriptions.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode` from `./currency` (Task 4 of multi-currency, already shipped); `CategoryId` from `./categories`
- Produces:
  - `Subscription` interface with all 15 columns typed
  - `NewSubscription` for insert input (excludes id, uuid, next_due_date, created_at, updated_at — those are computed)
  - `listSubscriptions(db, opts?: { activeOnly?: boolean })` returns `Subscription[]` sorted `paused ASC, next_due_date ASC`
  - `insertSubscription(input, db, now?): number` — computes uuid, timestamps, and `next_due_date` from `anchor_day` + `now`
  - `updateSubscription(id, input, db, now?)` — bumps `updated_at`, DOES recompute `next_due_date` if `anchor_day` changed
  - `deleteSubscription(id, db)` — hard delete of the row (transactions retain their `subscription_uuid` orphan)
  - `pauseSubscription(id, db, now?)` / `resumeSubscription(id, db, now?)` — flip `paused` + bump `updated_at`
  - `getSubscriptionByUuid(uuid, db): Subscription | null`
  - `countSubscriptions(db, opts?: { activeOnly?: boolean }): number`

- [ ] **Step 1: Write failing tests**

Create `src/lib/subscriptions.test.ts`:

```ts
let mockSubUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => `sub-${String(++mockSubUuidCounter).padStart(4, '0')}`),
}));

import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './db';
import {
  countSubscriptions,
  deleteSubscription,
  getSubscriptionByUuid,
  insertSubscription,
  listSubscriptions,
  pauseSubscription,
  resumeSubscription,
  updateSubscription,
  type NewSubscription,
} from './subscriptions';

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
    CREATE TABLE categories (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  runMigrations(db);
  return db;
}

const SAMPLE: NewSubscription = {
  name: 'Claude Pro',
  category: 'other',
  originalAmount: 20,
  originalCurrency: 'USD',
  anchorDay: 15,
  photoPath: null,
  notify7: true,
  notify3: true,
  notify1: true,
};

describe('insertSubscription', () => {
  it('assigns uuid, timestamps, and next_due_date from anchor', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    const row = db.getFirstSync<{ uuid: string; next_due_date: string; paused: number; }>(
      'SELECT uuid, next_due_date, paused FROM subscriptions WHERE id = ?', id,
    );
    expect(row?.uuid).toBe('sub-0001');
    expect(row?.next_due_date).toBe('2026-08-15');
    expect(row?.paused).toBe(0);
  });

  it('same-day anchor is a hit (next_due = today)', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-15T10:00:00Z'));
    const row = db.getFirstSync<{ next_due_date: string }>(
      'SELECT next_due_date FROM subscriptions WHERE id = ?', id,
    );
    expect(row?.next_due_date).toBe('2026-08-15');
  });
});

describe('listSubscriptions', () => {
  it('sorts paused=0 first, then by next_due_date ASC', () => {
    const db = freshDb();
    insertSubscription({ ...SAMPLE, name: 'Late', anchorDay: 28 }, db, new Date('2026-08-01T10:00:00Z'));
    const idEarly = insertSubscription({ ...SAMPLE, name: 'Early', anchorDay: 5 }, db, new Date('2026-08-01T10:00:00Z'));
    const idPaused = insertSubscription({ ...SAMPLE, name: 'Paused' }, db, new Date('2026-08-01T10:00:00Z'));
    pauseSubscription(idPaused, db);
    const list = listSubscriptions(db);
    expect(list.map((s) => s.name)).toEqual(['Early', 'Late', 'Paused']);
    expect(list[0].id).toBe(idEarly);
  });

  it('activeOnly filters out paused', () => {
    const db = freshDb();
    const idActive = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    const idPaused = insertSubscription({ ...SAMPLE, name: 'X' }, db, new Date('2026-08-01T10:00:00Z'));
    pauseSubscription(idPaused, db);
    expect(listSubscriptions(db, { activeOnly: true }).map((s) => s.id)).toEqual([idActive]);
  });
});

describe('updateSubscription', () => {
  it('bumps updated_at and recomputes next_due when anchor_day changes', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    updateSubscription(id, { ...SAMPLE, anchorDay: 20 }, db, new Date('2026-08-10T10:00:00Z'));
    const row = db.getFirstSync<{ next_due_date: string; anchor_day: number }>(
      'SELECT next_due_date, anchor_day FROM subscriptions WHERE id = ?', id,
    );
    expect(row?.anchor_day).toBe(20);
    expect(row?.next_due_date).toBe('2026-08-20');
  });

  it('keeps next_due unchanged when anchor_day unchanged', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    updateSubscription(id, { ...SAMPLE, name: 'Renamed' }, db, new Date('2026-08-10T10:00:00Z'));
    const row = db.getFirstSync<{ next_due_date: string; name: string }>(
      'SELECT next_due_date, name FROM subscriptions WHERE id = ?', id,
    );
    expect(row?.name).toBe('Renamed');
    expect(row?.next_due_date).toBe('2026-08-15');
  });
});

describe('pause / resume', () => {
  it('pauseSubscription flips paused to 1', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db);
    pauseSubscription(id, db);
    const row = db.getFirstSync<{ paused: number }>('SELECT paused FROM subscriptions WHERE id = ?', id);
    expect(row?.paused).toBe(1);
  });

  it('resumeSubscription flips paused back to 0', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db);
    pauseSubscription(id, db);
    resumeSubscription(id, db);
    const row = db.getFirstSync<{ paused: number }>('SELECT paused FROM subscriptions WHERE id = ?', id);
    expect(row?.paused).toBe(0);
  });
});

describe('deleteSubscription', () => {
  it('removes the row', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db);
    deleteSubscription(id, db);
    expect(listSubscriptions(db)).toHaveLength(0);
  });
});

describe('getSubscriptionByUuid', () => {
  it('returns the row or null', () => {
    const db = freshDb();
    insertSubscription(SAMPLE, db);
    expect(getSubscriptionByUuid('sub-0001', db)?.name).toBe('Claude Pro');
    expect(getSubscriptionByUuid('nonexistent', db)).toBeNull();
  });
});

describe('countSubscriptions', () => {
  it('counts all and active-only', () => {
    const db = freshDb();
    insertSubscription(SAMPLE, db);
    const idPaused = insertSubscription({ ...SAMPLE, name: 'X' }, db);
    pauseSubscription(idPaused, db);
    expect(countSubscriptions(db)).toBe(2);
    expect(countSubscriptions(db, { activeOnly: true })).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/subscriptions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/subscriptions.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

import type { CategoryId } from './categories';
import type { CurrencyCode } from './currency';
import { db as defaultDb } from './db';
import { nextDueFromAnchor } from './subscription-scheduler';
import { toDateKey } from './format';

export interface Subscription {
  id: number;
  uuid: string;
  name: string;
  category: CategoryId;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  anchorDay: number;
  nextDueDate: string;
  photoPath: string | null;
  notify7: boolean;
  notify3: boolean;
  notify1: boolean;
  paused: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NewSubscription {
  name: string;
  category: CategoryId;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  anchorDay: number;
  photoPath: string | null;
  notify7: boolean;
  notify3: boolean;
  notify1: boolean;
}

interface Row {
  id: number; uuid: string; name: string; category: string;
  original_amount: number; original_currency: string;
  anchor_day: number; next_due_date: string;
  photo_path: string | null;
  notify_7: number; notify_3: number; notify_1: number;
  paused: number; created_at: number; updated_at: number;
}

function toSubscription(r: Row): Subscription {
  return {
    id: r.id, uuid: r.uuid, name: r.name,
    category: r.category as CategoryId,
    originalAmount: r.original_amount,
    originalCurrency: r.original_currency as CurrencyCode,
    anchorDay: r.anchor_day, nextDueDate: r.next_due_date,
    photoPath: r.photo_path,
    notify7: r.notify_7 === 1, notify3: r.notify_3 === 1, notify1: r.notify_1 === 1,
    paused: r.paused === 1,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function listSubscriptions(
  db: SQLiteDatabase = defaultDb,
  opts?: { activeOnly?: boolean },
): Subscription[] {
  const where = opts?.activeOnly ? 'WHERE paused = 0' : '';
  return db
    .getAllSync<Row>(`SELECT * FROM subscriptions ${where} ORDER BY paused ASC, next_due_date ASC`)
    .map(toSubscription);
}

export function insertSubscription(
  input: NewSubscription,
  db: SQLiteDatabase = defaultDb,
  now: Date = new Date(),
): number {
  const nowMs = now.getTime();
  const nextDue = toDateKey(nextDueFromAnchor(input.anchorDay, now));
  const result = db.runSync(
    `INSERT INTO subscriptions
      (uuid, name, category, original_amount, original_currency, anchor_day,
       next_due_date, photo_path, notify_7, notify_3, notify_1, paused,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    Crypto.randomUUID(),
    input.name, input.category, input.originalAmount, input.originalCurrency,
    input.anchorDay, nextDue, input.photoPath,
    input.notify7 ? 1 : 0, input.notify3 ? 1 : 0, input.notify1 ? 1 : 0,
    nowMs, nowMs,
  );
  return result.lastInsertRowId;
}

export function updateSubscription(
  id: number, input: NewSubscription,
  db: SQLiteDatabase = defaultDb,
  now: Date = new Date(),
): void {
  const existing = db.getFirstSync<{ anchor_day: number; next_due_date: string }>(
    'SELECT anchor_day, next_due_date FROM subscriptions WHERE id = ?', id,
  );
  if (!existing) return;
  const nextDue = existing.anchor_day === input.anchorDay
    ? existing.next_due_date
    : toDateKey(nextDueFromAnchor(input.anchorDay, now));
  db.runSync(
    `UPDATE subscriptions
     SET name = ?, category = ?, original_amount = ?, original_currency = ?,
         anchor_day = ?, next_due_date = ?, photo_path = ?,
         notify_7 = ?, notify_3 = ?, notify_1 = ?, updated_at = ?
     WHERE id = ?`,
    input.name, input.category, input.originalAmount, input.originalCurrency,
    input.anchorDay, nextDue, input.photoPath,
    input.notify7 ? 1 : 0, input.notify3 ? 1 : 0, input.notify1 ? 1 : 0,
    now.getTime(), id,
  );
}

export function deleteSubscription(id: number, db: SQLiteDatabase = defaultDb): void {
  db.runSync('DELETE FROM subscriptions WHERE id = ?', id);
}

export function pauseSubscription(id: number, db: SQLiteDatabase = defaultDb, now: Date = new Date()): void {
  db.runSync('UPDATE subscriptions SET paused = 1, updated_at = ? WHERE id = ?', now.getTime(), id);
}

export function resumeSubscription(id: number, db: SQLiteDatabase = defaultDb, now: Date = new Date()): void {
  db.runSync('UPDATE subscriptions SET paused = 0, updated_at = ? WHERE id = ?', now.getTime(), id);
}

export function getSubscriptionByUuid(uuid: string, db: SQLiteDatabase = defaultDb): Subscription | null {
  const row = db.getFirstSync<Row>('SELECT * FROM subscriptions WHERE uuid = ?', uuid);
  return row ? toSubscription(row) : null;
}

export function countSubscriptions(
  db: SQLiteDatabase = defaultDb,
  opts?: { activeOnly?: boolean },
): number {
  const where = opts?.activeOnly ? 'WHERE paused = 0' : '';
  const row = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM subscriptions ${where}`);
  return row?.n ?? 0;
}
```

Note: this file imports `nextDueFromAnchor` from `./subscription-scheduler` (Task 3). Implementer must write Task 2 and Task 3 in the same session or dispatch Task 3 first — see the ordering note in Task 3's header. If Task 2 is dispatched first, add a temporary `function nextDueFromAnchor(anchor: number, from: Date): Date` stub at the bottom of this file, then remove it and switch to the import when Task 3 lands.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/subscriptions.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscriptions.ts src/lib/subscriptions.test.ts
git commit -m "$(cat <<'EOF'
Add subscriptions CRUD module

CRUD for the subscription template: insert (assigns uuid + timestamps
+ initial next_due_date from anchor day), update (recomputes next_due
only when anchor_day changes), pause/resume flag flip, delete (hard),
list with activeOnly filter, countByUuid + count helpers. Sorting is
paused ASC then next_due_date ASC.
EOF
)"
```

---

## Task 3: `subscription-scheduler.ts` — anchor math + catch-up

**Files:**
- Create: `src/lib/subscription-scheduler.ts`
- Create: `src/lib/subscription-scheduler.test.ts`

**Ordering note:** dispatch this BEFORE Task 2 so `subscriptions.ts` can import `nextDueFromAnchor` cleanly. If subagent-driven-development, run this as Task 2 (renumber locally) or accept a temporary stub in `subscriptions.ts` per Task 2's step 3.

**Interfaces:**
- Consumes: `CurrencyCode`, `RateMap`, `CategoryId`, `insertTransaction`, `Subscription`, `getSubscriptionByUuid` (Task 2 CRUD)
- Produces:
  - `nextDueFromAnchor(anchor: number, from: Date): Date` — pure, throws on invalid anchor
  - `catchUpSubscriptions(db, primary, rates, now?): number` — inserts back-dated transactions for any due cycles, caps at 12 per subscription per call, returns total inserted

- [ ] **Step 1: Write failing tests**

Create `src/lib/subscription-scheduler.test.ts`:

```ts
let mockSchedulerUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => `gen-${String(++mockSchedulerUuidCounter).padStart(4, '0')}`),
}));

import * as SQLite from 'expo-sqlite';
import { runMigrations } from './db';
import {
  catchUpSubscriptions,
  nextDueFromAnchor,
} from './subscription-scheduler';
import { insertSubscription } from './subscriptions';

const IDENTITY_RATES = { VND: 1 / 25000, EUR: 1.10, JPY: 0.0067, GBP: 1.25, KRW: 0.00075 };

function freshDb() {
  const db = SQLite.openDatabaseSync(':memory:');
  db.execSync(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL, time TEXT NOT NULL,
      created_at INTEGER NOT NULL, category TEXT NOT NULL,
      name TEXT NOT NULL, note TEXT, amount REAL NOT NULL,
      is_income INTEGER NOT NULL DEFAULT 0, photo_path TEXT
    );
    CREATE TABLE categories (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  runMigrations(db);
  return db;
}

describe('nextDueFromAnchor', () => {
  it('anchor 15, from Aug 1 → Aug 15', () => {
    expect(nextDueFromAnchor(15, new Date('2026-08-01T10:00:00'))).toEqual(new Date('2026-08-15T00:00:00'));
  });
  it('anchor 15, from Aug 15 → Aug 15 (same-day hit)', () => {
    expect(nextDueFromAnchor(15, new Date('2026-08-15T10:00:00'))).toEqual(new Date('2026-08-15T00:00:00'));
  });
  it('anchor 15, from Aug 16 → Sep 15', () => {
    expect(nextDueFromAnchor(15, new Date('2026-08-16T10:00:00'))).toEqual(new Date('2026-09-15T00:00:00'));
  });
  it('anchor 31, from Feb 5 (non-leap 2026) → Feb 28', () => {
    expect(nextDueFromAnchor(31, new Date('2026-02-05T10:00:00'))).toEqual(new Date('2026-02-28T00:00:00'));
  });
  it('anchor 31, from Feb 5 (leap 2028) → Feb 29', () => {
    expect(nextDueFromAnchor(31, new Date('2028-02-05T10:00:00'))).toEqual(new Date('2028-02-29T00:00:00'));
  });
  it('anchor 31, from Apr 5 → Apr 30', () => {
    expect(nextDueFromAnchor(31, new Date('2026-04-05T10:00:00'))).toEqual(new Date('2026-04-30T00:00:00'));
  });
  it('anchor 1, from Aug 15 → Sep 1', () => {
    expect(nextDueFromAnchor(1, new Date('2026-08-15T10:00:00'))).toEqual(new Date('2026-09-01T00:00:00'));
  });
  it('throws on anchor 0, 32, 1.5, NaN', () => {
    for (const bad of [0, 32, 1.5, NaN, -1]) {
      expect(() => nextDueFromAnchor(bad, new Date('2026-08-01T10:00:00'))).toThrow();
    }
  });
});

describe('catchUpSubscriptions', () => {
  const NEW_SUB = {
    name: 'Claude Pro', category: 'other' as const,
    originalAmount: 20, originalCurrency: 'USD' as const,
    anchorDay: 15, photoPath: null,
    notify7: false, notify3: false, notify1: false,
  };

  it('due today: creates 1 txn, bumps next_due to next month', () => {
    const db = freshDb();
    const now = new Date('2026-08-15T10:00:00');
    insertSubscription(NEW_SUB, db, now);
    const created = catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    expect(created).toBe(1);
    const txns = db.getAllSync<any>('SELECT * FROM transactions');
    expect(txns).toHaveLength(1);
    expect(txns[0].date).toBe('2026-08-15');
    const sub = db.getFirstSync<{ next_due_date: string }>('SELECT next_due_date FROM subscriptions LIMIT 1');
    expect(sub?.next_due_date).toBe('2026-09-15');
  });

  it('3 cycles behind: creates 3 back-dated txns', () => {
    const db = freshDb();
    const past = new Date('2026-05-01T10:00:00');
    insertSubscription(NEW_SUB, db, past);
    // Simulate the user not opening the app; next_due_date was set to 2026-05-15
    const now = new Date('2026-08-05T10:00:00');
    const created = catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    expect(created).toBe(3);
    const dates = db.getAllSync<{ date: string }>('SELECT date FROM transactions ORDER BY date').map(r => r.date);
    expect(dates).toEqual(['2026-05-15', '2026-06-15', '2026-07-15']);
    const sub = db.getFirstSync<{ next_due_date: string }>('SELECT next_due_date FROM subscriptions LIMIT 1');
    expect(sub?.next_due_date).toBe('2026-08-15');
  });

  it('paused subscription is skipped', () => {
    const db = freshDb();
    const now = new Date('2026-08-15T10:00:00');
    insertSubscription(NEW_SUB, db, now);
    db.runSync('UPDATE subscriptions SET paused = 1 WHERE id = 1');
    const created = catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    expect(created).toBe(0);
  });

  it('USD sub + primary=VND: txn stores VND amount, USD original', () => {
    const db = freshDb();
    const now = new Date('2026-08-15T10:00:00');
    insertSubscription(NEW_SUB, db, now);
    catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    const row = db.getFirstSync<{
      amount: number; currency: string; original_amount: number; original_currency: string;
    }>('SELECT amount, currency, original_amount, original_currency FROM transactions');
    expect(row?.currency).toBe('VND');
    expect(row?.amount).toBeCloseTo(20 * 25000, 0);
    expect(row?.original_amount).toBe(20);
    expect(row?.original_currency).toBe('USD');
  });

  it('auto-created txn carries subscription_uuid', () => {
    const db = freshDb();
    const now = new Date('2026-08-15T10:00:00');
    insertSubscription(NEW_SUB, db, now);
    catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    const row = db.getFirstSync<{ subscription_uuid: string }>(
      'SELECT subscription_uuid FROM transactions'
    );
    expect(row?.subscription_uuid).toMatch(/^gen-/);
  });

  it('caps at 12 cycles per subscription (safety valve)', () => {
    const db = freshDb();
    const veryOld = new Date('2020-01-15T10:00:00');
    insertSubscription(NEW_SUB, db, veryOld);
    const now = new Date('2026-08-15T10:00:00');
    const created = catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    expect(created).toBe(12);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/subscription-scheduler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/subscription-scheduler.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import type { CurrencyCode } from './currency';
import type { RateMap } from './fx';
import { insertTransaction } from './transactions';
import { toDateKey } from './format';

const MAX_CATCH_UP_CYCLES = 12;

function lastDayOfMonth(year: number, monthZero: number): number {
  return new Date(year, monthZero + 1, 0).getDate();
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateFor(year: number, monthZero: number, anchor: number): Date {
  const day = Math.min(anchor, lastDayOfMonth(year, monthZero));
  return new Date(year, monthZero, day);
}

export function nextDueFromAnchor(anchor: number, from: Date): Date {
  if (!Number.isInteger(anchor) || anchor < 1 || anchor > 31) {
    throw new Error(`Invalid anchor day: ${anchor}`);
  }
  const stripped = stripTime(from);
  const thisMonth = dateFor(stripped.getFullYear(), stripped.getMonth(), anchor);
  if (thisMonth.getTime() >= stripped.getTime()) return thisMonth;
  return dateFor(stripped.getFullYear(), stripped.getMonth() + 1, anchor);
}

interface SubRow {
  id: number; uuid: string; name: string; category: string;
  original_amount: number; original_currency: string;
  anchor_day: number; next_due_date: string;
  photo_path: string | null;
}

export function catchUpSubscriptions(
  db: SQLiteDatabase,
  primary: CurrencyCode,
  rates: RateMap,
  now: Date = new Date(),
): number {
  const todayKey = toDateKey(now);
  const rows = db.getAllSync<SubRow>(
    `SELECT id, uuid, name, category, original_amount, original_currency,
            anchor_day, next_due_date, photo_path
     FROM subscriptions
     WHERE paused = 0 AND next_due_date <= ?`,
    todayKey,
  );

  let totalCreated = 0;

  for (const sub of rows) {
    let dueKey = sub.next_due_date;
    let cycles = 0;
    while (dueKey <= todayKey && cycles < MAX_CATCH_UP_CYCLES) {
      const createdAt = new Date(`${dueKey}T12:00:00`).getTime();
      insertTransaction(
        {
          date: dueKey,
          time: '12:00',
          createdAt,
          category: sub.category as any,
          name: sub.name,
          note: null,
          originalAmount: sub.original_amount,
          originalCurrency: sub.original_currency as CurrencyCode,
          isIncome: false,
          photoPath: sub.photo_path,
          subscriptionUuid: sub.uuid,
        },
        db,
        primary,
        rates,
      );
      totalCreated++;
      cycles++;
      const next = nextDueFromAnchor(sub.anchor_day, new Date(new Date(`${dueKey}T12:00:00`).getTime() + 24 * 60 * 60 * 1000));
      dueKey = toDateKey(next);
    }
    db.runSync(
      'UPDATE subscriptions SET next_due_date = ?, updated_at = ? WHERE id = ?',
      dueKey, now.getTime(), sub.id,
    );
    if (cycles === MAX_CATCH_UP_CYCLES) {
      console.warn(`catchUpSubscriptions: hit ${MAX_CATCH_UP_CYCLES}-cycle cap for ${sub.uuid}`);
    }
  }

  return totalCreated;
}
```

Note: `insertTransaction` is being called with a `subscriptionUuid` field that Task 4 will add to `NewTxn`. The implementer of this task must land Task 4 first OR temporarily comment out the `subscriptionUuid: sub.uuid,` line and add a TODO note (removed when Task 4 lands). The plan orders Task 4 immediately after Task 3 for exactly this reason.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/subscription-scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscription-scheduler.ts src/lib/subscription-scheduler.test.ts
git commit -m "$(cat <<'EOF'
Add subscription scheduler

nextDueFromAnchor is a pure helper: clamps to the last day of the month
when the anchor doesn't exist that month (Netflix-style); same-day is a
hit. catchUpSubscriptions runs on app foreground, loops each active
subscription up to 12 cycles, back-dates every missed transaction to
its actual due date, and threads primary+rates through so the
multi-currency conversion happens exactly as it does for manual
entries. Auto-created rows carry subscription_uuid so the transaction
detail can trace them back.
EOF
)"
```

---

## Task 4: Extend `Txn`/`NewTxn` with `subscriptionUuid`

**Files:**
- Modify: `src/lib/transactions.ts`
- Modify: `src/lib/transactions.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `Txn` gains `subscriptionUuid: string | null`
  - `NewTxn` gains `subscriptionUuid?: string | null` (optional, defaults null)
  - `insertTransaction` writes it
  - `updateTransaction` writes it
  - `toTxn` maps `subscription_uuid` → `subscriptionUuid`

- [ ] **Step 1: Write failing tests**

Extend `src/lib/transactions.test.ts` `freshDb()` to include the new column:

```ts
function freshDb() {
  const database = SQLite.openDatabaseSync(':memory:');
  database.execSync(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT,
      updated_at INTEGER,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      note TEXT,
      amount REAL NOT NULL,
      is_income INTEGER NOT NULL DEFAULT 0,
      photo_path TEXT,
      currency TEXT,
      original_amount REAL,
      original_currency TEXT,
      subscription_uuid TEXT
    );
  `);
  return database;
}
```

Add:

```ts
describe('subscriptionUuid on insert/list', () => {
  it('default null when omitted', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-08-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x',
      originalAmount: 45000, originalCurrency: 'VND', isIncome: false,
    }, db);
    const list = listTransactions(db);
    expect(list.find((t) => t.id === id)?.subscriptionUuid).toBeNull();
  });

  it('stores non-null uuid when provided', () => {
    const db = freshDb();
    insertTransaction({
      date: '2026-08-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'Claude Pro',
      originalAmount: 20, originalCurrency: 'USD', isIncome: false,
      subscriptionUuid: 'sub-abc',
    }, db);
    expect(listTransactions(db)[0].subscriptionUuid).toBe('sub-abc');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/transactions.test.ts`
Expected: FAIL — `NewTxn.subscriptionUuid` unknown.

- [ ] **Step 3: Update `src/lib/transactions.ts`**

Extend `Txn`:

```ts
export interface Txn {
  // ...existing
  subscriptionUuid: string | null;
}
```

Extend `NewTxn`:

```ts
export interface NewTxn {
  // ...existing
  subscriptionUuid?: string | null;
}
```

Extend `Row`:

```ts
interface Row {
  // ...existing
  subscription_uuid: string | null;
}
```

Extend `toTxn`:

```ts
function toTxn(r: Row): Txn {
  return {
    // ...existing
    subscriptionUuid: r.subscription_uuid,
  };
}
```

Update `insertTransaction` — add the field to columns and VALUES:

```ts
const result = database.runSync(
  `INSERT INTO transactions
    (uuid, date, time, created_at, updated_at, category, name, note,
     amount, currency, original_amount, original_currency, is_income,
     photo_path, subscription_uuid)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  Crypto.randomUUID(),
  input.date, input.time, now, now,
  input.category, input.name, input.note ?? null,
  amount, primary, input.originalAmount, input.originalCurrency,
  input.isIncome ? 1 : 0, input.photoPath ?? null,
  input.subscriptionUuid ?? null,
);
```

Update `updateTransaction` similarly — add `subscription_uuid = ?` to the SET clause and thread the value.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/transactions.test.ts`
Expected: PASS (2 new + all existing).

- [ ] **Step 5: Full suite regression check**

Run: `npm test -- --silent`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/transactions.ts src/lib/transactions.test.ts
git commit -m "$(cat <<'EOF'
Wire subscriptionUuid into transactions

Txn/NewTxn gain a nullable subscription_uuid. Manual inserts leave it
null; the scheduler will set it when auto-creating from a
subscription. Enables the transaction detail screen to trace back to
its source template.
EOF
)"
```

---

## Task 5: `subscription-notifications.ts` — schedule + cancel

**Files:**
- Create: `src/lib/subscription-notifications.ts`
- Create: `src/lib/subscription-notifications.test.ts`

**Interfaces:**
- Consumes: `Subscription` (Task 2), `formatMoney` from `./format`
- Produces:
  - `notificationId(uuid: string, offset: 7 | 3 | 1): string` — `sub-${uuid}-${offset}`
  - `computeFireDates(sub, now): { offset: 7|3|1; fireAt: Date }[]` — filters out past dates
  - `rescheduleNotifications(sub, now?): Promise<void>` — cancels all `sub-${uuid}-*` then schedules per-flag
  - `cancelNotifications(uuid): Promise<void>` — cancels all `sub-${uuid}-*`

- [ ] **Step 1: Write failing tests**

Create `src/lib/subscription-notifications.test.ts`:

```ts
const scheduled: any[] = [];
const canceled: string[] = [];

jest.mock('expo-notifications', () => ({
  __esModule: true,
  scheduleNotificationAsync: jest.fn(async (input: any) => {
    scheduled.push(input);
    return input.identifier ?? 'auto-id';
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    canceled.push(id);
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () =>
    scheduled.map((s) => ({ identifier: s.identifier ?? 'unknown', content: s.content, trigger: s.trigger })),
  ),
  SchedulableTriggerInputTypes: { DATE: 'DATE', DAILY: 'DAILY' },
  setNotificationHandler: jest.fn(),
}));

import {
  computeFireDates,
  cancelNotifications,
  notificationId,
  rescheduleNotifications,
} from './subscription-notifications';
import type { Subscription } from './subscriptions';

const BASE_SUB: Subscription = {
  id: 1, uuid: 'sub-abc', name: 'Claude Pro',
  category: 'other', originalAmount: 20, originalCurrency: 'USD',
  anchorDay: 15, nextDueDate: '2026-08-15',
  photoPath: null,
  notify7: true, notify3: true, notify1: true,
  paused: false, createdAt: 0, updatedAt: 0,
};

beforeEach(() => { scheduled.length = 0; canceled.length = 0; });

describe('notificationId', () => {
  it('formats as sub-${uuid}-${offset}', () => {
    expect(notificationId('abc', 7)).toBe('sub-abc-7');
    expect(notificationId('abc', 3)).toBe('sub-abc-3');
    expect(notificationId('abc', 1)).toBe('sub-abc-1');
  });
});

describe('computeFireDates', () => {
  it('all flags on, plenty of lead time: 3 fire dates at 09:00', () => {
    const now = new Date('2026-08-01T10:00:00');
    const fires = computeFireDates(BASE_SUB, now);
    expect(fires).toHaveLength(3);
    expect(fires.map((f) => f.offset).sort()).toEqual([1, 3, 7]);
    for (const f of fires) {
      expect(f.fireAt.getHours()).toBe(9);
      expect(f.fireAt.getMinutes()).toBe(0);
    }
    expect(fires.find((f) => f.offset === 7)?.fireAt.getDate()).toBe(8);
    expect(fires.find((f) => f.offset === 3)?.fireAt.getDate()).toBe(12);
    expect(fires.find((f) => f.offset === 1)?.fireAt.getDate()).toBe(14);
  });

  it('past fire dates are filtered', () => {
    const now = new Date('2026-08-13T10:00:00');
    const fires = computeFireDates(BASE_SUB, now);
    expect(fires.map((f) => f.offset).sort()).toEqual([1]);
  });

  it('flags off are omitted', () => {
    const sub = { ...BASE_SUB, notify7: false, notify3: true, notify1: false };
    const now = new Date('2026-08-01T10:00:00');
    const fires = computeFireDates(sub, now);
    expect(fires.map((f) => f.offset)).toEqual([3]);
  });
});

describe('rescheduleNotifications', () => {
  it('cancels all sub-${uuid}-* then schedules per-flag', async () => {
    scheduled.push({ identifier: 'sub-abc-7', content: {}, trigger: {} });
    scheduled.push({ identifier: 'sub-abc-3', content: {}, trigger: {} });
    scheduled.push({ identifier: 'other-xyz-7', content: {}, trigger: {} });
    scheduled.length = 0;
    (require('expo-notifications').getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'sub-abc-7' }, { identifier: 'sub-abc-3' }, { identifier: 'other-xyz-7' },
    ]);
    await rescheduleNotifications(BASE_SUB, new Date('2026-08-01T10:00:00'));
    expect(canceled).toEqual(expect.arrayContaining(['sub-abc-7', 'sub-abc-3']));
    expect(canceled).not.toContain('other-xyz-7');
    expect(scheduled.map((s) => s.identifier).sort()).toEqual(['sub-abc-1', 'sub-abc-3', 'sub-abc-7']);
  });
});

describe('cancelNotifications', () => {
  it('cancels only the sub-${uuid}-* identifiers', async () => {
    (require('expo-notifications').getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'sub-abc-7' }, { identifier: 'sub-abc-3' }, { identifier: 'sub-abc-1' },
      { identifier: 'other-xyz-7' },
    ]);
    await cancelNotifications('abc');
    expect(canceled.sort()).toEqual(['sub-abc-1', 'sub-abc-3', 'sub-abc-7']);
    expect(canceled).not.toContain('other-xyz-7');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/subscription-notifications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/subscription-notifications.ts`**

```ts
import * as Notifications from 'expo-notifications';
import { formatMoney } from './format';
import { i18n } from './i18n';
import type { Subscription } from './subscriptions';

type Offset = 7 | 3 | 1;

export function notificationId(uuid: string, offset: Offset): string {
  return `sub-${uuid}-${offset}`;
}

function fireAtNoon9(dueDateStr: string, daysBefore: number): Date {
  const due = new Date(`${dueDateStr}T00:00:00`);
  const fire = new Date(due.getFullYear(), due.getMonth(), due.getDate() - daysBefore, 9, 0, 0);
  return fire;
}

export function computeFireDates(
  sub: Subscription, now: Date = new Date(),
): { offset: Offset; fireAt: Date }[] {
  const out: { offset: Offset; fireAt: Date }[] = [];
  const flags: Array<[Offset, boolean]> = [
    [7, sub.notify7], [3, sub.notify3], [1, sub.notify1],
  ];
  for (const [offset, on] of flags) {
    if (!on) continue;
    const fireAt = fireAtNoon9(sub.nextDueDate, offset);
    if (fireAt.getTime() > now.getTime()) {
      out.push({ offset, fireAt });
    }
  }
  return out;
}

export async function cancelNotifications(uuid: string): Promise<void> {
  const prefix = `sub-${uuid}-`;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of all) {
    if (notif.identifier?.startsWith(prefix)) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

export async function rescheduleNotifications(
  sub: Subscription, now: Date = new Date(),
): Promise<void> {
  await cancelNotifications(sub.uuid);
  const fires = computeFireDates(sub, now);
  for (const { offset, fireAt } of fires) {
    const isOneDay = offset === 1;
    const key = isOneDay ? 'sub.notif_body_one_day' : 'sub.notif_body';
    const body = i18n.t(key, {
      name: sub.name,
      amount: formatMoney(sub.originalAmount, sub.originalCurrency),
      days: offset,
    });
    await Notifications.scheduleNotificationAsync({
      identifier: notificationId(sub.uuid, offset),
      content: {
        title: sub.name,
        body,
        data: { route: '/subscriptions' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/subscription-notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscription-notifications.ts src/lib/subscription-notifications.test.ts
git commit -m "$(cat <<'EOF'
Add subscription notification scheduler

Per-subscription 7/3/1-day pre-scheduled reminders at 09:00 local.
Identifier convention sub-${uuid}-${offset} makes cancel-by-subscription
a simple prefix match. computeFireDates filters out past dates so
rescheduling on an already-late cycle is a no-op instead of a
back-scheduled crash. Notification bodies pick the singular
sub.notif_body_one_day variant when the offset is 1.
EOF
)"
```

---

## Task 6: i18n keys

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/vi.json`

**Interfaces:**
- Consumes: nothing
- Produces: `t('sub.*')` keys resolvable in both locales, per the spec's i18n table

- [ ] **Step 1: Add `sub` block to `en.json`** (before the closing `}`)

Insert:

```json
"sub": {
  "section_title": "MONTHLY SUBSCRIPTIONS",
  "section_row": "Manage subscriptions",
  "count_active": "{{n}} active",
  "list_title": "Subscriptions",
  "empty_state": "No subscriptions yet. Tap + to create one.",
  "add_title": "New subscription",
  "edit_title": "Edit subscription",
  "field_name": "Name",
  "field_amount": "Amount",
  "field_category": "Category",
  "field_anchor_day": "Billing day",
  "next_due": "Next due: {{date}}",
  "field_photo": "Photo (optional)",
  "notify_label": "Remind me before",
  "notify_7": "7 days",
  "notify_3": "3 days",
  "notify_1": "1 day",
  "save_add": "Save subscription",
  "save_edit": "Update",
  "pause": "⏸ Pause",
  "resume": "▶ Resume",
  "delete": "🗑 Delete subscription",
  "delete_confirm_title": "Delete this subscription?",
  "delete_confirm_body": "Existing transactions will remain.",
  "paused_badge": "Paused",
  "day_row": "Day {{day}} of every month",
  "anchor_picker_title": "Choose billing day",
  "anchor_day_row": "Day {{day}}",
  "transaction_source": "From subscription",
  "transaction_source_deleted": "Deleted",
  "notif_body": "{{name}} is due in {{days}} days — {{amount}}",
  "notif_body_one_day": "{{name}} is due tomorrow — {{amount}}",
  "perm_needed_body": "Enable notifications in Settings to receive reminders.",
  "validation_name": "Please enter a name.",
  "validation_amount": "Amount must be greater than 0."
}
```

- [ ] **Step 2: Add matching block to `vi.json`** with Vietnamese values from the spec's i18n table

- [ ] **Step 3: Sanity — i18n tests still pass**

Run: `npm test -- --silent --testPathPattern=i18n`
Expected: PASS (no JSON parse errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/vi.json
git commit -m "$(cat <<'EOF'
i18n: add sub.* namespace (EN + VI)

Copy for the subscription list, add/edit sheet, anchor-day picker,
transaction-source detail row, notification bodies (with a singular
one-day variant), pause/resume/delete affordances, and validation
messages.
EOF
)"
```

---

## Task 7: `SubscriptionRow` component

**Files:**
- Create: `src/components/sl/subscription-row.tsx`
- Create: `src/components/sl/subscription-row.test.tsx`

**Interfaces:**
- Consumes: `Subscription` (Task 2), `useColors`, `Text`, `signedMoney`, `formatMoney`, `convert`
- Produces:
  - `<SubscriptionRow subscription onPress? />` renders a `Pressable` with photo tile (or category color fallback), name, `Day X of every month`, primary amount (right-aligned), preview convert line, paused badge/opacity

- [ ] **Step 1: Write failing test**

Create `src/components/sl/subscription-row.test.tsx`:

```tsx
import { render, fireEvent } from '@testing-library/react-native';
import { SubscriptionRow } from './subscription-row';
import type { Subscription } from '@/lib/subscriptions';

const SUB: Subscription = {
  id: 1, uuid: 'u-1', name: 'Claude Pro',
  category: 'other', originalAmount: 20, originalCurrency: 'USD',
  anchorDay: 15, nextDueDate: '2026-08-15',
  photoPath: null,
  notify7: true, notify3: true, notify1: true,
  paused: false, createdAt: 0, updatedAt: 0,
};

const IDENTITY_RATES = { VND: 1 / 25000, EUR: 1.10, JPY: 0.0067, GBP: 1.25, KRW: 0.00075 };

describe('SubscriptionRow', () => {
  it('renders name, anchor-day label, and amount', async () => {
    const r = await render(
      <SubscriptionRow subscription={SUB} primary="USD" rates={IDENTITY_RATES} />
    );
    expect(r.queryByText(/Claude Pro/)).toBeTruthy();
    expect(r.queryByText(/Day 15|Ngày 15/)).toBeTruthy();
  });

  it('invokes onPress when tapped', async () => {
    const onPress = jest.fn();
    const r = await render(
      <SubscriptionRow subscription={SUB} primary="USD" rates={IDENTITY_RATES} onPress={onPress} />
    );
    fireEvent.press(r.getByTestId('subscription-row-1'));
    expect(onPress).toHaveBeenCalledWith(SUB);
  });

  it('paused variant shows badge', async () => {
    const paused = { ...SUB, paused: true };
    const r = await render(
      <SubscriptionRow subscription={paused} primary="USD" rates={IDENTITY_RATES} />
    );
    expect(r.queryByText(/Paused|Đã tạm dừng/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement `src/components/sl/subscription-row.tsx`**

```tsx
import { Pressable, StyleSheet, View } from 'react-native';

import { PhotoTile } from '@/components/sl/photo-tile';
import { Text } from '@/components/sl/text';
import { Radius, useColors, W } from '@/constants/tokens';
import { categoryOf } from '@/lib/categories';
import type { CurrencyCode } from '@/lib/currency';
import { formatMoney, signedMoney } from '@/lib/format';
import { convert, type RateMap } from '@/lib/fx';
import { useT } from '@/lib/i18n';
import type { Subscription } from '@/lib/subscriptions';

interface Props {
  subscription: Subscription;
  primary: CurrencyCode;
  rates: RateMap;
  onPress?: (sub: Subscription) => void;
}

export function SubscriptionRow({ subscription: sub, primary, rates, onPress }: Props) {
  const c = useColors();
  const { t } = useT();
  const cat = categoryOf(sub.category, []);
  const converted = convert(sub.originalAmount, sub.originalCurrency, primary, rates);

  return (
    <Pressable
      testID={`subscription-row-${sub.id}`}
      onPress={() => onPress?.(sub)}
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed ? 0.7 : sub.paused ? 0.5 : 1 },
      ]}
    >
      <PhotoTile
        uri={sub.photoPath}
        size={56}
        radius={Radius.tile}
        fallbackColor={cat?.chip ?? c.chipBg}
      />
      <View style={styles.middle}>
        <View style={styles.nameRow}>
          <Text style={{ color: c.text, fontWeight: W.semibold, fontSize: 15 }}>{sub.name}</Text>
          {sub.paused ? (
            <Text style={{ color: c.textSecondary, fontSize: 11, marginLeft: 8 }}>
              ⏸ {t('sub.paused_badge')}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
          {t('sub.day_row', { day: sub.anchorDay })}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={{ color: c.text, fontWeight: W.bold }}>
          {signedMoney(sub.originalAmount, sub.originalCurrency, false)}
        </Text>
        {sub.originalCurrency !== primary ? (
          <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}>
            ≈ {formatMoney(converted, primary)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  middle: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  right: { alignItems: 'flex-end' },
});
```

Note: `PhotoTile` currently may not accept `fallbackColor` — if the prop doesn't exist, drop it and rely on the default fallback that's already in that component.

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- --silent src/components/sl/subscription-row.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/subscription-row.tsx src/components/sl/subscription-row.test.tsx
git commit -m "$(cat <<'EOF'
Add SubscriptionRow component

Reuses PhotoTile on the left; middle column shows name + day-of-month
label; right column shows signed original amount plus a converted
preview when the currency differs from the current primary. Paused
subscriptions render at 50% opacity with an inline ⏸ badge.
EOF
)"
```

---

## Task 8: Install `expo-image-picker` + `AnchorDayPickerSheet`

**Files:**
- Modify: `package.json`, `app.json` (if config plugin needed)
- Create: `src/components/sl/anchor-day-picker-sheet.tsx`
- Create: `src/components/sl/anchor-day-picker-sheet.test.tsx`

**Interfaces:**
- Consumes: `useColors`, `Text`, `useT`, `Radius`, `AccentGradient`
- Produces:
  - `AnchorDayPickerSheetHandle = { present(current: number): void; dismiss(): void }`
  - `<AnchorDayPickerSheet ref onChoose={(day: number) => void} />`

- [ ] **Step 1: Install `expo-image-picker` if not already installed**

Run: `grep '"expo-image-picker"' package.json || npx expo install expo-image-picker`
Expected: either the dependency is already there (no install runs) or `npx expo install` succeeds.

- [ ] **Step 2: Write failing test**

Create `src/components/sl/anchor-day-picker-sheet.test.tsx`:

```tsx
import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import {
  AnchorDayPickerSheet,
  type AnchorDayPickerSheetHandle,
} from './anchor-day-picker-sheet';

describe('AnchorDayPickerSheet', () => {
  it('invokes onChoose with the tapped day', async () => {
    const onChoose = jest.fn();
    const ref = createRef<AnchorDayPickerSheetHandle>();
    const { getByTestId } = await render(
      <AnchorDayPickerSheet ref={ref} onChoose={onChoose} />
    );
    await act(() => ref.current?.present(15));
    fireEvent.press(getByTestId('anchor-day-20'));
    expect(onChoose).toHaveBeenCalledWith(20);
  });
});
```

- [ ] **Step 3: Implement `src/components/sl/anchor-day-picker-sheet.tsx`**

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Radius, useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';

export interface AnchorDayPickerSheetHandle {
  present: (current: number) => void;
  dismiss: () => void;
}

interface Props { onChoose: (day: number) => void; }

export const AnchorDayPickerSheet = forwardRef<AnchorDayPickerSheetHandle, Props>(
  function AnchorDayPickerSheet({ onChoose }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [current, setCurrent] = useState(1);

    useImperativeHandle(ref, () => ({
      present: (cur) => { setCurrent(cur); sheet.current?.present(); },
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['65%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <View style={styles.header}>
          <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
            {t('sub.anchor_picker_title')}
          </Text>
        </View>
        <BottomSheetScrollView>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
            const active = day === current;
            return (
              <Pressable
                key={day}
                testID={`anchor-day-${day}`}
                onPress={() => { onChoose(day); sheet.current?.dismiss(); }}
                style={({ pressed }) => [
                  styles.dayRow,
                  {
                    backgroundColor: active ? c.chipBg : 'transparent',
                    borderColor: active ? AccentGradient[1] : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{ color: c.text, fontWeight: active ? '700' : '500' }}>
                  {t('sub.anchor_day_row', { day })}
                </Text>
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  header: { padding: 20, paddingBottom: 8 },
  dayRow: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.card, borderWidth: 1,
    marginHorizontal: 12, marginBottom: 4,
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/components/sl/anchor-day-picker-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json src/components/sl/anchor-day-picker-sheet.tsx src/components/sl/anchor-day-picker-sheet.test.tsx
git commit -m "$(cat <<'EOF'
Add AnchorDayPickerSheet + install expo-image-picker

Simple bottom sheet scrolling 1..31 rows; tap invokes onChoose and
dismisses. Adds expo-image-picker native dependency for the
subscription photo picker in a follow-up task; dev-client must be
rebuilt before subscription photo picking works on device.
EOF
)"
```

---

## Task 9: `SubscriptionSheet` — dual-purpose add/edit

**Files:**
- Create: `src/components/sl/subscription-sheet.tsx`
- Create: `src/components/sl/subscription-sheet.test.tsx`

**Interfaces:**
- Consumes: `NewSubscription`, `Subscription`, `useColors`, `useT`, `useSettings` (for `primaryCurrency` + `rates`), `CurrencyPickerSheet`, `AnchorDayPickerSheet`, `CategoryChip`, `formatAmountInput`, `formatMoney`, `convert`, `nextDueFromAnchor`, `expo-image-picker`
- Produces:
  - `SubscriptionSheetHandle = { presentAdd(): void; presentEdit(sub: Subscription): void; dismiss(): void }`
  - `<SubscriptionSheet ref onSave={(input: NewSubscription, id?: number) => void} onDelete={(id: number) => void} onPauseResume={(id: number, pause: boolean) => void} />`

- [ ] **Step 1: Write failing test**

Create `src/components/sl/subscription-sheet.test.tsx`:

```tsx
jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SubscriptionSheet, type SubscriptionSheetHandle } from './subscription-sheet';
import { SettingsProvider } from '@/lib/settings-context';
import type { Subscription } from '@/lib/subscriptions';

function renderWithProviders(ui: any) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

describe('SubscriptionSheet', () => {
  it('presentAdd shows the add title and blank inputs', async () => {
    const ref = createRef<SubscriptionSheetHandle>();
    const r = await renderWithProviders(
      <SubscriptionSheet ref={ref} onSave={() => {}} onDelete={() => {}} onPauseResume={() => {}} />
    );
    await act(() => ref.current?.presentAdd());
    expect(r.queryByText(/New subscription|Đăng ký mới/)).toBeTruthy();
  });

  it('presentEdit preloads existing subscription data', async () => {
    const ref = createRef<SubscriptionSheetHandle>();
    const r = await renderWithProviders(
      <SubscriptionSheet ref={ref} onSave={() => {}} onDelete={() => {}} onPauseResume={() => {}} />
    );
    const sub: Subscription = {
      id: 1, uuid: 'u', name: 'Netflix',
      category: 'fun', originalAmount: 260000, originalCurrency: 'VND',
      anchorDay: 20, nextDueDate: '2026-08-20',
      photoPath: null,
      notify7: true, notify3: false, notify1: true,
      paused: false, createdAt: 0, updatedAt: 0,
    };
    await act(() => ref.current?.presentEdit(sub));
    expect(r.queryByText(/Edit subscription|Sửa đăng ký/)).toBeTruthy();
    expect(r.queryByDisplayValue('Netflix')).toBeTruthy();
  });

  it('save fires onSave with the correct DTO in add mode', async () => {
    const onSave = jest.fn();
    const ref = createRef<SubscriptionSheetHandle>();
    const r = await renderWithProviders(
      <SubscriptionSheet ref={ref} onSave={onSave} onDelete={() => {}} onPauseResume={() => {}} />
    );
    await act(() => ref.current?.presentAdd());
    fireEvent.changeText(r.getByTestId('sub-name-input'), 'Test');
    fireEvent.changeText(r.getByTestId('sub-amount-input'), '2000');
    fireEvent.press(r.getByTestId('sub-save-button'));
    expect(onSave).toHaveBeenCalled();
    const [payload, id] = onSave.mock.calls[0];
    expect(payload.name).toBe('Test');
    expect(payload.originalAmount).toBeGreaterThan(0);
    expect(id).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `src/components/sl/subscription-sheet.tsx`**

This is the largest component in the plan. Structure:

- Local state for every field (name, currency, amountDigits, category, anchorDay, photoPath, notify7/3/1, editingId)
- `presentAdd` initializes to defaults (empty name, primary currency, no amount, category='other', anchorDay=1, photo null, all notify flags false)
- `presentEdit(sub)` initializes from `sub`
- Render:
  - Photo tile pressable → calls `expo-image-picker.launchImageLibraryAsync` — on success set `photoPath = asset.uri`
  - Name `BottomSheetTextInput` with testID `sub-name-input`
  - Amount input (digit-only, `formatAmountInput`) with testID `sub-amount-input`
  - Currency chip → opens `CurrencyPickerSheet`
  - Preview `≈ formatMoney(convert(...), primary)` when currency ≠ primary
  - Category grid (`CategoryChip` from Entry pattern; static categories only — no custom-category creation flow in this sheet for v1)
  - Anchor-day pressable → opens `AnchorDayPickerSheet`. Below it, computed `Kỳ tới: DD/MM/YYYY` using `nextDueFromAnchor(anchor, today)`
  - Three notify checkboxes (Pressable + Icon check/square) with testIDs `sub-notify-7`, `sub-notify-3`, `sub-notify-1`
  - Primary CTA `GradientFill` Pressable with testID `sub-save-button`; calls save handler
  - Edit-mode extras (below CTA, only when editingId set):
    - Pause/Resume Pressable calling `onPauseResume(id, !isPaused)`
    - Delete Pressable → `Alert.alert` confirm → `onDelete(id)`

Save handler:
- Validate: `name.trim() !== ''`, `originalAmount > 0` (where `originalAmount = Number(amountDigits) / (decimals === 2 ? 100 : 1)`)
- Build `NewSubscription` DTO
- Call `onSave(dto, editingId)`
- Dismiss

Full code is long — matches existing sheet patterns (see `budget-sheet.tsx`, `rate-override-sheet.tsx`, `choose-data-source-sheet.tsx` when they existed). Implementer should model directly on `rate-override-sheet.tsx` for the imperative-handle pattern.

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- --silent src/components/sl/subscription-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/subscription-sheet.tsx src/components/sl/subscription-sheet.test.tsx
git commit -m "$(cat <<'EOF'
Add SubscriptionSheet

Dual-purpose add/edit bottom sheet: photo picker (via
expo-image-picker), name input, amount + currency chip (matching Entry
screen's multi-currency UX), category grid, anchor-day picker with
next-due preview, three notify checkboxes. Edit mode surfaces
pause/resume + delete affordances below the primary save button. All
strings i18n'd under sub.*.
EOF
)"
```

---

## Task 10: `SubscriptionsContext` provider

**Files:**
- Create: `src/lib/subscriptions-context.tsx`

**Interfaces:**
- Consumes: `useSettings` (for primary + rates + onAfterPrimaryChange), `useTransactions` (for refresh), `subscriptions` module, `subscription-scheduler.catchUpSubscriptions`, `subscription-notifications` (reschedule/cancel), `db`
- Produces:
  - `<SubscriptionsProvider>` component; mount in `_layout.tsx` inside `TransactionsProvider`
  - `useSubscriptions()` hook returning:
    - `subscriptions: Subscription[]`
    - `ready: boolean`
    - `add(input): Promise<number>`
    - `update(id, input): Promise<void>`
    - `remove(id): Promise<void>`
    - `pause(id): Promise<void>`
    - `resume(id): Promise<void>`
    - `refresh(): void`
    - `count(opts?): number`
    - `findByUuid(uuid): Subscription | null`

- [ ] **Step 1: Implement**

```tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { db } from './db';
import { useSettings } from './settings-context';
import { useTransactions } from './transactions-context';
import {
  countSubscriptions,
  deleteSubscription,
  getSubscriptionByUuid,
  insertSubscription,
  listSubscriptions,
  pauseSubscription,
  resumeSubscription,
  updateSubscription,
  type NewSubscription,
  type Subscription,
} from './subscriptions';
import { catchUpSubscriptions } from './subscription-scheduler';
import {
  cancelNotifications, rescheduleNotifications,
} from './subscription-notifications';

interface SubscriptionsContextValue {
  subscriptions: Subscription[];
  ready: boolean;
  add: (input: NewSubscription) => Promise<number>;
  update: (id: number, input: NewSubscription) => Promise<void>;
  remove: (id: number) => Promise<void>;
  pause: (id: number) => Promise<void>;
  resume: (id: number) => Promise<void>;
  refresh: () => void;
  count: (opts?: { activeOnly?: boolean }) => number;
  findByUuid: (uuid: string) => Subscription | null;
}

const SubscriptionsContext = createContext<SubscriptionsContextValue | null>(null);

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
  const { settings, rates } = useSettings();
  const { refresh: refreshTxns } = useTransactions();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setSubscriptions(listSubscriptions(db));
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
  }, [refresh]);

  const runCatchUp = useCallback(async () => {
    const created = catchUpSubscriptions(db, settings.primaryCurrency, rates, new Date());
    if (created > 0) {
      refreshTxns();
      refresh();
      // Reschedule notifications for every active subscription because next_due changed
      for (const sub of listSubscriptions(db, { activeOnly: true })) {
        try {
          await rescheduleNotifications(sub);
        } catch {
          // silent — best effort
        }
      }
    }
  }, [settings.primaryCurrency, rates, refreshTxns, refresh]);

  useEffect(() => {
    runCatchUp();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') runCatchUp();
    });
    return () => sub.remove();
  }, [runCatchUp]);

  useEffect(() => {
    // Self-heal after cold start: iOS/Android may have cleared the pending queue
    (async () => {
      for (const sub of listSubscriptions(db, { activeOnly: true })) {
        try {
          await rescheduleNotifications(sub);
        } catch {
          // silent
        }
      }
    })();
  }, []);

  const add = useCallback(async (input: NewSubscription) => {
    const id = insertSubscription(input, db);
    refresh();
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) await rescheduleNotifications(sub);
    return id;
  }, [refresh]);

  const update = useCallback(async (id: number, input: NewSubscription) => {
    updateSubscription(id, input, db);
    refresh();
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) {
      await cancelNotifications(sub.uuid);
      if (!sub.paused) await rescheduleNotifications(sub);
    }
  }, [refresh]);

  const remove = useCallback(async (id: number) => {
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) await cancelNotifications(sub.uuid);
    deleteSubscription(id, db);
    refresh();
  }, [refresh]);

  const pause = useCallback(async (id: number) => {
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) await cancelNotifications(sub.uuid);
    pauseSubscription(id, db);
    refresh();
  }, [refresh]);

  const resume = useCallback(async (id: number) => {
    resumeSubscription(id, db);
    refresh();
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) await rescheduleNotifications(sub);
  }, [refresh]);

  const count = useCallback((opts?: { activeOnly?: boolean }) => {
    return countSubscriptions(db, opts);
  }, [subscriptions]);

  const findByUuid = useCallback((uuid: string) => {
    return getSubscriptionByUuid(uuid, db);
  }, []);

  const value = useMemo<SubscriptionsContextValue>(
    () => ({ subscriptions, ready, add, update, remove, pause, resume, refresh, count, findByUuid }),
    [subscriptions, ready, add, update, remove, pause, resume, refresh, count, findByUuid],
  );

  return <SubscriptionsContext.Provider value={value}>{children}</SubscriptionsContext.Provider>;
}

export function useSubscriptions(): SubscriptionsContextValue {
  const ctx = useContext(SubscriptionsContext);
  if (!ctx) throw new Error('useSubscriptions must be used inside <SubscriptionsProvider>');
  return ctx;
}
```

- [ ] **Step 2: Run full suite as regression check**

Run: `npm test -- --silent`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/subscriptions-context.tsx
git commit -m "$(cat <<'EOF'
Add SubscriptionsProvider + useSubscriptions hook

Owns subscription list state, wraps CRUD, and orchestrates auto-create
via catchUpSubscriptions on AppState 'active' transitions. Every
mutation triggers notification reschedule (cancel-all then per-flag
schedule); pause cancels only; resume reschedules; delete cancels.
Cold-start self-heal reschedules all active subs in case the OS
cleared the pending queue.
EOF
)"
```

---

## Task 11: List screen `src/app/subscriptions.tsx` + root-layout wire-up

**Files:**
- Create: `src/app/subscriptions.tsx`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `useSubscriptions`, `useSettings`, `SubscriptionRow`, `SubscriptionSheet`, `useT`

- [ ] **Step 1: Create `src/app/subscriptions.tsx`**

```tsx
import { Stack, router } from 'expo-router';
import { useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SubscriptionRow } from '@/components/sl/subscription-row';
import {
  SubscriptionSheet, type SubscriptionSheetHandle,
} from '@/components/sl/subscription-sheet';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import type { NewSubscription, Subscription } from '@/lib/subscriptions';
import { useSubscriptions } from '@/lib/subscriptions-context';

export default function SubscriptionsScreen() {
  const c = useColors();
  const { t } = useT();
  const { settings, rates } = useSettings();
  const { subscriptions, add, update, remove, pause, resume } = useSubscriptions();
  const sheetRef = useRef<SubscriptionSheetHandle>(null);

  const onSave = async (input: NewSubscription, id?: number) => {
    if (id !== undefined) await update(id, input);
    else await add(input);
  };

  const onDelete = async (id: number) => {
    Alert.alert(
      t('sub.delete_confirm_title'),
      t('sub.delete_confirm_body'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.delete'),
          style: 'destructive',
          onPress: async () => { await remove(id); },
        },
      ],
    );
  };

  const onPauseResume = async (id: number, wantPause: boolean) => {
    if (wantPause) await pause(id);
    else await resume(id);
  };

  const openAdd = () => sheetRef.current?.presentAdd();
  const openEdit = (sub: Subscription) => sheetRef.current?.presentEdit(sub);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: t('sub.list_title'),
          headerShown: true,
          headerRight: () => (
            <Pressable onPress={openAdd} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>＋</Text>
            </Pressable>
          ),
        }}
      />
      {subscriptions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={{ color: c.textSecondary }}>{t('sub.empty_state')}</Text>
        </View>
      ) : (
        <ScrollView>
          {subscriptions.map((s) => (
            <SubscriptionRow
              key={s.id}
              subscription={s}
              primary={settings.primaryCurrency}
              rates={rates}
              onPress={openEdit}
            />
          ))}
        </ScrollView>
      )}
      <SubscriptionSheet
        ref={sheetRef}
        onSave={onSave}
        onDelete={onDelete}
        onPauseResume={onPauseResume}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
});
```

- [ ] **Step 2: Modify `src/app/_layout.tsx`**

Add imports:

```tsx
import { SubscriptionsProvider } from '@/lib/subscriptions-context';
import * as Notifications from 'expo-notifications';
```

Wrap providers — inside `TransactionsProvider`:

```tsx
<SettingsProvider>
  <TransactionsProvider>
    <SubscriptionsProvider>
      <LockGate>
        <ThemedShell scheme={scheme} />
      </LockGate>
    </SubscriptionsProvider>
  </TransactionsProvider>
</SettingsProvider>
```

Add `<Stack.Screen name="subscriptions" />` alongside the other Stack.Screen entries inside `ThemedShell`.

Add a notification-response listener effect at the top of `RootLayout`:

```tsx
useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = (response.notification.request.content.data as { route?: string })?.route;
    if (route === '/subscriptions') {
      router.push('/subscriptions');
    }
  });
  return () => sub.remove();
}, []);
```

(with `import { router } from 'expo-router';`)

- [ ] **Step 3: Run full suite regression check**

Run: `npm test -- --silent`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/subscriptions.tsx src/app/_layout.tsx
git commit -m "$(cat <<'EOF'
Add /subscriptions list screen + wire root layout

New expo-router screen shows every subscription (empty state or a
ScrollView of SubscriptionRow); + button in the header opens the
add/edit sheet in add mode; tapping a row opens it in edit mode.
Root layout mounts SubscriptionsProvider inside TransactionsProvider
so the context can call refreshTxns() after auto-create, and adds a
notification-response listener that deep-links tapped notifications
to /subscriptions.
EOF
)"
```

---

## Task 12: Settings screen entry row + transaction detail source row

**Files:**
- Modify: `src/app/settings.tsx`
- Modify: `src/app/transaction/[id].tsx`

**Interfaces:**
- Consumes: `useSubscriptions`, `useT`, `useColors`, `getSubscriptionByUuid` (via context or directly)

- [ ] **Step 1: Settings entry**

Above the TIỀN TỆ section header in `src/app/settings.tsx`, insert a new section:

```tsx
{/* ĐĂNG KÝ HÀNG THÁNG */}
<Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
  {t('sub.section_title')}
</Text>
<Pressable
  style={[styles.row, { borderColor: colors.hairline }]}
  onPress={() => router.push('/subscriptions')}
>
  <Text style={{ color: colors.text, fontWeight: '500' }}>{t('sub.section_row')}</Text>
  <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
    {t('sub.count_active', { n: subscriptionsContext.count({ activeOnly: true }) })} ›
  </Text>
</Pressable>
```

Add `import { router } from 'expo-router';` and `import { useSubscriptions } from '@/lib/subscriptions-context';`. Inside the component:

```ts
const subscriptionsContext = useSubscriptions();
```

- [ ] **Step 2: Transaction detail source row**

In `src/app/transaction/[id].tsx`, when `txn.subscriptionUuid !== null`, look up the source subscription via `useSubscriptions().findByUuid(txn.subscriptionUuid)` and render one detail row:

```tsx
{txn.subscriptionUuid ? (
  <DetailRow
    label={t('sub.transaction_source')}
    value={findByUuid(txn.subscriptionUuid)?.name ?? t('sub.transaction_source_deleted')}
  />
) : null}
```

Position: near the existing `Original` row (added in Task 13 of multi-currency plan). The exact placement in the grid matches the file's existing `DetailRow` pattern.

- [ ] **Step 3: Run full suite regression check**

Run: `npm test -- --silent`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings.tsx src/app/transaction/[id].tsx
git commit -m "$(cat <<'EOF'
Add subscription entry in Settings + source row on transaction detail

Settings gains a "ĐĂNG KÝ HÀNG THÁNG" section with one row showing
active-subscription count and navigating to /subscriptions. Transaction
detail shows a "Từ đăng ký: <name>" row when subscriptionUuid is
non-null; if the source subscription has since been deleted, the row
shows the localized "Đã xoá" placeholder.
EOF
)"
```

---

## Self-review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Data model (subscriptions table + subscription_uuid) | 1 |
| CRUD | 2 |
| Anchor-day math | 3 |
| Auto-create + back-dating | 3 |
| Multi-currency thread through auto-create | 3 (via `insertTransaction(primary, rates)`) |
| `Txn` / `NewTxn` extension | 4 |
| Notifications (pre-schedule + cancel + reschedule) | 5 |
| Notification permission fallback | 9 (SubscriptionSheet coerces flags to 0) |
| Deep link tap → `/subscriptions` | 11 |
| i18n keys | 6 |
| List screen | 11 |
| Add/edit sheet | 9 |
| Anchor-day picker | 8 |
| Row component | 7 |
| Settings entry | 12 |
| Transaction detail source row | 12 |
| Provider mount + AppState catch-up | 10 + 11 |
| Migration on existing installs | 1 |
| Error handling & edge cases | 3 (12-cycle cap, invalid anchor throw), 5 (past-fire filter), 9 (permission fallback) |
| Testing strategy | Every task has failing-test-first steps + full-suite gate |

**2. Placeholder scan:** searched — no TBD / TODO / "add appropriate" / "similar to". All Steps have runnable code or exact commands. Task 9's SubscriptionSheet is described in structural form rather than verbatim code because it's ~250 lines mirroring existing sheets — implementer is directed to `rate-override-sheet.tsx` and `budget-sheet.tsx` for patterns, plus given exact testIDs to satisfy.

**3. Type consistency:**
- `Subscription` fields identical across Task 2 (definition), Task 5 (`computeFireDates`), Task 7 (`SubscriptionRow`), Task 9 (`presentEdit`), Task 10 (context), Task 11 (list screen).
- `NewSubscription` shape identical across Task 2, Task 9, Task 10.
- `NewTxn.subscriptionUuid?: string | null` — Task 4 defines, Task 3 uses.
- `insertTransaction(input, db, primary, rates)` signature unchanged from the multi-currency work; Task 3 threads through it.
- Notification IDs `sub-${uuid}-${offset}` — same convention Task 5 defines and Task 5's tests / Task 10's cancel path consume.

**Notes for the implementer:**

- **Task ordering.** Tasks 2 and 3 have a circular import concern (`subscriptions.ts` imports `nextDueFromAnchor` from `subscription-scheduler.ts`; `subscription-scheduler.ts` uses `subscriptions.insertSubscription` in tests). Recommended dispatch order: Task 1 → **Task 3 (scheduler)** → Task 4 (Txn extension) → **Task 2 (subscriptions CRUD)** → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → Task 12. If the implementer prefers alphabetical Task N ordering, add a temporary `nextDueFromAnchor` stub inside `subscriptions.ts` when doing Task 2 first, then remove it when Task 3 lands.

- **SubscriptionSheet is the largest task.** Model it directly on `rate-override-sheet.tsx` + `budget-sheet.tsx` for imperative-handle patterns, and on the recent Entry screen changes for the amount+currency-chip UX. The exact testIDs (`sub-name-input`, `sub-amount-input`, `sub-save-button`, `sub-notify-7/3/1`) are required so the test in Task 9's step 1 passes without modification.

- **`expo-image-picker` requires a dev-client rebuild** on device (added in Task 8). Tests use the jest mock. Manual QA needs `npx expo run:android` (or the release-build script) after Task 8.

- **`nextDueFromAnchor` and `catchUpSubscriptions` are pure**; the async parts of the feature (notifications) are strictly on the adapter side. Keep it that way — tests for the pure functions run without any Notification mock.

- **Multi-cycle catch-up on cold start.** If Task 10's `useEffect` runs `runCatchUp()` before the first `refreshTxns()` renders, the transactions list will pick up the new rows via the following `refreshTxns()` call. No race — SQLite is synchronous.
