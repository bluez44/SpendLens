# SpendLens — Settings, Notifications, CSV Export & Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full Settings screen, local daily reminder notifications, CSV export with a shared date-range modal, and remove leftover Expo template files — on top of the `origin/main` camera-first SpendLens baseline.

**Architecture:** New modules under `src/lib/` (settings + settings-context + notifications + export) plus one new route `src/app/settings.tsx` and two new `sl/*` primitives (`budget-bar`, `date-range-modal`). Settings persist via the existing `settings` SQLite table (no schema change); notifications use `expo-notifications` with a fixed identifier for idempotent re-schedules; CSV goes through `expo-file-system` + `expo-sharing`.

**Tech Stack:** Expo SDK 57, `expo-router` (Stack), `expo-sqlite` (sync API), `expo-notifications`, `expo-file-system`, `expo-sharing`, `@react-native-community/datetimepicker`, React Native, TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-07-23-settings-notifications-export-design.md`

## Global Constraints

- Baseline commit: `3b5d663` (`origin/main`). Do not modify origin's camera-first `Stack`, `sl/*` primitives, `TransactionsProvider`, or the SQLite schema.
- Expo SDK 57. Use API surface documented at `https://docs.expo.dev/versions/v57.0.0/`.
- SQLite access is **synchronous** (matches existing `src/lib/transactions.ts` — uses `execSync`, `getAllSync`, `getFirstSync`, `runSync`). New modules must follow suit.
- Vietnamese UI labels; VND currency; U+2212 minus (`−`) for expense sign — reuse existing `formatVND` / `signedVND` from `src/lib/format.ts`.
- Existing type: transactions are typed `Txn` (not `Transaction`). Categories are `Category` with id `CategoryId`.
- Test framework: Jest 29 + `jest-expo`. Native modules are mocked (`__mocks__/expo-sqlite.ts` is auto-applied).
- Verification bar per task: `npx jest --silent` all green, `npx tsc --noEmit` no *new* errors vs. baseline. Baseline has 91 pre-existing tsc errors (88 jest-globals + 3 SQLite/nav) — do not attempt to fix these, only ensure count does not grow.
- Do not push to remote. Commit each task locally.
- Do not add features outside the spec (no cloud sync, no non-CSV export, no Google Sign-In).

---

## File structure

**New**
- `src/lib/settings.ts` — sync CRUD over the `settings` SQLite table.
- `src/lib/settings-context.tsx` — `SettingsProvider` + `useSettings()`.
- `src/lib/notifications.ts` — `expo-notifications` wrapper (permission, schedule, cancel).
- `src/lib/export.ts` — pure `buildTransactionsCsv` + `exportAndShareCsv`.
- `src/app/settings.tsx` — Settings screen route.
- `src/components/sl/budget-bar.tsx` — presentational monthly-budget progress bar.
- `src/components/sl/date-range-modal.tsx` — shared date range picker + Xuất trigger.
- Tests: `src/lib/settings.test.ts`, `src/lib/notifications.test.ts`, `src/lib/export.test.ts`, `src/components/sl/budget-bar.test.tsx`.

**Modified**
- `src/lib/transactions.ts` — add `resetTransactions()`.
- `src/lib/transactions.test.ts` — cover reset.
- `src/app/_layout.tsx` — wrap `SettingsProvider`, apply `themeMode`, re-schedule reminder on startup.
- `src/app/home.tsx` — insert `BudgetBar` + gear icon → `/settings`.
- `src/app/history.tsx` — share icon in header → date range modal → CSV export.
- `app.json` — add `expo-notifications` plugin block.
- `package.json` / `package-lock.json` — add `expo-notifications`, `@react-native-community/datetimepicker`.

**Deleted (Task 15)**
- `src/components/animated-icon.tsx`, `animated-icon.module.css`, `animated-icon.web.tsx`
- `src/components/app-tabs.tsx`, `app-tabs.web.tsx`
- `src/components/external-link.tsx`
- `src/components/hint-row.tsx`
- `src/components/themed-text.tsx`, `themed-view.tsx`
- `src/components/web-badge.tsx`
- `src/components/ui/` (entire dir)
- `src/app/explore.tsx`

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `expo-notifications`, `@react-native-community/datetimepicker` available to later tasks.

- [ ] **Step 1: Install packages (SDK-aligned versions)**

Run: `npx expo install expo-notifications @react-native-community/datetimepicker`

Expected: both packages appear under `dependencies` in `package.json` at Expo-57-compatible versions.

- [ ] **Step 2: Verify test suite still passes**

Run: `npx jest --silent`

Expected: 37 tests / 8 suites pass, no regressions.

- [ ] **Step 3: Verify tsc error count unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: `91` (baseline). If higher, revert the install and stop.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add expo-notifications and datetimepicker dependencies"
```

---

### Task 2: Settings data layer

**Files:**
- Create: `src/lib/settings.ts`
- Create: `src/lib/settings.test.ts`

**Interfaces:**
- Consumes: `db` (default) and `SQLiteDatabase` type from `src/lib/db.ts`. `settings` table already exists (`key TEXT PRIMARY KEY, value TEXT`).
- Produces:
  - `interface Settings { monthlyBudget: number; reminderEnabled: boolean; reminderHHMM: string | null; themeMode: 'auto' | 'light' | 'dark' }`
  - `const DEFAULTS: Settings`
  - `function loadSettings(database?: SQLiteDatabase): Settings`
  - `function updateSetting<K extends keyof Settings>(key: K, value: Settings[K], database?: SQLiteDatabase): void`
  - `function resetSettings(database?: SQLiteDatabase): void`

- [ ] **Step 1: Write failing tests**

Create `src/lib/settings.test.ts`:

```typescript
import * as SQLite from 'expo-sqlite';

import { DEFAULTS, loadSettings, resetSettings, updateSetting } from './settings';

function freshDb() {
  const database = SQLite.openDatabaseSync(':memory:');
  database.execSync(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  return database;
}

describe('loadSettings', () => {
  it('returns DEFAULTS when the table is empty', () => {
    expect(loadSettings(freshDb())).toEqual(DEFAULTS);
  });

  it('round-trips every key type', () => {
    const db = freshDb();
    updateSetting('monthlyBudget', 3_000_000, db);
    updateSetting('reminderEnabled', true, db);
    updateSetting('reminderHHMM', '21:00', db);
    updateSetting('themeMode', 'dark', db);
    expect(loadSettings(db)).toEqual({
      monthlyBudget: 3_000_000,
      reminderEnabled: true,
      reminderHHMM: '21:00',
      themeMode: 'dark',
    });
  });

  it('encodes booleans as "0"/"1" (not string "true"/"false")', () => {
    const db = freshDb();
    updateSetting('reminderEnabled', false, db);
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['reminderEnabled']);
    expect(row?.value).toBe('0');
  });
});

describe('resetSettings', () => {
  it('clears every row so the next load returns DEFAULTS', () => {
    const db = freshDb();
    updateSetting('monthlyBudget', 1_000_000, db);
    resetSettings(db);
    expect(loadSettings(db)).toEqual(DEFAULTS);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/settings.test.ts`

Expected: FAIL with "Cannot find module './settings'".

- [ ] **Step 3: Implement `settings.ts`**

Create `src/lib/settings.ts`:

```typescript
import type { SQLiteDatabase } from 'expo-sqlite';

import { db as defaultDb } from './db';

export interface Settings {
  monthlyBudget: number;
  reminderEnabled: boolean;
  reminderHHMM: string | null;
  themeMode: 'auto' | 'light' | 'dark';
}

export const DEFAULTS: Settings = {
  monthlyBudget: 0,
  reminderEnabled: false,
  reminderHHMM: null,
  themeMode: 'auto',
};

type Row = { key: string; value: string };

function encode<K extends keyof Settings>(key: K, value: Settings[K]): string {
  switch (key) {
    case 'monthlyBudget':
      return String(value as number);
    case 'reminderEnabled':
      return (value as boolean) ? '1' : '0';
    case 'reminderHHMM':
      return (value as string | null) ?? '';
    case 'themeMode':
      return value as string;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function decode(map: Map<string, string>): Settings {
  const result: Settings = { ...DEFAULTS };
  const budget = map.get('monthlyBudget');
  if (budget !== undefined) result.monthlyBudget = Number(budget) || 0;
  const enabled = map.get('reminderEnabled');
  if (enabled !== undefined) result.reminderEnabled = enabled === '1';
  const hhmm = map.get('reminderHHMM');
  if (hhmm !== undefined) result.reminderHHMM = hhmm === '' ? null : hhmm;
  const theme = map.get('themeMode');
  if (theme === 'auto' || theme === 'light' || theme === 'dark') result.themeMode = theme;
  return result;
}

export function loadSettings(database: SQLiteDatabase = defaultDb): Settings {
  const rows = database.getAllSync<Row>('SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return decode(map);
}

export function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
  database: SQLiteDatabase = defaultDb,
): void {
  database.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, encode(key, value)],
  );
}

export function resetSettings(database: SQLiteDatabase = defaultDb): void {
  database.runSync('DELETE FROM settings');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/settings.test.ts`

Expected: 4 tests pass.

- [ ] **Step 5: Verify tsc unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: same count as after Task 1 (baseline `91`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "Add typed settings data layer over the settings SQLite table"
```

---

### Task 3: Settings context provider

**Files:**
- Create: `src/lib/settings-context.tsx`

**Interfaces:**
- Consumes: `loadSettings`, `updateSetting`, `resetSettings`, `Settings` from Task 2.
- Produces:
  - `SettingsProvider: React.FC<{ children: React.ReactNode }>`
  - `useSettings(): { settings: Settings; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void; reset: () => void }`

- [ ] **Step 1: Implement the provider**

Create `src/lib/settings-context.tsx`:

```typescript
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { DEFAULTS, loadSettings, resetSettings, updateSetting, type Settings } from './settings';

interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return loadSettings();
    } catch {
      return DEFAULTS;
    }
  });

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    updateSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    resetSettings();
    setSettings(DEFAULTS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside a SettingsProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify tsc unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: same count as Task 2 (baseline `91`).

- [ ] **Step 3: Verify jest still green**

Run: `npx jest --silent`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/settings-context.tsx
git commit -m "Add SettingsProvider and useSettings hook"
```

---

### Task 4: Wire SettingsProvider + themeMode in root layout

**Files:**
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `SettingsProvider`, `useSettings` from Task 3.
- Produces: `themeMode` from settings is now applied app-wide; `TransactionsProvider` remains inside `SettingsProvider` so screens can read both.

- [ ] **Step 1: Read the current `_layout.tsx` to preserve font loading and existing providers**

Run: `cat src/app/_layout.tsx`

Note: the existing file loads Plus Jakarta Sans fonts, hides the splash on `fontsLoaded`, wraps `SafeAreaProvider` → `TransactionsProvider` → `ThemeProvider(scheme)` → `Stack`.

- [ ] **Step 2: Add `SettingsProvider` and resolve theme from settings**

Modify `src/app/_layout.tsx` — keep font loading and Stack config verbatim; only change the provider tree and theme selection.

Replace the return block to look like this (pseudo — apply as an edit that preserves existing font-loading logic and Stack.Screen entries):

```typescript
// after existing font hooks
import { SettingsProvider, useSettings } from '@/lib/settings-context';

// ...

function ThemedShell({ colors, scheme }: { /* pass existing props */ }) {
  const { settings } = useSettings();
  const effective =
    settings.themeMode === 'auto' ? scheme : settings.themeMode;
  return (
    <ThemeProvider value={effective === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* preserve every existing Stack.Screen entry */}
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // ... existing scheme, colors, fontsLoaded logic unchanged ...
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <TransactionsProvider>
          <ThemedShell colors={colors} scheme={scheme} />
        </TransactionsProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
```

Note: `SettingsProvider` must sit **outside** `TransactionsProvider` if the latter does not depend on settings, and outside `ThemedShell` because the shell reads settings. Preserve every `Stack.Screen` entry currently in the file.

- [ ] **Step 3: Verify jest**

Run: `npx jest --silent`

Expected: all suites pass.

- [ ] **Step 4: Verify tsc unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: same count.

- [ ] **Step 5: Manual smoke on device/simulator**

Run: `npx expo start`

Confirm: app boots, camera opens as before, no visual regression, theme currently follows system (default `themeMode='auto'`).

- [ ] **Step 6: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "Wire SettingsProvider and apply themeMode in root layout"
```

---

### Task 5: BudgetBar presentational component

**Files:**
- Create: `src/components/sl/budget-bar.tsx`
- Create: `src/components/sl/budget-bar.test.tsx`

**Interfaces:**
- Consumes: `Text` from `@/components/sl/text`, `useColors, W` from `@/constants/tokens`, `formatVND` from `@/lib/format`.
- Produces: `<BudgetBar spent={number} budget={number} onSetBudget={() => void} />`. When `budget === 0`, renders a CTA row that calls `onSetBudget`.

- [ ] **Step 1: Write failing test**

Create `src/components/sl/budget-bar.test.tsx`:

```typescript
import { render } from '@testing-library/react-native';

import { BudgetBar } from './budget-bar';

describe('BudgetBar', () => {
  it('renders the CTA when budget is 0', () => {
    const { getByText } = render(<BudgetBar spent={0} budget={0} onSetBudget={() => {}} />);
    expect(getByText(/Đặt ngân sách/)).toBeTruthy();
  });

  it('shows the percentage under 100 when within budget', () => {
    const { getByText } = render(<BudgetBar spent={1_500_000} budget={3_000_000} onSetBudget={() => {}} />);
    expect(getByText('50%')).toBeTruthy();
  });

  it('shows a true percentage over 100 when over budget', () => {
    const { getByText } = render(<BudgetBar spent={3_450_000} budget={3_000_000} onSetBudget={() => {}} />);
    expect(getByText('115%')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Confirm `@testing-library/react-native` is available**

Run: `npm ls @testing-library/react-native`

If missing: `npx expo install @testing-library/react-native`. Then re-run `npm ls` to confirm.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/components/sl/budget-bar.test.tsx`

Expected: FAIL with "Cannot find module './budget-bar'".

- [ ] **Step 4: Implement `budget-bar.tsx`**

Create `src/components/sl/budget-bar.tsx`:

```typescript
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';
import { formatVND } from '@/lib/format';

interface Props {
  spent: number;
  budget: number;
  onSetBudget: () => void;
}

function pickColor(pct: number, colors: ReturnType<typeof useColors>): string {
  if (pct > 100) return '#FB5B4D';
  if (pct >= 80) return '#F59E0B';
  return colors.accent;
}

export function BudgetBar({ spent, budget, onSetBudget }: Props) {
  const colors = useColors();
  if (budget <= 0) {
    return (
      <Pressable onPress={onSetBudget} style={[styles.cta, { borderColor: colors.line }]}>
        <Text weight="500" style={{ color: colors.text }}>
          Đặt ngân sách tháng →
        </Text>
      </Pressable>
    );
  }
  const pct = Math.round((spent / budget) * 100);
  const fillPct = Math.min(pct, 100);
  const barColor = pickColor(pct, colors);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text weight="500" style={{ color: colors.textDim }}>
          Đã chi tháng này
        </Text>
        <Text weight="600" style={{ color: colors.text }}>{pct}%</Text>
      </View>
      <View style={styles.row}>
        <Text weight="600" style={{ color: colors.text }}>
          {formatVND(spent)} / {formatVND(budget)}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.line }]}>
        <View style={[styles.fill, { width: `${fillPct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: W.pad, gap: 6, marginTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  cta: {
    marginTop: 12,
    marginHorizontal: W.pad,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
});
```

Note: if `useColors()`'s return type does not expose `accent`, `textDim`, `line`, `bg`, `text` — adjust names to match the actual token module (open `src/constants/tokens.ts` to verify). Do not invent tokens.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/components/sl/budget-bar.test.tsx`

Expected: 3 tests pass.

- [ ] **Step 6: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: all jest green, tsc count unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/sl/budget-bar.tsx src/components/sl/budget-bar.test.tsx
git commit -m "Add BudgetBar component with threshold-colored progress"
```

---

### Task 6: Integrate BudgetBar and gear icon into Home

**Files:**
- Modify: `src/app/home.tsx`

**Interfaces:**
- Consumes: `BudgetBar` (Task 5), `useSettings` (Task 3), existing `useTransactions` and category/summary helpers.
- Produces: gear icon in Home header pushes `/settings`; budget bar rendered under the balance card sourced from settings + current-month expense sum.

- [ ] **Step 1: Read the current `home.tsx` header row and balance card layout**

Run: `sed -n '1,60p' src/app/home.tsx`

Locate: the header row (usually contains title + right-side actions) and the position immediately below the balance card / above the bar chart.

- [ ] **Step 2: Add imports and gear icon**

At the top of `src/app/home.tsx`, add:

```typescript
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Icon } from '@/components/sl/icons';
import { BudgetBar } from '@/components/sl/budget-bar';
import { useSettings } from '@/lib/settings-context';
```

In the component: add `const router = useRouter();` if not already present; add `const { settings } = useSettings();`.

In the header row (right side), add a gear icon:

```tsx
<Pressable onPress={() => router.push('/settings')} hitSlop={10}>
  <Icon name="settings" size={22} color={colors.text} />
</Pressable>
```

Icon name: if `settings` is not in `Icon`'s `name` union, use a close equivalent from `src/components/sl/icons.tsx` (e.g. `gear`, `cog`). Do not invent icon names.

- [ ] **Step 3: Compute this month's expense sum and render BudgetBar**

Above the return statement:

```typescript
const spentThisMonth = txns
  .filter((t) => !t.isIncome && t.date.slice(0, 7) === new Date().toISOString().slice(0, 7))
  .reduce((sum, t) => sum + t.amount, 0);
```

Note: `txns` is the array from `useTransactions()`. If it's called differently in the current file, use the existing binding.

In JSX, right after the balance card and before the bar chart:

```tsx
<BudgetBar
  spent={spentThisMonth}
  budget={settings.monthlyBudget}
  onSetBudget={() => router.push('/settings')}
/>
```

- [ ] **Step 4: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: jest green, tsc unchanged (a new `Cannot find module '@/app/settings'` error will appear once expo-router regenerates typed routes; this only surfaces after `npx expo start` and stays at 0 in tsc if `.expo/types` is not regenerated. Do not create the route yet — Task 11 does).

- [ ] **Step 5: Manual smoke**

Run: `npx expo start`, open Home:
- Confirm gear icon visible top-right.
- Tapping it will crash the route push — expected until Task 11. Do not interact with it yet.
- Confirm the CTA "Đặt ngân sách tháng →" is visible (default `monthlyBudget === 0`).

- [ ] **Step 6: Commit**

```bash
git add src/app/home.tsx
git commit -m "Add BudgetBar and settings gear icon to Home"
```

---

### Task 7: Notifications module

**Files:**
- Create: `src/lib/notifications.ts`
- Create: `src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `expo-notifications` API surface.
- Produces:
  - `const REMINDER_ID: string`
  - `async function requestPermission(): Promise<boolean>`
  - `async function scheduleDailyReminder(hh: number, mm: number): Promise<void>`
  - `async function cancelDailyReminder(): Promise<void>`

- [ ] **Step 1: Write failing tests**

Create `src/lib/notifications.test.ts`:

```typescript
jest.mock('expo-notifications', () => ({
  __esModule: true,
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));

import * as Notifications from 'expo-notifications';

import {
  cancelDailyReminder,
  REMINDER_ID,
  requestPermission,
  scheduleDailyReminder,
} from './notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requestPermission', () => {
  it('returns true when granted', async () => {
    (mocked.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await requestPermission()).toBe(true);
  });

  it('returns false when denied', async () => {
    (mocked.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await requestPermission()).toBe(false);
  });
});

describe('scheduleDailyReminder', () => {
  it('cancels the previous schedule then schedules a DAILY trigger with the fixed id', async () => {
    await scheduleDailyReminder(21, 30);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(REMINDER_ID);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: REMINDER_ID,
        trigger: expect.objectContaining({ type: 'daily', hour: 21, minute: 30 }),
      }),
    );
  });
});

describe('cancelDailyReminder', () => {
  it('cancels by the fixed identifier', async () => {
    await cancelDailyReminder();
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(REMINDER_ID);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/notifications.test.ts`

Expected: FAIL with "Cannot find module './notifications'".

- [ ] **Step 3: Implement `notifications.ts`**

Create `src/lib/notifications.ts`:

```typescript
import * as Notifications from 'expo-notifications';

export const REMINDER_ID = 'spendlens-daily-reminder';

export async function requestPermission(): Promise<boolean> {
  const result = await Notifications.requestPermissionsAsync();
  return result.status === 'granted';
}

export async function scheduleDailyReminder(hh: number, mm: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'SpendLens',
      body: 'Ghi lại chi tiêu hôm nay?',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hh,
      minute: mm,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/notifications.test.ts`

Expected: 4 tests pass.

- [ ] **Step 5: Add plugin block to `app.json`**

Edit `app.json`: inside `expo.plugins` array (after the `expo-splash-screen` entry, still inside the array), append:

```json
["expo-notifications", { "icon": "./assets/notification-icon.png" }]
```

Note: the icon path is optional in Expo Go / dev. Only production builds require the asset to exist.

- [ ] **Step 6: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: jest green, tsc unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts app.json
git commit -m "Add notifications wrapper for the daily reminder"
```

---

### Task 8: resetTransactions helper

**Files:**
- Modify: `src/lib/transactions.ts`
- Modify: `src/lib/transactions.test.ts`

**Interfaces:**
- Consumes: existing `Txn`, `db`, `SQLiteDatabase`, `insertTransaction`, `listTransactions`.
- Produces: `function resetTransactions(database?: SQLiteDatabase): void` — deletes every row from `transactions`. Best-effort delete of local receipt photo files (paths beginning with `file://` or `/`). Remote URLs (starting `http`) are skipped.

- [ ] **Step 1: Add failing test in `transactions.test.ts`**

Append to the end of `src/lib/transactions.test.ts` (inside the top-level describe or as a new one):

```typescript
describe('resetTransactions', () => {
  it('deletes every row', () => {
    insertTransaction({
      date: '2026-07-23', time: '10:00', createdAt: Date.now(),
      category: 'food', name: 'Coffee', note: '', amount: 45000,
      isIncome: false, photoPath: null,
    });
    resetTransactions();
    expect(listTransactions()).toEqual([]);
  });
});
```

Add `resetTransactions` to the existing import at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/transactions.test.ts -t resetTransactions`

Expected: FAIL with `resetTransactions is not a function` or `Cannot find`.

- [ ] **Step 3: Implement `resetTransactions` in `transactions.ts`**

Append to `src/lib/transactions.ts`:

```typescript
import { File } from 'expo-file-system';

export function resetTransactions(database: SQLiteDatabase = defaultDb): void {
  const rows = database.getAllSync<{ photo_path: string | null }>(
    'SELECT photo_path FROM transactions WHERE photo_path IS NOT NULL',
  );
  database.runSync('DELETE FROM transactions');
  for (const row of rows) {
    const p = row.photo_path;
    if (!p) continue;
    if (p.startsWith('http')) continue;
    try {
      new File(p).delete();
    } catch {
      // best-effort; ignore missing/renamed files
    }
  }
}
```

Note: if `expo-file-system` is imported elsewhere in the file, reuse the existing import. If `File` is not exported as expected, guard the loop with a `try/catch` around the whole file-cleanup block so a mis-typed import never blocks the DB reset.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/transactions.test.ts`

Expected: previous tests still green, new test passes.

- [ ] **Step 5: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/transactions.ts src/lib/transactions.test.ts
git commit -m "Add resetTransactions with best-effort receipt photo cleanup"
```

---

### Task 9: CSV export module

**Files:**
- Create: `src/lib/export.ts`
- Create: `src/lib/export.test.ts`

**Interfaces:**
- Consumes: `Txn` and `categoryOf` from existing modules.
- Produces:
  - `function buildTransactionsCsv(txns: Txn[]): string`
  - `async function exportAndShareCsv(txns: Txn[]): Promise<boolean>`

- [ ] **Step 1: Write failing tests**

Create `src/lib/export.test.ts`:

```typescript
import { buildTransactionsCsv } from './export';

describe('buildTransactionsCsv', () => {
  it('starts with a UTF-8 BOM and header row', () => {
    const csv = buildTransactionsCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [, header] = csv.split('\n');
    expect(header).toBeUndefined(); // no rows so no newline yet
    expect(csv.slice(1)).toBe('Date,Time,Category,Name,Note,Amount,Type');
  });

  it('quotes fields with commas and doubles inner quotes', () => {
    const csv = buildTransactionsCsv([
      {
        id: 1, date: '2026-07-17', time: '8:00 AM', createdAt: 1, category: 'food',
        name: 'Coffee, Large', note: 'w/ "extra" shot', amount: 6.5, isIncome: false, photoPath: null,
      },
    ]);
    const lines = csv.slice(1).split('\n');
    expect(lines[1]).toBe('2026-07-17,8:00 AM,Ăn uống,"Coffee, Large","w/ ""extra"" shot",6.50,Expense');
  });

  it('labels income rows', () => {
    const csv = buildTransactionsCsv([
      { id: 1, date: '2026-07-17', time: '9:00 AM', createdAt: 1, category: 'other', name: 'Salary', note: '', amount: 2400, isIncome: true, photoPath: null },
    ]);
    expect(csv.slice(1).split('\n')[1]).toBe('2026-07-17,9:00 AM,Khác,Salary,,2400.00,Income');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/export.test.ts`

Expected: FAIL with "Cannot find module './export'".

- [ ] **Step 3: Implement `export.ts`**

Create `src/lib/export.ts`:

```typescript
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { categoryOf } from './categories';
import type { Txn } from './transactions';

const BOM = '﻿';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildTransactionsCsv(txns: Txn[]): string {
  const header = ['Date', 'Time', 'Category', 'Name', 'Note', 'Amount', 'Type'];
  const rows = txns.map((t) => [
    t.date,
    t.time,
    categoryOf(t.category).label,
    t.name,
    t.note ?? '',
    t.amount.toFixed(2),
    t.isIncome ? 'Income' : 'Expense',
  ]);
  const body = [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(','))
    .join('\n');
  return BOM + body;
}

export async function exportAndShareCsv(txns: Txn[]): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const csv = buildTransactionsCsv(txns);
  const file = new File(Paths.cache, `spendlens-export-${Date.now()}.csv`);
  file.create();
  file.write(csv);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Xuất SpendLens',
    });
  } finally {
    try { file.delete(); } catch { /* best-effort */ }
  }
  return true;
}
```

Note: `Txn.note` may be typed non-nullable in `transactions.ts`. If so, drop the `?? ''`. Verify by opening `src/lib/transactions.ts` interface Txn.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/lib/export.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green + unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export.ts src/lib/export.test.ts
git commit -m "Add CSV export module with BOM and Vietnamese category labels"
```

---

### Task 10: DateRangeModal shared component

**Files:**
- Create: `src/components/sl/date-range-modal.tsx`

**Interfaces:**
- Consumes: `@react-native-community/datetimepicker`, `Text` from sl, `useColors, W` from tokens, `toDateKey` from `src/lib/format`.
- Produces: `<DateRangeModal visible={boolean} initialFrom={string} initialTo={string} onCancel={() => void} onExport={(from: string, to: string) => void />`. `from`/`to` are ISO `YYYY-MM-DD` date keys.

- [ ] **Step 1: Implement the modal**

Create `src/components/sl/date-range-modal.tsx`:

```typescript
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { GradientButton } from '@/components/sl/gradient';
import { useColors, W } from '@/constants/tokens';
import { shiftDateKey, toDateKey } from '@/lib/format';

interface Props {
  visible: boolean;
  initialFrom: string;
  initialTo: string;
  onCancel: () => void;
  onExport: (from: string, to: string) => void;
}

type Quick = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all';

function firstOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, 1));
}

export function DateRangeModal({ visible, initialFrom, initialTo, onCancel, onExport }: Props) {
  const colors = useColors();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);

  const applyQuick = (q: Quick) => {
    const today = toDateKey(new Date());
    if (q === 'thisMonth') {
      setFrom(firstOfMonth(today));
      setTo(today);
    } else if (q === 'lastMonth') {
      const [y, m] = today.split('-').map(Number);
      const lastFirst = toDateKey(new Date(y, m - 2, 1));
      const lastLast = toDateKey(new Date(y, m - 1, 0));
      setFrom(lastFirst);
      setTo(lastLast);
    } else if (q === 'threeMonths') {
      setFrom(shiftDateKey(today, -90));
      setTo(today);
    } else {
      setFrom('2000-01-01');
      setTo(today);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <Text weight="700" style={{ color: colors.text, fontSize: 18 }}>
            Xuất CSV theo khoảng thời gian
          </Text>

          <View style={styles.row}>
            <Pressable style={styles.field} onPress={() => setPicker('from')}>
              <Text weight="500" style={{ color: colors.textDim }}>Từ</Text>
              <Text weight="600" style={{ color: colors.text }}>{from}</Text>
            </Pressable>
            <Pressable style={styles.field} onPress={() => setPicker('to')}>
              <Text weight="500" style={{ color: colors.textDim }}>Đến</Text>
              <Text weight="600" style={{ color: colors.text }}>{to}</Text>
            </Pressable>
          </View>

          <View style={styles.chips}>
            {(['thisMonth', 'lastMonth', 'threeMonths', 'all'] as Quick[]).map((q) => (
              <Pressable key={q} onPress={() => applyQuick(q)} style={[styles.chip, { borderColor: colors.line }]}>
                <Text weight="500" style={{ color: colors.text }}>
                  {q === 'thisMonth' ? 'Tháng này' : q === 'lastMonth' ? 'Tháng trước' : q === 'threeMonths' ? '3 tháng' : 'Toàn bộ'}
                </Text>
              </Pressable>
            ))}
          </View>

          {picker && (
            <DateTimePicker
              value={new Date(picker === 'from' ? from : to)}
              mode="date"
              onChange={(_, d) => {
                setPicker(null);
                if (!d) return;
                const k = toDateKey(d);
                if (picker === 'from') setFrom(k); else setTo(k);
              }}
            />
          )}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancel}>
              <Text weight="600" style={{ color: colors.text }}>Huỷ</Text>
            </Pressable>
            <GradientButton title="Xuất" onPress={() => onExport(from, to)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  sheet: { padding: W.pad, gap: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, padding: 12, borderWidth: 1, borderRadius: 12, borderColor: '#8884' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  cancel: { padding: 12 },
});
```

Note: `GradientButton` prop name (`title` vs `label`) and props of `Text` (`weight` string values) must match the existing sl components. Open `src/components/sl/gradient.tsx` and `src/components/sl/text.tsx` before saving and adjust prop names to match. Do NOT invent names.

- [ ] **Step 2: Verify tsc + jest**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green + unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/sl/date-range-modal.tsx
git commit -m "Add DateRangeModal for date-scoped CSV export"
```

---

### Task 11: Settings screen — skeleton + Ngân sách + Nhắc nhở

**Files:**
- Create: `src/app/settings.tsx`

**Interfaces:**
- Consumes: `useSettings` (Task 3), `notifications.ts` API (Task 7), `sl/*` primitives.
- Produces: route `/settings` renders. Budget section persists to `monthlyBudget`. Reminder section handles permission flow, time picker, `scheduleDailyReminder`, `cancelDailyReminder`.

- [ ] **Step 1: Scaffold the route**

Create `src/app/settings.tsx`:

```typescript
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { GradientButton } from '@/components/sl/gradient';
import { useColors, W } from '@/constants/tokens';
import { formatVND } from '@/lib/format';
import {
  cancelDailyReminder,
  requestPermission,
  scheduleDailyReminder,
} from '@/lib/notifications';
import { useSettings } from '@/lib/settings-context';

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { settings, update } = useSettings();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(String(settings.monthlyBudget || ''));
  const [timePicker, setTimePicker] = useState<null | 'first' | 'change'>(null);

  const saveBudget = () => {
    const n = Number(budgetDraft.replace(/\D/g, '')) || 0;
    update('monthlyBudget', n);
    setBudgetOpen(false);
  };

  const onToggleReminder = async (v: boolean) => {
    if (!v) {
      update('reminderEnabled', false);
      await cancelDailyReminder();
      return;
    }
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert('Cần quyền thông báo', 'Hãy bật quyền thông báo trong Cài đặt hệ thống.');
      return;
    }
    setTimePicker('first');
  };

  const onTimePicked = async (_: unknown, d?: Date) => {
    const mode = timePicker;
    setTimePicker(null);
    if (!d || !mode) return;
    const hh = d.getHours();
    const mm = d.getMinutes();
    const hhmm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    update('reminderHHMM', hhmm);
    if (mode === 'first') update('reminderEnabled', true);
    await scheduleDailyReminder(hh, mm);
  };

  const [hh, mm] = (settings.reminderHHMM ?? '21:00').split(':').map(Number);
  const initialTime = new Date();
  initialTime.setHours(hh, mm, 0, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Cài đặt', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.body}>
        {/* NGÂN SÁCH */}
        <Text weight="700" style={[styles.sectionHeader, { color: colors.textDim }]}>NGÂN SÁCH</Text>
        <Pressable style={[styles.row, { borderColor: colors.line }]} onPress={() => setBudgetOpen(true)}>
          <Text weight="500" style={{ color: colors.text }}>Ngân sách tháng</Text>
          <Text weight="600" style={{ color: colors.text }}>
            {settings.monthlyBudget > 0 ? formatVND(settings.monthlyBudget) : 'Chưa đặt'}
          </Text>
        </Pressable>

        {/* NHẮC NHỞ */}
        <Text weight="700" style={[styles.sectionHeader, { color: colors.textDim }]}>NHẮC NHỞ</Text>
        <View style={[styles.row, { borderColor: colors.line }]}>
          <Text weight="500" style={{ color: colors.text }}>Nhắc chụp bill cuối ngày</Text>
          <Switch value={settings.reminderEnabled} onValueChange={onToggleReminder} />
        </View>
        {settings.reminderEnabled && (
          <Pressable style={[styles.row, { borderColor: colors.line }]} onPress={() => setTimePicker('change')}>
            <Text weight="500" style={{ color: colors.text }}>Giờ nhắc</Text>
            <Text weight="600" style={{ color: colors.text }}>
              {settings.reminderHHMM ?? 'Chưa đặt'}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {timePicker && (
        <DateTimePicker value={initialTime} mode="time" is24Hour onChange={onTimePicked} />
      )}

      {/* Budget keypad modal */}
      <Modal visible={budgetOpen} transparent animationType="slide" onRequestClose={() => setBudgetOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
            <Text weight="700" style={{ color: colors.text, fontSize: 18 }}>Ngân sách tháng</Text>
            <TextInput
              value={budgetDraft}
              onChangeText={(t) => setBudgetDraft(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              style={[styles.input, { color: colors.text, borderColor: colors.line }]}
            />
            <Text weight="500" style={{ color: colors.textDim }}>
              {formatVND(Number(budgetDraft) || 0)}
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={() => setBudgetOpen(false)} style={{ padding: 12 }}>
                <Text weight="600" style={{ color: colors.text }}>Huỷ</Text>
              </Pressable>
              <GradientButton title="Lưu" onPress={saveBudget} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: W.pad, gap: 8 },
  sectionHeader: { marginTop: 16, fontSize: 12 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderWidth: 1, borderRadius: 12,
  },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  sheet: { padding: W.pad, gap: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
});
```

Note: adjust `GradientButton`/`Text` prop names to match the actual sl components, as in Task 10.

- [ ] **Step 2: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green + unchanged.

- [ ] **Step 3: Manual smoke on device**

Run: `npx expo start`. From Home tap the gear icon:
- Route renders.
- Budget row opens keypad modal; entering a number saves, Home now shows the progress bar next reload.
- Reminder toggle: turning ON prompts permission (grant), then time picker appears; picking a time enables reminder. Change time row appears; tap → picker → new time saved.
- Turn OFF: schedule cancelled (verify via `console.log(await Notifications.getAllScheduledNotificationsAsync())` if needed).

- [ ] **Step 4: Commit**

```bash
git add src/app/settings.tsx
git commit -m "Add settings route with budget and reminder sections"
```

---

### Task 12: Settings screen — Giao diện, Dữ liệu, Thông tin

**Files:**
- Modify: `src/app/settings.tsx`

**Interfaces:**
- Consumes: `useSettings.reset` (Task 3), `resetTransactions` (Task 8), `cancelDailyReminder` (Task 7), `DateRangeModal` (Task 10), `exportAndShareCsv` (Task 9).
- Produces: theme segmented, two-tier reset with confirmations, CSV export trigger, About info.

- [ ] **Step 1: Add imports at the top of `src/app/settings.tsx`**

```typescript
import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { DateRangeModal } from '@/components/sl/date-range-modal';
import { Segmented } from '@/components/sl/segmented';
import { exportAndShareCsv } from '@/lib/export';
import { resetTransactions } from '@/lib/transactions';
import { toDateKey } from '@/lib/format';
import { useTransactions } from '@/lib/transactions-context';
```

Also add to the destructure at the top: `const { reset } = useSettings();` and `const { txns, refresh } = useTransactions();`.

**Important:** open `src/lib/transactions-context.tsx` before writing this task. If the hook already exposes a reload function under a different name (`reload`, `refetch`, `revalidate`, …), use that. If it exposes no reload at all, add one as part of this task: a function that re-runs the underlying `listTransactions()` query and calls `setTxns`. The reset flow needs it so the UI does not show stale rows after `resetTransactions()`.

- [ ] **Step 2: Add state**

```typescript
const [exportOpen, setExportOpen] = useState(false);
```

- [ ] **Step 3: Append sections to the `ScrollView`, before the closing tag**

```tsx
{/* GIAO DIỆN */}
<Text weight="700" style={[styles.sectionHeader, { color: colors.textDim }]}>GIAO DIỆN</Text>
<View style={[styles.row, { borderColor: colors.line }]}>
  <Text weight="500" style={{ color: colors.text }}>Chế độ tối</Text>
</View>
<Segmented
  value={settings.themeMode}
  onChange={(v) => update('themeMode', v as 'auto' | 'light' | 'dark')}
  options={[
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Sáng' },
    { value: 'dark', label: 'Tối' },
  ]}
/>

{/* DỮ LIỆU */}
<Text weight="700" style={[styles.sectionHeader, { color: colors.textDim }]}>DỮ LIỆU</Text>
<Pressable style={[styles.row, { borderColor: colors.line }]} onPress={() => setExportOpen(true)}>
  <Text weight="500" style={{ color: colors.text }}>Xuất CSV</Text>
  <Text weight="500" style={{ color: colors.textDim }}>›</Text>
</Pressable>
<Pressable
  style={[styles.row, { borderColor: colors.line }]}
  onPress={() =>
    Alert.alert('Xoá giao dịch', 'Tất cả giao dịch và ảnh sẽ bị xoá vĩnh viễn.', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => { resetTransactions(); refresh(); } },
    ])
  }>
  <Text weight="500" style={{ color: '#FB5B4D' }}>Xoá giao dịch</Text>
</Pressable>
<Pressable
  style={[styles.row, { borderColor: colors.line }]}
  onPress={() =>
    Alert.alert('Reset về mặc định', 'Tất cả giao dịch, ảnh và cài đặt sẽ được đưa về mặc định.', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          resetTransactions();
          reset();
          await cancelDailyReminder();
          refresh();
        },
      },
    ])
  }>
  <Text weight="500" style={{ color: '#FB5B4D' }}>Reset về mặc định</Text>
