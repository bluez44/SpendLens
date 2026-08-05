# Design Spec — Shareable Spend Cards

**Date:** 2026-08-05
**Feature:** Shareable Spend Cards (feature #1 of 4 Gen Z-targeted features)
**Status:** Design approved, pending implementation plan

## Goal

Let SpendLens users generate branded, share-worthy card images (Instagram Story / TikTok / Snap format) from their transaction data — driving organic word-of-mouth acquisition and daily engagement among Gen Z users. Scope is limited to **rendering, previewing, and sharing** cards; no data-model expansion beyond one setting flag.

## Non-goals

- Savings-goals subsystem (deferred to a future feature; needed for a "goal progress" card type)
- No-spend-day toggle system (deferred)
- Multi-slide Spotify Wrapped-style flow (single-image only for MVP)
- Multiple visual themes / user customization
- Multiple aspect ratios (only 9:16)
- Cloud persistence of shared cards

## Approved decisions (Q&A summary)

| # | Decision | Chosen |
|---|---|---|
| 1 | Card types in MVP | Weekly recap (B) + Streak (D). Goal (C) deferred. |
| 2 | Design direction | Single fixed template per card type. No themes, no customization. |
| 3 | Trigger points | Manual button on Home header + weekly Sunday 8pm push notification. |
| 4 | Recap card content | Story format — total + top 3 categories + delta % + rules-based punchy line. |
| 5 | Streak card content | Log-days streak + hype line + micro-stat (`txnCountThisWeek`). |
| 6 | Privacy | "Hide amounts" toggle on preview, remembered per-user in settings. |
| 7 | Aspect ratio | 9:16 fixed. 1080×1920 PNG output. |
| 8 | Localization | Auto-follow app locale (i18n keys in `translations/{vi,en}.json`). |
| 9 | Watermark | "spendlens" small text, top-left corner only. |
| 10 | Save-to-gallery button | Kept in MVP (adds `expo-media-library` dep). |
| 11 | Notification granularity | Reuse existing `reminderEnabled` flag; no separate `weeklyRecapEnabled` setting. |

## Architecture

### New files

```
src/app/share.tsx                          Preview screen (route: /share?type=...)
src/components/share/
  ├── recap-card.tsx                       1080×1920 layout, hydrates from RecapData
  ├── streak-card.tsx                      1080×1920 layout, hydrates from StreakData
  └── card-picker-sheet.tsx                Bottom sheet: [Recap] [Streak]
src/lib/
  ├── streaks.ts                           computeLogDaysStreak (pure fn)
  ├── share-cards.ts                       Assembly + pickNarrative + pickHype
  └── use-share-card.ts                    Hook for share.tsx state
```

### Modified files

- `src/app/index.tsx` — add Share icon to Home header (beside settings cog)
- `src/lib/notifications.ts` — add `scheduleWeeklyRecapReminder` / `cancelWeeklyRecapReminder`
- `src/lib/settings.ts` — add `shareHideAmounts: boolean` key (default `false`)
- `translations/{vi,en}.json` — add `share.*` and `narrative.*` and `hype.*` keys

### New dependency

- `expo-media-library` — needed for `MediaLibrary.saveToLibraryAsync` (Save to gallery button)

### Module boundaries

- `streaks.ts` and `share-cards.ts` are **pure functions**. No React, no side effects, no I/O. 100% unit-testable with no mocks.
- Card components (`recap-card.tsx`, `streak-card.tsx`) are **presentation-only**. Take fully-hydrated data via props. Snapshot-testable.
- `share.tsx` is **orchestration only** — glue between hook, card, capture, share. Thin file.
- No shared mutable state. Each concern has one owner.

## Data model

### Types (`src/lib/share-cards.ts`)

```ts
export type CardType = 'recap' | 'streak';

export type NarrativeKey =
  | 'blew_budget'
  | 'splurged'
  | 'locked_in'
  | 'under_budget_hero'
  | 'single_cat_focus'
  | 'new_obsession'
  | 'another_log';

export type HypeKey =
  | 'unstoppable'
  | 'on_a_roll'
  | 'locked_in_streak'
  | 'warming_up'
  | 'just_started';

export interface RecapData {
  weekStart: string;                  // YYYY-MM-DD (Monday)
  weekEnd: string;                    // YYYY-MM-DD (Sunday)
  totalExpense: number;               // in primary currency
  totalIncome: number;
  topCategories: Array<{
    id: string;
    label: string;
    color: string;
    value: number;
    pctOfWeek: number;                // 0..100
  }>;                                 // sorted desc by value, max length 3
  deltaExpensePct: number | null;     // vs previous week; null if no prior data
  narrative: NarrativeKey;
  budgetPctUsed: number | null;       // null if monthlyBudget === 0
  primary: CurrencyCode;
}

export interface StreakData {
  logDays: number;                    // >= 0
  txnCountThisWeek: number;           // >= 0
  hype: HypeKey;
}

export type ShareData =
  | { type: 'recap'; data: RecapData }
  | { type: 'streak'; data: StreakData };
```

### New setting key

Extend `Settings` in `src/lib/settings.ts`:

```ts
interface Settings {
  // ... existing keys
  shareHideAmounts: boolean;          // default: false
}
```

Persisted via existing key-value schema in `settings` table. No SQL migration needed.

### Narrative rules (priority-ordered)

Function `pickNarrative(recap: RecapData, previousWeekTopCatId: string | null): NarrativeKey`

| Priority | Condition | Return |
|---|---|---|
| 1 | `budgetPctUsed !== null && budgetPctUsed > 100` | `blew_budget` |
| 2 | `deltaExpensePct !== null && deltaExpensePct > 30` | `splurged` |
| 3 | `deltaExpensePct !== null && deltaExpensePct < -20` | `locked_in` |
| 4 | `budgetPctUsed !== null && budgetPctUsed < 70` | `under_budget_hero` |
| 5 | `topCategories[0]?.pctOfWeek > 50` | `single_cat_focus` |
| 6 | `previousWeekTopCatId !== null && previousWeekTopCatId !== topCategories[0]?.id` | `new_obsession` |
| 7 | (fallback) | `another_log` |

Priority order: check specific rules first, generic last.

### Hype rules

Function `pickHype(logDays: number): HypeKey`

| Streak | Return |
|---|---|
| ≥ 30 | `unstoppable` |
| ≥ 14 | `on_a_roll` |
| ≥ 7 | `locked_in_streak` |
| ≥ 3 | `warming_up` |
| 1-2 | `just_started` |
| 0 | `just_started` (defensive; card still renders) |

## Streak computation

Function signature:

```ts
export function computeLogDaysStreak(txns: Txn[], today: Date = new Date()): number
```

Algorithm:

1. If `txns.length === 0` → return `0`.
2. Extract `Set<string>` of unique `txn.date` (YYYY-MM-DD) — dedupes multiple txns on same day.
3. Start at `toDateKey(today)`. Two-branch:
   - If today is in set → streak = 1, cursor = today − 1 day.
   - If today NOT in set → check yesterday. If yesterday in set → streak = 1, cursor = yesterday − 1 day. Else → return `0`.
4. Loop: while `cursor` in set → streak++, cursor -= 1 day. Break on miss.
5. Return `streak`.

**Rationale for grace day**: user may not have logged yet today (e.g., checking app in morning before spending). Punishing a fresh streak by not counting yet-to-log day would feel unfair.

## Assembly functions

```ts
export function assembleRecapData(
  txns: Txn[],
  categoryRegistry: CategoryLike[],
  monthlyBudget: number,
  primary: CurrencyCode,
  today: Date = new Date(),
): RecapData
```

Steps:
1. `weekStart = weekStartOf(toDateKey(today))` — Monday of this week (from `lib/comparison.ts`).
2. `weekEnd = shiftDateKey(weekStart, 6)` — Sunday.
3. `thisWeekTxns = filterByWeek(txns, weekStart)`
4. `prevWeekTxns = filterByWeek(txns, shiftDateKey(weekStart, -7))`
5. `comparison = buildComparison(thisWeekTxns, prevWeekTxns, 'week', categoryRegistry, weekStart, shiftDateKey(weekStart, -7))`
6. `totalExpense = comparison.sumA.expense`, `totalIncome = comparison.sumA.income`.
7. `topCategories = comparison.categories.filter(c => c.valueA > 0).slice(0, 3).map(c => ({ id: c.id, label: c.label, color: c.color, value: c.valueA, pctOfWeek: totalExpense > 0 ? (c.valueA / totalExpense) * 100 : 0 }))`
8. `deltaExpensePct = comparison.deltaExpensePct`
9. `budgetPctUsed = monthlyBudget > 0 ? (totalExpense / (monthlyBudget * 7 / 30)) * 100 : null` — proportional-to-week approximation.
10. `previousWeekTopCatId` — compute directly by summarizing `prevWeekTxns`: group by `category`, sum expense per group, pick the id with the max. If `prevWeekTxns.length === 0` → `null`. (Do **not** derive from `comparison.categories` — that array is sorted by valueA, so `.find(c => c.valueB > 0)` returns the wrong category.)
11. `narrative = pickNarrative(recapData, previousWeekTopCatId)`

```ts
export function assembleStreakData(txns: Txn[], today: Date = new Date()): StreakData
```

Steps:
1. `logDays = computeLogDaysStreak(txns, today)`
2. `weekStart = weekStartOf(toDateKey(today))`
3. `txnCountThisWeek = filterByWeek(txns, weekStart).length`
4. `hype = pickHype(logDays)`

## Notifications

Add to `src/lib/notifications.ts`:

```ts
export async function scheduleWeeklyRecapReminder(hh = 20, mm = 0): Promise<void>
export async function cancelWeeklyRecapReminder(): Promise<void>
```

Behavior:
- Uses `Notifications.scheduleNotificationAsync` with a **weekly repeating trigger** at Sunday `hh:mm`. Exact trigger shape depends on Expo SDK v57 — verify at https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ before writing code (weekday-number conventions have shifted across SDK versions; do not guess).
- Content data: `{ route: '/share?type=recap' }` — matches the existing `data.route` convention already handled in `src/app/_layout.tsx`.
- Content body: i18n key `share.weekly_notif_body` — "Your weekly recap is ready".
- **Cancel-before-schedule pattern**: reuse the existing `REMINDER_ID`-style pattern — define `WEEKLY_RECAP_ID = 'spendlens-weekly-recap'` and call `Notifications.cancelScheduledNotificationAsync(WEEKLY_RECAP_ID)` before re-scheduling. Ensures only one weekly recap notif exists.
- Silent failure: if `Notifications.requestPermissionsAsync()` returns denied, skip scheduling with `console.warn`. Not user-facing error.

Called from:
- App boot (`src/app/_layout.tsx` or wherever `scheduleDailyReminder` is currently invoked).
- Whenever `reminderEnabled` setting toggles.

Deep-link handling: Expo Router auto-handles URL routes. Confirm `expo-router` is configured to receive notification tap intents (check `expo-notifications` docs — typically `Notifications.addNotificationResponseReceivedListener` in root layout dispatches `router.push(deepLink)`).

## UI

### Home entry point

Modify `src/app/index.tsx` header. Add share icon (📤 outline) beside the existing settings cog. Tap:
- If `txns.length === 0` and `computeLogDaysStreak(txns) === 0`: icon shown at `opacity: 0.5`; tap shows `Alert.alert(t('share.no_data_title'), t('share.no_data_body'))`.
- Else: present `CardPickerSheet`.

### CardPickerSheet

Bottom sheet component. 2 tap targets:
- "📊 Weekly recap" — `router.push('/share?type=recap')`
- "🔥 Streak" — `router.push('/share?type=streak')`

Sheet auto-dismisses after selection.

### `src/app/share.tsx`

Route: `/share`. Query params: `type` (defaults to `recap` if missing/invalid).

State machine:
- `loading` — assembling ShareData (~200ms, show skeleton preview).
- `ready` — render card, enable controls.
- `capturing` — Share/Save buttons disabled + spinner overlay.
- `error` — Alert; return to `ready` after dismiss.

Layout:

```
┌── Preview & share ────── × ──┐   header with back
│                              │
│  [Card preview scaled to     │
│   fit screen width, 9:16     │
│   aspect ratio maintained]   │
│                              │
│  ☐ Hide amounts              │   toggle (recap only)
│                              │
│  [ Save to gallery ]         │   secondary button
│  [    Share    ]             │   primary gradient button
└──────────────────────────────┘
```

Controls:
- **Hide amounts toggle**: rendered only when `type === 'recap'`. Bound to `settings.shareHideAmounts`. Passes as prop to `RecapCard`.
- **Save to gallery**: calls `handleSaveToGallery()`.
- **Share**: calls `handleShare()`.

### Card layouts

Both cards render at logical size `360×640 dp` (fits phone screen at 9:16), captured at 1080×1920 via view-shot's `width`/`height` options.

**RecapCard visual**:

```
┌────────────────────────────────┐
│ spendlens                      │  watermark: top-left, small, secondary color
│                                │
│                                │
│   WEEKLY RECAP                 │  small caps, secondary
│   Mar 10 – Mar 16              │  date range
│                                │
│                                │
│   $ 1,247                      │  hero stat (~72pt), extrabold
│   ↑ 30% vs last week           │  delta pill, red if expense up
│                                │
│                                │
│   Splurged this week 👀        │  narrative, bold ~24pt
│                                │
│                                │
│   ▓▓▓▓▓▓▓▓▓▓▓▓ Food  42%      │  top 3 rows: color bar + label + %
│   ▓▓▓▓▓▓▓▓ Fun       30%      │
│   ▓▓▓▓▓ Transport    18%      │
│                                │
└────────────────────────────────┘
```

Background: `AccentGradient` tokens (2-3 stop gradient).
Font: system UI. Weights: extrabold hero, semibold stats, medium narrative.

**Hide-amounts branch (recap only)**:
- Hero (`$ 1,247`) → replaced with `87% of budget` if `budgetPctUsed !== null`; otherwise hide the hero line entirely.
- Delta pill: unchanged (percentages don't leak amounts).
- Category rows: drop the trailing `$X` amount if any (spec shows `%` only — already amount-free).

**StreakCard visual**:

```
┌────────────────────────────────┐
│ spendlens                      │  watermark: top-left
│                                │
│                                │
│              🔥                │  emoji giant (~120pt)
│                                │
│              5                 │  number huge (~108pt), extrabold
│                                │
│         days logged            │  label medium
│         in a row               │
│                                │
│                                │
│         Locked in 💯           │  hype, bold ~24pt
│                                │
│                                │
│         12 txns this week      │  micro-stat, small secondary
│                                │
└────────────────────────────────┘
```

No hide-amounts branch (no $ present).

## Capture and share

Card wrapped in `<ViewShot ref={viewShotRef}>` container. On Share tap:

```ts
async function handleShare() {
  setState('capturing');
  let uri: string | null = null;
  try {
    uri = await captureRef(viewShotRef, {
      format: 'png',
      quality: 1,
      width: 1080,
      height: 1920,
      result: 'tmpfile',
    });
    await RNShare.open({ url: uri, type: 'image/png' });
  } catch (err: any) {
    if (err?.message?.includes('User did not share')) {
      // User cancelled — silent
    } else if (uri === null) {
      Alert.alert(t('share.capture_failed_title'), t('share.capture_failed_body'));
    } else {
      Alert.alert(t('share.share_failed_title'), t('share.share_failed_body'));
    }
  } finally {
    setState('ready');
    // Temp file auto-cleaned by OS
  }
}

async function handleSaveToGallery() {
  setState('capturing');
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('share.gallery_perm_title'), t('share.gallery_perm_body'));
      return;
    }
    const uri = await captureRef(viewShotRef, {
      format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile',
    });
    await MediaLibrary.saveToLibraryAsync(uri);
    // Show inline check-mark for 2s (no Alert — non-terminal action)
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 2000);
  } catch (err) {
    Alert.alert(t('share.save_failed_title'), t('share.save_failed_body'));
  } finally {
    setState('ready');
  }
}
```

## Error handling matrix

| Point | Failure | Handling |
|---|---|---|
| `useShareCard(type)` (pure JS) | — | — |
| `captureRef` | Native throw | `Alert.alert(share.capture_failed_*)`; stay on preview |
| `MediaLibrary.requestPermissions` denied | Denied | `Alert.alert(share.gallery_perm_*)` with hint to open Settings |
| `MediaLibrary.saveToLibraryAsync` | Throw | `Alert.alert(share.save_failed_*)` |
| " | Success | Inline check mark 2s, no Alert |
| `RNShare.open` | User cancelled | Silent (detect `User did not share`) |
| `RNShare.open` | Real failure | `Alert.alert(share.share_failed_*)` |
| `scheduleWeeklyRecapReminder` | Permission denied / throw | `console.warn`, no user alert (background op) |
| Deep-link `type` invalid | | Default `type=recap`, no error |
| Assembly with empty data | | Card still renders (0 values, fallback narrative); Home entry point disables when both cards empty |

**Principle**: user-initiated actions (capture, save, share) must surface errors — silent failure is prohibited (audit priority #4 fix pattern).

## Testing strategy

### Unit tests (highest value, no mocks)

- `src/lib/streaks.test.ts`
  - empty txns → 0
  - only today → 1
  - today + yesterday → 2
  - yesterday only (no today) → 1 (grace)
  - gap (today + 2 days ago) → 1
  - today missing, day-before-yesterday only → 0 (2-day gap breaks)
  - 30-day continuous → 30
  - multiple txns same day → count 1

- `src/lib/share-cards.test.ts`
  - `pickNarrative`: each of 7 rules fires at correct priority (8 test cases + fallback)
  - `pickHype`: threshold boundaries (0, 1, 2, 3, 6, 7, 13, 14, 29, 30, 31)
  - `assembleRecapData` with `monthlyBudget === 0` → `budgetPctUsed === null`
  - `assembleRecapData` with empty txns → all-zero totals, `narrative === 'another_log'`
  - `assembleRecapData` with category shift → `narrative === 'new_obsession'` when no higher-priority rule fires
  - `assembleRecapData` with 1-2 categories → `topCategories.length` matches (no crash on < 3)
  - `assembleStreakData` composition

- `src/lib/notifications.test.ts` (extends existing tests)
  - `scheduleWeeklyRecapReminder`: mock `scheduleNotificationAsync`, verify trigger fires weekly on Sunday at 20:00 (exact object shape verified against Expo v57 docs during implementation)
  - `cancelWeeklyRecapReminder`: mock `getAllScheduledNotificationsAsync` returning mixed notifs, verify only recap-tagged one cancelled

### Component tests (react-native-testing-library)

- `src/components/share/recap-card.test.tsx`
  - Renders total, narrative text, 3 category rows
  - `hideAmounts=true` + `budgetPctUsed=87` → renders `87% of budget`, no `$`
  - `hideAmounts=true` + `budgetPctUsed=null` → hero line absent
  - `deltaExpensePct=null` → no delta pill rendered (no NaN%)
  - Categories `[1 item]` → renders 1 row, no crash

- `src/components/share/streak-card.test.tsx`
  - Renders `logDays` prominently
  - `logDays=0` → renders defensively (no crash)
  - Hype text matches expected i18n key per streak threshold

- `src/components/share/card-picker-sheet.test.tsx`
  - Both options render
  - Tap "Weekly recap" → callback fires with `'recap'`

- `src/app/share.test.tsx` (integration)
  - Mount with query `type=recap` → RecapCard visible
  - Toggle Hide amounts → RecapCard re-renders with new prop
  - Tap Share success → mocked RNShare.open called with URI
  - Tap Share on captureRef throw → Alert.alert called

### Not tested (out of jest scope)

- Actual OS share dialog behavior
- PNG visual correctness (manual QA / snapshot files if desired later)
- Notification firing on actual Sunday 8pm

### Manual QA checklist

- Trigger Share → PNG output is 1080×1920, text sharp
- Share to Instagram Story on iOS + Android — layout not cropped
- Notification fires on schedule (dev: temporarily set trigger to "2 minutes from now" for validation)
- Deep-link from notif opens correct preview screen
- Switching app locale VI ↔ EN → card text renders in correct language
- With `shareHideAmounts=true` → no `$` symbol anywhere on shared card

## Rollback / cleanup

- No DB writes to transactions/subscriptions — feature is read-only against existing data. No rollback SQL needed.
- If feature reverted:
  - `shareHideAmounts` setting orphaned in `settings` table — harmless (key-value schema tolerates unknown keys).
  - Weekly notification — call `cancelWeeklyRecapReminder()` in a one-shot migration or let it die with app uninstall.
  - Temp PNGs in cache — OS-managed cleanup.

## Open questions

None. All decisions confirmed in Q&A.

## References

- Existing `lib/comparison.ts` (`filterByWeek`, `buildComparison`, `weekStartOf`, `shiftDateKey`)
- Existing `lib/notifications.ts` pattern (`scheduleDailyReminder`)
- Existing `react-native-view-shot` and `react-native-share` (installed)
- Audit doc: `docs/audits/2026-08-05-code-audit.md`
