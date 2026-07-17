# Expense Tracker (SpendLens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn SpendLens from the default Expo template into the real expense-tracking app specified in `docs/superpowers/specs/2026-07-17-expense-tracker-design.md`, matching the imported mockup pixel-for-pixel with real SQLite persistence, camera receipt capture, notifications, CSV export, and Google sign-in.

**Architecture:** Expo Router with a custom (non-native) tab bar. `app/index.tsx` is the launch route (Capture screen); Add Details lives as local state inside that same route (it only ever follows Capture, sharing its draft-amount/photo state). `app/(tabs)/` holds Home/History/Stats/Settings as real routes (`/home`, `/history`, `/stats`, `/settings`) rendered via a hand-rolled `TabBar`, not `NativeTabs`. Transaction Detail is a context-driven overlay owned by the `(tabs)` layout (reachable from both Home and History). SQLite (`expo-sqlite`) is the single source of truth via a `useTransactions()` hook with a tiny pub/sub for cross-screen live updates.

**Tech Stack:** Expo SDK 57, expo-router, expo-sqlite, expo-camera, expo-file-system (new `File`/`Directory`/`Paths` API), expo-notifications, expo-sharing, expo-secure-store, react-native-svg, @expo/ui (universal `Switch` + `@expo/ui/community/datetime-picker`), @react-native-google-signin/google-signin, NativeWind (already configured), jest-expo (new).

## Global Constraints

- Styling uses NativeWind `className` for static layout/typography; **dynamic per-data colors (category chips, chart segments, bar heights) use inline `style` props**, not arbitrary Tailwind classes — these values come from data, not fixed design tokens.
- Exact mockup colors: brand green `#10B981` (dark `#059669`, light `#34D399`/`#6EE7B7`/`#A7F3D0`), danger red `#EF4444`, ink `#111111`, muted gray `#9CA3AF`, app background `#FAFAFA`, card white `#ffffff`, hairline `#F2F2F0`.
- Categories (id / label / chip bg / fg): `food`/Food/`#FFEDD5`/`#EA580C`, `transport`/Transport/`#DBEAFE`/`#2563EB`, `shopping`/Shopping/`#EDE9FE`/`#7C3AED`, `bills`/Bills/`#FEF3C7`/`#D97706`, `health`/Health/`#CCFBF1`/`#0D9488`, `fun`/Entertainment/`#FCE7F3`/`#DB2777`, `other`/Other/`#F3F4F6`/`#6B7280`.
- `expo-sqlite`: use `SQLite.openDatabaseSync(name)`, `db.execSync(...)` for DDL, `db.runAsync(...)` for insert/update/delete, `db.getAllAsync<T>(...)` / `db.getFirstAsync<T>(...)` for selects. Confirmed against https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/.
- `expo-file-system` on this SDK uses the **new class-based API only** — `import { File, Directory, Paths } from 'expo-file-system'`, e.g. `new File(Paths.document, 'receipts', name).create()` / `.write()` / `.copy()`. The legacy `FileSystem.*` function API is deprecated and throws at runtime. Confirmed against https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/.
- `expo-camera`: `CameraView` + `useCameraPermissions()` + `cameraRef.current.takePictureAsync()` returning `{ uri, width, height }`. Confirmed against https://docs.expo.dev/versions/v57.0.0/sdk/camera/.
- `expo-notifications`: `requestPermissionsAsync()`, `scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute } })`, `cancelScheduledNotificationAsync(id)`. Confirmed against https://docs.expo.dev/versions/v57.0.0/sdk/notifications/.
- `expo-sharing`: `Sharing.isAvailableAsync()` then `Sharing.shareAsync(uri, { mimeType, dialogTitle })`. Confirmed against https://docs.expo.dev/versions/v57.0.0/sdk/sharing/.
- Date picker uses `@expo/ui/community/datetime-picker` (the `@react-native-community/datetimepicker`-API-compatible drop-in), not a `DateTimePicker` from the universal `@expo/ui` root (it doesn't exist there). Settings reminder toggle uses `Switch` from the universal `@expo/ui` root. Confirmed against the expo-ui skill's `references/universal.md` and `references/drop-in-replacements.md`.
- **Google Sign-In requires `@react-native-google-signin/google-signin`, which cannot run in Expo Go** — it needs a config plugin and a custom dev client (`npx expo prebuild` + `npx expo run:ios`/`run:android`, or an EAS dev build). This only affects Task 27; every earlier task must remain testable in Expo Go / `npx expo start`. Confirmed against https://docs.expo.dev/guides/google-authentication/ and https://react-native-google-signin.github.io/docs/setting-up/expo.
- Routing note: `app/index.tsx` (Capture, path `/`) and a tabs-group index would collide if the tabs' Home file were also named `index.tsx` (route groups don't add a path segment, so `app/(tabs)/index.tsx` also resolves to `/`). Home is therefore `app/(tabs)/home.tsx` (path `/home`), not `index.tsx`.
- Follow this repo's existing conventions: TypeScript strict mode, `@/*` path alias to `src/*`, single quotes / 2-space indent (see `.prettierrc`-equivalent already reflected in existing files), NativeWind `@/tw` wrapper components (`View`, `Text`, `ScrollView`, `Pressable`, `TextInput`, `Image`, `Link`) from `src/tw/`.

## File Structure

```text
src/
  app/
    index.tsx                        — Capture screen (launch route "/"), owns local capture+details state
    _layout.tsx                      — root Stack: DB init/seed on mount, ToastProvider, screens: index, (tabs)
    (tabs)/
      _layout.tsx                    — Slot + custom TabBar + TransactionDetailProvider + overlay
      home.tsx                       — "/home"
      history.tsx                    — "/history"
      stats.tsx                      — "/stats"
      settings.tsx                   — "/settings"
  components/
    expense/
      toast.tsx                      — ToastProvider + useToast()
      segmented-control.tsx          — SegmentedControl<T>
      category-icon.tsx              — CategoryIcon (react-native-svg, ported from mockup)
      category-chip.tsx              — CategoryChip (picker chip used in Add Details / change-category)
      transaction-row.tsx            — TransactionRow (list row used on Home/History)
      donut-chart.tsx                — DonutChart (react-native-svg)
      bar-chart.tsx                  — BarChart (react-native-svg)
      keypad.tsx                     — Keypad (custom numeric entry)
      tab-bar.tsx                    — TabBar (custom, not NativeTabs)
      add-details.tsx                — AddDetails (rendered inline by app/index.tsx)
      transaction-detail.tsx         — TransactionDetail (rendered by (tabs)/_layout.tsx overlay)
      google-sign-in-row.tsx         — GoogleSignInRow (Settings profile row)
  lib/
    db.ts                            — expo-sqlite schema + singleton db + createDb() for tests
    categories.ts                    — CategoryId, Category, CATEGORIES, categoryOf()
    format.ts                        — formatCurrency, toDateKey, shiftDateKey, dayLabel, monthKey
    seed.ts                          — seedIfEmpty()
    transactions.ts                  — Transaction, NewTransaction, CRUD fns, useTransactions()
    settings.ts                      — typed get/set helpers over the settings table
    receipts.ts                      — saveReceiptPhoto() (expo-file-system)
    notifications.ts                 — scheduleDailyReminder()/cancelDailyReminder()
    export.ts                        — buildTransactionsCsv()/exportAndShareCsv()
    auth.ts                          — configureGoogleSignIn()/signInWithGoogle()/signOut()/useAuth()
jest.config.js                       — jest-expo preset
```

---

### Task 1: Install dependencies and configure Jest

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Create: `src/lib/sanity.test.ts`

**Interfaces:**
- Produces: a working `npm test` command via `jest-expo`, proven by one trivial passing test. Every later task with a `.test.ts` file depends on this.

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npx expo install expo-sqlite expo-camera expo-file-system expo-sharing expo-notifications expo-secure-store react-native-svg
```

- [ ] **Step 2: Install Jest dev dependencies**

Run:
```bash
npm install --save-dev jest-expo jest @types/jest
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In `package.json`, inside `"scripts"`, add:
```json
"test": "jest"
```

- [ ] **Step 4: Create `jest.config.js`**

```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
```

- [ ] **Step 5: Write a trivial sanity test**

```ts
// src/lib/sanity.test.ts
describe('jest-expo harness', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npm test`
Expected: `PASS src/lib/sanity.test.ts`, 1 passed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json jest.config.js src/lib/sanity.test.ts
git commit -m "Add Jest harness and Expense Tracker native dependencies"
```

---

### Task 2: Design tokens

**Files:**
- Modify: `src/global.css`

**Interfaces:**
- Produces: Tailwind theme tokens `bg-brand`, `text-brand`, `bg-brand-dark`, `text-danger`, `bg-app-bg`, `bg-card`, `border-hairline`, `text-ink`, `text-muted`, usable via NativeWind `className` in every later UI task.

- [ ] **Step 1: Add the theme block to `src/global.css`**

Add this block after the existing `@import` lines and before the existing `:root { --font-display: ... }` block:

```css
@layer theme {
  @theme {
    --color-brand: #10b981;
    --color-brand-dark: #059669;
    --color-brand-light: #34d399;
    --color-danger: #ef4444;
    --color-ink: #111111;
    --color-muted: #9ca3af;
    --color-app-bg: #fafafa;
    --color-card: #ffffff;
    --color-hairline: #f2f2f0;
  }
}
```

- [ ] **Step 2: Verify Tailwind picks up the new tokens**

Run: `npx tsc --noEmit` (should still report no errors — this step is purely CSS, but confirms nothing else broke)
Then start the web dev server briefly and confirm no PostCSS/Tailwind build errors appear in the terminal:
Run: `npx expo start --web --port 8099` (background), check terminal output for `Tailwind` or CSS compile errors, then stop it.

- [ ] **Step 3: Commit**

```bash
git add src/global.css
git commit -m "Add Expense Tracker design tokens to Tailwind theme"
```

---

### Task 3: Categories and category icons

**Files:**
- Create: `src/lib/categories.ts`
- Create: `src/components/expense/category-icon.tsx`

**Interfaces:**
- Produces: `CategoryId` (`'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'fun' | 'other'`), `Category { id: CategoryId; label: string; chip: string; fg: string }`, `CATEGORIES: Category[]`, `categoryOf(id: string): Category` — used by `lib/transactions.ts`, `lib/seed.ts`, and every screen/component that renders a category. `CategoryIcon({ category, color, size }: { category: CategoryId; color: string; size: number })` — used by `TransactionRow`, `CategoryChip`, Stats legend/top-categories.

- [ ] **Step 1: Write `src/lib/categories.ts`**

```ts
export type CategoryId = 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'fun' | 'other';

export interface Category {
  id: CategoryId;
  label: string;
  chip: string;
  fg: string;
}

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food', chip: '#FFEDD5', fg: '#EA580C' },
  { id: 'transport', label: 'Transport', chip: '#DBEAFE', fg: '#2563EB' },
  { id: 'shopping', label: 'Shopping', chip: '#EDE9FE', fg: '#7C3AED' },
  { id: 'bills', label: 'Bills', chip: '#FEF3C7', fg: '#D97706' },
  { id: 'health', label: 'Health', chip: '#CCFBF1', fg: '#0D9488' },
  { id: 'fun', label: 'Entertainment', chip: '#FCE7F3', fg: '#DB2777' },
  { id: 'other', label: 'Other', chip: '#F3F4F6', fg: '#6B7280' },
];

export function categoryOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
```

- [ ] **Step 2: Write a unit test for `categoryOf`**

```ts
// src/lib/categories.test.ts
import { categoryOf, CATEGORIES } from './categories';

describe('categoryOf', () => {
  it('returns the matching category', () => {
    expect(categoryOf('food').label).toBe('Food');
  });

  it('falls back to "other" for an unknown id', () => {
    expect(categoryOf('nonsense').id).toBe('other');
  });

  it('has exactly the 7 mockup categories', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      'food', 'transport', 'shopping', 'bills', 'health', 'fun', 'other',
    ]);
  });
});
```

- [ ] **Step 3: Run the test and verify it passes**

Run: `npm test -- categories.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Write `src/components/expense/category-icon.tsx`**

```tsx
import Svg, { Circle, Path } from 'react-native-svg';

import type { CategoryId } from '@/lib/categories';

interface CategoryIconProps {
  category: CategoryId;
  color: string;
  size: number;
}

export function CategoryIcon({ category, color, size }: CategoryIconProps) {
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  switch (category) {
    case 'food':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 3v4.5a2.5 2.5 0 0 0 5 0V3" {...stroke} />
          <Path d="M8.5 3v18" {...stroke} />
          <Path d="M17.5 3c-1.9 1.7-2.9 4.8-2.9 7.4 0 1.8 1.2 2.8 2.9 2.8z" {...stroke} />
          <Path d="M17.5 13.5V21" {...stroke} />
        </Svg>
      );
    case 'transport':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4.5 15.5h15" {...stroke} />
          <Path d="M6 15.5l1.7-5.1A2 2 0 0 1 9.6 9h4.8a2 2 0 0 1 1.9 1.4l1.7 5.1" {...stroke} />
          <Circle cx={8} cy={18.2} r={1.3} fill={color} stroke="none" />
          <Circle cx={16} cy={18.2} r={1.3} fill={color} stroke="none" />
        </Svg>
      );
    case 'shopping':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6.5 8h11l-1.1 12h-8.8z" {...stroke} />
          <Path d="M9 8V6.5a3 3 0 0 1 6 0V8" {...stroke} />
        </Svg>
      );
    case 'bills':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M7 3h10v18l-2.5-1.7L12 21l-2.5-1.7L7 21z" {...stroke} />
          <Path d="M10 8.5h4" {...stroke} />
          <Path d="M10 12.5h4" {...stroke} />
        </Svg>
      );
    case 'health':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 20.5S5 16 5 10.6A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7 2.9C19 16 12 20.5 12 20.5z" {...stroke} />
        </Svg>
      );
    case 'fun':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4.5 6.5h15v12h-15z" {...stroke} />
          <Path d="M4.5 10h15" {...stroke} />
          <Path d="M8.5 6.5V10" {...stroke} />
          <Path d="M12 6.5V10" {...stroke} />
          <Path d="M15.5 6.5V10" {...stroke} />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={6} cy={12} r={1.5} fill={color} stroke="none" />
          <Circle cx={12} cy={12} r={1.5} fill={color} stroke="none" />
          <Circle cx={18} cy={12} r={1.5} fill={color} stroke="none" />
        </Svg>
      );
  }
}
```

- [ ] **Step 5: Manual verification**

`CategoryIcon` has no behavior to unit test (pure SVG rendering); it will be visually verified once `TransactionRow` (Task 11) renders it on a real screen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/categories.ts src/lib/categories.test.ts src/components/expense/category-icon.tsx
git commit -m "Add expense categories and category icons"
```

---

### Task 4: Format helpers

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/lib/format.test.ts`

**Interfaces:**
- Produces: `formatCurrency(amount: number): string`, `toDateKey(date: Date): string` (`'YYYY-MM-DD'`), `shiftDateKey(dateKey: string, days: number): string`, `dayLabel(dateKey: string, todayKey: string): string` (`'Today' | 'Yesterday' | 'Mon D'`), `monthKey(dateKey: string): string` (`'YYYY-MM'`) — used by `lib/seed.ts`, `lib/transactions.ts`, Home/History/Stats screens.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/format.test.ts
import { dayLabel, formatCurrency, monthKey, shiftDateKey, toDateKey } from './format';

describe('formatCurrency', () => {
  it('formats with two decimals and thousands separators', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(6.75)).toBe('$6.75');
  });
});

describe('toDateKey', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 6, 17))).toBe('2026-07-17');
  });

  it('pads single-digit months and days', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('shiftDateKey', () => {
  it('shifts backward across a month boundary', () => {
    expect(shiftDateKey('2026-07-01', -1)).toBe('2026-06-30');
  });

  it('shifts forward', () => {
    expect(shiftDateKey('2026-07-17', 3)).toBe('2026-07-20');
  });
});

describe('dayLabel', () => {
  it('labels today and yesterday specially', () => {
    expect(dayLabel('2026-07-17', '2026-07-17')).toBe('Today');
    expect(dayLabel('2026-07-16', '2026-07-17')).toBe('Yesterday');
  });

  it('labels older dates as "Mon D"', () => {
    expect(dayLabel('2026-07-10', '2026-07-17')).toBe('Jul 10');
  });
});

describe('monthKey', () => {
  it('extracts YYYY-MM', () => {
    expect(monthKey('2026-07-17')).toBe('2026-07');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- format.test.ts`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 3: Write `src/lib/format.ts`**