</Pressable>

{/* THÔNG TIN */}
<Text weight="700" style={[styles.sectionHeader, { color: colors.textDim }]}>THÔNG TIN</Text>
<View style={[styles.row, { borderColor: colors.line }]}>
  <Text weight="500" style={{ color: colors.text }}>Phiên bản</Text>
  <Text weight="500" style={{ color: colors.textDim }}>
    {Constants.expoConfig?.version ?? '1.0.0'}
  </Text>
</View>
<Pressable
  style={[styles.row, { borderColor: colors.line }]}
  onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens')}>
  <Text weight="500" style={{ color: colors.text }}>GitHub</Text>
  <Text weight="500" style={{ color: colors.textDim }}>›</Text>
</Pressable>
<Pressable
  style={[styles.row, { borderColor: colors.line }]}
  onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens/issues')}>
  <Text weight="500" style={{ color: colors.text }}>Báo lỗi</Text>
  <Text weight="500" style={{ color: colors.textDim }}>›</Text>
</Pressable>
<View style={[styles.row, { borderColor: colors.line }]}>
  <Text weight="500" style={{ color: colors.text }}>Giấy phép</Text>
  <Text weight="500" style={{ color: colors.textDim }}>MIT</Text>
</View>
```

- [ ] **Step 4: Add `DateRangeModal` at the end of the top-level `View`, next to the budget modal**

```tsx
<DateRangeModal
  visible={exportOpen}
  initialFrom={toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
  initialTo={toDateKey(new Date())}
  onCancel={() => setExportOpen(false)}
  onExport={async (from, to) => {
    setExportOpen(false);
    const filtered = txns.filter((t) => t.date >= from && t.date <= to);
    await exportAndShareCsv(filtered);
  }}
/>
```

- [ ] **Step 5: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green + unchanged.

- [ ] **Step 6: Manual smoke**

Run: `npx expo start`. In Settings:
- Segmented Auto / Sáng / Tối flips theme instantly.
- Export opens modal → chips + custom dates → share sheet.
- Xoá giao dịch → confirm → txns cleared, settings preserved.
- Reset về mặc định → confirm → both cleared, reminder cancelled.
- GitHub / Báo lỗi links open in browser.

- [ ] **Step 7: Commit**

```bash
git add src/app/settings.tsx
git commit -m "Add theme, data reset, and about sections to Settings"
```

---

### Task 13: History header share icon → CSV

**Files:**
- Modify: `src/app/history.tsx`

**Interfaces:**
- Consumes: `DateRangeModal` (Task 10), `exportAndShareCsv` (Task 9), existing `useTransactions`.
- Produces: share icon in History header opens the same modal + export flow used in Settings.

- [ ] **Step 1: Add imports and state**

At the top of `src/app/history.tsx`:

```typescript
import { useState } from 'react';
import { DateRangeModal } from '@/components/sl/date-range-modal';
import { exportAndShareCsv } from '@/lib/export';
import { toDateKey } from '@/lib/format';
```

Inside the component: `const [exportOpen, setExportOpen] = useState(false);`

- [ ] **Step 2: Add the share icon into the header row**

Locate the header row (title + existing icons if any). Add on the right side:

```tsx
<Pressable onPress={() => setExportOpen(true)} hitSlop={10}>
  <Icon name="share" size={22} color={colors.text} />
</Pressable>
```

If `share` is not in `Icon`'s union, use the closest existing (e.g. `download`, `upload`). Do not invent.

- [ ] **Step 3: Render the modal at the end of the component's root View**

```tsx
<DateRangeModal
  visible={exportOpen}
  initialFrom={toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
  initialTo={toDateKey(new Date())}
  onCancel={() => setExportOpen(false)}
  onExport={async (from, to) => {
    setExportOpen(false);
    const filtered = txns.filter((t) => t.date >= from && t.date <= to);
    await exportAndShareCsv(filtered);
  }}
/>
```

- [ ] **Step 4: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green + unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/history.tsx
git commit -m "Add share icon and CSV export flow to History header"
```

---

### Task 14: Startup re-schedule of the daily reminder

**Files:**
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `useSettings` (Task 3), `scheduleDailyReminder` (Task 7).
- Produces: if reminder is enabled with a set time, silently re-schedule on app boot so a stale OS-side schedule cannot silently drift.

- [ ] **Step 1: Read the current post-Task-4 `_layout.tsx`**

Confirm `SettingsProvider` wraps `ThemedShell` and that `useSettings` is available inside `ThemedShell`.

- [ ] **Step 2: Add a startup effect inside `ThemedShell` (or wherever `useSettings` is called)**

```typescript
import { useEffect } from 'react';
import { scheduleDailyReminder } from '@/lib/notifications';

// inside ThemedShell after `const { settings } = useSettings();`
useEffect(() => {
  if (!settings.reminderEnabled || !settings.reminderHHMM) return;
  const [hh, mm] = settings.reminderHHMM.split(':').map(Number);
  scheduleDailyReminder(hh, mm).catch(() => {
    // silent — permission may have been revoked externally
  });
}, [settings.reminderEnabled, settings.reminderHHMM]);
```

- [ ] **Step 3: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green + unchanged.

- [ ] **Step 4: Manual smoke**

Set a reminder in Settings. Cold-boot the app. In dev console, run:

```typescript
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
console.log(scheduled.find((n) => n.identifier === 'spendlens-daily-reminder'));
```

Expected: entry exists with the saved hour/minute.

- [ ] **Step 5: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "Re-schedule the daily reminder on app startup"
```

---

### Task 15: Template cleanup

**Files:**
- Delete: `src/components/animated-icon.tsx`, `animated-icon.module.css`, `animated-icon.web.tsx`
- Delete: `src/components/app-tabs.tsx`, `app-tabs.web.tsx`
- Delete: `src/components/external-link.tsx`
- Delete: `src/components/hint-row.tsx`
- Delete: `src/components/themed-text.tsx`, `themed-view.tsx`
- Delete: `src/components/web-badge.tsx`
- Delete: `src/components/ui/` (entire dir)
- Delete: `src/app/explore.tsx`

**Interfaces:**
- Consumes: grep must confirm no import exists outside the deleted set.
- Produces: smaller, focused component surface.

- [ ] **Step 1: Grep each name for external imports**

Run each of these and confirm zero hits outside the doomed files themselves:

```bash
for name in animated-icon app-tabs external-link hint-row themed-text themed-view web-badge explore ui/; do
  echo "=== $name ==="
  npx --yes grep -RIn --include='*.ts' --include='*.tsx' --include='*.json' "$name" src/ app.json | grep -v "src/components/$name" | grep -v "src/app/explore"
done
```

If any hit surfaces a real consumer, STOP and review manually before deleting.

- [ ] **Step 2: `git rm` the doomed files**

```bash
git rm src/components/animated-icon.tsx src/components/animated-icon.module.css src/components/animated-icon.web.tsx \
       src/components/app-tabs.tsx src/components/app-tabs.web.tsx \
       src/components/external-link.tsx \
       src/components/hint-row.tsx \
       src/components/themed-text.tsx src/components/themed-view.tsx \
       src/components/web-badge.tsx \
       src/app/explore.tsx
git rm -r src/components/ui
```

- [ ] **Step 3: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: jest green, tsc count **≤** baseline (may drop if removed template files had their own type warnings).

- [ ] **Step 4: Commit**

```bash
git commit -m "Remove unused Expo template components and explore screen"
```

---

### Task 16: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run all tests**

Run: `npx jest --silent`

Expected: all suites pass; new tests added by this plan visible in the pass list (settings, notifications, export, budget-bar, transactions extension).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: ≤ baseline count (91), no new categories of error.

- [ ] **Step 3: Manual smoke checklist on device or simulator**

Run: `npx expo start` and verify:
- Home shows the budget bar with correct color at 50 / 80 / 105 %.
- Gear icon opens `/settings`.
- Budget can be set / cleared; Home updates.
- Reminder toggle: permission denied path → alert + revert; granted path → time picker → schedule confirmed via `getAllScheduledNotificationsAsync()`.
- Theme segmented flips app instantly across all screens.
- Export from Settings and from History both open the modal; chips work; custom range works; CSV opens in a spreadsheet with Vietnamese diacritics intact.
- "Xoá giao dịch" clears txns only. "Reset về mặc định" clears both + cancels reminder.
- GitHub / Báo lỗi links open in browser.

- [ ] **Step 4: If any failure, fix and commit as an amend to the affected task or a new fix commit — do not amend a previously-shipped task from an earlier scope**

- [ ] **Step 5: Report done**
