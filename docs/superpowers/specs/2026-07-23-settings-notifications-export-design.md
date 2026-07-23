# SpendLens — Settings, Notifications, CSV Export & Cleanup

**Date:** 2026-07-23
**Status:** Approved (brainstorming)
**Baseline:** `origin/main` at `3b5d663` (camera-first Stack + sl/* design system + SQLite backend already in place)

## Goal

Close the remaining gaps on top of the existing camera-first SpendLens app: a full Settings screen (budget, reminder, theme, data actions, about), local daily-reminder notifications, CSV export, and removal of leftover template files from the Expo starter. Google Sign-In and a separate Stats screen are explicitly out of scope for this iteration.

## Scope

**In**
- Monthly budget with progress bar on Home.
- Daily reminder toggle + user-picked time (persisted via `expo-notifications`).
- Manual theme override: Auto / Light / Dark.
- CSV export (all fields) with date range picker; triggered from Settings and History.
- Two-tier data reset: transactions-only, and factory reset.
- App info: version, GitHub repo link, GitHub Issues link, MIT license.
- Template file cleanup (unused Expo starter components + `explore.tsx`).

**Out**
- Google Sign-In / users wiring (Task 27 of the original plan).
- Standalone Stats screen (origin's `home.tsx` donut + bar chart is sufficient).
- Schema changes to the `settings` SQLite table (already exists as key/value).
- Adding cloud sync, encryption, or export formats other than CSV.

## Architecture

### New files
- `src/lib/settings.ts` — typed CRUD over the `settings` SQLite table.
- `src/lib/settings-context.tsx` — `SettingsProvider` + `useSettings()` in-memory cache.
- `src/lib/notifications.ts` — thin wrapper over `expo-notifications`.
- `src/lib/export.ts` — pure CSV builder + `Sharing.shareAsync` flow.
- `src/app/settings.tsx` — Settings screen route.
- `src/components/sl/budget-bar.tsx` — presentational progress bar.
- `src/components/sl/date-range-modal.tsx` — reusable range picker for exports.

### Modified files
- `src/app/_layout.tsx` — wrap `SettingsProvider`; apply resolved `themeMode` (replacing raw `useColorScheme()`); silent re-schedule of daily reminder on startup when enabled.
- `src/app/home.tsx` — add budget bar under balance card + gear icon in header → `/settings`.
- `src/app/history.tsx` — add share icon in header → date range modal → CSV export.
- `app.json` — add `expo-notifications` plugin block (icon asset).
- `package.json` — add `expo-notifications`, `@react-native-community/datetimepicker`.

### Deleted files (template cleanup)
- `src/components/animated-icon.tsx`, `animated-icon.module.css`, `animated-icon.web.tsx`
- `src/components/app-tabs.tsx`, `app-tabs.web.tsx`
- `src/components/external-link.tsx`
- `src/components/hint-row.tsx`
- `src/components/themed-text.tsx`, `themed-view.tsx`
- `src/components/web-badge.tsx`
- `src/components/ui/` (entire dir)
- `src/app/explore.tsx`

Guardrail: grep each name across `src/` + `app.json` before deletion. If any file outside the deleted set imports it, stop and review — do not auto-rewrite consumers.

## Settings data layer

The `settings` table (existing) is a `(key TEXT PRIMARY KEY, value TEXT)` store. No schema change.

```ts
export interface Settings {
  monthlyBudget: number;        // VND; 0 = unset
  reminderEnabled: boolean;
  reminderHHMM: string | null;  // "HH:MM"; null until user picks
  themeMode: 'auto' | 'light' | 'dark';
}

export const DEFAULTS: Settings = {
  monthlyBudget: 0,
  reminderEnabled: false,
  reminderHHMM: null,
  themeMode: 'auto',
};

export async function loadSettings(db: SQLiteDatabase): Promise<Settings>;
export async function updateSetting<K extends keyof Settings>(
  db: SQLiteDatabase, key: K, value: Settings[K],
): Promise<void>;
export async function resetSettings(db: SQLiteDatabase): Promise<void>;
```

Serialization:
- number/string → stored raw.
- boolean → `"0"` / `"1"` (distinct from any number/string used elsewhere).
- `null` → row absent (get returns default).

`SettingsProvider` loads once on mount, memoizes state, exposes an `update()` that writes to SQLite then calls `setState`. Every screen reads via `useSettings()`; no direct DB touches in components.

### Data reset (two actions)
- `resetTransactions(db)` in `src/lib/transactions.ts` — `DELETE FROM transactions`. Also best-effort delete of any locally-stored receipt image files referenced by `photoPath` (skip remote URLs and swallow per-file errors so a missing/renamed file doesn't abort the reset). Settings preserved.
- `resetSettings(db)` in `src/lib/settings.ts` — `DELETE FROM settings`. Context re-loads DEFAULTS. Transactions preserved.

Both actions gated by two-step `Alert.alert()` confirmation.

## Settings screen UI (`src/app/settings.tsx`)

Stack screen, header title "Cài đặt", back arrow. Scrollable section list:

1. **Ngân sách**
   - Row `Ngân sách tháng` → tap opens a modal keypad, live-formats "3.000.000", saves to `monthlyBudget`.

2. **Nhắc nhở**
   - Row `Nhắc chụp bill cuối ngày` — toggle bound to `reminderEnabled`.
   - Row `Giờ nhắc` — enabled only when reminder ON; tap opens `@react-native-community/datetimepicker`; shows `HH:MM` or "Chưa đặt".

3. **Giao diện**
   - Segmented `[ Auto ] [ Sáng ] [ Tối ]` bound to `themeMode`. Change applies immediately via `_layout.tsx`.

4. **Dữ liệu**
   - Row `Xuất CSV` → opens `DateRangeModal` → export flow.
   - Row `Xoá giao dịch` (red) → two-step confirm → `resetTransactions()`.
   - Row `Reset về mặc định` (red) → two-step confirm → `resetSettings()` (and cancel any scheduled reminder).

5. **Thông tin**
   - `Phiên bản` — `Constants.expoConfig?.version ?? '1.0.0'`.
   - `GitHub` → `Linking.openURL('https://github.com/bluez44/SpendLens')`.
   - `Báo lỗi` → `Linking.openURL('https://github.com/bluez44/SpendLens/issues')`.
   - `Giấy phép` — `MIT`.

**Entry point:** gear icon in the right side of Home's header row → `router.push('/settings')`.

### Reminder toggle flow
1. Toggle ON:
   - `Notifications.requestPermissionsAsync()`.
   - If denied → `Alert` explaining, keep toggle OFF.
   - If granted → auto-open time picker.
   - On time chosen: `update('reminderEnabled', true)` + `update('reminderHHMM', 'HH:MM')` + `scheduleDailyReminder(hh, mm)`.
   - On time cancelled: revert toggle to OFF.
2. Toggle OFF: `cancelDailyReminder()`; preserve `reminderHHMM` (so a later re-enable remembers the last time).
3. Change time row (while ON): open picker, on save → `scheduleDailyReminder(hh, mm)` (fixed identifier replaces the previous schedule).

## Home budget bar

Position: directly under existing balance card, before the monthly bar chart.

```
Đã chi tháng này
1.850.000₫ / 3.000.000₫              62%
█████████████░░░░░░░░░░░
```

Source: `useTransactions()` → filter `!isIncome` and current month → sum `amount`. Budget from `useSettings().monthlyBudget`.

Rules:
- `budget === 0` → hide bar; show one-line CTA "Đặt ngân sách tháng →" that pushes `/settings`.
- `pct < 80` → accent gradient (existing peach → coral tokens).
- `80 ≤ pct ≤ 100` → orange `#F59E0B` solid.
- `pct > 100` → red `#FB5B4D` solid; label shows the true percentage (e.g. "115%"). Fill width capped at 100%.

Component `BudgetBar` is pure/presentational: props `{ spent: number; budget: number }`. No context access inside.

## Notifications (`src/lib/notifications.ts`)

Uses a fixed identifier so schedule is idempotent.

```ts
const REMINDER_ID = 'spendlens-daily-reminder';

export async function requestPermission(): Promise<boolean>;
export async function scheduleDailyReminder(hh: number, mm: number): Promise<void>;
export async function cancelDailyReminder(): Promise<void>;
```

Implementation notes:
- `scheduleNotificationAsync` with `trigger: { type: SchedulableTriggerInputTypes.DAILY, hour, minute }`.
- Content: `{ title: 'SpendLens', body: 'Ghi lại chi tiêu hôm nay?' }`.
- Cancel by identifier before re-schedule to avoid duplicates.
- On startup (`_layout.tsx` `useEffect` after settings loaded): if `reminderEnabled && reminderHHMM` → silently re-schedule (no permission prompt; if permission was revoked externally the schedule is a no-op).
- `app.json`: add plugin entry `["expo-notifications", { icon: "./assets/notification-icon.png" }]` for production builds. Placeholder icon path — real asset can be added later; dev builds work without it.

## CSV export (`src/lib/export.ts`)

```ts
export function buildTransactionsCsv(txns: Transaction[]): string;
export async function exportAndShareCsv(txns: Transaction[]): Promise<boolean>;
```

CSV format:
- Header: `Date,Time,Category,Name,Note,Amount,Type`.
- Rows: 1 per txn. `Category` = `categoryOf(t.category).label` (Vietnamese). `Amount` = `t.amount.toFixed(2)`. `Type` = `Income` or `Expense`.
- Escape: if field contains `,`, `"`, or `\n` → wrap in `"..."` with inner `"` doubled to `""`.
- File payload starts with UTF-8 BOM (`﻿`) so Excel opens Vietnamese diacritics correctly.

Runtime:
- Write to `${Paths.cache}/spendlens-export-${Date.now()}.csv` via `expo-file-system`.
- `Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Xuất SpendLens' })`.
- Cleanup file in `finally` (best-effort; ignore delete errors).
- Return `false` if `Sharing.isAvailableAsync()` is false.

### Date range modal (`src/components/sl/date-range-modal.tsx`)

Reused by Settings and History. Fields:
- "Từ" and "Đến" — tap opens `datetimepicker` in date mode.
- Quick chips: `Tháng này` (default), `Tháng trước`, `3 tháng`, `Toàn bộ`.
- Actions: `Huỷ` / `Xuất`.

Flow: on Xuất → filter via existing `filterRange(txns, from, to)` in `transactions.ts` → `exportAndShareCsv(filtered)`.

History entry: share icon added to header (right of title) → same modal.

## Testing

Unit (Jest, native modules mocked):
- `settings.test.ts` — round-trip for every key type; `resetSettings` clears rows; boolean `"0"/"1"` decode.
- `export.test.ts` — header row, escaping (`,`, `"`), income row, empty list, BOM prefix.
- `notifications.test.ts` — mock `expo-notifications`; `schedule` sends correct trigger (DAILY, hour, minute) and identifier; `cancel` calls cancel with identifier.
- `budget-bar.test.tsx` — three threshold states render correct color; `budget === 0` renders the CTA.

Verification bar before calling this scope done:
- `npm test` all green.
- `npx tsc --noEmit` no *new* errors vs. baseline (pre-existing 88 jest-globals errors are inherited from `origin/main` and out of scope).
- Manual smoke on a real device or emulator: budget updates Home, reminder fires (verified via `getAllScheduledNotificationsAsync()`), theme switch is instant, CSV opens cleanly in Excel/Sheets with Vietnamese labels, both resets scope correctly.

## Open questions

None at spec time — all decisions captured above.

## Dependencies to add

- `expo-notifications` (align to Expo SDK 57 version pinning).
- `@react-native-community/datetimepicker`.
- No dep removals (Plus Jakarta Sans and `sl/*` remain — they're used by the origin baseline).