```ts
export function formatCurrency(amount: number): string {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === shiftDateKey(todayKey, -1)) return 'Yesterday';
  const [, m, d] = dateKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- format.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "Add date/currency format helpers"
```

---

### Task 5: SQLite schema and db module

**Files:**
- Create: `src/lib/db.ts`

**Interfaces:**
- Consumes: nothing (foundational).
- Produces: `db: SQLiteDatabase` (singleton, opened against `'spendlens.db'`), `createDb(name: string): SQLiteDatabase` (opens + initializes schema, used directly by tests to get an isolated in-memory database) — used by every task in `lib/` and the root layout's init effect.

- [ ] **Step 1: Write `src/lib/db.ts`**

```ts
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
`;

export function createDb(name: string): SQLiteDatabase {
  const database = SQLite.openDatabaseSync(name);
  database.execSync(SCHEMA);
  return database;
}

export const db = createDb('spendlens.db');
```

- [ ] **Step 2: Write a smoke test that the schema applies cleanly**

```ts
// src/lib/db.test.ts
import { createDb } from './db';

describe('createDb', () => {
  it('creates the expected tables on an in-memory database', () => {
    const database = createDb(':memory:');
    const tables = database.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    expect(tables.map((t) => t.name)).toEqual(['settings', 'transactions', 'users']);
  });
});
```

- [ ] **Step 3: Run the test and verify it passes**

Run: `npm test -- db.test.ts`
Expected: 1 passed. (If `expo-sqlite`'s native module isn't available under Jest, `jest-expo`'s preset mocks it — if this fails with a native module error, check `jest-expo`'s expo-sqlite mock docs before proceeding; do not skip the test.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "Add SQLite schema and db module"
```

---

### Task 6: Transactions data layer and useTransactions hook

**Files:**
- Create: `src/lib/transactions.ts`
- Create: `src/lib/transactions.test.ts`

**Interfaces:**
- Consumes: `db`, `createDb` from `lib/db.ts`.
- Produces: `Transaction { id, date, time, createdAt, category, name, note, amount, isIncome, photoPath }`, `NewTransaction` (same shape minus `id`), `listTransactions(database): Promise<Transaction[]>`, `insertTransaction(database, input: NewTransaction): Promise<number>`, `updateTransaction(database, id, patch: Partial<NewTransaction>): Promise<void>`, `deleteTransaction(database, id): Promise<void>`, `countTransactions(database): Promise<number>`, `useTransactions(): { transactions: Transaction[]; loading: boolean; add(input): Promise<number>; update(id, patch): Promise<void>; remove(id): Promise<void>; refresh(): Promise<void> }` — used by `lib/seed.ts` and every screen.

- [ ] **Step 1: Write the failing tests for the pure CRUD functions**

```ts
// src/lib/transactions.test.ts
import { createDb } from './db';
import {
  countTransactions,
  deleteTransaction,
  insertTransaction,
  listTransactions,
  updateTransaction,
} from './transactions';

describe('transactions data layer', () => {
  it('inserts and lists a transaction', async () => {
    const database = createDb(':memory:');
    await insertTransaction(database, {
      date: '2026-07-17', time: '8:12 AM', createdAt: 1000,
      category: 'food', name: 'Coffee', note: 'Flat white', amount: 6.75,
      isIncome: false, photoPath: null,
    });
    const rows = await listTransactions(database);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Coffee', amount: 6.75, isIncome: false, category: 'food' });
  });

  it('orders results by createdAt descending', async () => {
    const database = createDb(':memory:');
    await insertTransaction(database, { date: '2026-07-15', time: '1:00 PM', createdAt: 100, category: 'food', name: 'Older', note: '', amount: 1, isIncome: false, photoPath: null });
    await insertTransaction(database, { date: '2026-07-17', time: '1:00 PM', createdAt: 200, category: 'food', name: 'Newer', note: '', amount: 2, isIncome: false, photoPath: null });
    const rows = await listTransactions(database);
    expect(rows.map((r) => r.name)).toEqual(['Newer', 'Older']);
  });

  it('updates only the provided fields', async () => {
    const database = createDb(':memory:');
    const id = await insertTransaction(database, { date: '2026-07-17', time: '1:00 PM', createdAt: 100, category: 'food', name: 'Original', note: '', amount: 1, isIncome: false, photoPath: null });
    await updateTransaction(database, id, { amount: 42, category: 'transport' });
    const rows = await listTransactions(database);
    expect(rows[0]).toMatchObject({ name: 'Original', amount: 42, category: 'transport' });
  });

  it('deletes a transaction', async () => {
    const database = createDb(':memory:');
    const id = await insertTransaction(database, { date: '2026-07-17', time: '1:00 PM', createdAt: 100, category: 'food', name: 'Gone', note: '', amount: 1, isIncome: false, photoPath: null });
    await deleteTransaction(database, id);
    expect(await listTransactions(database)).toHaveLength(0);
  });

  it('counts transactions', async () => {
    const database = createDb(':memory:');
    expect(await countTransactions(database)).toBe(0);
    await insertTransaction(database, { date: '2026-07-17', time: '1:00 PM', createdAt: 100, category: 'food', name: 'One', note: '', amount: 1, isIncome: false, photoPath: null });
    expect(await countTransactions(database)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- transactions.test.ts`
Expected: FAIL — `Cannot find module './transactions'`.

- [ ] **Step 3: Write `src/lib/transactions.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';

import { db } from './db';

export interface Transaction {
  id: number;
  date: string;
  time: string;
  createdAt: number;
  category: string;
  name: string;
  note: string;
  amount: number;
  isIncome: boolean;
  photoPath: string | null;
}

export interface NewTransaction {
  date: string;
  time: string;
  createdAt: number;
  category: string;
  name: string;
  note: string;
  amount: number;
  isIncome: boolean;
  photoPath: string | null;
}

interface TransactionRow {
  id: number;
  date: string;
  time: string;
  created_at: number;
  category: string;
  name: string;
  note: string | null;
  amount: number;
  is_income: number;
  photo_path: string | null;
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    createdAt: row.created_at,
    category: row.category,
    name: row.name,
    note: row.note ?? '',
    amount: row.amount,
    isIncome: row.is_income === 1,
    photoPath: row.photo_path,
  };
}

export async function listTransactions(database: SQLiteDatabase): Promise<Transaction[]> {
  const rows = await database.getAllAsync<TransactionRow>(
    'SELECT * FROM transactions ORDER BY created_at DESC'
  );
  return rows.map(rowToTransaction);
}

export async function insertTransaction(database: SQLiteDatabase, input: NewTransaction): Promise<number> {
  const result = await database.runAsync(
    `INSERT INTO transactions (date, time, created_at, category, name, note, amount, is_income, photo_path)
     VALUES ($date, $time, $created_at, $category, $name, $note, $amount, $is_income, $photo_path)`,
    {
      $date: input.date,
      $time: input.time,
      $created_at: input.createdAt,
      $category: input.category,
      $name: input.name,
      $note: input.note,
      $amount: input.amount,
      $is_income: input.isIncome ? 1 : 0,
      $photo_path: input.photoPath,
    }
  );
  return result.lastInsertRowId;
}

export async function updateTransaction(
  database: SQLiteDatabase,
  id: number,
  patch: Partial<NewTransaction>
): Promise<void> {
  const fields: string[] = [];
  const params: Record<string, unknown> = { $id: id };

  if (patch.category !== undefined) { fields.push('category = $category'); params.$category = patch.category; }
  if (patch.name !== undefined) { fields.push('name = $name'); params.$name = patch.name; }
  if (patch.note !== undefined) { fields.push('note = $note'); params.$note = patch.note; }
  if (patch.amount !== undefined) { fields.push('amount = $amount'); params.$amount = patch.amount; }
  if (patch.isIncome !== undefined) { fields.push('is_income = $is_income'); params.$is_income = patch.isIncome ? 1 : 0; }
  if (patch.photoPath !== undefined) { fields.push('photo_path = $photo_path'); params.$photo_path = patch.photoPath; }
  if (patch.date !== undefined) { fields.push('date = $date'); params.$date = patch.date; }
  if (patch.time !== undefined) { fields.push('time = $time'); params.$time = patch.time; }

  if (fields.length === 0) return;
  await database.runAsync(`UPDATE transactions SET ${fields.join(', ')} WHERE id = $id`, params);
}

export async function deleteTransaction(database: SQLiteDatabase, id: number): Promise<void> {
  await database.runAsync('DELETE FROM transactions WHERE id = $id', { $id: id });
}

export async function countTransactions(database: SQLiteDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM transactions');
  return row?.count ?? 0;
}

type Listener = () => void;
const listeners = new Set<Listener>();
function notifyAll() {
  listeners.forEach((listener) => listener());
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await listTransactions(db);
    setTransactions(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);

  const add = useCallback(async (input: NewTransaction) => {
    const id = await insertTransaction(db, input);
    notifyAll();
    return id;
  }, []);

  const update = useCallback(async (id: number, patch: Partial<NewTransaction>) => {
    await updateTransaction(db, id, patch);
    notifyAll();
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteTransaction(db, id);
    notifyAll();
  }, []);

  return { transactions, loading, add, update, remove, refresh };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- transactions.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/transactions.ts src/lib/transactions.test.ts
git commit -m "Add transactions data layer and useTransactions hook"
```

---

### Task 7: Settings persistence and seed data

**Files:**
- Create: `src/lib/settings.ts`
- Create: `src/lib/settings.test.ts`
- Create: `src/lib/seed.ts`
- Create: `src/lib/seed.test.ts`

**Interfaces:**
- Consumes: `db`, `createDb`, `SQLiteDatabase` from `lib/db.ts`; `countTransactions`, `insertTransaction` from `lib/transactions.ts`; `toDateKey`, `shiftDateKey` from `lib/format.ts`.
- Produces: `getSetting(database, key): Promise<string | null>`, `setSetting(database, key, value): Promise<void>`, `getMonthlyBudget(database): Promise<number>` (defaults to `2000`), `setMonthlyBudget(database, value: number): Promise<void>`, `getDailyReminderEnabled(database): Promise<boolean>`, `setDailyReminderEnabled(database, enabled: boolean): Promise<void>`, `getReminderNotificationId(database): Promise<string | null>`, `setReminderNotificationId(database, id: string | null): Promise<void>`; `seedIfEmpty(database): Promise<void>` — used by Settings screen (Task 20), notifications (Task 25), and root layout init (Task 15).

- [ ] **Step 1: Write the failing tests for settings.ts**

```ts
// src/lib/settings.test.ts
import { createDb } from './db';
import {
  getDailyReminderEnabled,
  getMonthlyBudget,
  getReminderNotificationId,
  setDailyReminderEnabled,
  setMonthlyBudget,
  setReminderNotificationId,
} from './settings';

describe('settings', () => {
  it('defaults monthly budget to 2000', async () => {
    const database = createDb(':memory:');
    expect(await getMonthlyBudget(database)).toBe(2000);
  });

  it('persists a custom monthly budget', async () => {
    const database = createDb(':memory:');
    await setMonthlyBudget(database, 3500);
    expect(await getMonthlyBudget(database)).toBe(3500);
  });

  it('defaults the daily reminder to disabled', async () => {
    const database = createDb(':memory:');
    expect(await getDailyReminderEnabled(database)).toBe(false);
  });

  it('persists the daily reminder toggle', async () => {
    const database = createDb(':memory:');
    await setDailyReminderEnabled(database, true);
    expect(await getDailyReminderEnabled(database)).toBe(true);
  });

  it('persists and clears the reminder notification id', async () => {
    const database = createDb(':memory:');
    await setReminderNotificationId(database, 'abc-123');
    expect(await getReminderNotificationId(database)).toBe('abc-123');
    await setReminderNotificationId(database, null);
    expect(await getReminderNotificationId(database)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- settings.test.ts`
Expected: FAIL — `Cannot find module './settings'`.

- [ ] **Step 3: Write `src/lib/settings.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite';

const KEYS = {
  monthlyBudget: 'monthlyBudget',
  dailyReminderEnabled: 'dailyReminderEnabled',
  reminderNotificationId: 'reminderNotificationId',
} as const;

export async function getSetting(database: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(database: SQLiteDatabase, key: string, value: string): Promise<void> {
  await database.runAsync(
    'INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = $value',
    { $key: key, $value: value }
  );
}

export async function getMonthlyBudget(database: SQLiteDatabase): Promise<number> {
  const value = await getSetting(database, KEYS.monthlyBudget);
  return value === null ? 2000 : Number(value);
}

export async function setMonthlyBudget(database: SQLiteDatabase, value: number): Promise<void> {
  await setSetting(database, KEYS.monthlyBudget, String(value));
}

export async function getDailyReminderEnabled(database: SQLiteDatabase): Promise<boolean> {
  const value = await getSetting(database, KEYS.dailyReminderEnabled);
  return value === 'true';
}

export async function setDailyReminderEnabled(database: SQLiteDatabase, enabled: boolean): Promise<void> {
  await setSetting(database, KEYS.dailyReminderEnabled, enabled ? 'true' : 'false');
}

export async function getReminderNotificationId(database: SQLiteDatabase): Promise<string | null> {
  return getSetting(database, KEYS.reminderNotificationId);
}

export async function setReminderNotificationId(database: SQLiteDatabase, id: string | null): Promise<void> {
  if (id === null) {
    await database.runAsync('DELETE FROM settings WHERE key = ?', KEYS.reminderNotificationId);
    return;
  }
  await setSetting(database, KEYS.reminderNotificationId, id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- settings.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write the failing test for seed.ts**

```ts
// src/lib/seed.test.ts
import { createDb } from './db';
import { countTransactions, listTransactions } from './transactions';
import { seedIfEmpty } from './seed';

