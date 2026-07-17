# Expense Tracker (SpendLens) — Design

Source: Claude Design project "Daily Expense Tracker App" (`5dfacf81-4d49-470f-b4a3-605da6ef7c2f`), file `Expense Tracker.dc.html`. This spec turns that fully-specified interactive mockup into the real SpendLens app, replacing the current default Expo template.

## Goal

SpendLens becomes a real expense-tracking app: capture receipts, log transactions, browse history, see spending stats, and manage settings — matching the mockup's visual design pixel-for-pixel, backed by real local persistence, a real camera, real notifications, and optional Google sign-in for future sync.

## Architecture

```
src/
  app/
    index.tsx                 — Capture screen (app launch lands here)
    (tabs)/
      _layout.tsx              — custom tab bar (Home/History/Stats/Settings + FAB), NOT NativeTabs
      index.tsx                — Home
      history.tsx
      stats.tsx
      settings.tsx
    _layout.tsx                — root: owns overlay state (add-details/tx-detail), auth state
  components/expense/          — transaction-row, category-chip, donut-chart, bar-chart,
                                  keypad, segmented-control, toast, google-sign-in-button
  lib/
    db.ts                      — expo-sqlite setup, schema, migrations
    categories.ts              — static category definitions (id, label, colors, icon), ported from mockup's CATS
    transactions.ts            — query/insert/update/delete helpers + useTransactions() hook
    receipts.ts                — expo-file-system helpers for saving/reading receipt photos
    notifications.ts           — expo-notifications scheduling for the daily reminder
    export.ts                  — CSV generation + expo-sharing
    auth.ts                    — expo-auth-session Google flow, session persistence, useAuth()
```

**Data flow**: SQLite is the source of truth. `useTransactions()` wraps queries and exposes `insert/update/delete`; after any mutation it re-queries and notifies subscribers (simple pub/sub — no external state library needed, this app has one real collection). Screens call the hook and get live data; no prop-drilling the transaction list through navigation params.

**Navigation**: app launch → Capture (full screen, `app/index.tsx`) → snap or skip photo → Add Details (shares state with Capture; presented as in-memory overlay state, not a router route) → Save lands on the Home tab. Closing Capture (✕) also lands on Home tab + tab bar. The 4 main tabs (Home/History/Stats/Settings) are real Expo Router routes under a custom (non-native) tab bar — deep-linkable, get router history for free. Transaction Detail opens as overlay state (not a route) from Home/History rows, matching the mockup's layered-overlay interaction model (needed for its specific slide-up transitions and shared state that doesn't map cleanly to router's page model).

## Data Model (SQLite via `expo-sqlite`)

```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,        -- 'YYYY-MM-DD'
  time TEXT NOT NULL,        -- display string, e.g. '8:12 AM'
  created_at INTEGER NOT NULL, -- epoch ms, for stable sort
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  amount REAL NOT NULL,
  is_income INTEGER NOT NULL DEFAULT 0,
  photo_path TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- keys used: monthlyBudget, dailyReminderEnabled, dailyReminderNotificationId

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);
```

Categories (`food`, `transport`, `shopping`, `bills`, `health`, `fun`, `other`) stay a static TS array with id/label/chip-color/icon — ported directly from the mockup's `CATS`, not a DB table.

On first launch (empty `transactions` table), seed with the mockup's ~40 sample transactions, remapped from the mockup's hardcoded anchor date (`2026-07-17`) onto **today's actual date** so the seed data stays realistic over time (same relative offsets, e.g. "today", "yesterday", "6 days ago"). Transactions created afterward through Add Details use the real device clock for `date`/`time`/`created_at`, not mockup constants.

Sign-in is optional and local-only for now — there is no backend to sync to yet. Signing in populates `users` and persists the session; nothing in the app is gated on it.

## Screens & Components

Styling: NativeWind `className` throughout (already configured in this repo). The mockup's exact design tokens (colors, radii, shadows, spacing) get ported into Tailwind theme variables in `global.css` (e.g. `--color-brand-500: #10B981`, `--color-danger-500: #EF4444`) rather than sprinkled as inline hex, so they're reusable across components.