describe('seedIfEmpty', () => {
  it('inserts seed rows into an empty database', async () => {
    const database = createDb(':memory:');
    await seedIfEmpty(database);
    expect(await countTransactions(database)).toBeGreaterThan(30);
  });

  it('does nothing if transactions already exist', async () => {
    const database = createDb(':memory:');
    await seedIfEmpty(database);
    const firstCount = await countTransactions(database);
    await seedIfEmpty(database);
    expect(await countTransactions(database)).toBe(firstCount);
  });

  it('anchors the most recent seed row to today', async () => {
    const database = createDb(':memory:');
    await seedIfEmpty(database);
    const rows = await listTransactions(database);
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    expect(rows.some((r) => r.date === `${y}-${m}-${d}`)).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- seed.test.ts`
Expected: FAIL — `Cannot find module './seed'`.

- [ ] **Step 7: Write `src/lib/seed.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite';

import { shiftDateKey, toDateKey } from './format';
import { countTransactions, insertTransaction } from './transactions';

interface SeedRow {
  daysAgo: number;
  time: string;
  category: string;
  name: string;
  note: string;
  amount: number;
  isIncome?: boolean;
}

const SEED: SeedRow[] = [
  { daysAgo: 0, time: '8:12 AM', category: 'food', name: 'Blue Bottle Coffee', note: 'Flat white', amount: 6.75 },
  { daysAgo: 0, time: '9:02 AM', category: 'transport', name: 'Uber', note: 'To office', amount: 14.2 },
  { daysAgo: 0, time: '12:38 PM', category: 'food', name: 'Sweetgreen', note: 'Lunch', amount: 13.4 },
  { daysAgo: 1, time: '6:20 PM', category: 'food', name: 'Whole Foods', note: 'Groceries', amount: 84.12 },
  { daysAgo: 1, time: '5:05 PM', category: 'health', name: 'CVS Pharmacy', note: '', amount: 23.99 },
  { daysAgo: 1, time: '8:15 PM', category: 'fun', name: 'AMC Theatres', note: 'Movie night', amount: 32.0 },
  { daysAgo: 2, time: '9:00 AM', category: 'bills', name: 'ConEd', note: 'Electric bill', amount: 96.4 },
  { daysAgo: 2, time: '7:40 PM', category: 'transport', name: 'Shell', note: 'Gas', amount: 41.75 },
  { daysAgo: 2, time: '8:05 AM', category: 'food', name: 'Joe & The Juice', note: '', amount: 5.25 },
  { daysAgo: 3, time: '1:15 PM', category: 'shopping', name: 'Zara', note: 'T-shirt', amount: 39.9 },
  { daysAgo: 3, time: '8:30 PM', category: 'food', name: 'Ippudo', note: 'Ramen', amount: 21.6 },
  { daysAgo: 4, time: '8:45 AM', category: 'transport', name: 'MTA', note: 'Metro card', amount: 34.0 },
  { daysAgo: 4, time: '9:00 AM', category: 'other', name: 'Acme Corp', note: 'Salary', amount: 2400.0, isIncome: true },
  { daysAgo: 4, time: '3:30 PM', category: 'health', name: 'Dr. Patel', note: 'Dental cleaning', amount: 120.0 },
  { daysAgo: 5, time: '11:20 AM', category: 'food', name: 'Café Mogador', note: 'Brunch', amount: 28.4 },
  { daysAgo: 5, time: '2:00 PM', category: 'shopping', name: 'McNally Jackson', note: 'Book', amount: 18.99 },
  { daysAgo: 7, time: '6:00 AM', category: 'fun', name: 'Spotify', note: 'Subscription', amount: 10.99 },
  { daysAgo: 7, time: '7:10 PM', category: 'food', name: "Trader Joe's", note: 'Groceries', amount: 57.2 },
  { daysAgo: 9, time: '9:00 AM', category: 'bills', name: 'Verizon', note: 'Internet', amount: 59.99 },
  { daysAgo: 9, time: '8:00 PM', category: 'food', name: 'Lucali', note: 'Dinner with Sam', amount: 46.8 },
  { daysAgo: 12, time: '4:20 PM', category: 'shopping', name: 'Nike', note: 'Sneakers', amount: 129.0 },
  { daysAgo: 12, time: '5:30 PM', category: 'transport', name: 'Uber', note: '', amount: 11.3 },
  { daysAgo: 14, time: '10:00 AM', category: 'bills', name: 'City Utilities', note: 'Water & trash', amount: 88.0 },
  { daysAgo: 14, time: '7:45 PM', category: 'food', name: "Roberta's", note: 'Pizza', amount: 24.5 },
  { daysAgo: 16, time: '7:00 AM', category: 'health', name: 'Crunch Gym', note: 'Membership', amount: 45.0 },
  { daysAgo: 16, time: '2:10 PM', category: 'other', name: 'Upwork', note: 'Freelance payout', amount: 350.0, isIncome: true },
  { daysAgo: 20, time: '9:00 AM', category: 'other', name: 'Acme Corp', note: 'Salary', amount: 2400.0, isIncome: true },
  { daysAgo: 22, time: '6:30 PM', category: 'food', name: 'Whole Foods', note: 'Groceries', amount: 63.2 },
  { daysAgo: 27, time: '8:00 PM', category: 'food', name: 'Via Carota', note: 'Dinner', amount: 44.0 },
  { daysAgo: 30, time: '5:40 PM', category: 'food', name: "Trader Joe's", note: 'Groceries', amount: 66.45 },
  { daysAgo: 31, time: '3:15 PM', category: 'health', name: 'CVS Pharmacy', note: '', amount: 19.99 },
  { daysAgo: 32, time: '8:10 AM', category: 'food', name: 'Blue Bottle Coffee', note: '', amount: 6.1 },
  { daysAgo: 33, time: '8:30 PM', category: 'food', name: 'Lilia', note: 'Dinner', amount: 52.3 },
  { daysAgo: 34, time: '10:00 AM', category: 'bills', name: 'City Utilities', note: '', amount: 120.0 },
  { daysAgo: 35, time: '2:20 PM', category: 'shopping', name: 'Vans', note: 'Shoes', amount: 98.0 },
  { daysAgo: 37, time: '11:00 AM', category: 'health', name: 'Dr. Patel', note: 'Checkup', amount: 150.0 },
  { daysAgo: 38, time: '9:00 AM', category: 'bills', name: 'Verizon', note: 'Phone bill', amount: 65.0 },
  { daysAgo: 41, time: '7:30 PM', category: 'fun', name: 'Bowery Ballroom', note: 'Concert', amount: 85.0 },
  { daysAgo: 42, time: '6:00 AM', category: 'transport', name: 'Delta', note: 'Flight to Chicago', amount: 380.0 },
  { daysAgo: 43, time: '5:00 PM', category: 'transport', name: 'Shell', note: 'Gas', amount: 43.1 },
  { daysAgo: 45, time: '6:45 PM', category: 'food', name: 'Whole Foods', note: 'Groceries', amount: 71.2 },
];

export async function seedIfEmpty(database: SQLiteDatabase): Promise<void> {
  const existing = await countTransactions(database);
  if (existing > 0) return;

  const today = toDateKey(new Date());
  for (const row of SEED) {
    const date = shiftDateKey(today, -row.daysAgo);
    await insertTransaction(database, {
      date,
      time: row.time,
      createdAt: Date.now() - row.daysAgo * 86_400_000,
      category: row.category,
      name: row.name,
      note: row.note,
      amount: row.amount,
      isIncome: !!row.isIncome,
      photoPath: null,
    });
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- seed.test.ts`
Expected: 3 passed.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all suites pass (sanity, categories, format, db, transactions, settings, seed).

- [ ] **Step 10: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts src/lib/seed.ts src/lib/seed.test.ts
git commit -m "Add settings persistence and seed data"
```

---

### Task 8: Toast component

**Files:**
- Create: `src/components/expense/toast.tsx`

**Interfaces:**
- Produces: `ToastProvider({ children })`, `useToast(): { show(message: string): void }` — `ToastProvider` wraps the root layout (Task 15); `useToast` is called from the save/delete/update flows (Tasks 20, 23, 24, 25, 26).

- [ ] **Step 1: Write `src/components/expense/toast.tsx`**

```tsx
import { createContext, useCallback, useContext, useRef, useState } from 'react';

import { Text, View } from '@/tw';

interface ToastContextValue {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(next);
    timeoutRef.current = setTimeout(() => setMessage(null), 1800);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message !== null && (
        <View
          className="absolute left-1/2 z-[60] rounded-full px-5 py-2.5"
          style={{ bottom: 116, transform: [{ translateX: -0.5 * 160 }], backgroundColor: '#111111' }}>
          <Text className="text-[14px] font-semibold text-white">{message}</Text>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
```

Note: the `translateX` uses a fixed estimate since RN can't measure text width before layout for a `left: 50%` + `translateX: -50%` CSS trick; this is close enough for short confirmation strings ("Saved ✓", "Deleted", "Updated ✓") which is all this app ever shows. If a future message is much wider, revisit with `onLayout` measurement.

- [ ] **Step 2: Manual verification**

No standalone route renders `ToastProvider` yet — it will be verified end-to-end once wired into the root layout (Task 15) and triggered by a real action (Task 23's Save flow).

- [ ] **Step 3: Commit**

```bash
git add src/components/expense/toast.tsx
git commit -m "Add Toast component"
```

---

### Task 9: SegmentedControl component

**Files:**
- Create: `src/components/expense/segmented-control.tsx`

**Interfaces:**
- Produces: `SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void })` — used by History (Day/Month), Stats (Day/Month), and Add Details (Expense/Income).

- [ ] **Step 1: Write `src/components/expense/segmented-control.tsx`**

```tsx
import { Pressable, Text, View } from '@/tw';

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View className="flex-row rounded-[11px] p-[2.5px]" style={{ backgroundColor: '#EEEEEC' }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            className="flex-1 items-center rounded-[9px] py-2"
            style={{
              backgroundColor: active ? '#ffffff' : 'transparent',
              shadowColor: active ? '#000' : undefined,
              shadowOpacity: active ? 0.1 : 0,
              shadowRadius: active ? 3 : 0,
              shadowOffset: { width: 0, height: 1 },
              elevation: active ? 1 : 0,
            }}>
            <Text
              className="text-[14px] font-semibold"
              style={{ color: active ? '#111111' : '#9CA3AF' }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: Manual verification**

Verified visually once used in History (Task 17) and Add Details (Task 23) — tapping a segment should switch the active pill and its shadow/text-color state.

- [ ] **Step 3: Commit**

```bash
git add src/components/expense/segmented-control.tsx
git commit -m "Add SegmentedControl component"
```

---

### Task 10: CategoryChip component

**Files:**
- Create: `src/components/expense/category-chip.tsx`

**Interfaces:**
- Consumes: `Category`, `CategoryIcon`.
- Produces: `CategoryChip({ category, selected, onPress }: { category: Category; selected: boolean; onPress: () => void })` — used by Add Details' category picker (Task 23) and Transaction Detail's change-category picker (Task 24).

- [ ] **Step 1: Write `src/components/expense/category-chip.tsx`**

```tsx
import { CategoryIcon } from './category-icon';
import type { Category } from '@/lib/categories';
import { Pressable, Text, View } from '@/tw';

interface CategoryChipProps {
  category: Category;
  selected: boolean;
  onPress: () => void;
}

export function CategoryChip({ category, selected, onPress }: CategoryChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-[7px] whitespace-nowrap rounded-xl py-2 pl-[9px] pr-[13px]"
      style={{
        backgroundColor: selected ? category.chip : '#ffffff',
        borderWidth: 1.5,
        borderColor: selected ? category.fg : '#ECECEA',
      }}>
      <View className="h-[26px] w-[26px] items-center justify-center rounded-lg" style={{ backgroundColor: category.chip }}>
        <CategoryIcon category={category.id} color={category.fg} size={16} />
      </View>
      <Text className="text-[13px] font-bold" style={{ color: selected ? '#111111' : '#6B7280' }}>
        {category.label}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 2: Manual verification**

Verified visually once used in Add Details (Task 23).

- [ ] **Step 3: Commit**

```bash
git add src/components/expense/category-chip.tsx
git commit -m "Add CategoryChip component"
```

---

### Task 11: TransactionRow component

**Files:**
- Create: `src/components/expense/transaction-row.tsx`

**Interfaces:**
- Consumes: `Transaction` from `lib/transactions.ts`, `categoryOf` from `lib/categories.ts`, `formatCurrency`/`dayLabel`/`toDateKey` from `lib/format.ts`, `CategoryIcon`.
- Produces: `TransactionRow({ transaction, todayKey, onPress }: { transaction: Transaction; todayKey: string; onPress: () => void })` — used by Home (Task 18) and History (Task 19).

- [ ] **Step 1: Write `src/components/expense/transaction-row.tsx`**

```tsx
import { CategoryIcon } from './category-icon';
import { categoryOf } from '@/lib/categories';
import { dayLabel, formatCurrency } from '@/lib/format';
import type { Transaction } from '@/lib/transactions';
import { Pressable, Text, View } from '@/tw';

interface TransactionRowProps {
  transaction: Transaction;
  todayKey: string;
  onPress: () => void;
}

export function TransactionRow({ transaction, todayKey, onPress }: TransactionRowProps) {
  const category = categoryOf(transaction.category);
  const subtitle = transaction.note ? `${category.label} · ${transaction.note}` : category.label;
  const when = transaction.date === todayKey ? transaction.time : dayLabel(transaction.date, todayKey);
  const amountStr = (transaction.isIncome ? '+' : '−') + formatCurrency(transaction.amount);
  const amountColor = transaction.isIncome ? '#10B981' : '#EF4444';

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3"
      style={{ borderBottomWidth: 0.5, borderBottomColor: '#F2F2F0' }}>
      <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: category.chip }}>
        <CategoryIcon category={category.id} color={category.fg} size={20} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold" numberOfLines={1}>
          {transaction.name}
        </Text>
        <Text className="mt-px text-[12.5px]" style={{ color: '#9CA3AF' }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {transaction.photoPath === null && (
        <View
          className="h-9 w-9 flex-shrink-0 flex-col gap-[3px] rounded-lg px-[6px] py-[7px]"
          style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ECECEA' }}>
          <View className="h-[2.5px] w-full rounded-sm" style={{ backgroundColor: '#E5E7EB' }} />
          <View className="h-[2.5px] w-[65%] rounded-sm" style={{ backgroundColor: '#E5E7EB' }} />
          <View className="h-[2.5px] w-[85%] rounded-sm" style={{ backgroundColor: '#E5E7EB' }} />
          <View className="h-[2.5px] w-[45%] rounded-sm" style={{ backgroundColor: '#D1D5DB' }} />
        </View>
      )}
      <View className="flex-shrink-0 items-end">
        <Text className="text-[15px] font-semibold" style={{ color: amountColor }}>
          {amountStr}
        </Text>
        <Text className="mt-px text-[11.5px]" style={{ color: '#9CA3AF' }}>
          {when}
        </Text>
      </View>
    </Pressable>
  );
}
```

Note: this ports the mockup's "receipt placeholder" glyph (shown when there's **no** photo) — re-reading the mockup, `t.ph` marks rows that show the placeholder icon, which in the mockup's seed data was actually used as a stand-in for "has an attached receipt image" (a decorative filled-document icon), not "no photo". For the real app, a transaction either has a real `photoPath` (show the actual thumbnail — deferred detail, out of scope for the row, full photo shows in Transaction Detail) or has none (show nothing extra, not a placeholder graphic, since a placeholder glyph implying "there's a receipt" would be misleading when there isn't one). This task therefore **omits** the placeholder graphic entirely rather than inverting the mockup's condition — simpler and honest about state. Revise the component above: delete the `{transaction.photoPath === null && (...)}` block and its contents.

- [ ] **Step 2: Manual verification**

Verified visually once used on Home (Task 18).

- [ ] **Step 3: Commit**

```bash
git add src/components/expense/transaction-row.tsx
git commit -m "Add TransactionRow component"
```

---

### Task 12: DonutChart component

**Files:**
- Create: `src/components/expense/donut-chart.tsx`

**Interfaces:**
- Consumes: `formatCurrency` from `lib/format.ts`.
- Produces: `DonutChart({ segments, total, size }: { segments: { color: string; value: number }[]; total: number; size: number })` — used by Stats (Task 21).

- [ ] **Step 1: Write `src/components/expense/donut-chart.tsx`**

```tsx
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';

import { formatCurrency } from '@/lib/format';

interface DonutChartProps {
  segments: { color: string; value: number }[];
  total: number;
  size: number;
}

export function DonutChart({ segments, total, size }: DonutChartProps) {
  const radius = size * 0.322; // matches mockup's 58/180 ratio
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeWidth = size * 0.139; // matches mockup's 25/180 ratio

  let offset = 0;
  const arcs = segments.map((segment, index) => {
    const length = total > 0 ? (segment.value / total) * circumference : 0;
    const dash = Math.max(length - 3, 0.5);
    const arc = (
      <Circle
        key={index}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={segment.color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
      />
    );
    offset += length;
    return arc;
  });

  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={center} cy={center} r={radius} fill="none" stroke="#F3F4F6" strokeWidth={strokeWidth} />
      {arcs}
      <G rotation={90} origin={`${center}, ${center}`}>
        <SvgText x={center} y={center - 4} textAnchor="middle" fontSize={20} fontWeight={800} fill="#111111">
          {formatCurrency(total)}
        </SvgText>
        <SvgText x={center} y={center + 14} textAnchor="middle" fontSize={11} fontWeight={600} fill="#9CA3AF">
          spent
        </SvgText>
      </G>
    </Svg>
  );
}
```

- [ ] **Step 2: Manual verification**

Verified visually once used on Stats (Task 21) with real seeded category totals.

- [ ] **Step 3: Commit**

```bash
git add src/components/expense/donut-chart.tsx
git commit -m "Add DonutChart component"
```

---

### Task 13: BarChart component

**Files:**
- Create: `src/components/expense/bar-chart.tsx`

**Interfaces:**
- Produces: `BarChart({ bars, gap }: { bars: { label: string; heightPct: number; color: string }[]; gap: number })` — used by Stats (Task 21).

- [ ] **Step 1: Write `src/components/expense/bar-chart.tsx`**

```tsx
import { Text, View } from '@/tw';

interface BarChartProps {
  bars: { label: string; heightPct: number; color: string }[];
  gap: number;
}

export function BarChart({ bars, gap }: BarChartProps) {
  return (
    <View>
      <View className="flex-row items-end" style={{ gap, height: 130 }}>
        {bars.map((bar, index) => (
          <View key={index} className="h-full flex-1 items-center justify-end">
            <View
              className="w-full rounded-sm"
              style={{ maxWidth: 16, minHeight: 2, height: `${bar.heightPct}%`, backgroundColor: bar.color }}
            />
          </View>
        ))}
      </View>
      <View className="mt-1.5 flex-row" style={{ gap }}>
        {bars.map((bar, index) => (
          <Text key={index} className="flex-1 text-center text-[9.5px] font-semibold" style={{ color: '#9CA3AF' }}>
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Manual verification**

Verified visually once used on Stats (Task 21).

- [ ] **Step 3: Commit**

```bash
git add src/components/expense/bar-chart.tsx
git commit -m "Add BarChart component"
```

---

### Task 14: Keypad component

**Files:**
- Create: `src/components/expense/keypad.tsx`

**Interfaces:**
- Produces: `Keypad({ onKeyPress }: { onKeyPress: (key: string) => void })` — emits `'0'`-`'9'`, `'.'`, `'⌫'`; used by Add Details (Task 23).

- [ ] **Step 1: Write `src/components/expense/keypad.tsx`**

```tsx
import { Pressable, Text, View } from '@/tw';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

interface KeypadProps {
  onKeyPress: (key: string) => void;
}

export function Keypad({ onKeyPress }: KeypadProps) {
  return (
    <View className="px-2 pb-9 pt-1.5" style={{ backgroundColor: '#F1F0EE' }}>
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => onKeyPress(key)}
            className="h-[45px] items-center justify-center rounded-[9px]"
            style={{
              width: '32%',
              backgroundColor: key === '.' || key === '⌫' ? '#E4E4E1' : '#ffffff',
            }}>
            <Text className="text-[23px] font-medium">{key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Manual verification**

Verified visually once used in Add Details (Task 23) — tapping digits should build up the amount display, `.` should only be insertable once, `⌫` should delete the last character.

- [ ] **Step 3: Commit**

```bash
git add src/components/expense/keypad.tsx
git commit -m "Add Keypad component"
```

---

### Task 15: TransactionDetail overlay and its context

**Files:**
- Create: `src/components/expense/transaction-detail.tsx`

**Interfaces:**
- Consumes: `useTransactions` from `lib/transactions.ts`, `categoryOf`, `CATEGORIES` from `lib/categories.ts`, `formatCurrency`, `toDateKey` from `lib/format.ts`, `CategoryIcon`, `CategoryChip`, `useToast` from `toast.tsx`, `router` from `expo-router` (for the Edit button, which navigates to `/` with an `editId` param).
- Produces: `TransactionDetailProvider({ children }: { children: React.ReactNode })`, `useOpenTransactionDetail(): (id: number) => void` — `TransactionDetailProvider` wraps `(tabs)/_layout.tsx` (Task 17); `useOpenTransactionDetail` is called by `TransactionRow` taps on Home (Task 18) and History (Task 19).

- [ ] **Step 1: Write `src/components/expense/transaction-detail.tsx`**

```tsx
import { router } from 'expo-router';
import { createContext, useContext, useState } from 'react';

import { CategoryChip } from './category-chip';
import { CategoryIcon } from './category-icon';
import { useToast } from './toast';
import { CATEGORIES, categoryOf } from '@/lib/categories';
import { formatCurrency, toDateKey } from '@/lib/format';
import { useTransactions } from '@/lib/transactions';
import { Pressable, ScrollView, Text, View } from '@/tw';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthDay(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

interface TransactionDetailContextValue {
  open: (id: number) => void;
}

const TransactionDetailContext = createContext<TransactionDetailContextValue | null>(null);

export function useOpenTransactionDetail(): (id: number) => void {
  const ctx = useContext(TransactionDetailContext);
  if (!ctx) throw new Error('useOpenTransactionDetail must be used within a TransactionDetailProvider');
  return ctx.open;
}

export function TransactionDetailProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [changingCategory, setChangingCategory] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { transactions, update, remove } = useTransactions();
  const { show: showToast } = useToast();

  const close = () => {
    setOpenId(null);
    setChangingCategory(false);
    setConfirmingDelete(false);
  };

  const tx = transactions.find((t) => t.id === openId) ?? null;

  return (
    <TransactionDetailContext.Provider value={{ open: setOpenId }}>
      {children}
      {tx !== null && (
        <View className="absolute inset-0 z-30" style={{ backgroundColor: '#FAFAFA' }}>
          <View className="flex-row items-center justify-between px-4 pb-1.5 pt-[66px]">
            <Pressable
              onPress={close}
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }}>
              <Text className="text-[18px] font-semibold" style={{ color: '#404040' }}>
                ‹
              </Text>
            </Pressable>
            <Text className="text-[16px] font-bold">Details</Text>
            <View className="w-9" />
          </View>
          <ScrollView className="flex-1 px-5 pb-10 pt-2.5">
            {tx.photoPath === null && (
              <View
                className="mb-4 rounded-[18px] p-[22px]"
                style={{ backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#D1D5DB', borderStyle: 'dashed' }}>
                <Text className="text-center text-[13px] font-semibold" style={{ color: '#9CA3AF' }}>
                  No receipt photo
                </Text>
              </View>
            )}
            <View className="mb-[18px] items-center">
              <Text
                className="text-[38px] font-extrabold"
                style={{ color: tx.isIncome ? '#10B981' : '#111111', letterSpacing: -1 }}>
                {(tx.isIncome ? '+' : '−') + formatCurrency(tx.amount)}
              </Text>
              <Text className="mt-0.5 text-[15px] font-semibold">{tx.name}</Text>
              <View
                className="mt-2.5 flex-row items-center gap-[7px] rounded-full py-1.5 pl-2 pr-3.5"
                style={{ backgroundColor: categoryOf(tx.category).chip }}>
                <CategoryIcon category={categoryOf(tx.category).id} color={categoryOf(tx.category).fg} size={16} />
                <Text className="text-[13px] font-semibold" style={{ color: categoryOf(tx.category).fg }}>
                  {categoryOf(tx.category).label}
                </Text>
              </View>
            </View>
            <View className="mb-3 overflow-hidden rounded-2xl" style={{ backgroundColor: '#ffffff' }}>
              <View className="flex-row justify-between px-4 py-3.5" style={{ borderBottomWidth: 0.5, borderBottomColor: '#F2F2F0' }}>
                <Text className="text-[14px] font-semibold" style={{ color: '#9CA3AF' }}>Date</Text>
                <Text className="text-[14px] font-semibold">
                  {toDateKey(new Date()) === tx.date ? 'Today' : `${monthDay(tx.date)}, ${tx.date.slice(0, 4)}`}
                </Text>
              </View>
              <View className="flex-row justify-between px-4 py-3.5" style={{ borderBottomWidth: 0.5, borderBottomColor: '#F2F2F0' }}>
                <Text className="text-[14px] font-semibold" style={{ color: '#9CA3AF' }}>Time</Text>
                <Text className="text-[14px] font-semibold">{tx.time}</Text>
              </View>
              <View className="flex-row justify-between gap-4 px-4 py-3.5">
                <Text className="flex-shrink-0 text-[14px] font-semibold" style={{ color: '#9CA3AF' }}>Note</Text>
                <Text className="text-right text-[14px] font-semibold">{tx.note || '—'}</Text>
              </View>
            </View>
            {changingCategory && (
              <View className="mb-3 rounded-2xl p-3.5" style={{ backgroundColor: '#ffffff' }}>
                <Text className="mb-2.5 text-[12px] font-semibold" style={{ color: '#9CA3AF' }}>
                  CHANGE CATEGORY
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {CATEGORIES.map((category) => (
                    <CategoryChip
                      key={category.id}
                      category={category}
                      selected={tx.category === category.id}
                      onPress={async () => {
                        await update(tx.id, { category: category.id });
                        setChangingCategory(false);
                        showToast('Category updated');
                      }}
                    />
                  ))}
                </View>
              </View>
            )}
            <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: '#ffffff' }}>
              <Pressable
                onPress={() => {
                  router.push({ pathname: '/', params: { editId: String(tx.id) } });
                  close();
                }}
                className="px-4 py-3.5"
                style={{ borderBottomWidth: 0.5, borderBottomColor: '#F2F2F0' }}>
                <Text className="text-[15px] font-semibold" style={{ color: '#10B981' }}>Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => setChangingCategory((v) => !v)}
                className="px-4 py-3.5"
                style={{ borderBottomWidth: confirmingDelete ? 0 : 0.5, borderBottomColor: '#F2F2F0' }}>
                <Text className="text-[15px] font-semibold">Change category</Text>
              </Pressable>
              {!confirmingDelete && (
                <Pressable onPress={() => setConfirmingDelete(true)} className="px-4 py-3.5">
                  <Text className="text-[15px] font-semibold" style={{ color: '#EF4444' }}>Delete</Text>
                </Pressable>
              )}
              {confirmingDelete && (
                <View className="flex-row items-center gap-2.5 px-4 py-3.5">
                  <Text className="flex-1 text-[13.5px] font-semibold" style={{ color: '#6B7280' }}>
                    Delete this transaction?
                  </Text>
                  <Pressable
                    onPress={() => setConfirmingDelete(false)}
                    className="rounded-[9px] px-3.5 py-1.5"
                    style={{ backgroundColor: '#F3F4F6' }}>
                    <Text className="text-[13px] font-bold">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      await remove(tx.id);
                      close();
                      showToast('Deleted');
                    }}
                    className="rounded-[9px] px-3.5 py-1.5"
                    style={{ backgroundColor: '#EF4444' }}>
                    <Text className="text-[13px] font-bold text-white">Delete</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      )}
    </TransactionDetailContext.Provider>
  );
}
```

- [ ] **Step 2: Manual verification**

No screen opens this yet — verified end-to-end once wired into `(tabs)/_layout.tsx` (Task 17) and triggered from a real `TransactionRow` tap (Task 18).

- [ ] **Step 3: Commit**

```bash
git add src/components/expense/transaction-detail.tsx
git commit -m "Add TransactionDetail overlay and its context"
```

---

### Task 16: Root layout

**Files:**
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`, `seedIfEmpty` from `lib/seed.ts`, `ToastProvider` from `toast.tsx`.
- Produces: the root `Stack` with two screens (`index`, `(tabs)`), both headerless — used implicitly by Expo Router; every route in Tasks 17–27 renders inside this tree.

- [ ] **Step 1: Read the current file to see what's being replaced**

The existing `src/app/_layout.tsx` renders `ThemeProvider`/`SplashScreen`/`AnimatedSplashOverlay`/`AppTabs` from the default template — all superseded by this app. Confirm via:
Run: `cat src/app/_layout.tsx` (or open it) — expect the current default-template content described in this repo's history.

- [ ] **Step 2: Replace `src/app/_layout.tsx`**

```tsx
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { ToastProvider } from '@/components/expense/toast';
import { db } from '@/lib/db';
import { seedIfEmpty } from '@/lib/seed';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedIfEmpty(db)
      .catch((error) => console.error('Failed to seed database', error))
      .finally(() => {
        setReady(true);
        SplashScreen.hideAsync();
      });
  }, []);

  if (!ready) return null;

  return (
    <ToastProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ToastProvider>
  );
}
```

- [ ] **Step 3: Manual verification**

This alone won't render a full app yet (`index` and `(tabs)` routes don't exist as real screens until Tasks 17 and 23). Confirm only that TypeScript is happy:
Run: `npx tsc --noEmit`
Expected: errors about missing `index`/`(tabs)` route modules are fine at this point (Expo Router resolves routes at the file-system level, not via import — `tsc` won't actually complain about that); if it complains about anything else in this file, fix it before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "Replace root layout with expense tracker shell"
```

---

### Task 17: Custom TabBar and tabs navigation shell

**Files:**
- Create: `src/components/expense/tab-bar.tsx`
- Create: `src/app/(tabs)/_layout.tsx`
- Create: `src/app/(tabs)/home.tsx` (stub, filled in by Task 18)
- Create: `src/app/(tabs)/history.tsx` (stub, filled in by Task 19)
- Create: `src/app/(tabs)/stats.tsx` (stub, filled in by Task 20)
- Create: `src/app/(tabs)/settings.tsx` (stub, filled in by Task 21)

**Interfaces:**
- Consumes: `TransactionDetailProvider` from `transaction-detail.tsx` (Task 15).
- Produces: routes `/home`, `/history`, `/stats`, `/settings`, all reachable from the `TabBar`; the FAB button navigates to `/` (Capture, not yet built — see verification note).

- [ ] **Step 1: Write `src/components/expense/tab-bar.tsx`**

```tsx
import { router, usePathname } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';

import { Pressable, Text, View } from '@/tw';

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 11l8-7 8 7" />
      <Path d="M6 9.5V20h12V9.5" />
    </Svg>
  );
}

function HistoryIcon({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3.2 1.9" />
    </Svg>
  );
}

function StatsIcon({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
      <Path d="M5 20v-7M12 20V4.5M19 20v-10" />
    </Svg>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

const LEFT_TABS = [
  { path: '/home', label: 'Home', Icon: HomeIcon },
  { path: '/history', label: 'History', Icon: HistoryIcon },
] as const;

const RIGHT_TABS = [
  { path: '/stats', label: 'Stats', Icon: StatsIcon },
  { path: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const;

function TabButton({ path, label, Icon }: { path: string; label: string; Icon: (props: { color: string }) => React.ReactElement }) {
  const pathname = usePathname();
  const active = pathname === path;
  const color = active ? '#10B981' : '#9CA3AF';
  return (
    <Pressable onPress={() => router.push(path as never)} className="flex-1 items-center gap-[3px] pt-1.5">
      <Icon color={color} />
      <Text className="text-[10px] font-semibold" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function TabBar() {
  return (
    <View
      className="absolute inset-x-0 bottom-0 z-20 flex-row items-end px-2 pb-7 pt-1.5"
      style={{ backgroundColor: 'rgba(250,250,250,0.88)', borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.07)' }}>
      {LEFT_TABS.map((tab) => (
        <TabButton key={tab.path} {...tab} />
      ))}
      <View className="flex-1 items-center justify-center">
        <Pressable
          onPress={() => router.push('/')}
          className="h-14 w-14 items-center justify-center rounded-full"
          style={{
            backgroundColor: '#10B981',
            transform: [{ translateY: -16 }],
            shadowColor: '#10B981',
            shadowOpacity: 0.4,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
          }}>
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 8.5a2 2 0 0 1 2-2h1.6l1.1-1.7a1.5 1.5 0 0 1 1.2-.8h4.2a1.5 1.5 0 0 1 1.2.8l1.1 1.7H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
            <Circle cx={12} cy={12.5} r={3.4} />
          </Svg>
        </Pressable>
      </View>
      {RIGHT_TABS.map((tab) => (
        <TabButton key={tab.path} {...tab} />
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Write `src/app/(tabs)/_layout.tsx`**

```tsx
import { Slot } from 'expo-router';

import { TabBar } from '@/components/expense/tab-bar';
import { TransactionDetailProvider } from '@/components/expense/transaction-detail';
import { View } from '@/tw';

export default function TabsLayout() {
  return (
    <TransactionDetailProvider>
      <View className="flex-1" style={{ backgroundColor: '#FAFAFA' }}>
        <Slot />
        <TabBar />
      </View>
    </TransactionDetailProvider>
  );
}
```

- [ ] **Step 3: Write stub route files**

```tsx
// src/app/(tabs)/home.tsx
import { Text, View } from '@/tw';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center" style={{ paddingTop: 70 }}>
      <Text>Home (Task 18)</Text>
    </View>
  );
}
```

```tsx
// src/app/(tabs)/history.tsx
import { Text, View } from '@/tw';

export default function HistoryScreen() {
  return (
    <View className="flex-1 items-center justify-center" style={{ paddingTop: 70 }}>
      <Text>History (Task 19)</Text>
    </View>
  );
}
```

```tsx
// src/app/(tabs)/stats.tsx
import { Text, View } from '@/tw';

export default function StatsScreen() {
  return (
    <View className="flex-1 items-center justify-center" style={{ paddingTop: 70 }}>
      <Text>Stats (Task 20)</Text>
    </View>
  );
}
```

```tsx
// src/app/(tabs)/settings.tsx
import { Text, View } from '@/tw';

export default function SettingsScreen() {
  return (
    <View className="flex-1 items-center justify-center" style={{ paddingTop: 70 }}>
      <Text>Settings (Task 21)</Text>
    </View>
  );
}
```

- [ ] **Step 4: Manual verification**

Use the `run` skill (or `npx expo start --web`) to launch the app. Navigate directly to `/home`, `/history`, `/stats`, `/settings` (on web, edit the URL; on a simulator, temporarily set `initialRouteName` or navigate via a temporary button) and confirm:
- Each stub screen renders its placeholder text.
- The `TabBar` is visible at the bottom on all four, with the active tab's icon/label colored `#10B981` and inactive ones `#9CA3AF`.
- Tapping a tab navigates to the corresponding route.
- Tapping the center FAB navigates to `/` — at this point in the plan `/` still renders the **old default-template Welcome screen** (Task 23 replaces it with Capture); seeing the old template there is expected and correct for this task, not a bug.

- [ ] **Step 5: Commit**

```bash
git add src/components/expense/tab-bar.tsx "src/app/(tabs)/_layout.tsx" "src/app/(tabs)/home.tsx" "src/app/(tabs)/history.tsx" "src/app/(tabs)/stats.tsx" "src/app/(tabs)/settings.tsx"
git commit -m "Add custom TabBar and tabs navigation shell"
```

---

### Task 18: Home screen

**Files:**
- Modify: `src/app/(tabs)/home.tsx`

**Interfaces:**
- Consumes: `useTransactions` from `lib/transactions.ts`, `getMonthlyBudget` and `db` from `lib/settings.ts`/`lib/db.ts`, `formatCurrency`, `toDateKey`, `shiftDateKey`, `monthKey` from `lib/format.ts`, `TransactionRow` (Task 11), `useOpenTransactionDetail` (Task 15).
- Produces: the `/home` screen — the recent-transactions list opens `TransactionDetail`; "See all" navigates to `/history`.

- [ ] **Step 1: Write `src/app/(tabs)/home.tsx`**

```tsx
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { TransactionRow } from '@/components/expense/transaction-row';
import { useOpenTransactionDetail } from '@/components/expense/transaction-detail';
import { db } from '@/lib/db';
import { formatCurrency, monthKey, shiftDateKey, toDateKey } from '@/lib/format';
import { getMonthlyBudget } from '@/lib/settings';
import { useTransactions } from '@/lib/transactions';
import { Pressable, ScrollView, Text, View } from '@/tw';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { transactions } = useTransactions();
  const openTransactionDetail = useOpenTransactionDetail();
  const [budget, setBudget] = useState(2000);

  useFocusEffect(
    useCallback(() => {
      getMonthlyBudget(db).then(setBudget);
    }, [])
  );

  const now = new Date();
  const todayKey = toDateKey(now);
  const thisMonth = monthKey(todayKey);
  const lastMonthKey = monthKey(toDateKey(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())));
  const dayOfMonth = now.getDate();

  const thisMonthSpent = transactions
    .filter((t) => !t.isIncome && monthKey(t.date) === thisMonth)
    .reduce((sum, t) => sum + t.amount, 0);
  const lastMonthToDateSpent = transactions
    .filter((t) => !t.isIncome && monthKey(t.date) === lastMonthKey && Number(t.date.slice(8, 10)) <= dayOfMonth)
    .reduce((sum, t) => sum + t.amount, 0);
  const diffPct = lastMonthToDateSpent > 0 ? ((thisMonthSpent - lastMonthToDateSpent) / lastMonthToDateSpent) * 100 : 0;

  const todaySpent = transactions.filter((t) => !t.isIncome && t.date === todayKey).reduce((sum, t) => sum + t.amount, 0);
  const weekStart = shiftDateKey(todayKey, -6);
  const weekSpent = transactions
    .filter((t) => !t.isIncome && t.date >= weekStart && t.date <= todayKey)
    .reduce((sum, t) => sum + t.amount, 0);

  const budgetPct = Math.min(100, (thisMonthSpent / budget) * 100);
  const recent = transactions.filter((t) => monthKey(t.date) === thisMonth).slice(0, 5);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 70, paddingHorizontal: 20, paddingBottom: 130 }}>
      <View className="mb-5 flex-row items-center justify-between">
        <View>
          <Text className="text-[22px] font-bold" style={{ letterSpacing: -0.3 }}>
            {greeting(now.getHours())}
          </Text>
          <Text className="mt-0.5 text-[13px]" style={{ color: '#9CA3AF' }}>
            {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#10B981' }}>
          <Text className="text-[15px] font-bold text-white">S</Text>
        </View>
      </View>

      <View className="mb-3 rounded-[20px] p-5" style={{ backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 1 } }}>
        <Text className="text-[12px] font-semibold uppercase" style={{ color: '#9CA3AF', letterSpacing: 1 }}>
          Spent this month
        </Text>
        <Text className="mb-1 mt-1.5 text-[40px] font-extrabold" style={{ letterSpacing: -1 }}>
          {formatCurrency(thisMonthSpent)}
        </Text>
        <Text className="mb-3.5 text-[13px] font-semibold" style={{ color: diffPct <= 0 ? '#10B981' : '#EF4444' }}>
          {(diffPct <= 0 ? '↓ ' : '↑ ') + Math.abs(Math.round(diffPct)) + '% vs last month'}
        </Text>
        <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: '#F3F4F6' }}>
          <View className="h-full rounded-full" style={{ width: `${budgetPct}%`, backgroundColor: '#10B981' }} />
        </View>
        <View className="mt-2 flex-row justify-between">
          <Text className="text-[12px]" style={{ color: '#9CA3AF' }}>
            {formatCurrency(thisMonthSpent)} of {formatCurrency(budget)} budget
          </Text>
          <Text className="text-[12px]" style={{ color: '#9CA3AF' }}>
            {Math.round(budgetPct)}%
          </Text>
        </View>
      </View>

      <View className="mb-6 flex-row gap-3">
        <View className="flex-1 rounded-2xl px-4 py-3.5" style={{ backgroundColor: '#ffffff' }}>
          <Text className="text-[12px] font-semibold" style={{ color: '#9CA3AF' }}>Today</Text>
          <Text className="mt-[3px] text-[20px] font-bold">{formatCurrency(todaySpent)}</Text>
        </View>
        <View className="flex-1 rounded-2xl px-4 py-3.5" style={{ backgroundColor: '#ffffff' }}>
          <Text className="text-[12px] font-semibold" style={{ color: '#9CA3AF' }}>This week</Text>
          <Text className="mt-[3px] text-[20px] font-bold">{formatCurrency(weekSpent)}</Text>
        </View>
      </View>

      <View className="mb-2.5 flex-row items-baseline justify-between">
        <Text className="text-[17px] font-bold" style={{ letterSpacing: -0.2 }}>Recent transactions</Text>
        <Pressable onPress={() => router.push('/history')}>
          <Text className="text-[13px] font-semibold" style={{ color: '#10B981' }}>See all</Text>
        </Pressable>
      </View>
      <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: '#ffffff' }}>
        {recent.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            todayKey={todayKey}
            onPress={() => openTransactionDetail(transaction.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Manual verification**

Run the app (`run` skill) and navigate to `/home`:
- Hero card shows a real spent-this-month total from the seeded data, a budget progress bar, and today/week stat cards with plausible non-zero values.
- Recent transactions list shows up to 5 rows from this month, most recent first.
- Tapping a row opens `TransactionDetail` (from Task 15) with matching data; tapping the back chevron closes it.
- Tapping "See all" navigates to `/history`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/home.tsx"
git commit -m "Implement Home screen"
```

---

### Task 19: History screen

**Files:**
- Modify: `src/app/(tabs)/history.tsx`

**Interfaces:**
- Consumes: `useTransactions`, `Transaction` from `lib/transactions.ts`, `CATEGORIES`, `categoryOf` from `lib/categories.ts`, `formatCurrency`, `toDateKey`, `shiftDateKey`, `monthKey`, `dayLabel` from `lib/format.ts`, `SegmentedControl` (Task 9), `TransactionRow` (Task 11), `useOpenTransactionDetail` (Task 15).
- Produces: the `/history` screen.

- [ ] **Step 1: Write `src/app/(tabs)/history.tsx`**

```tsx
import { useMemo, useState } from 'react';

import { SegmentedControl } from '@/components/expense/segmented-control';
import { useOpenTransactionDetail } from '@/components/expense/transaction-detail';
import { TransactionRow } from '@/components/expense/transaction-row';
import { CATEGORIES, categoryOf } from '@/lib/categories';
import { dayLabel, formatCurrency, monthKey, shiftDateKey, toDateKey } from '@/lib/format';
import { type Transaction, useTransactions } from '@/lib/transactions';
import { Pressable, ScrollView, Text, View } from '@/tw';

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFull(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES_FULL[m - 1]} ${y}`;
}

export default function HistoryScreen() {
  const { transactions } = useTransactions();
  const openTransactionDetail = useOpenTransactionDetail();

  const todayKey = toDateKey(new Date());
  const thisMonth = monthKey(todayKey);

  const [mode, setMode] = useState<'day' | 'month'>('month');
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const periodLabel = mode === 'day' ? dayLabel(selectedDay, todayKey) : monthLabelFull(selectedMonth);
  const canGoNext = mode === 'day' ? selectedDay < todayKey : selectedMonth < thisMonth;

  const goPrev = () => {
    if (mode === 'day') setSelectedDay(shiftDateKey(selectedDay, -1));
    else setSelectedMonth(shiftMonthKey(selectedMonth, -1));
  };
  const goNext = () => {
    if (!canGoNext) return;
    if (mode === 'day') setSelectedDay(shiftDateKey(selectedDay, 1));
    else setSelectedMonth(shiftMonthKey(selectedMonth, 1));
  };

  const periodTxs = useMemo(
    () =>
      transactions.filter((t) => (mode === 'day' ? t.date === selectedDay : monthKey(t.date) === selectedMonth)),
    [transactions, mode, selectedDay, selectedMonth]
  );

  const spent = periodTxs.filter((t) => !t.isIncome).reduce((sum, t) => sum + t.amount, 0);
  const income = periodTxs.filter((t) => t.isIncome).reduce((sum, t) => sum + t.amount, 0);
  const net = income - spent;

  const filtered = categoryFilter === 'all' ? periodTxs : periodTxs.filter((t) => t.category === categoryFilter);

  const groups = useMemo(() => {
    const byDate = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const list = byDate.get(t.date) ?? [];
      list.push(t);
      byDate.set(t.date, list);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, items]) => {
        const subtotal = items.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0);
        return {
          date,
          header: dayLabel(date, todayKey),
          subtotalLabel: (subtotal < 0 ? '−' : '+') + formatCurrency(Math.abs(subtotal)),
          items,
        };
      });
  }, [filtered, todayKey]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 70, paddingHorizontal: 20, paddingBottom: 130 }}>
      <Text className="mb-3.5 text-[28px] font-extrabold" style={{ letterSpacing: -0.5 }}>History</Text>

      <View className="mb-3 flex-row items-center gap-2.5">
        <View style={{ flexShrink: 0, width: 132 }}>
          <SegmentedControl
            options={[
              { value: 'day', label: 'Day' },
              { value: 'month', label: 'Month' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
        <View className="flex-1 flex-row items-center justify-between rounded-[10px] px-1.5 py-1" style={{ backgroundColor: '#ffffff' }}>
          <Pressable onPress={goPrev} className="h-7 w-7 items-center justify-center rounded-lg">
            <Text className="text-[17px] font-semibold" style={{ color: '#6B7280' }}>‹</Text>
          </Pressable>
          <Text className="text-[13.5px] font-bold">{periodLabel}</Text>
          <Pressable onPress={goNext} disabled={!canGoNext} className="h-7 w-7 items-center justify-center rounded-lg">
            <Text className="text-[17px] font-semibold" style={{ color: canGoNext ? '#6B7280' : '#D1D5DB' }}>›</Text>
          </Pressable>
        </View>
      </View>

      <View className="mb-3 flex-row overflow-hidden rounded-[14px]" style={{ backgroundColor: '#ffffff' }}>
        <View className="flex-1 items-center py-3">
          <Text className="text-[11px] font-semibold" style={{ color: '#9CA3AF' }}>Spent</Text>
          <Text className="mt-0.5 text-[15px] font-bold" style={{ color: '#EF4444' }}>−{formatCurrency(spent)}</Text>
        </View>
        <View style={{ width: 0.5, backgroundColor: '#F0F0EE', marginVertical: 10 }} />
        <View className="flex-1 items-center py-3">
          <Text className="text-[11px] font-semibold" style={{ color: '#9CA3AF' }}>Income</Text>
          <Text className="mt-0.5 text-[15px] font-bold" style={{ color: '#10B981' }}>+{formatCurrency(income)}</Text>
        </View>
        <View style={{ width: 0.5, backgroundColor: '#F0F0EE', marginVertical: 10 }} />
        <View className="flex-1 items-center py-3">
          <Text className="text-[11px] font-semibold" style={{ color: '#9CA3AF' }}>Net</Text>
          <Text className="mt-0.5 text-[15px] font-bold" style={{ color: net < 0 ? '#EF4444' : '#10B981' }}>
            {(net < 0 ? '−' : '+') + formatCurrency(Math.abs(net))}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }} className="mb-1.5">
        <Pressable
          onPress={() => setCategoryFilter('all')}
          className="flex-shrink-0 rounded-full px-3.5 py-1.5"
          style={{
            backgroundColor: categoryFilter === 'all' ? '#111111' : '#ffffff',
            borderWidth: 1,
            borderColor: categoryFilter === 'all' ? '#111111' : '#E7E7E4',
          }}>
          <Text className="text-[12.5px] font-semibold" style={{ color: categoryFilter === 'all' ? '#ffffff' : '#6B7280' }}>
            All
          </Text>
        </Pressable>
        {CATEGORIES.map((category) => {
          const selected = categoryFilter === category.id;
          return (
            <Pressable
              key={category.id}
              onPress={() => setCategoryFilter(category.id)}
              className="flex-shrink-0 rounded-full px-3.5 py-1.5"
              style={{
                backgroundColor: selected ? '#111111' : '#ffffff',
                borderWidth: 1,
                borderColor: selected ? '#111111' : '#E7E7E4',
              }}>
              <Text className="text-[12.5px] font-semibold" style={{ color: selected ? '#ffffff' : '#6B7280' }}>
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View className="items-center px-8 py-14">
          <View
            className="mb-5 h-[110px] w-[88px] items-center justify-center rounded-[10px]"
            style={{ backgroundColor: '#ffffff', transform: [{ rotate: '-4deg' }], shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
            <Text style={{ fontSize: 28 }}>🧾</Text>
          </View>
          <Text className="mb-1.5 text-[16px] font-bold">No transactions yet</Text>
          <Text className="text-center text-[13.5px] leading-5" style={{ color: '#9CA3AF' }}>
            Snap your first receipt with the camera button below
          </Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.date}>
            <View className="flex-row items-baseline justify-between px-1 pb-2 pt-3">
              <Text className="text-[13px] font-bold" style={{ color: '#6B7280' }}>{group.header}</Text>
              <Text className="text-[12.5px] font-semibold" style={{ color: '#9CA3AF' }}>{group.subtotalLabel}</Text>
            </View>
            <View className="mb-1.5 overflow-hidden rounded-2xl" style={{ backgroundColor: '#ffffff' }}>
              {group.items.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  todayKey={todayKey}
                  onPress={() => openTransactionDetail(transaction.id)}
                />
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}
```

Note: the empty-state graphic is simplified to an emoji-in-a-card rather than the mockup's hand-drawn receipt illustration (rows of gray bars) — a deliberate scope trim for a rarely-seen edge case, not a placeholder. `categoryOf` is imported but unused by this simplified version; remove that import if `tsc`/lint flags it as unused.

- [ ] **Step 2: Manual verification**

Run the app, navigate to `/history`:
- Default view is Month mode, current month, showing spent/income/net and day-grouped transactions.
- Switching to Day mode shows only today's transactions (from seed data).
- Prev/Next navigate periods; Next is disabled (grayed, non-interactive) once you reach the current day/month.
- Tapping a category chip filters the list; tapping "All" clears the filter.
- Tapping a row opens `TransactionDetail`.
- Filter to a category with zero matches in the selected period (if any) and confirm the empty state renders.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/history.tsx"
git commit -m "Implement History screen"
```

---

### Task 20: Stats screen

**Files:**
- Modify: `src/app/(tabs)/stats.tsx`

**Interfaces:**
- Consumes: `useTransactions` from `lib/transactions.ts`, `CATEGORIES` from `lib/categories.ts`, `formatCurrency`, `toDateKey`, `monthKey` from `lib/format.ts`, `DonutChart` (Task 12), `BarChart` (Task 13), `SegmentedControl` (Task 9), `CategoryIcon` (Task 3).
- Produces: the `/stats` screen.

- [ ] **Step 1: Write `src/app/(tabs)/stats.tsx`**

```tsx
import { useMemo, useState } from 'react';

import { BarChart } from '@/components/expense/bar-chart';
import { CategoryIcon } from '@/components/expense/category-icon';
import { DonutChart } from '@/components/expense/donut-chart';
import { SegmentedControl } from '@/components/expense/segmented-control';
import { CATEGORIES } from '@/lib/categories';
import { formatCurrency, monthKey, toDateKey } from '@/lib/format';
import { useTransactions } from '@/lib/transactions';
import { Pressable, ScrollView, Text, View } from '@/tw';

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export default function StatsScreen() {
  const { transactions } = useTransactions();
  const now = new Date();
  const todayKey = toDateKey(now);
  const thisMonth = monthKey(todayKey);

  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [barMode, setBarMode] = useState<'day' | 'month'>('day');

  const canGoNext = selectedMonth < thisMonth;

  const monthTxs = useMemo(
    () => transactions.filter((t) => !t.isIncome && monthKey(t.date) === selectedMonth),
    [transactions, selectedMonth]
  );
  const total = monthTxs.reduce((sum, t) => sum + t.amount, 0);

  const byCategory = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        sum: monthTxs.filter((t) => t.category === category.id).reduce((sum, t) => sum + t.amount, 0),
      }))
        .filter((x) => x.sum > 0)
        .sort((a, b) => b.sum - a.sum),
    [monthTxs]
  );

  const donutSegments = byCategory.map((x) => ({ color: x.category.fg, value: x.sum }));

  const dayBars = useMemo(() => {
    const numDays = daysInMonth(selectedMonth);
    const totals = Array.from({ length: numDays }, (_, i) => {
      const dayKey = `${selectedMonth}-${String(i + 1).padStart(2, '0')}`;
      return monthTxs.filter((t) => t.date === dayKey).reduce((sum, t) => sum + t.amount, 0);
    });
    const max = Math.max(...totals, 1);
    return totals.map((value, i) => {
      const dayKey = `${selectedMonth}-${String(i + 1).padStart(2, '0')}`;
      return {
        label: (i + 1) % 7 === 1 ? String(i + 1) : '',
        heightPct: Math.round((value / max) * 100),
        color: dayKey === todayKey ? '#10B981' : value > 0 ? '#6EE7B7' : '#EFEFED',
      };
    });
  }, [monthTxs, selectedMonth, todayKey]);

  const monthBars = useMemo(() => {
    const keys = Array.from({ length: 6 }, (_, i) =>
      monthKey(toDateKey(new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)))
    );
    const totals = keys.map((mk) =>
      transactions.filter((t) => !t.isIncome && monthKey(t.date) === mk).reduce((sum, t) => sum + t.amount, 0)
    );
    const max = Math.max(...totals, 1);
    return keys.map((mk, i) => ({
      label: MONTH_NAMES_FULL[Number(mk.slice(5, 7)) - 1][0],
      heightPct: Math.round((totals[i] / max) * 100),
      color: mk === thisMonth ? '#10B981' : totals[i] > 0 ? '#6EE7B7' : '#EFEFED',
    }));
  }, [transactions, thisMonth]);

  const topCategories = byCategory.slice(0, 5);
  const topMax = topCategories[0]?.sum ?? 1;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 70, paddingHorizontal: 20, paddingBottom: 130 }}>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-[28px] font-extrabold" style={{ letterSpacing: -0.5 }}>Stats</Text>
        <View className="flex-row items-center gap-0.5 rounded-[10px] px-1.5 py-1" style={{ backgroundColor: '#ffffff' }}>
          <Pressable onPress={() => setSelectedMonth(shiftMonthKey(selectedMonth, -1))} className="h-[26px] w-[26px] items-center justify-center rounded-[7px]">
            <Text className="text-[16px] font-semibold" style={{ color: '#6B7280' }}>‹</Text>
          </Pressable>
          <Text className="min-w-[82px] px-1.5 text-center text-[13px] font-bold">
            {MONTH_NAMES_FULL[Number(selectedMonth.slice(5, 7)) - 1]} {selectedMonth.slice(0, 4)}
          </Text>
          <Pressable
            onPress={() => canGoNext && setSelectedMonth(shiftMonthKey(selectedMonth, 1))}
            disabled={!canGoNext}
            className="h-[26px] w-[26px] items-center justify-center rounded-[7px]">
            <Text className="text-[16px] font-semibold" style={{ color: canGoNext ? '#6B7280' : '#D1D5DB' }}>›</Text>
          </Pressable>
        </View>
      </View>

      <View className="mb-3 rounded-[20px] p-5" style={{ backgroundColor: '#ffffff' }}>
        <Text className="mb-2 text-[12px] font-semibold uppercase" style={{ color: '#9CA3AF', letterSpacing: 1 }}>
          Spending by category
        </Text>
        {byCategory.length === 0 ? (
          <Text className="py-8 text-center text-[13.5px]" style={{ color: '#9CA3AF' }}>No spending this month</Text>
        ) : (
          <>
            <View className="mb-1.5 items-center justify-center">
              <DonutChart segments={donutSegments} total={total} size={180} />
            </View>
            <View>
              {byCategory.map((x) => (
                <View key={x.category.id} className="flex-row items-center gap-2.5 px-0.5 py-1.5">
                  <View className="h-[10px] w-[10px] rounded-sm" style={{ backgroundColor: x.category.fg }} />
                  <Text className="flex-1 text-[13.5px] font-semibold">{x.category.label}</Text>
                  <Text className="text-[13px] font-bold">{formatCurrency(x.sum)}</Text>
                  <Text className="w-[38px] text-right text-[12px]" style={{ color: '#9CA3AF' }}>
                    {Math.round((x.sum / total) * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View className="mb-3 rounded-[20px] p-5" style={{ backgroundColor: '#ffffff' }}>
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-[12px] font-semibold uppercase" style={{ color: '#9CA3AF', letterSpacing: 1 }}>
            {barMode === 'day' ? 'Daily spending' : `Monthly totals · ${selectedMonth.slice(0, 4)}`}
          </Text>
          <View style={{ width: 116 }}>
            <SegmentedControl
              options={[
                { value: 'day', label: 'Day' },
                { value: 'month', label: 'Month' },
              ]}
              value={barMode}
              onChange={setBarMode}
            />
          </View>
        </View>
        <BarChart bars={barMode === 'day' ? dayBars : monthBars} gap={barMode === 'day' ? 2 : 6} />
      </View>

      <View className="rounded-[20px] p-5" style={{ backgroundColor: '#ffffff' }}>
        <Text className="mb-3 text-[12px] font-semibold uppercase" style={{ color: '#9CA3AF', letterSpacing: 1 }}>
          Top categories
        </Text>
        {topCategories.length === 0 ? (
          <Text className="py-4 text-center text-[13.5px]" style={{ color: '#9CA3AF' }}>Nothing to show yet</Text>
        ) : (
          <View style={{ gap: 14 }}>
            {topCategories.map((x) => (
              <View key={x.category.id} className="flex-row items-center gap-3">
                <View className="h-[34px] w-[34px] items-center justify-center rounded-[10px]" style={{ backgroundColor: x.category.chip }}>
                  <CategoryIcon category={x.category.id} color={x.category.fg} size={17} />
                </View>
                <View className="flex-1">
                  <View className="mb-1.5 flex-row justify-between">
                    <Text className="text-[13.5px] font-semibold">{x.category.label}</Text>
                    <Text className="text-[13px] font-bold">{formatCurrency(x.sum)}</Text>
                  </View>
                  <View className="h-[5px] overflow-hidden rounded-full" style={{ backgroundColor: '#F3F4F6' }}>
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${Math.round((x.sum / topMax) * 100)}%`, backgroundColor: x.category.fg }}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Manual verification**

Run the app, navigate to `/stats`:
- Donut chart renders with seeded-data category proportions; legend rows match the donut's colors and sum to ~100%.
- Switching Day/Month on the bar chart changes both its data and bar spacing.
- Prev/Next month navigation updates the donut, legend, and top categories; Next is disabled at the current month.
- Top categories list shows up to 5 categories sorted by spend, each bar's width proportional to the top category's spend.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/stats.tsx"
git commit -m "Implement Stats screen"
```

---

### Task 21: Settings screen (local settings only)

**Files:**
- Modify: `src/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `getMonthlyBudget`/`setMonthlyBudget`/`getDailyReminderEnabled`/`setDailyReminderEnabled` from `lib/settings.ts`, `formatCurrency` from `lib/format.ts`, `Switch`/`Host` from `@expo/ui`.
- Produces: the `/settings` screen with a working budget editor and a reminder toggle that persists locally. The profile row (static "Not signed in") is upgraded to a real Google sign-in flow in Task 27; the Export data row becomes interactive in Task 26; the reminder toggle gets real notification scheduling layered on top in Task 25 (this task only persists the boolean).

- [ ] **Step 1: Confirm the installed `@expo/ui` `Switch` API**

Per this project's `expo:expo-ui` skill and AGENTS.md's "Expo has changed, check versioned docs" directive, read the installed package's types rather than assuming:
Run: `cat node_modules/@expo/ui/build/Switch/index.d.ts` (or the closest matching path under `node_modules/@expo/ui` — search with `find node_modules/@expo/ui -iname '*switch*'` if the path differs)
Confirm the exact prop names for value and change-callback (expected `value: boolean` and `onValueChange: (value: boolean) => void`, matching React Native's own `Switch`, but verify before writing Step 2 — adjust the code below if the actual prop names differ).

- [ ] **Step 2: Write `src/app/(tabs)/settings.tsx`**

```tsx
import { Host, Switch } from '@expo/ui';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/format';
import { getDailyReminderEnabled, getMonthlyBudget, setDailyReminderEnabled, setMonthlyBudget } from '@/lib/settings';
import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';

export default function SettingsScreen() {
  const [budget, setBudget] = useState(2000);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getMonthlyBudget(db).then(setBudget);
      getDailyReminderEnabled(db).then(setReminderEnabled);
    }, [])
  );

  const startEditingBudget = () => {
    setBudgetDraft(String(budget));
    setEditingBudget(true);
  };

  const saveBudget = async () => {
    const value = Math.max(0, Math.round(Number(budgetDraft) || 0));
    await setMonthlyBudget(db, value);
    setBudget(value);
    setEditingBudget(false);
  };

  const onToggleReminder = async (enabled: boolean) => {
    setReminderEnabled(enabled);
    await setDailyReminderEnabled(db, enabled);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 70, paddingHorizontal: 20, paddingBottom: 130 }}>
      <Text className="mb-4 text-[28px] font-extrabold" style={{ letterSpacing: -0.5 }}>Settings</Text>

      <View className="mb-3 flex-row items-center gap-3.5 rounded-2xl p-4" style={{ backgroundColor: '#ffffff' }}>
        <View className="h-[52px] w-[52px] items-center justify-center rounded-full" style={{ backgroundColor: '#10B981' }}>
          <Text className="text-[20px] font-bold text-white">S</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[16px] font-bold">Not signed in</Text>
          <Text className="text-[13px]" style={{ color: '#9CA3AF' }}>Sign in with Google to sync later</Text>
        </View>
      </View>

      <View className="mb-3 overflow-hidden rounded-2xl" style={{ backgroundColor: '#ffffff' }}>
        <Pressable
          onPress={startEditingBudget}
          className="flex-row items-center justify-between px-4 py-3.5"
          style={{ borderBottomWidth: 0.5, borderBottomColor: '#F2F2F0' }}>
          <Text className="text-[15px] font-medium">Monthly budget</Text>
          {editingBudget ? (
            <TextInput
              autoFocus
              value={budgetDraft}
              onChangeText={setBudgetDraft}
              onBlur={saveBudget}
              onSubmitEditing={saveBudget}
              keyboardType="number-pad"
              className="text-[15px] font-medium"
              style={{ color: '#111111', minWidth: 80, textAlign: 'right' }}
            />
          ) : (
            <Text className="text-[15px]" style={{ color: '#9CA3AF' }}>{formatCurrency(budget)} / mo</Text>
          )}
        </Pressable>
        <View className="flex-row items-center justify-between px-4 py-3.5" style={{ borderBottomWidth: 0.5, borderBottomColor: '#F2F2F0' }}>
          <Text className="text-[15px] font-medium">Currency</Text>
          <Text className="text-[15px]" style={{ color: '#9CA3AF' }}>USD ($)</Text>
        </View>
        <View className="flex-row items-center justify-between px-4 py-3.5">
          <Text className="text-[15px] font-medium">Daily reminder</Text>
          <Host matchContents>
            <Switch value={reminderEnabled} onValueChange={onToggleReminder} color="#10B981" />
          </Host>
        </View>
      </View>

      <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: '#ffffff' }}>
        <View className="flex-row items-center justify-between px-4 py-3.5" style={{ borderBottomWidth: 0.5, borderBottomColor: '#F2F2F0' }}>
          <Text className="text-[15px] font-medium">Export data</Text>
          <Text style={{ color: '#C7C7C5', fontSize: 18 }}>›</Text>
        </View>
        <View className="flex-row items-center justify-between px-4 py-3.5">
          <Text className="text-[15px] font-medium">About</Text>
          <Text className="text-[13px]" style={{ color: '#C7C7C5' }}>v1.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 3: Manual verification**

Run the app, navigate to `/settings`:
- Tapping "Monthly budget" swaps its value for an editable numeric field; typing a new value and tapping outside (blur) or submitting persists it — revisit Settings (navigate away and back) and confirm the new value sticks.
- Toggling "Daily reminder" flips the native switch; revisit the screen and confirm the on/off state persisted.
- "Export data" and "About" render but are not yet interactive (expected at this point).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(tabs)/settings.tsx"
git commit -m "Implement Settings screen (budget + reminder toggle persistence)"
```

---

### Task 22: Receipt photo storage

**Files:**
- Create: `src/lib/receipts.ts`

**Interfaces:**
- Produces: `saveReceiptPhoto(tempUri: string): string` — copies a camera-captured temp file into a persistent app directory and returns the new stable URI; used by Add Details (Task 24) before the transaction is inserted with `photoPath`.

- [ ] **Step 1: Confirm the exact `expo-file-system` `File`/`Directory` method signatures**

Run: `cat node_modules/expo-file-system/build/File.js.map` is unhelpful (minified) — instead read the TypeScript declarations directly:
Run: `find node_modules/expo-file-system/build -iname "File.d.ts" -o -iname "Directory.d.ts"` then read the matched files.
Confirm: (a) whether `new File(uri: string)` (a single full URI) is a valid constructor overload alongside `new File(parent: Directory, ...segments: string[])`, (b) whether `.exists` is a boolean property or a method, (c) whether `.copy()` / `.create()` are synchronous or return a `Promise` (the earlier fetched docs summary showed them called without `await`, but confirm against the installed version before writing Step 2 — adjust to `await` + the `Async`-suffixed method names if the sync ones don't exist).

- [ ] **Step 2: Write `src/lib/receipts.ts`**

```ts
import { Directory, File, Paths } from 'expo-file-system';

const receiptsDir = new Directory(Paths.document, 'receipts');

function ensureReceiptsDir(): void {
  if (!receiptsDir.exists) {
    receiptsDir.create({ intermediates: true });
  }
}

export function saveReceiptPhoto(tempUri: string): string {
  ensureReceiptsDir();
  const source = new File(tempUri);
  const destination = new File(receiptsDir, `receipt-${Date.now()}.jpg`);
  source.copy(destination);
  return destination.uri;
}
```

- [ ] **Step 3: Manual verification**

This has no caller yet — verified end-to-end once wired into the Capture → Add Details save flow (Task 24): take a real photo, save the transaction, then confirm `Transaction.photoPath` points at a file under the app's document directory (not the camera's original temp path) and that `TransactionDetail` (Task 15) can display it after an app restart (proving the temp file wasn't garbage-collected).

- [ ] **Step 4: Commit**

```bash
git add src/lib/receipts.ts
git commit -m "Add receipt photo storage helper"
```

---

### Task 23: Capture screen

**Files:**
- Modify: `src/app/index.tsx` (replaces the default-template Welcome screen entirely)

**Interfaces:**
- Consumes: `CameraView`, `useCameraPermissions` from `expo-camera`; `AddDetails` from `add-details.tsx` (Task 24 — this task's manual verification is deferred until Task 24 lands, since the two are wired together here but `AddDetails` doesn't exist until the next task).
- Produces: the `/` route. `close()` behavior: `router.back()` if there's navigation history, else `router.replace('/home')` — used identically by `AddDetails`.

- [ ] **Step 1: Write `src/app/index.tsx`**

```tsx
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { AddDetails } from '@/components/expense/add-details';
import { Pressable, Text, View } from '@/tw';

export default function CaptureScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState<'camera' | 'details'>(editId ? 'details' : 'camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !cameraReady) return;
    const photo = await cameraRef.current.takePictureAsync();
    setPhotoUri(photo.uri);
    setPhase('details');
  };

  const skipPhoto = () => {
    setPhotoUri(null);
    setPhase('details');
  };

  if (phase === 'details') {
    return (
      <AddDetails
        photoUri={photoUri}
        editId={editId ? Number(editId) : null}
        onBackToCapture={() => setPhase('camera')}
        onClose={close}
      />
    );
  }

  if (!permission) {
    return <View className="flex-1" style={{ backgroundColor: '#0B0D0F' }} />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-8" style={{ backgroundColor: '#0B0D0F' }}>
        <Text className="text-center text-[15px] font-semibold text-white">
          SpendLens needs camera access to scan receipts. You can still add expenses without a photo.
        </Text>
        <Pressable onPress={requestPermission} className="rounded-full px-5 py-2.5" style={{ backgroundColor: '#10B981' }}>
          <Text className="text-[14px] font-bold text-white">Allow camera</Text>
        </Pressable>
        <Pressable onPress={skipPhoto}>
          <Text className="text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>Skip photo</Text>
        </Pressable>
        <Pressable onPress={close}>
          <Text className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#0B0D0F' }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" onCameraReady={() => setCameraReady(true)} />
      <View pointerEvents="none" className="absolute inset-x-0 items-center" style={{ top: '30%' }}>
        <View style={{ width: 250, height: 360, borderRadius: 20, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.55)' }} />
        <View className="mt-[16px] rounded-full px-[18px] py-2" style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}>
          <Text className="text-[14px] font-semibold text-white">Snap your receipt</Text>
        </View>
      </View>
      <Pressable
        onPress={close}
        className="absolute h-[38px] w-[38px] items-center justify-center rounded-full"
        style={{ top: 66, left: 20, backgroundColor: 'rgba(255,255,255,0.14)' }}>
        <Text className="text-[17px] text-white">✕</Text>
      </Pressable>
      <View className="absolute inset-x-0 bottom-0 flex-row items-center justify-between px-9 pb-[52px]">
        <Pressable
          onPress={takePhoto}
          className="h-[46px] w-[46px] items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
        />
        <Pressable
          onPress={takePhoto}
          className="h-[74px] w-[74px] items-center justify-center rounded-full"
          style={{ borderWidth: 4, borderColor: '#ffffff' }}>
          <View className="h-[58px] w-[58px] rounded-full" style={{ backgroundColor: '#ffffff' }} />
        </Pressable>
        <Pressable onPress={skipPhoto} style={{ width: 46 }}>
          <Text className="text-center text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>Skip photo</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

Note: the mockup shows a small secondary icon button to the left of the main shutter, visually resembling a "choose from library" glyph, but its actual wired behavior in the mockup's own script is identical to the main shutter (`onShutter`). Real gallery-picker support (`expo-image-picker`) wasn't part of the approved design, so this task keeps that button wired to the same `takePhoto` action as the main shutter rather than silently adding an unapproved feature — a plain square button in the same spot, not the gallery icon.

- [ ] **Step 2: Manual verification**

Deferred to the end of Task 24 (this screen isn't functional on its own until `AddDetails` exists — `phase === 'details'` currently has no component to render).

- [ ] **Step 3: Commit**

```bash
git add src/app/index.tsx
git commit -m "Implement Capture screen"
```

---

### Task 24: AddDetails component (amount entry, category, save)

**Files:**
- Create: `src/components/expense/add-details.tsx`

**Interfaces:**
- Consumes: `useTransactions` from `lib/transactions.ts`, `CATEGORIES`/`categoryOf` from `lib/categories.ts`, `toDateKey` from `lib/format.ts`, `saveReceiptPhoto` from `lib/receipts.ts`, `Keypad` (Task 14), `SegmentedControl` (Task 9), `CategoryChip` (Task 10), `useToast` (Task 8), `DateTimePicker` from `@expo/ui/community/datetime-picker`.
- Produces: `AddDetails({ photoUri, editId, onBackToCapture, onClose }: { photoUri: string | null; editId: number | null; onBackToCapture: () => void; onClose: () => void })` — rendered by `app/index.tsx` (Task 23).

- [ ] **Step 1: Confirm the `@expo/ui/community/datetime-picker` prop API**

Run: `find node_modules/@expo/ui -iname "*datetime*"` then read the matched `.d.ts` file. Confirm the `onChange` callback signature — it's documented as API-compatible with `@react-native-community/datetimepicker`, whose convention is `onChange: (event: DateTimePickerEvent, selectedDate?: Date) => void`. Confirm this matches before writing Step 2; adjust if the installed version differs.

- [ ] **Step 2: Write `src/components/expense/add-details.tsx`**

```tsx
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';

import { CategoryChip } from './category-chip';
import { Keypad } from './keypad';
import { SegmentedControl } from './segmented-control';
import { useToast } from './toast';
import { CATEGORIES, categoryOf } from '@/lib/categories';
import { toDateKey } from '@/lib/format';
import { saveReceiptPhoto } from '@/lib/receipts';
import { useTransactions } from '@/lib/transactions';
import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';

interface AddDetailsProps {
  photoUri: string | null;
  editId: number | null;
  onBackToCapture: () => void;
  onClose: () => void;
}

export function AddDetails({ photoUri, editId, onBackToCapture, onClose }: AddDetailsProps) {
  const { transactions, add, update } = useTransactions();
  const { show: showToast } = useToast();

  const editing = editId !== null ? (transactions.find((t) => t.id === editId) ?? null) : null;

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'exp' | 'inc'>('exp');
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (editing && !initialized) {
      setAmount(String(editing.amount));
      setType(editing.isIncome ? 'inc' : 'exp');
      setCategory(editing.category);
      setNote(editing.note);
      const [y, m, d] = editing.date.split('-').map(Number);
      setDate(new Date(y, m - 1, d));
      setInitialized(true);
    }
  }, [editing, initialized]);

  const amountNum = parseFloat(amount) || 0;
  const canSave = amountNum > 0 && category !== null;

  const onKeyPress = (key: string) => {
    setAmount((current) => {
      if (key === '⌫') return current.slice(0, -1);
      if (key === '.') return current.includes('.') ? current : (current || '0') + '.';
      if (current.includes('.') && current.length - current.indexOf('.') > 2) return current;
      if (current.replace('.', '').length >= 7) return current;
      return current === '0' ? key : current + key;
    });
  };

  const onSave = async () => {
    if (!canSave || category === null) return;
    const photoPath = photoUri ? saveReceiptPhoto(photoUri) : (editing?.photoPath ?? null);
    const dateKey = toDateKey(date);
    const timeLabel = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (editing) {
      await update(editing.id, {
        amount: amountNum, category, note, isIncome: type === 'inc', photoPath, date: dateKey, time: timeLabel,
      });
      showToast('Updated ✓');
    } else {
      const cat = categoryOf(category);
      await add({
        date: dateKey,
        time: timeLabel,
        createdAt: Date.now(),
        category,
        note,
        name: note || (type === 'inc' ? 'Income' : `${cat.label} expense`),
        amount: amountNum,
        isIncome: type === 'inc',
        photoPath,
      });
      showToast('Saved ✓');
    }
    onClose();
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#FAFAFA' }}>
      <View className="flex-row items-center justify-between px-4 pb-1.5 pt-[66px]">
        <Pressable
          onPress={onBackToCapture}
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }}>
          <Text className="text-[18px] font-semibold" style={{ color: '#404040' }}>‹</Text>
        </Pressable>
        <Text className="text-[16px] font-bold">
          {editing ? 'Edit transaction' : type === 'inc' ? 'New income' : 'New expense'}
        </Text>
        <Pressable
          onPress={onClose}
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }}>
          <Text className="text-[14px] font-semibold" style={{ color: '#404040' }}>✕</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 }}>
        {photoUri !== null && (
          <View className="mb-2 flex-row items-center gap-3 rounded-[14px] px-3 py-2.5" style={{ backgroundColor: '#ffffff' }}>
            <Image source={{ uri: photoUri }} style={{ width: 44, height: 44, borderRadius: 10 }} contentFit="cover" />
            <Text className="flex-1 text-[13.5px] font-semibold">Receipt attached</Text>
            <Pressable onPress={onBackToCapture}>
              <Text className="text-[13px] font-semibold" style={{ color: '#10B981' }}>Retake</Text>
            </Pressable>
          </View>
        )}

        <View className="items-center py-3.5">
          <Text style={{ fontSize: 54, fontWeight: '800', letterSpacing: -1.5, color: amount ? '#111111' : '#D1D5DB' }}>
            <Text style={{ fontSize: 26, fontWeight: '600', color: '#9CA3AF' }}>$</Text>
            {amount || '0'}
          </Text>
        </View>

        <View className="mb-3">
          <SegmentedControl
            options={[
              { value: 'exp', label: 'Expense' },
              { value: 'inc', label: 'Income' },
            ]}
            value={type}
            onChange={setType}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }} className="mb-3">
          {CATEGORIES.map((cat) => (
            <CategoryChip key={cat.id} category={cat} selected={category === cat.id} onPress={() => setCategory(cat.id)} />
          ))}
        </ScrollView>

        <View className="mb-2 rounded-xl px-3.5 py-3" style={{ backgroundColor: '#ffffff' }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note…"
            className="text-[14.5px]"
            style={{ color: '#111111' }}
          />
        </View>

        <View className="flex-row items-center gap-2.5 rounded-xl px-3.5 py-3" style={{ backgroundColor: '#ffffff' }}>
          <Text className="flex-1 text-[14.5px] font-semibold">
            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <DateTimePicker
            value={date}
            mode="date"
            onChange={(_event, selectedDate) => {
              if (selectedDate) setDate(selectedDate);
            }}
          />
        </View>
      </ScrollView>

      <View className="px-5 pb-1.5 pt-2">
        <Pressable
          onPress={onSave}
          disabled={!canSave}
          className="h-[52px] items-center justify-center rounded-2xl"
          style={{ backgroundColor: canSave ? '#10B981' : '#D6D6D3' }}>
          <Text className="text-[16px] font-bold text-white">{editing ? 'Save changes' : 'Save'}</Text>
        </Pressable>
      </View>

      <Keypad onKeyPress={onKeyPress} />
    </View>
  );
}
```

- [ ] **Step 3: Manual verification (covers Task 23 + Task 24 together)**

Run the app (`run` skill) on a simulator with camera support (web won't have a real camera):
- Launching the app lands directly on the Capture screen (`/`), not on Home.
- Grant camera permission when prompted; the receipt-frame guide and "Snap your receipt" pill render over the live camera preview.
- Tap the shutter: the screen transitions to Add Details with the captured photo shown as "Receipt attached"; tapping "Retake" returns to the camera.
- Tap digits on the keypad: the amount display updates; `.` can only be inserted once; `⌫` deletes the last character.
- Select a category chip and toggle Expense/Income — the header title and Save button's enabled state respond correctly (Save stays disabled until both an amount > 0 and a category are set).
- Tap the date row and confirm the native date picker opens and updates the displayed date.
- Tap Save: a "Saved ✓" toast appears, and you land on `/home` with the new transaction visible at the top of Recent transactions.
- From Home, tap the FAB again, this time tap "Skip photo" instead of the shutter — confirm Add Details opens with no photo/no "Retake" row, and saving still works.
- From `TransactionDetail`, tap "Edit" on a transaction — confirm Add Details opens pre-filled with that transaction's amount/category/note/date and the header reads "Edit transaction"; changing the amount and tapping "Save changes" updates the existing row (does not create a duplicate) and shows an "Updated ✓" toast.

- [ ] **Step 4: Commit**

```bash
git add src/components/expense/add-details.tsx
git commit -m "Implement AddDetails (amount entry, category, save)"
```

---

### Task 25: Daily reminder notifications

**Files:**
- Create: `src/lib/notifications.ts`
- Modify: `src/app/(tabs)/settings.tsx`

**Interfaces:**
- Produces: `requestNotificationPermission(): Promise<boolean>`, `scheduleDailyReminder(): Promise<string>` (returns the notification id), `cancelDailyReminder(notificationId: string): Promise<void>` — used by the Settings reminder toggle.

- [ ] **Step 1: Write `src/lib/notifications.ts`**

```ts
import * as Notifications from 'expo-notifications';

const REMINDER_HOUR = 20;
const REMINDER_MINUTE = 0;

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleDailyReminder(): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'SpendLens',
      body: "Don't forget to log today's expenses.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
    },
  });
}

export async function cancelDailyReminder(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
```

- [ ] **Step 2: Wire it into the Settings reminder toggle**

In `src/app/(tabs)/settings.tsx`, add these imports:

```tsx
import { useToast } from '@/components/expense/toast';
import { cancelDailyReminder, requestNotificationPermission, scheduleDailyReminder } from '@/lib/notifications';
import { getReminderNotificationId, setReminderNotificationId } from '@/lib/settings';
```

Replace the `onToggleReminder` function with:

```tsx
  const { show: showToast } = useToast();

  const onToggleReminder = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        showToast('Enable notifications in system settings first');
        return;
      }
      const id = await scheduleDailyReminder();
      await setReminderNotificationId(db, id);
    } else {
      const existingId = await getReminderNotificationId(db);
      if (existingId) await cancelDailyReminder(existingId);
      await setReminderNotificationId(db, null);
    }
    setReminderEnabled(enabled);
    await setDailyReminderEnabled(db, enabled);
  };
```

- [ ] **Step 3: Manual verification**

Run the app on a simulator/device, go to `/settings`, toggle "Daily reminder" on:
- A system permission prompt appears (first time); granting it leaves the switch on.
- Deny permission on a fresh install (or via system settings) and toggle on again — confirm the switch reverts and a toast explains why, rather than silently appearing "on" with nothing scheduled.
- With permission granted, toggling off then on again should not accumulate duplicate scheduled notifications (each on-cycle cancels any stale id before scheduling — verify by checking `getReminderNotificationId` only ever holds one id at a time, e.g. by adding a temporary `console.log` during manual testing, then removing it).

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications.ts "src/app/(tabs)/settings.tsx"
git commit -m "Wire daily reminder to real local notifications"
```