- **Capture** (`app/index.tsx`) — full-screen camera via `expo-camera`, receipt-frame overlay guide, shutter + skip buttons, close (✕) to tab bar.
- **Add Details** (overlay, shares state with Capture) — receipt thumbnail if photo taken, large amount display + custom keypad (ported from mockup, not a native keyboard), Expense/Income segmented toggle, category picker (horizontal 2-row scroll grid), note text input, date row using `@expo/ui`'s native `DateTimePicker`, Save button.
- **Home** (tab) — greeting header, monthly-spend hero card with budget progress bar, today/week stat cards, recent transactions list (tap row → Transaction Detail overlay).
- **History** (tab) — Day/Month segmented toggle, prev/next period nav, spent/income/net summary row, category filter chips, day-grouped transaction list, empty state illustration.
- **Stats** (tab) — month nav, donut chart by category (`react-native-svg`) with legend, daily/monthly bar chart, top-categories list with progress bars.
- **Settings** (tab) — profile row (Google sign-in button when signed out, real name/email/avatar when signed in), monthly budget (tap to edit — inline input since there's no design-tool control panel in the real app), currency (static "USD ($)" for now), daily reminder as a native `@expo/ui` `Switch`, Export data (real CSV export), About (static "v1.0" label).
- **Transaction Detail** (overlay) — receipt photo or "no photo" state, amount/name/category chip, date/time/note, Edit / Change category (inline chip picker) / Delete (inline confirm row, not a native alert) — ported directly from mockup.
- **Tab bar** (custom component, not `NativeTabs`) — Home / History / [raised circular green FAB, opens Capture] / Stats / Settings. Built custom because a native OS tab bar cannot render a floating button raised above the bar.
- **Toast** — bottom pill toast for Saved/Updated/Deleted/error confirmations, auto-dismisses (~1.8s), ported from mockup.

## Native Integrations

New dependencies: `expo-sqlite`, `expo-camera`, `expo-file-system`, `expo-sharing`, `expo-notifications`, `expo-auth-session`, `react-native-svg`, `@expo/ui`, `jest-expo` (dev).

- **Camera**: request permission on first Capture visit. If denied, show an inline message with a "Skip photo" fallback — never a hard block. Captured photos are copied from the camera's temp URI into a persistent app directory via `expo-file-system` before being referenced by a transaction row (temp files aren't guaranteed to survive).
- **Notifications**: toggling the Settings reminder on requests permission (if denied, revert the switch and toast an explanation) and schedules a repeating daily local notification; toggling off cancels it. The scheduled notification ID is persisted in `settings` so it survives app restarts.
- **Google Sign-In**: standard OAuth code flow via `expo-auth-session` + `expo-web-browser`. On success, upsert into `users` and persist the session token via `expo-secure-store`. Settings shows "Sign in with Google" ↔ real profile card based on session state. Sign-in failure/cancel returns to signed-out state with a toast — non-blocking. OAuth client IDs (iOS/Android/Web) are read from env config (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`), not hardcoded; the user will need guidance creating a Google Cloud project and OAuth clients during implementation.
- **CSV export**: build CSV in-memory from all transactions, write via `expo-file-system`, open the native share sheet via `expo-sharing`. If sharing is unavailable on the platform, toast an error.

## Error Handling

SQLite writes are wrapped so a failed insert/update/delete surfaces a toast rather than silently losing data or crashing. The UI never assumes camera, notification, or auth permissions are granted — every native capability has a non-blocking fallback path (skip photo, revert toggle, stay signed out).

## Testing

No test framework is configured in this repo yet.

- **Unit tests** (`jest-expo`, new dependency): date/period grouping and labels (History's day/month grouping, Stats' bar-chart bucketing), budget/percentage math, CSV formatting, and the transaction query/filter helpers in `lib/transactions.ts` (against an in-memory or temp SQLite DB).
- **Manual verification** via the `run` skill on a simulator for everything native/visual: camera capture, notification scheduling/permission flows, Google sign-in, and each screen's fidelity to the mockup — these can't be meaningfully unit tested without a real camera/notification/OAuth environment.