---

### Task 26: CSV export

**Files:**
- Create: `src/lib/export.ts`
- Create: `src/lib/export.test.ts`
- Modify: `src/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `Transaction` from `lib/transactions.ts`, `categoryOf` from `lib/categories.ts`.
- Produces: `buildTransactionsCsv(transactions: Transaction[]): string`, `exportAndShareCsv(transactions: Transaction[]): Promise<boolean>` (returns whether sharing was available) — used by the Settings "Export data" row.

- [ ] **Step 1: Write the failing test for `buildTransactionsCsv`**

```ts
// src/lib/export.test.ts
import { buildTransactionsCsv } from './export';

describe('buildTransactionsCsv', () => {
  it('builds a header row plus one row per transaction, quoting fields with commas/quotes', () => {
    const csv = buildTransactionsCsv([
      {
        id: 1, date: '2026-07-17', time: '8:00 AM', createdAt: 1, category: 'food',
        name: 'Coffee, Large', note: 'w/ "extra" shot', amount: 6.5, isIncome: false, photoPath: null,
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Time,Category,Name,Note,Amount,Type');
    expect(lines[1]).toBe('2026-07-17,8:00 AM,Food,"Coffee, Large","w/ ""extra"" shot",6.50,Expense');
  });

  it('labels income rows', () => {
    const csv = buildTransactionsCsv([
      { id: 1, date: '2026-07-17', time: '9:00 AM', createdAt: 1, category: 'other', name: 'Salary', note: '', amount: 2400, isIncome: true, photoPath: null },
    ]);
    expect(csv.split('\n')[1]).toBe('2026-07-17,9:00 AM,Other,Salary,,2400.00,Income');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- export.test.ts`
Expected: FAIL — `Cannot find module './export'`.

- [ ] **Step 3: Write `src/lib/export.ts`**

```ts
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { categoryOf } from './categories';
import type { Transaction } from './transactions';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildTransactionsCsv(transactions: Transaction[]): string {
  const header = ['Date', 'Time', 'Category', 'Name', 'Note', 'Amount', 'Type'];
  const rows = transactions.map((t) => [
    t.date,
    t.time,
    categoryOf(t.category).label,
    t.name,
    t.note,
    t.amount.toFixed(2),
    t.isIncome ? 'Income' : 'Expense',
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(',')).join('\n');
}

export async function exportAndShareCsv(transactions: Transaction[]): Promise<boolean> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;

  const csv = buildTransactionsCsv(transactions);
  const file = new File(Paths.cache, `spendlens-export-${Date.now()}.csv`);
  file.create();
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export SpendLens data' });
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- export.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Wire the Export data row**

In `src/app/(tabs)/settings.tsx`, add:

```tsx
import { exportAndShareCsv } from '@/lib/export';
import { useTransactions } from '@/lib/transactions';
```

Add `const { transactions } = useTransactions();` inside the component, and replace the static "Export data" `View` row with:

```tsx
        <Pressable
          onPress={async () => {
            const shared = await exportAndShareCsv(transactions);
            if (!shared) showToast('Sharing is not available on this device');
          }}
          className="flex-row items-center justify-between px-4 py-3.5"
          style={{ borderBottomWidth: 0.5, borderBottomColor: '#F2F2F0' }}>
          <Text className="text-[15px] font-medium">Export data</Text>
          <Text style={{ color: '#C7C7C5', fontSize: 18 }}>›</Text>
        </Pressable>
```

- [ ] **Step 6: Manual verification**

Run the app, go to `/settings`, tap "Export data": the native share sheet should open with a `.csv` file attached; opening it (e.g. AirDrop to a Mac, or a Files app preview) should show a header row and one row per seeded transaction with correctly quoted names/notes containing commas.

- [ ] **Step 7: Commit**

```bash
git add src/lib/export.ts src/lib/export.test.ts "src/app/(tabs)/settings.tsx"
git commit -m "Add CSV export and wire it to Settings"
```

---

### Task 27: Google Sign-In

**Files:**
- Create: `.env.example`
- Modify: `.gitignore` (ensure `.env` is ignored)
- Delete: `app.json`
- Create: `app.config.js` (replaces `app.json` — needed to read env vars into the config plugin)
- Modify: `package.json` (new dependency)
- Create: `src/lib/auth.ts`
- Create: `src/components/expense/google-sign-in-row.tsx`
- Modify: `src/app/(tabs)/settings.tsx`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Produces: `configureGoogleSignIn(): void`, `signInWithGoogle(): Promise<AuthUser | null>`, `signOutOfGoogle(): Promise<void>`, `useAuth(): { user: AuthUser | null; loading: boolean; signIn(): Promise<AuthUser | null>; signOut(): Promise<void> }`, `AuthUser { id, googleId, email, displayName, avatarUrl }` — used by `GoogleSignInRow`, which replaces the static profile row in Settings.

**⚠ This task requires you (the human running this plan) to provide real Google Cloud credentials — they cannot be fabricated. It also switches local development from Expo Go to a custom dev client, since `@react-native-google-signin/google-signin` uses native code Expo Go doesn't include. Do this task last, and expect to stop partway through Step 1 until credentials are available.**

- [ ] **Step 1: Obtain Google OAuth client IDs (human prerequisite, not code)**

1. Go to https://console.cloud.google.com/, create a project (or reuse one).
2. Under "APIs & Services" → "Credentials", create an OAuth 2.0 Client ID of type **Web application** — note the client ID as `GOOGLE_WEB_CLIENT_ID`.
3. Create a second OAuth 2.0 Client ID of type **iOS** — set the bundle ID to match `app.config.js`'s `ios.bundleIdentifier` (set one if not already present, e.g. `com.spendlens.app`). Note the client ID as `GOOGLE_IOS_CLIENT_ID`. Its "reversed client ID" (shown in the console, format `com.googleusercontent.apps.XXXXXXXX`) is `GOOGLE_IOS_URL_SCHEME`.
4. For Android, create an OAuth 2.0 Client ID of type **Android**, providing the package name (e.g. `com.spendlens.app`) and the SHA-1 fingerprint of your debug keystore (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android` on most setups). This step doesn't produce a value your code reads directly (the Android client is matched by package name + SHA-1 on Google's side), but it must exist for Android sign-in to work.
5. Do not proceed to Step 2 until you have `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, and `GOOGLE_IOS_URL_SCHEME`.

- [ ] **Step 2: Create `.env.example` and ensure `.env` is gitignored**

```
# .env.example
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
GOOGLE_IOS_URL_SCHEME=
```

Check `.gitignore` for a `.env` entry; if missing, add one:
```
.env
```

Copy `.env.example` to `.env` and fill in the three real values from Step 1.

- [ ] **Step 3: Install the package**

Run:
```bash
npm install @react-native-google-signin/google-signin
```

- [ ] **Step 4: Convert `app.json` to `app.config.js`**

Delete `app.json`, create `app.config.js` with the same content plus the new plugin and a bundle identifier:

```js
require('dotenv').config();

module.exports = {
  expo: {
    name: 'SpendLens',
    slug: 'SpendLens',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'spendlens',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/expo.icon',
      bundleIdentifier: 'com.spendlens.app',
    },
    android: {
      package: 'com.spendlens.app',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  },
};
```

Install `dotenv` (used above to load `.env` at config-evaluation time):
```bash
npm install --save-dev dotenv
```

- [ ] **Step 5: Write `src/lib/auth.ts`**

```ts
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

import { db } from './db';

const SESSION_KEY = 'spendlens_google_session';

export interface AuthUser {
  id: number;
  googleId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
}

async function upsertUser(
  googleId: string,
  email: string,
  displayName: string | null,
  avatarUrl: string | null
): Promise<AuthUser> {
  await db.runAsync(
    `INSERT INTO users (google_id, email, display_name, avatar_url, created_at)
     VALUES ($google_id, $email, $display_name, $avatar_url, $created_at)
     ON CONFLICT(google_id) DO UPDATE SET email = $email, display_name = $display_name, avatar_url = $avatar_url`,
    { $google_id: googleId, $email: email, $display_name: displayName, $avatar_url: avatarUrl, $created_at: Date.now() }
  );
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE google_id = ?', googleId);
  return { id: row!.id, googleId, email, displayName, avatarUrl };
}

export async function signInWithGoogle(): Promise<AuthUser | null> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (response.type !== 'success') return null;

  const { email, name, photo, id: googleId } = response.data.user;
  const user = await upsertUser(googleId, email, name, photo);
  await SecureStore.setItemAsync(SESSION_KEY, String(user.id));
  return user;
}

export async function signOutOfGoogle(): Promise<void> {
  await GoogleSignin.signOut();
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

interface UserRow {
  id: number;
  google_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const restore = useCallback(async () => {
    const sessionId = await SecureStore.getItemAsync(SESSION_KEY);
    if (!sessionId) {
      setUser(null);
      setLoading(false);
      return;
    }
    const row = await db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ?', Number(sessionId));
    setUser(
      row
        ? { id: row.id, googleId: row.google_id, email: row.email, displayName: row.display_name, avatarUrl: row.avatar_url }
        : null
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const signIn = useCallback(async () => {
    const signedInUser = await signInWithGoogle();
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const signOut = useCallback(async () => {
    await signOutOfGoogle();
    setUser(null);
  }, []);

  return { user, loading, signIn, signOut };
}
```

- [ ] **Step 6: Write `src/components/expense/google-sign-in-row.tsx`**

```tsx
import { useToast } from './toast';
import { useAuth } from '@/lib/auth';
import { Pressable, Text, View } from '@/tw';

export function GoogleSignInRow() {
  const { user, signIn, signOut } = useAuth();
  const { show: showToast } = useToast();

  if (user) {
    const initial = (user.displayName ?? user.email)[0]?.toUpperCase() ?? '?';
    return (
      <View className="mb-3 flex-row items-center gap-3.5 rounded-2xl p-4" style={{ backgroundColor: '#ffffff' }}>
        <View className="h-[52px] w-[52px] items-center justify-center rounded-full" style={{ backgroundColor: '#10B981' }}>
          <Text className="text-[20px] font-bold text-white">{initial}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[16px] font-bold">{user.displayName ?? user.email}</Text>
          <Text className="text-[13px]" style={{ color: '#9CA3AF' }}>{user.email}</Text>
        </View>
        <Pressable onPress={() => signOut()}>
          <Text className="text-[13px] font-semibold" style={{ color: '#EF4444' }}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={async () => {
        try {
          const signedIn = await signIn();
          if (signedIn) showToast(`Signed in as ${signedIn.email}`);
        } catch {
          showToast('Sign-in cancelled');
        }
      }}
      className="mb-3 flex-row items-center gap-3.5 rounded-2xl p-4"
      style={{ backgroundColor: '#ffffff' }}>
      <View className="h-[52px] w-[52px] items-center justify-center rounded-full" style={{ backgroundColor: '#F3F4F6' }}>
        <Text className="text-[20px]">G</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[16px] font-bold">Sign in with Google</Text>
        <Text className="text-[13px]" style={{ color: '#9CA3AF' }}>For syncing across devices, coming soon</Text>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 7: Wire it into Settings**

In `src/app/(tabs)/settings.tsx`, import `GoogleSignInRow` and replace the static profile `View` block (the one showing "Not signed in") with `<GoogleSignInRow />`.

- [ ] **Step 8: Configure Google Sign-In at app startup**

In `src/app/_layout.tsx`, import and call `configureGoogleSignIn()` once, alongside the existing `seedIfEmpty` effect:

```tsx
import { configureGoogleSignIn } from '@/lib/auth';
```

```tsx
  useEffect(() => {
    configureGoogleSignIn();
    seedIfEmpty(db)
      .catch((error) => console.error('Failed to seed database', error))
      .finally(() => {
        setReady(true);
        SplashScreen.hideAsync();
      });
  }, []);
```

- [ ] **Step 9: Prebuild and run a custom dev client**

From this point on, `npx expo start` (Expo Go) can no longer run the full app — `@react-native-google-signin/google-signin` requires native code Expo Go doesn't ship.

Run:
```bash
npx expo prebuild --clean
npx expo run:ios
```
(or `npx expo run:android` on Android). This generates `ios/`/`android/` native project directories and builds a custom dev client.

- [ ] **Step 10: Manual verification**

On the dev client build:
- Go to `/settings`; the profile row shows "Sign in with Google".
- Tap it, complete the Google account picker — confirm the row switches to showing your real name/email and an avatar-colored circle with your initial.
- Force-quit and relaunch the app; confirm you're still signed in (session persisted via `expo-secure-store`).
- Tap "Sign out"; confirm the row reverts to "Sign in with Google" and relaunching stays signed out.
- Cancel the Google sign-in flow partway through (back out of the account picker) — confirm the app shows a "Sign-in cancelled" toast rather than crashing or hanging.

- [ ] **Step 11: Commit**

```bash
git add .env.example .gitignore app.config.js package.json package-lock.json src/lib/auth.ts src/components/expense/google-sign-in-row.tsx "src/app/(tabs)/settings.tsx" src/app/_layout.tsx
git rm app.json
git commit -m "Add Google Sign-In"
```

---

### Task 28: Remove superseded template files and final verification

**Files:**
- Modify: `src/app/_layout.tsx` (move the `global.css` side-effect import here)
- Delete: `src/app/explore.tsx`, `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`, `src/components/hint-row.tsx`, `src/components/animated-icon.tsx`, `src/components/animated-icon.web.tsx`, `src/components/animated-icon.module.css`, `src/components/web-badge.tsx`, `src/components/themed-text.tsx`, `src/components/themed-view.tsx`, `src/components/ui/collapsible.tsx`, `src/components/external-link.tsx`, `src/hooks/use-theme.ts`, `src/constants/theme.ts`

**Interfaces:**
- None — this task only removes dead code and re-homes one side-effect import.

- [ ] **Step 1: Confirm nothing outside this deletion list still references the files being removed**

Run:
```bash
grep -rln "ThemedText\|ThemedView\|useTheme\|constants/theme\|app-tabs\|hint-row\|animated-icon\|web-badge\|components/ui/collapsible\|external-link" src --include="*.tsx" --include="*.ts"
```
Expected: only files in the deletion list above appear (plus, transiently, `src/app/index.tsx` and `src/app/explore.tsx` if this is run before Tasks 23–27 landed — by this point in the plan they should already be gone/replaced). If anything else appears, stop and investigate before deleting — it means something in the new app still depends on the old template code.

- [ ] **Step 2: Move the `global.css` import into the root layout**

`constants/theme.ts` (about to be deleted) was the only place importing `'@/global.css'` as a side effect — without it, Tailwind's compiled CSS stops loading. Add the import to the top of `src/app/_layout.tsx`:

```tsx
import '@/global.css';

import * as SplashScreen from 'expo-splash-screen';
// ...rest of existing imports unchanged
```

- [ ] **Step 3: Delete the superseded files**

```bash
git rm src/app/explore.tsx
git rm src/components/app-tabs.tsx src/components/app-tabs.web.tsx
git rm src/components/hint-row.tsx
git rm src/components/animated-icon.tsx src/components/animated-icon.web.tsx src/components/animated-icon.module.css
git rm src/components/web-badge.tsx
git rm src/components/themed-text.tsx src/components/themed-view.tsx
git rm src/components/ui/collapsible.tsx
git rm src/components/external-link.tsx
git rm src/hooks/use-theme.ts
git rm src/constants/theme.ts
```

- [ ] **Step 4: Typecheck and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites pass (sanity, categories, format, db, transactions, settings, seed, export).

- [ ] **Step 5: Full end-to-end manual verification**

Using the `run` skill on a simulator/dev-client build:

1. Launch → lands on Capture. Skip photo → Add Details → pick a category, enter an amount, Save → lands on Home with the new transaction at the top.
2. Home: hero card, today/week cards, and recent list all show correct real numbers reflecting the seeded + just-added data.
3. Tap a transaction row → Transaction Detail opens; try Edit (round-trips to Capture's Add Details pre-filled, saves back correctly), Change category (updates and shows a toast), Delete (inline confirm, removes the row, shows a toast).
4. History: Day/Month toggle, period navigation, category filters, and the empty state (filter to a category/period with no matches) all behave correctly.
5. Stats: donut chart, bar chart (Day/Month), and top categories all reflect real data and update when you navigate months.
6. Settings: budget edit persists, daily reminder toggle requests permission and persists, Export data opens a real share sheet with a correct CSV, Google sign-in/out works and persists across an app restart.
7. Confirm the tab bar's FAB, Home, History, Stats, Settings all navigate correctly from every screen, and that the active tab is visually highlighted.

- [ ] **Step 6: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "Remove superseded template files"
```

---

## Plan Self-Review

**Spec coverage:** every section of `docs/superpowers/specs/2026-07-17-expense-tracker-design.md` maps to a task — architecture/file structure → Tasks 1–17 (with the `/` + `/home` routing refinement noted in Global Constraints), data model → Tasks 5–7, screens → Tasks 18–21 + 23–24, native integrations → Tasks 22, 25, 26, 27, error handling (non-blocking camera/notification/auth fallbacks) → Tasks 23, 25, 27, testing → Tasks 1, 4, 6, 7, 26 (unit) and every task's manual-verification step (everything else).

**Placeholder scan:** no `TBD`/`TODO` remain. The one deliberate simplification (History's empty-state illustration using an emoji instead of the mockup's hand-drawn graphic) is called out explicitly as a scope trim, not left as an unstated gap. Task 27's Step 1 is a genuine external human prerequisite (real OAuth credentials can't be fabricated), not a placeholder — the task states exactly what's needed and why it can't proceed without it.

**Type consistency:** `Transaction`/`NewTransaction` (Task 6) are used with the same field names throughout (Tasks 7, 11, 15, 18, 19, 20, 24, 26). `Category`/`CategoryId`/`categoryOf` (Task 3) are consistent everywhere they're consumed. `useTransactions()`'s returned `{ transactions, loading, add, update, remove, refresh }` shape matches every call site. `useOpenTransactionDetail()` (Task 15) is called identically in Tasks 18 and 19.
