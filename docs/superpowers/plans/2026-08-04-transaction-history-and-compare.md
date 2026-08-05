# Transaction history browser & compare — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Monthly History Browser screen for reviewing past months, augment the Overview with delta indicators, and add a Compare screen that overlays two periods side by side.

**Architecture:** All derivations happen in-memory over the `Txn[]` returned by `useTransactions()` — no SQLite schema change. A new pure-logic module (`src/lib/comparison.ts`) exposes month/week filters, delta primitives, and a `buildComparison()` aggregator. Four new reusable components (`DeltaBadge`, `MonthPickerSheet`, `WeekPickerSheet`, `PeriodPickerSheet`, `BarChartOverlay`) plus two new Expo Router screens (`/history-months`, `/compare`).

**Tech Stack:** Expo Router 57, React Native, `expo-sqlite`, `@gorhom/bottom-sheet` v5, `react-native-svg`, i18next. TypeScript strict.

## Global Constraints

- **Expo SDK 57** — read `https://docs.expo.dev/versions/v57.0.0/` before writing framework code (per `AGENTS.md`).
- **No DB schema change.** No migrations. No new SQL.
- **No test framework in repo.** Verification per task = `npx tsc --noEmit` + visual smoke test in Expo dev + manual QA checklist at the end. Do not add jest / vitest.
- **Multi-currency:** always use `tx.amount` (already converted to the user's primary currency) — never `tx.originalAmount` — in aggregation code. Consistent with existing `home.tsx` and `history.tsx`.
- **Timezone:** `tx.date` (local `YYYY-MM-DD`) is the source of truth for month/week/day membership. Do **not** rebuild dates from `tx.createdAt` epoch for bucketing purposes.
- **Design tokens:** colors via `useColors()`, spacing/radius via `Radius`, weights via `W`, money colors via `Money`. Do not hard-code hex.
- **i18n:** every user-visible string uses `t('key')`. Add every new key to both `en.json` and `vi.json`.
- **No new dependencies.** All work uses libraries already in `package.json`.
- **Reference spec:** `docs/superpowers/specs/2026-08-04-transaction-history-and-compare-design.md`.

---

## File map

**New files:**
- `src/lib/comparison.ts` — pure derivations (Task 2)
- `src/components/sl/summary-cell.tsx` — extracted from `history.tsx` (Task 3)
- `src/components/sl/delta-badge.tsx` — reusable ▲/▼ +N% pill (Task 3)
- `src/components/sl/month-picker-sheet.tsx` — bottom sheet (Task 4)
- `src/components/sl/week-picker-sheet.tsx` — bottom sheet (Task 5)
- `src/components/sl/period-picker-sheet.tsx` — preset selector sheet (Task 6)
- `src/components/sl/bar-chart-overlay.tsx` — two-series bar chart (Task 7)
- `src/app/history-months.tsx` — Monthly History Browser screen (Task 8)
- `src/app/compare.tsx` — Compare screen (Task 11)

**Modified files:**
- `src/lib/i18n/locales/en.json` (Task 1)
- `src/lib/i18n/locales/vi.json` (Task 1)
- `src/app/history.tsx` — use extracted `SummaryCell`; add "Xem tháng cũ" button (Tasks 3, 9)
- `src/app/home.tsx` — DeltaBadge, category delta, "So sánh" button (Task 10)

---

## Task 1: Add i18n keys

**Files:**
- Modify: `src/lib/i18n/locales/vi.json`
- Modify: `src/lib/i18n/locales/en.json`

**Interfaces:**
- Consumes: nothing
- Produces: i18n keys under namespaces `history_months`, `compare`, `delta` — every later UI task calls `t('history_months.*')`, `t('compare.*')`, `t('delta.*')`

- [ ] **Step 1: Add Vietnamese keys**

Open `src/lib/i18n/locales/vi.json`. Insert these three namespaces after the existing `history` object (keep alphabetic order flexible — match neighbours):

```json
"history_months": {
  "header": "Xem tháng cũ",
  "picker_trigger_placeholder": "Chọn tháng",
  "picker_title": "Chọn tháng",
  "empty_no_history": "Chưa có dữ liệu các tháng trước",
  "empty_this_month": "Chưa có giao dịch trong tháng này",
  "picker_row_spend": "{{amount}} chi",
  "view_older_btn": "Xem tháng cũ"
},
"compare": {
  "header": "So sánh",
  "type_month": "Tháng",
  "type_week": "Tuần",
  "swap_a11y": "Đổi vị trí A và B",
  "preset_label": "Chọn nhanh",
  "preset_this_vs_last_month": "Tháng này vs Tháng trước",
  "preset_last_vs_prev_month": "Tháng trước vs 2 tháng trước",
  "preset_year_over_year": "Cùng kỳ năm trước",
  "preset_this_vs_last_week": "Tuần này vs Tuần trước",
  "preset_last_vs_prev_week": "Tuần trước vs 2 tuần trước",
  "preset_custom": "Tuỳ chọn",
  "picker_a_title": "Chọn kỳ A",
  "picker_b_title": "Chọn kỳ B",
  "chart_title_month": "Chi theo tuần",
  "chart_title_week": "Chi theo ngày",
  "categories_title": "Danh mục",
  "empty_period_a": "Không có giao dịch trong kỳ A",
  "empty_period_b": "Không có giao dịch trong kỳ B",
  "empty_both": "Chưa có dữ liệu để so sánh",
  "compare_btn": "So sánh",
  "week_label_range": "{{from}} - {{to}}",
  "week_day_short": ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
  "week_bucket_short": "W{{n}}"
},
"delta": {
  "vs_yesterday": "so với hôm qua",
  "vs_last_week": "so với tuần trước",
  "vs_month": "so với {{label}}",
  "category_new": "mới",
  "category_gone": "không còn",
  "no_previous": ""
}
```

- [ ] **Step 2: Add English mirror keys**

Open `src/lib/i18n/locales/en.json`. Insert the mirror block:

```json
"history_months": {
  "header": "Older transactions",
  "picker_trigger_placeholder": "Select month",
  "picker_title": "Select month",
  "empty_no_history": "No history from previous months yet",
  "empty_this_month": "No transactions this month",
  "picker_row_spend": "{{amount}} spent",
  "view_older_btn": "View older transactions"
},
"compare": {
  "header": "Compare",
  "type_month": "Month",
  "type_week": "Week",
  "swap_a11y": "Swap A and B",
  "preset_label": "Quick pick",
  "preset_this_vs_last_month": "This month vs last month",
  "preset_last_vs_prev_month": "Last month vs 2 months ago",
  "preset_year_over_year": "Same month last year",
  "preset_this_vs_last_week": "This week vs last week",
  "preset_last_vs_prev_week": "Last week vs 2 weeks ago",
  "preset_custom": "Custom",
  "picker_a_title": "Pick period A",
  "picker_b_title": "Pick period B",
  "chart_title_month": "Spend by week",
  "chart_title_week": "Spend by day",
  "categories_title": "Categories",
  "empty_period_a": "No transactions in period A",
  "empty_period_b": "No transactions in period B",
  "empty_both": "No data to compare",
  "compare_btn": "Compare",
  "week_label_range": "{{from}} - {{to}}",
  "week_day_short": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "week_bucket_short": "W{{n}}"
},
"delta": {
  "vs_yesterday": "vs yesterday",
  "vs_last_week": "vs last week",
  "vs_month": "vs {{label}}",
  "category_new": "new",
  "category_gone": "gone",
  "no_previous": ""
}
```

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "require('./src/lib/i18n/locales/vi.json'); require('./src/lib/i18n/locales/en.json'); console.log('ok')"`
Expected: prints `ok`. If it errors, fix the syntax (usually a missing comma before the inserted block).

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/locales/vi.json src/lib/i18n/locales/en.json
git commit -m "i18n(compare): add history_months, compare, delta namespaces"
```

---

## Task 2: Pure derivations — `comparison.ts`

**Files:**
- Create: `src/lib/comparison.ts`

**Interfaces:**
- Consumes: `Txn`, `Range`, `Summary` from `./transactions`; `monthKey`, `toDateKey` from `./format`; `STATIC_CATEGORIES`, `categoryLabel`, `CategoryId` from `./categories`; user categories flow through `CategoryObj`-like objects passed by caller.
- Produces: functions listed below, plus `CategoryDelta` and `Comparison` types. Later tasks import these by name.

- [ ] **Step 1: Create the file**

Write `src/lib/comparison.ts` with this content exactly (adjust import paths only if the compiler complains):

```ts
import type { CategoryId } from './categories';
import { STATIC_CATEGORIES, categoryLabel } from './categories';
import { monthKey, toDateKey } from './format';
import { i18n } from './i18n';
import type { Range, Summary, Txn } from './transactions';
import { summarize } from './transactions';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CategoryLike {
  id: string;
  label: string;
  color: string;
}

export interface CategoryDelta {
  id: string;
  label: string;
  color: string;
  valueA: number;
  valueB: number;
  deltaPct: number | null;
  status: 'both' | 'onlyA' | 'onlyB';
}

export interface Comparison {
  sumA: Summary;
  sumB: Summary;
  deltaExpensePct: number | null;
  deltaIncomePct: number | null;
  deltaNetPct: number | null;
  categories: CategoryDelta[];
  seriesA: number[];
  seriesB: number[];
  seriesLabels: string[];
}

/* ------------------------------------------------------------------ */
/* Month utilities                                                     */
/* ------------------------------------------------------------------ */

/** Distinct month keys ("YYYY-MM") that have ≥1 txn, newest first, EXCLUDING the current month. */
export function availableMonthsDesc(txns: Txn[], now: Date = new Date()): string[] {
  const currentKey = monthKey(toDateKey(now));
  const set = new Set<string>();
  for (const t of txns) {
    const k = monthKey(t.date);
    if (k !== currentKey) set.add(k);
  }
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

export function filterByMonth(txns: Txn[], key: string): Txn[] {
  return txns.filter((t) => monthKey(t.date) === key);
}

export function groupMonthsByYear(months: string[]): Array<{ year: number; months: string[] }> {
  const map = new Map<number, string[]>();
  for (const m of months) {
    const y = Number(m.slice(0, 4));
    const list = map.get(y) ?? [];
    list.push(m);
    map.set(y, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, ms]) => ({ year, months: ms }));
}

/* ------------------------------------------------------------------ */
/* Week utilities (weeks start Monday)                                 */
/* ------------------------------------------------------------------ */

/** Return the Monday of the week containing `dateKey`, as "YYYY-MM-DD". */
export function weekStartOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - dow);
  return toDateKey(dt);
}

/** Distinct week-start keys, newest first, EXCLUDING the current week. */
export function availableWeeksDesc(txns: Txn[], now: Date = new Date()): string[] {
  const currentWeekStart = weekStartOf(toDateKey(now));
  const set = new Set<string>();
  for (const t of txns) {
    const ws = weekStartOf(t.date);
    if (ws !== currentWeekStart) set.add(ws);
  }
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

export function filterByWeek(txns: Txn[], weekStart: string): Txn[] {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const endDate = new Date(y, m - 1, d + 6);
  const endKey = toDateKey(endDate);
  return txns.filter((t) => t.date >= weekStart && t.date <= endKey);
}

/** Format a "23/6 - 29/6" style label for a week starting `weekStart`. */
export function weekRangeLabel(weekStart: string): { from: string; to: string } {
  const [y, m, d] = weekStart.split('-').map(Number);
  const startD = new Date(y, m - 1, d);
  const endD = new Date(y, m - 1, d + 6);
  const from = `${startD.getDate()}/${startD.getMonth() + 1}`;
  const to = `${endD.getDate()}/${endD.getMonth() + 1}`;
  return { from, to };
}

/* ------------------------------------------------------------------ */
/* Delta primitives                                                    */
/* ------------------------------------------------------------------ */

/** Percentage change. Returns null when previous is 0 (avoid /0). */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function deltaAbs(current: number, previous: number): number {
  return current - previous;
}

/* ------------------------------------------------------------------ */
/* Overview delta badge — previous-period txns and its label           */
/* ------------------------------------------------------------------ */

/** Yesterday / last week / last month txns based on `range`. */
export function previousPeriodTxns(
  txns: Txn[],
  range: Range,
  now: Date = new Date(),
): Txn[] {
  if (range === 'day') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const key = toDateKey(y);
    return txns.filter((t) => t.date === key);
  }
  if (range === 'week') {
    const thisWeekStart = weekStartOf(toDateKey(now));
    const [y, m, d] = thisWeekStart.split('-').map(Number);
    const lastWeekStart = toDateKey(new Date(y, m - 1, d - 7));
    return filterByWeek(txns, lastWeekStart);
  }
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = monthKey(toDateKey(first));
  return filterByMonth(txns, key);
}

/** Human label for the previous period. Uses i18n. */
export function previousPeriodLabel(range: Range, now: Date = new Date()): string {
  if (range === 'day') return i18n.t('delta.vs_yesterday');
  if (range === 'week') return i18n.t('delta.vs_last_week');
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthAbbrev = i18n.t('format.month_abbrev', { month: prev.getMonth() + 1 });
  return i18n.t('delta.vs_month', { label: monthAbbrev });
}

/* ------------------------------------------------------------------ */
/* Comparison — bar-chart buckets                                      */
/* ------------------------------------------------------------------ */

/** Fixed 5 buckets by day-of-month: 1-7, 8-14, 15-21, 22-28, 29-31. */
function monthExpenseBuckets(txns: Txn[]): number[] {
  const buckets = [0, 0, 0, 0, 0];
  for (const t of txns) {
    if (t.isIncome) continue;
    const day = Number(t.date.slice(8, 10));
    const idx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4;
    buckets[idx] += t.amount;
  }
  return buckets;
}

/** 7 buckets Mon-Sun. `weekStart` is the Monday date key of the week. */
function weekExpenseBuckets(txns: Txn[], weekStart: string): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const [y, m, d] = weekStart.split('-').map(Number);
  for (const t of txns) {
    if (t.isIncome) continue;
    const [ty, tm, td] = t.date.split('-').map(Number);
    const start = new Date(y, m - 1, d).getTime();
    const cur = new Date(ty, tm - 1, td).getTime();
    const idx = Math.floor((cur - start) / 86_400_000);
    if (idx >= 0 && idx < 7) buckets[idx] += t.amount;
  }
  return buckets;
}

function monthBucketLabels(): string[] {
  return [1, 2, 3, 4, 5].map((n) => i18n.t('compare.week_bucket_short', { n }));
}

function weekBucketLabels(): string[] {
  const raw = i18n.t('compare.week_day_short', { returnObjects: true }) as unknown;
  return Array.isArray(raw) ? (raw as string[]) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
}

/* ------------------------------------------------------------------ */
/* Comparison builder                                                  */
/* ------------------------------------------------------------------ */

/** Build all Compare-screen data from two txn sets and a compare type. */
export function buildComparison(
  txnsA: Txn[],
  txnsB: Txn[],
  type: 'month' | 'week',
  customCategories: CategoryLike[],
  weekStartA?: string,
  weekStartB?: string,
): Comparison {
  const sumA = summarize(txnsA);
  const sumB = summarize(txnsB);

  const registry: CategoryLike[] = [
    ...STATIC_CATEGORIES.map((c) => ({ id: c.id, label: categoryLabel(c), color: c.fg })),
    ...customCategories,
  ];

  const totalByCategory = (txns: Txn[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const t of txns) {
      if (t.isIncome) continue;
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    return map;
  };

  const totalsA = totalByCategory(txnsA);
  const totalsB = totalByCategory(txnsB);
  const ids = new Set<string>([...totalsA.keys(), ...totalsB.keys()]);
  const categories: CategoryDelta[] = [];
  for (const id of ids) {
    const meta = registry.find((c) => c.id === id) ?? { id, label: id, color: '#888' };
    const valueA = totalsA.get(id) ?? 0;
    const valueB = totalsB.get(id) ?? 0;
    const status: CategoryDelta['status'] =
      valueA > 0 && valueB > 0 ? 'both' : valueA > 0 ? 'onlyA' : 'onlyB';
    categories.push({
      id,
      label: meta.label,
      color: meta.color,
      valueA,
      valueB,
      deltaPct: deltaPct(valueA, valueB),
      status,
    });
  }
  categories.sort((a, b) => Math.max(b.valueA, b.valueB) - Math.max(a.valueA, a.valueB));

  const seriesA =
    type === 'month' ? monthExpenseBuckets(txnsA) : weekExpenseBuckets(txnsA, weekStartA ?? '1970-01-05');
  const seriesB =
    type === 'month' ? monthExpenseBuckets(txnsB) : weekExpenseBuckets(txnsB, weekStartB ?? '1970-01-05');
  const seriesLabels = type === 'month' ? monthBucketLabels() : weekBucketLabels();

  return {
    sumA,
    sumB,
    deltaExpensePct: deltaPct(sumA.expense, sumB.expense),
    deltaIncomePct: deltaPct(sumA.income, sumB.income),
    deltaNetPct: deltaPct(sumA.net, sumB.net),
    categories,
    seriesA,
    seriesB,
    seriesLabels,
  };
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors. If `categoryLabel`, `STATIC_CATEGORIES`, or `Range` are exported from different modules, fix the imports to match — read `src/lib/categories.ts` and `src/lib/transactions.ts` to confirm.

- [ ] **Step 3: Smoke check with a REPL script (delete after)**

Create a temporary file `tmp-check.ts`:

```ts
import { availableMonthsDesc, deltaPct, weekStartOf, buildComparison } from './src/lib/comparison';
import type { Txn } from './src/lib/transactions';

const fake = (date: string, amount: number, category = 'food'): Txn => ({
  id: 1, uuid: 'x', updatedAt: 0, date, time: '10:00', createdAt: 0,
  category: category as any, name: 't', note: null, amount,
  currency: 'VND' as any, originalAmount: amount, originalCurrency: 'VND' as any,
  isIncome: false, photoPath: null, subscriptionUuid: null,
});

const txns: Txn[] = [
  fake('2026-07-04', 100),
  fake('2026-06-10', 200),
  fake('2026-06-20', 300),
];

console.log('availableMonthsDesc:', availableMonthsDesc(txns, new Date('2026-08-01')));
// Expect: ['2026-07', '2026-06']

console.log('weekStartOf 2026-08-04 (Tuesday):', weekStartOf('2026-08-04'));
// Expect: '2026-08-03' (Monday)

console.log('deltaPct(120, 100):', deltaPct(120, 100));
// Expect: 20
console.log('deltaPct(100, 0):', deltaPct(100, 0));
// Expect: null
```

Run: `npx tsx tmp-check.ts` (or `npx ts-node tmp-check.ts` — whichever the repo already supports). If neither is installed, skip this step and rely on typecheck + downstream screen QA.
Expected: matches the "Expect:" comments.

Delete `tmp-check.ts` before committing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/comparison.ts
git commit -m "feat(comparison): add pure derivations for history + compare"
```

---

## Task 3: `SummaryCell` extraction + `DeltaBadge` component

**Files:**
- Create: `src/components/sl/summary-cell.tsx`
- Create: `src/components/sl/delta-badge.tsx`
- Modify: `src/app/history.tsx` (swap local `SummaryCell` for the extracted one)

**Interfaces:**
- Consumes: `useColors`, `W` from `@/constants/tokens`; `Text` from `@/components/sl/text`; `Money` from `@/constants/tokens`; `useT` from `@/lib/i18n`.
- Produces:
  - `SummaryCell({ label, value, color })` — the three-cell layout row used in `history.tsx`.
  - `DeltaBadge({ current, previous, compareType, periodLabel, size? })` — renders `▲ +18% so với T6` or nothing (see rules below).

- [ ] **Step 1: Create `SummaryCell`**

`src/components/sl/summary-cell.tsx`:

```tsx
import { View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';

export function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: W.semibold, color: c.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: W.extrabold, color, marginTop: 3 }}>{value}</Text>
    </View>
  );
}
```

- [ ] **Step 2: Create `DeltaBadge`**

`src/components/sl/delta-badge.tsx`:

```tsx
import { View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Money, useColors, W } from '@/constants/tokens';
import { deltaPct } from '@/lib/comparison';

export type DeltaCompareType = 'expense' | 'income' | 'net';

interface Props {
  current: number;
  previous: number;
  compareType: DeltaCompareType;
  periodLabel: string;
  size?: 'sm' | 'md';
}

export function DeltaBadge({ current, previous, compareType, periodLabel, size = 'sm' }: Props) {
  const c = useColors();

  if (previous === 0 && current === 0) return null;

  const pct = deltaPct(current, previous); // null if previous === 0
  const rising = current > previous;
  const arrow = rising ? '▲' : current < previous ? '▼' : '·';

  // Color rule: expense rising = bad (red); income rising = good (green); net rising = good.
  const badWhenRising = compareType === 'expense';
  const rawColor = rising === badWhenRising ? Money.expense : Money.income;
  const color = current === previous ? c.textSecondary : rawColor;

  const pctText = pct === null ? '' : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;

  const fontSize = size === 'md' ? 13 : 12;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <Text style={{ fontSize, fontWeight: W.bold, color }}>{arrow}</Text>
      {pctText ? (
        <Text style={{ fontSize, fontWeight: W.bold, color }}>{pctText}</Text>
      ) : null}
      {periodLabel ? (
        <Text style={{ fontSize: fontSize - 1, fontWeight: W.semibold, color: c.textSecondary }}>
          {periodLabel}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: Refactor `history.tsx` to use extracted `SummaryCell`**

In `src/app/history.tsx`:
1. Remove the local `SummaryCell` function (currently around lines 127-135).
2. Add import at top: `import { SummaryCell } from '@/components/sl/summary-cell';`
3. No JSX changes — the usage remains identical.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Smoke run**

Run: `npx expo start` (or user's usual dev command). Open Income & Expenses screen; confirm summary card still renders correctly (Thu / Chi / Chênh lệch cells look unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/components/sl/summary-cell.tsx src/components/sl/delta-badge.tsx src/app/history.tsx
git commit -m "feat(components): extract SummaryCell and add DeltaBadge"
```

---

## Task 4: `MonthPickerSheet` bottom sheet

**Files:**
- Create: `src/components/sl/month-picker-sheet.tsx`

**Interfaces:**
- Consumes: `availableMonthsDesc`, `filterByMonth`, `groupMonthsByYear` from `@/lib/comparison`; `useTransactions` from `@/lib/transactions-context`; `useSettings` from `@/lib/settings-context`; `monthKey`, `toDateKey`, `formatCompact` from `@/lib/format`; bottom sheet from `@gorhom/bottom-sheet`.
- Produces:
  ```ts
  export interface MonthPickerSheetHandle {
    present: () => void;
    dismiss: () => void;
  }
  export interface MonthPickerSheetProps {
    selectedMonth: string;
    onSelect: (monthKey: string) => void;
    includeCurrentMonth?: boolean; // default false
  }
  ```

- [ ] **Step 1: Create the file**

`src/components/sl/month-picker-sheet.tsx`:

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Radius, useColors, W } from '@/constants/tokens';
import { availableMonthsDesc, filterByMonth, groupMonthsByYear } from '@/lib/comparison';
import { formatCompact, monthKey, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useTransactions } from '@/lib/transactions-context';

export interface MonthPickerSheetHandle {
  present: () => void;
  dismiss: () => void;
}

export interface MonthPickerSheetProps {
  selectedMonth: string;
  onSelect: (monthKey: string) => void;
  includeCurrentMonth?: boolean;
}

export const MonthPickerSheet = forwardRef<MonthPickerSheetHandle, MonthPickerSheetProps>(
  function MonthPickerSheet({ selectedMonth, onSelect, includeCurrentMonth = false }, ref) {
    const { t } = useT();
    const c = useColors();
    const { transactions } = useTransactions();
    const { settings } = useSettings();
    const sheet = useRef<BottomSheetModal>(null);

    useImperativeHandle(ref, () => ({
      present: () => sheet.current?.present(),
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const groups = useMemo(() => {
      const now = new Date();
      const months = availableMonthsDesc(transactions, now);
      if (includeCurrentMonth) {
        const curKey = monthKey(toDateKey(now));
        const curHasData = transactions.some((tx) => monthKey(tx.date) === curKey);
        if (curHasData && !months.includes(curKey)) months.unshift(curKey);
      }
      return groupMonthsByYear(months);
    }, [transactions, includeCurrentMonth]);

    const spendByMonth = useMemo(() => {
      const map = new Map<string, number>();
      for (const g of groups) {
        for (const m of g.months) {
          const total = filterByMonth(transactions, m)
            .filter((tx) => !tx.isIncome)
            .reduce((s, tx) => s + tx.amount, 0);
          map.set(m, total);
        }
      }
      return map;
    }, [groups, transactions]);

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['70%']}
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <View style={styles.header}>
          <Text style={{ fontWeight: W.extrabold, color: c.text, fontSize: 18 }}>
            {t('history_months.picker_title')}
          </Text>
        </View>
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {groups.map((g) => (
            <View key={g.year}>
              <Text style={[styles.yearHeader, { color: c.textSecondary }]}>{g.year}</Text>
              {g.months.map((m) => {
                const active = m === selectedMonth;
                const monthNum = Number(m.slice(5, 7));
                const label = t('format.month_abbrev', { month: monthNum }) + ` ${g.year}`;
                const spend = spendByMonth.get(m) ?? 0;
                return (
                  <Pressable
                    key={m}
                    onPress={() => { onSelect(m); sheet.current?.dismiss(); }}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: active ? c.chipBg : 'transparent',
                        borderColor: active ? AccentGradient[1] : 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={{ flex: 1, color: c.text, fontWeight: active ? W.extrabold : W.medium, fontSize: 15 }}>
                      {label}
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: W.semibold }}>
                      {t('history_months.picker_row_spend', { amount: formatCompact(spend, settings.primaryCurrency) })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  header: { padding: 20, paddingBottom: 8 },
  yearHeader: {
    paddingHorizontal: 20, paddingVertical: 8, fontSize: 12, fontWeight: '700',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.card, borderWidth: 1,
    marginHorizontal: 12, marginBottom: 4,
  },
});
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors. If `chipBg`, `AccentGradient`, or `Radius.card` names differ, adjust to match `constants/tokens.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/sl/month-picker-sheet.tsx
git commit -m "feat(components): add MonthPickerSheet bottom sheet"
```

---

## Task 5: `WeekPickerSheet` bottom sheet

**Files:**
- Create: `src/components/sl/week-picker-sheet.tsx`

**Interfaces:**
- Consumes: `availableWeeksDesc`, `filterByWeek`, `weekRangeLabel` from `@/lib/comparison`; `useTransactions`, `useSettings`, `formatCompact`; bottom sheet.
- Produces:
  ```ts
  export interface WeekPickerSheetHandle { present: () => void; dismiss: () => void; }
  export interface WeekPickerSheetProps {
    selectedWeek: string;   // Monday date key
    onSelect: (weekStart: string) => void;
    includeCurrentWeek?: boolean;
  }
  ```

- [ ] **Step 1: Create the file**

`src/components/sl/week-picker-sheet.tsx`:

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Radius, useColors, W } from '@/constants/tokens';
import { availableWeeksDesc, filterByWeek, weekRangeLabel, weekStartOf } from '@/lib/comparison';
import { formatCompact, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useTransactions } from '@/lib/transactions-context';

export interface WeekPickerSheetHandle {
  present: () => void;
  dismiss: () => void;
}

export interface WeekPickerSheetProps {
  selectedWeek: string;
  onSelect: (weekStart: string) => void;
  includeCurrentWeek?: boolean;
}

export const WeekPickerSheet = forwardRef<WeekPickerSheetHandle, WeekPickerSheetProps>(
  function WeekPickerSheet({ selectedWeek, onSelect, includeCurrentWeek = false }, ref) {
    const { t } = useT();
    const c = useColors();
    const { transactions } = useTransactions();
    const { settings } = useSettings();
    const sheet = useRef<BottomSheetModal>(null);

    useImperativeHandle(ref, () => ({
      present: () => sheet.current?.present(),
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const weeks = useMemo(() => {
      const now = new Date();
      const list = availableWeeksDesc(transactions, now);
      if (includeCurrentWeek) {
        const curWeek = weekStartOf(toDateKey(now));
        const curHasData = transactions.some((tx) => weekStartOf(tx.date) === curWeek);
        if (curHasData && !list.includes(curWeek)) list.unshift(curWeek);
      }
      return list;
    }, [transactions, includeCurrentWeek]);

    const spendByWeek = useMemo(() => {
      const map = new Map<string, number>();
      for (const w of weeks) {
        const total = filterByWeek(transactions, w)
          .filter((tx) => !tx.isIncome)
          .reduce((s, tx) => s + tx.amount, 0);
        map.set(w, total);
      }
      return map;
    }, [weeks, transactions]);

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['70%']}
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <View style={styles.header}>
          <Text style={{ fontWeight: W.extrabold, color: c.text, fontSize: 18 }}>
            {t('history_months.picker_title')}
          </Text>
        </View>
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {weeks.map((w) => {
            const active = w === selectedWeek;
            const { from, to } = weekRangeLabel(w);
            const label = t('compare.week_label_range', { from, to });
            const spend = spendByWeek.get(w) ?? 0;
            return (
              <Pressable
                key={w}
                onPress={() => { onSelect(w); sheet.current?.dismiss(); }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: active ? c.chipBg : 'transparent',
                    borderColor: active ? AccentGradient[1] : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{ flex: 1, color: c.text, fontWeight: active ? W.extrabold : W.medium, fontSize: 15 }}>
                  {label}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: W.semibold }}>
                  {t('history_months.picker_row_spend', { amount: formatCompact(spend, settings.primaryCurrency) })}
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
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.card, borderWidth: 1,
    marginHorizontal: 12, marginBottom: 4,
  },
});
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sl/week-picker-sheet.tsx
git commit -m "feat(components): add WeekPickerSheet bottom sheet"
```

---

## Task 6: `PeriodPickerSheet` (presets selector)

**Files:**
- Create: `src/components/sl/period-picker-sheet.tsx`

**Interfaces:**
- Consumes: bottom sheet from `@gorhom/bottom-sheet`.
- Produces:
  ```ts
  export type CompareType = 'month' | 'week';
  export type PresetKey =
    | 'this_vs_last_month' | 'last_vs_prev_month' | 'year_over_year'
    | 'this_vs_last_week'  | 'last_vs_prev_week'
    | 'custom';
  export interface PeriodPickerSheetHandle { present: () => void; dismiss: () => void; }
  export interface PeriodPickerSheetProps {
    type: CompareType;
    yearOverYearAvailable: boolean;
    selected: PresetKey;
    onSelect: (key: PresetKey) => void;
  }
  ```

- [ ] **Step 1: Create the file**

`src/components/sl/period-picker-sheet.tsx`:

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Radius, useColors, W } from '@/constants/tokens';
import { useT } from '@/lib/i18n';

export type CompareType = 'month' | 'week';
export type PresetKey =
  | 'this_vs_last_month' | 'last_vs_prev_month' | 'year_over_year'
  | 'this_vs_last_week'  | 'last_vs_prev_week'
  | 'custom';

export interface PeriodPickerSheetHandle {
  present: () => void;
  dismiss: () => void;
}

export interface PeriodPickerSheetProps {
  type: CompareType;
  yearOverYearAvailable: boolean;
  selected: PresetKey;
  onSelect: (key: PresetKey) => void;
}

const MONTH_KEYS: PresetKey[] = ['this_vs_last_month', 'last_vs_prev_month', 'year_over_year', 'custom'];
const WEEK_KEYS:  PresetKey[] = ['this_vs_last_week',  'last_vs_prev_week',  'custom'];

const LABEL_KEY: Record<PresetKey, string> = {
  this_vs_last_month: 'compare.preset_this_vs_last_month',
  last_vs_prev_month: 'compare.preset_last_vs_prev_month',
  year_over_year:     'compare.preset_year_over_year',
  this_vs_last_week:  'compare.preset_this_vs_last_week',
  last_vs_prev_week:  'compare.preset_last_vs_prev_week',
  custom:             'compare.preset_custom',
};

export const PeriodPickerSheet = forwardRef<PeriodPickerSheetHandle, PeriodPickerSheetProps>(
  function PeriodPickerSheet({ type, yearOverYearAvailable, selected, onSelect }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);

    useImperativeHandle(ref, () => ({
      present: () => sheet.current?.present(),
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const list = (type === 'month' ? MONTH_KEYS : WEEK_KEYS)
      .filter((k) => k !== 'year_over_year' || yearOverYearAvailable);

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['45%']}
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <View style={styles.header}>
          <Text style={{ fontWeight: W.extrabold, color: c.text, fontSize: 18 }}>
            {t('compare.preset_label')}
          </Text>
        </View>
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {list.map((key) => {
            const active = key === selected;
            return (
              <Pressable
                key={key}
                onPress={() => { onSelect(key); sheet.current?.dismiss(); }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: active ? c.chipBg : 'transparent',
                    borderColor: active ? AccentGradient[1] : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{ color: c.text, fontWeight: active ? W.extrabold : W.medium, fontSize: 15 }}>
                  {t(LABEL_KEY[key])}
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
  row: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.card, borderWidth: 1,
    marginHorizontal: 12, marginBottom: 4,
  },
});
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sl/period-picker-sheet.tsx
git commit -m "feat(components): add PeriodPickerSheet preset selector"
```

---

## Task 7: `BarChartOverlay` two-series chart

**Files:**
- Create: `src/components/sl/bar-chart-overlay.tsx`

**Interfaces:**
- Consumes: `useColors`, `W` from `@/constants/tokens`; `Text`.
- Produces:
  ```ts
  export interface BarChartOverlayProps {
    seriesA: number[];
    seriesB: number[];
    labels: string[];
    colorA: string;
    colorB: string;
  }
  ```

- [ ] **Step 1: Create the file**

`src/components/sl/bar-chart-overlay.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useColors, W } from '@/constants/tokens';

export interface BarChartOverlayProps {
  seriesA: number[];
  seriesB: number[];
  labels: string[];
  colorA: string;
  colorB: string;
}

export function BarChartOverlay({ seriesA, seriesB, labels, colorA, colorB }: BarChartOverlayProps) {
  const c = useColors();
  const max = Math.max(1, ...seriesA, ...seriesB);
  return (
    <View style={styles.row}>
      {labels.map((label, i) => {
        const a = seriesA[i] ?? 0;
        const b = seriesB[i] ?? 0;
        const hA = Math.round(6 + (a / max) * 78);
        const hB = Math.round(6 + (b / max) * 78);
        return (
          <View key={label} style={styles.bucket}>
            <View style={styles.barsRow}>
              <View style={{ width: 10, height: hA, borderRadius: 4, backgroundColor: colorA }} />
              <View style={{ width: 10, height: hB, borderRadius: 4, backgroundColor: colorB, opacity: 0.6 }} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: W.semibold, color: c.textSecondary, marginTop: 4 }}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    height: 100,
    marginTop: 14,
  },
  bucket: { flex: 1, alignItems: 'center' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 88 },
});
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sl/bar-chart-overlay.tsx
git commit -m "feat(components): add BarChartOverlay two-series chart"
```

---

## Task 8: Monthly History Browser screen (`/history-months`)

**Files:**
- Create: `src/app/history-months.tsx`

**Interfaces:**
- Consumes: everything built so far (`comparison.ts`, `SummaryCell`, `MonthPickerSheet`, `Donut`, `TransactionRow`).
- Produces: a route reachable via `router.push('/history-months')`.

- [ ] **Step 1: Create the screen file**

`src/app/history-months.tsx`:

```tsx
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Donut } from '@/components/sl/donut';
import { Icon } from '@/components/sl/icons';
import { MonthPickerSheet, type MonthPickerSheetHandle } from '@/components/sl/month-picker-sheet';
import { SummaryCell } from '@/components/sl/summary-cell';
import { Text } from '@/components/sl/text';
import { TransactionRow } from '@/components/sl/transaction-row';
import { Money, Radius, useColors, W } from '@/constants/tokens';
import { availableMonthsDesc, filterByMonth } from '@/lib/comparison';
import { dayLabel, formatCompact, formatMoney, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { categoryBreakdown, groupByDay, summarize } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';
import { toCategoryObj } from '@/lib/user-categories';

export default function HistoryMonthsScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { transactions, userCategories } = useTransactions();
  const { settings } = useSettings();
  const primary = settings.primaryCurrency;
  const categoryExtras = userCategories.map(toCategoryObj);
  const pickerRef = useRef<MonthPickerSheetHandle>(null);

  const months = useMemo(() => availableMonthsDesc(transactions), [transactions]);
  const [selectedMonth, setSelectedMonth] = useState<string>(months[0] ?? '');

  // Keep selection valid if the underlying data changes (e.g. user deletes txns).
  useEffect(() => {
    if (!months.length) { setSelectedMonth(''); return; }
    if (!months.includes(selectedMonth)) setSelectedMonth(months[0]);
  }, [months, selectedMonth]);

  const monthTxns = useMemo(
    () => (selectedMonth ? filterByMonth(transactions, selectedMonth) : []),
    [transactions, selectedMonth],
  );
  const groups = useMemo(() => groupByDay(monthTxns), [monthTxns]);
  const sum = useMemo(() => summarize(monthTxns), [monthTxns]);
  const breakdown = useMemo(() => categoryBreakdown(monthTxns).slice(0, 5), [monthTxns]);
  const todayKey = toDateKey(new Date());

  const monthLabel = selectedMonth
    ? t('format.month_abbrev', { month: Number(selectedMonth.slice(5, 7)) }) + ' ' + selectedMonth.slice(0, 4)
    : t('history_months.picker_trigger_placeholder');

  if (!months.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <Header title={t('history_months.header')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: c.textSecondary, fontWeight: W.semibold, textAlign: 'center' }}>
            {t('history_months.empty_no_history')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <Header title={t('history_months.header')} />

      <View style={{ paddingHorizontal: 20 }}>
        <Pressable
          onPress={() => pickerRef.current?.present()}
          style={[styles.pickerTrigger, { backgroundColor: c.segment }]}
        >
          <Text style={{ flex: 1, color: c.text, fontWeight: W.extrabold, fontSize: 15 }}>
            {monthLabel}
          </Text>
          <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 12 }}>▼</Text>
        </Pressable>

        <View style={[styles.summary, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <SummaryCell label={t('history.income_label')} value={'+' + formatCompact(sum.income, primary)} color={Money.income} />
          <View style={[styles.vline, { backgroundColor: c.cardBorder }]} />
          <SummaryCell label={t('history.expense_label')} value={'−' + formatCompact(sum.expense, primary)} color={Money.expense} />
          <View style={[styles.vline, { backgroundColor: c.cardBorder }]} />
          <SummaryCell
            label={t('history.net_label')}
            value={(sum.net >= 0 ? '+' : '−') + formatCompact(sum.net, primary)}
            color={c.text}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        {breakdown.length > 0 ? (
          <View style={[styles.donutCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <Donut
              slices={breakdown.map((b) => ({ color: b.color, pct: b.pct }))}
              centerTop={t('history.expense_label')}
              centerMain={formatCompact(sum.expense, primary)}
            />
            <View style={{ flex: 1, gap: 7 }}>
              {breakdown.map((b) => (
                <View key={b.id} style={styles.legendRow}>
                  <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: b.color }} />
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: W.semibold, color: c.text }}>{b.label}</Text>
                  <Text style={{ fontSize: 12, fontWeight: W.extrabold, color: c.text }}>{Math.round(b.pct)}%</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {groups.length === 0 ? (
          <Text style={{ marginTop: 40, textAlign: 'center', color: c.textSecondary, fontWeight: W.medium }}>
            {t('history_months.empty_this_month')}
          </Text>
        ) : null}
        {groups.map((g) => (
          <View key={g.key} style={{ marginBottom: 18 }}>
            <View style={styles.groupHeader}>
              <Text style={{ fontSize: 13, fontWeight: W.extrabold, color: c.text }}>{dayLabel(g.key, todayKey)}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: W.bold, color: c.textSecondary }}>
                {(g.net >= 0 ? '+' : '−') + formatMoney(g.net, primary)}
              </Text>
            </View>
            <View style={{ gap: 11 }}>
              {g.items.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  txn={txn}
                  tileSize={48}
                  extras={categoryExtras}
                  onPress={() => router.push(`/transaction/${txn.id}`)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <MonthPickerSheet
        ref={pickerRef}
        selectedMonth={selectedMonth}
        onSelect={setSelectedMonth}
      />
    </View>
  );
}

function Header({ title }: { title: string }) {
  const c = useColors();
  const { t } = useT();
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={styles.header}>
        <Text style={{ fontSize: 22, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>{title}</Text>
        <Pressable
          onPress={goBack}
          hitSlop={8}
          accessibilityLabel={t('home.close_a11y')}
          style={[styles.iconBtn, { backgroundColor: c.segment }]}>
          <Icon name="close" size={18} color={c.text} />
        </Pressable>
      </View>
    </View>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pickerTrigger: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: Radius.chip, marginTop: 12,
  },
  summary: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  vline: { width: 1 },
  donutCard: {
    marginTop: 14, borderRadius: Radius.card, borderWidth: 1,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 18,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: 10,
  },
});
```

- [ ] **Step 2: Register the route in the Stack**

Open `src/app/_layout.tsx`. Existing screens are registered explicitly inside `<Stack>`. Add a new line right after `<Stack.Screen name="history" />`:

```tsx
<Stack.Screen name="history-months" />
```

The `screenOptions` on the parent `<Stack>` already sets `headerShown: false` — no per-screen options needed.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Smoke test**

Start Expo dev. Manually navigate to the route by editing `home.tsx` temporarily to add `router.push('/history-months')` on the settings icon (or type it in a debug menu). Verify:
- Screen opens.
- If no past months exist, empty state shows.
- If past months exist, picker trigger shows the newest one.
- Tap picker → sheet opens with months grouped by year.
- Select a month → summary, donut, and list update.
- Tap a transaction → detail screen opens.

Revert the temporary navigation change before commit.

- [ ] **Step 5: Commit**

```bash
git add src/app/history-months.tsx src/app/_layout.tsx
git commit -m "feat(history-months): add Monthly History Browser screen"
```

---

## Task 9: Wire "Xem tháng cũ" button into `history.tsx`

**Files:**
- Modify: `src/app/history.tsx`

**Interfaces:**
- Consumes: `availableMonthsDesc` from `@/lib/comparison`; existing `useTransactions`; `router` from `expo-router`.
- Produces: the entry point users tap to reach `/history-months`.

- [ ] **Step 1: Add button under the Month tab's transaction list**

In `src/app/history.tsx`:

1. Add import at top:
   ```tsx
   import { availableMonthsDesc } from '@/lib/comparison';
   ```

2. Compute a memoized flag inside `HistoryScreen()` after the existing `sum` line:
   ```tsx
   const hasOlderMonths = useMemo(
     () => availableMonthsDesc(transactions).length > 0,
     [transactions],
   );
   ```

3. In the `ScrollView`, after the `groups.map(...)` render block (right before the closing `</ScrollView>`), add:
   ```tsx
   {range === 'month' && hasOlderMonths ? (
     <Pressable
       onPress={() => router.push('/history-months')}
       style={{ paddingVertical: 18, alignItems: 'center' }}
     >
       <Text style={{ fontSize: 13.5, fontWeight: W.bold, color: c.textSecondary }}>
         {t('history_months.view_older_btn')} →
       </Text>
     </Pressable>
   ) : null}
   ```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Smoke test**

Start Expo dev. Open Income & Expenses:
- Tab = Day / Week: no button.
- Tab = Month, no past-month data: no button.
- Tab = Month, past-month data exists: button appears at bottom of the list. Tap → opens `/history-months`.

- [ ] **Step 4: Commit**

```bash
git add src/app/history.tsx
git commit -m "feat(history): add 'View older transactions' entry point on Month tab"
```

---

## Task 10: Overview enhancements (`home.tsx`)

**Files:**
- Modify: `src/app/home.tsx`

**Interfaces:**
- Consumes: `DeltaBadge`, `previousPeriodTxns`, `previousPeriodLabel`, `deltaPct` from prior tasks.
- Produces: three enhancements — DeltaBadge on balance card, per-category delta in donut legend, "So sánh" button on monthly chart card.

- [ ] **Step 1: Add DeltaBadge on the balance card**

In `src/app/home.tsx`:

1. Add imports:
   ```tsx
   import { DeltaBadge } from '@/components/sl/delta-badge';
   import { previousPeriodTxns, previousPeriodLabel } from '@/lib/comparison';
   ```

2. Inside `HomeScreen()`, after the existing `bars = useMemo(...)` block, add:
   ```tsx
   const prevTxns = useMemo(() => previousPeriodTxns(transactions, range), [transactions, range]);
   const prevSum = useMemo(() => summarize(prevTxns), [prevTxns]);
   const prevLabel = previousPeriodLabel(range);
   const prevBreakdown = useMemo(() => categoryBreakdown(prevTxns), [prevTxns]);
   ```
   (`summarize`, `categoryBreakdown` are already imported.)

3. In the balance-card JSX, right after the big net-number `<Text>`, insert:
   ```tsx
   <DeltaBadge
     current={sum.expense}
     previous={prevSum.expense}
     compareType="expense"
     periodLabel={prevLabel}
   />
   ```

- [ ] **Step 2: Add per-category delta in the donut legend**

In the same file, replace the existing legend row map (`breakdown.map((b) => (...))`) with:

```tsx
{breakdown.map((b) => {
  const prev = prevBreakdown.find((p) => p.id === b.id);
  const isNew = !prev;
  const pct = prev ? deltaPct(b.amount, prev.amount) : null;
  const rising = prev ? b.amount > prev.amount : true;
  const deltaColor = isNew
    ? c.textSecondary
    : rising ? Money.expense : Money.income;
  const deltaText = isNew
    ? t('delta.category_new')
    : pct === null ? '' : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;
  return (
    <View key={b.id} style={styles.legendRow}>
      <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: b.color }} />
      <Text style={{ flex: 1, fontSize: 12, fontWeight: W.semibold, color: c.text }}>{b.label}</Text>
      <Text style={{ fontSize: 12, fontWeight: W.extrabold, color: c.text }}>{Math.round(b.pct)}%</Text>
      {prevBreakdown.length > 0 && deltaText ? (
        <Text style={{ fontSize: 11, fontWeight: W.semibold, color: deltaColor, marginLeft: 6 }}>
          {deltaText}
        </Text>
      ) : null}
    </View>
  );
})}
```

Add import for `deltaPct` at top: `import { deltaPct, previousPeriodTxns, previousPeriodLabel } from '@/lib/comparison';`

- [ ] **Step 3: Add "So sánh" button on the monthly chart card title row**

Replace the existing title `<Text>` of the monthly chart card (currently a single Text with `t('home.monthly_chart_title')`) with a row:

```tsx
<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
  <Text style={{ fontSize: 13.5, fontWeight: W.extrabold, color: c.text }}>{t('home.monthly_chart_title')}</Text>
  <Pressable onPress={() => router.push('/compare')} hitSlop={6}>
    <Text style={{ fontSize: 12.5, fontWeight: W.bold, color: c.textSecondary }}>
      {t('compare.compare_btn')} →
    </Text>
  </Pressable>
</View>
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Smoke test**

Start Expo dev. Open Overview:
- Balance card shows delta badge (assuming prev-period has data).
- Toggle Day / Week / Month — label updates ("hôm qua" / "tuần trước" / "T[N]") and color flips per direction.
- Donut legend shows delta per category ("+18%", "-5%", "mới").
- "So sánh" button in the monthly chart card title. Tap → not-yet-created `/compare` will 404, that's expected until Task 11.

- [ ] **Step 6: Commit**

```bash
git add src/app/home.tsx
git commit -m "feat(overview): add DeltaBadge, category delta, and Compare entry"
```

---

## Task 11: Compare screen (`/compare`)

**Files:**
- Create: `src/app/compare.tsx`

**Interfaces:**
- Consumes: `MonthPickerSheet`, `WeekPickerSheet`, `PeriodPickerSheet`, `BarChartOverlay`, `DeltaBadge`, all utilities in `comparison.ts`, `Segmented`, `useTransactions`, `useSettings`.
- Produces: `/compare` route (opened from `home.tsx`).

- [ ] **Step 1: Create the screen with type toggle + period pills + presets**

`src/app/compare.tsx`:

```tsx
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChartOverlay } from '@/components/sl/bar-chart-overlay';
import { GradientFill } from '@/components/sl/gradient';
import { Icon } from '@/components/sl/icons';
import { MonthPickerSheet, type MonthPickerSheetHandle } from '@/components/sl/month-picker-sheet';
import {
  PeriodPickerSheet, type PeriodPickerSheetHandle, type PresetKey,
} from '@/components/sl/period-picker-sheet';
import { Segmented } from '@/components/sl/segmented';
import { Text } from '@/components/sl/text';
import { WeekPickerSheet, type WeekPickerSheetHandle } from '@/components/sl/week-picker-sheet';
import { AccentGradient, Money, Radius, useColors, W } from '@/constants/tokens';
import {
  availableMonthsDesc, availableWeeksDesc, buildComparison,
  filterByMonth, filterByWeek, weekRangeLabel, weekStartOf,
} from '@/lib/comparison';
import { formatCompact, formatMoney, monthKey, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useTransactions } from '@/lib/transactions-context';
import { toCategoryObj } from '@/lib/user-categories';

type CompareType = 'month' | 'week';

export default function CompareScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { transactions, userCategories } = useTransactions();
  const { settings } = useSettings();
  const primary = settings.primaryCurrency;
  const registry = useMemo(() => userCategories.map(toCategoryObj).map((c) => ({ id: c.id, label: c.label, color: c.fg })), [userCategories]);

  const monthSheetA = useRef<MonthPickerSheetHandle>(null);
  const monthSheetB = useRef<MonthPickerSheetHandle>(null);
  const weekSheetA = useRef<WeekPickerSheetHandle>(null);
  const weekSheetB = useRef<WeekPickerSheetHandle>(null);
  const presetSheet = useRef<PeriodPickerSheetHandle>(null);

  const [typeIndex, setTypeIndex] = useState(0); // 0 = month, 1 = week
  const type: CompareType = typeIndex === 0 ? 'month' : 'week';

  // Seeded defaults from data.
  const initialMonthA = useMemo(() => {
    const now = new Date();
    const cur = monthKey(toDateKey(now));
    return cur;
  }, []);
  const initialMonthB = useMemo(() => availableMonthsDesc(transactions)[0] ?? initialMonthA, [transactions, initialMonthA]);
  const initialWeekA = useMemo(() => weekStartOf(toDateKey(new Date())), []);
  const initialWeekB = useMemo(() => availableWeeksDesc(transactions)[0] ?? initialWeekA, [transactions, initialWeekA]);

  const [monthA, setMonthA] = useState(initialMonthA);
  const [monthB, setMonthB] = useState(initialMonthB);
  const [weekA, setWeekA] = useState(initialWeekA);
  const [weekB, setWeekB] = useState(initialWeekB);
  const [preset, setPreset] = useState<PresetKey>(type === 'month' ? 'this_vs_last_month' : 'this_vs_last_week');

  // Whenever type changes, reset preset + periods to that type's default.
  useEffect(() => {
    if (type === 'month') {
      setPreset('this_vs_last_month');
      setMonthA(initialMonthA);
      setMonthB(initialMonthB);
    } else {
      setPreset('this_vs_last_week');
      setWeekA(initialWeekA);
      setWeekB(initialWeekB);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const yearOverYearAvailable = useMemo(() => {
    const months = availableMonthsDesc(transactions);
    if (!months.length) return false;
    const now = new Date();
    const yoy = monthKey(toDateKey(new Date(now.getFullYear() - 1, now.getMonth(), 1)));
    return months.includes(yoy);
  }, [transactions]);

  // Apply preset to periods.
  useEffect(() => {
    if (preset === 'custom') return;
    const now = new Date();
    if (preset === 'this_vs_last_month') {
      setMonthA(monthKey(toDateKey(now)));
      setMonthB(monthKey(toDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))));
    } else if (preset === 'last_vs_prev_month') {
      setMonthA(monthKey(toDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))));
      setMonthB(monthKey(toDateKey(new Date(now.getFullYear(), now.getMonth() - 2, 1))));
    } else if (preset === 'year_over_year') {
      setMonthA(monthKey(toDateKey(now)));
      setMonthB(monthKey(toDateKey(new Date(now.getFullYear() - 1, now.getMonth(), 1))));
    } else if (preset === 'this_vs_last_week') {
      const cur = weekStartOf(toDateKey(now));
      setWeekA(cur);
      const [y, m, d] = cur.split('-').map(Number);
      setWeekB(toDateKey(new Date(y, m - 1, d - 7)));
    } else if (preset === 'last_vs_prev_week') {
      const cur = weekStartOf(toDateKey(now));
      const [y, m, d] = cur.split('-').map(Number);
      setWeekA(toDateKey(new Date(y, m - 1, d - 7)));
      setWeekB(toDateKey(new Date(y, m - 1, d - 14)));
    }
  }, [preset]);

  const txnsA = useMemo(
    () => (type === 'month' ? filterByMonth(transactions, monthA) : filterByWeek(transactions, weekA)),
    [transactions, type, monthA, weekA],
  );
  const txnsB = useMemo(
    () => (type === 'month' ? filterByMonth(transactions, monthB) : filterByWeek(transactions, weekB)),
    [transactions, type, monthB, weekB],
  );
  const comparison = useMemo(
    () => buildComparison(txnsA, txnsB, type, registry, weekA, weekB),
    [txnsA, txnsB, type, registry, weekA, weekB],
  );

  const labelFor = (key: string): string => {
    if (type === 'month') {
      return t('format.month_abbrev', { month: Number(key.slice(5, 7)) }) + '/' + key.slice(0, 4);
    }
    const { from, to } = weekRangeLabel(key);
    return `${from} - ${to}`;
  };

  const swap = () => {
    if (type === 'month') { setMonthA(monthB); setMonthB(monthA); }
    else { setWeekA(weekB); setWeekB(weekA); }
    setPreset('custom');
  };

  const openPickerA = () => {
    setPreset('custom');
    if (type === 'month') monthSheetA.current?.present();
    else weekSheetA.current?.present();
  };
  const openPickerB = () => {
    setPreset('custom');
    if (type === 'month') monthSheetB.current?.present();
    else weekSheetB.current?.present();
  };

  const bothEmpty = txnsA.length === 0 && txnsB.length === 0;
  const chartTitle = type === 'month' ? t('compare.chart_title_month') : t('compare.chart_title_week');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 20 }}>
        <View style={styles.header}>
          <Text style={{ fontSize: 22, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>
            {t('compare.header')}
          </Text>
          <Pressable onPress={goBack} hitSlop={8} accessibilityLabel={t('home.close_a11y')}
            style={[styles.iconBtn, { backgroundColor: c.segment }]}>
            <Icon name="close" size={18} color={c.text} />
          </Pressable>
        </View>

        <View style={{ marginTop: 12 }}>
          <Segmented
            options={[t('compare.type_month'), t('compare.type_week')]}
            value={typeIndex}
            onChange={setTypeIndex}
          />
        </View>

        <View style={styles.periodRow}>
          <Pressable onPress={openPickerA} style={[styles.pill, { backgroundColor: c.segment }]}>
            <Text style={{ flex: 1, color: c.text, fontWeight: W.extrabold, fontSize: 14 }}>
              {labelFor(type === 'month' ? monthA : weekA)}
            </Text>
            <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 11 }}>▼</Text>
          </Pressable>
          <Pressable onPress={swap} hitSlop={8} accessibilityLabel={t('compare.swap_a11y')} style={styles.swapBtn}>
            <Text style={{ color: c.text, fontWeight: W.extrabold, fontSize: 18 }}>⇅</Text>
          </Pressable>
          <Pressable onPress={openPickerB} style={[styles.pill, { backgroundColor: c.segment }]}>
            <Text style={{ flex: 1, color: c.text, fontWeight: W.extrabold, fontSize: 14 }}>
              {labelFor(type === 'month' ? monthB : weekB)}
            </Text>
            <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 11 }}>▼</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => presetSheet.current?.present()}
          style={[styles.presetChip, { backgroundColor: c.segment }]}
        >
          <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 13 }}>
            {t(presetLabelKey(preset))}
          </Text>
          <Icon name="chevron-down" size={14} color={c.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        {bothEmpty ? (
          <Text style={{ marginTop: 40, textAlign: 'center', color: c.textSecondary, fontWeight: W.medium }}>
            {t('compare.empty_both')}
          </Text>
        ) : (
          <>
            {/* Delta card */}
            <View style={styles.deltaCard}>
              <GradientFill colors={c.summaryCard} />
              <Text style={{ fontSize: 12.5, fontWeight: W.semibold, color: 'rgba(255,255,255,0.7)' }}>
                {t('history.expense_label')}
              </Text>
              <Text style={{ fontSize: 30, fontWeight: W.extrabold, color: '#fff', letterSpacing: -0.5, marginTop: 2 }}>
                {formatMoney(comparison.sumA.expense, primary)}
              </Text>
              <DeltaLine
                pct={comparison.deltaExpensePct}
                abs={comparison.sumA.expense - comparison.sumB.expense}
                primary={primary}
                periodLabel={labelFor(type === 'month' ? monthB : weekB)}
                risingIsBad
              />
              <View style={styles.deltaStats}>
                <View>
                  <Text style={styles.deltaStatLabel}>{t('history.income_label')}</Text>
                  <Text style={styles.deltaStatValue}>{formatCompact(comparison.sumA.income, primary)}</Text>
                  <DeltaLine
                    pct={comparison.deltaIncomePct}
                    abs={comparison.sumA.income - comparison.sumB.income}
                    primary={primary}
                    periodLabel=""
                    risingIsBad={false}
                    compact
                  />
                </View>
                <View>
                  <Text style={styles.deltaStatLabel}>{t('history.net_label')}</Text>
                  <Text style={styles.deltaStatValue}>{formatCompact(comparison.sumA.net, primary)}</Text>
                  <DeltaLine
                    pct={comparison.deltaNetPct}
                    abs={comparison.sumA.net - comparison.sumB.net}
                    primary={primary}
                    periodLabel=""
                    risingIsBad={false}
                    compact
                  />
                </View>
              </View>
            </View>

            {/* Chart card */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13.5, fontWeight: W.extrabold, color: c.text }}>{chartTitle}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <LegendChip color={AccentGradient[1]} label={labelFor(type === 'month' ? monthA : weekA)} />
                  <LegendChip color={c.textSecondary} label={labelFor(type === 'month' ? monthB : weekB)} muted />
                </View>
              </View>
              <BarChartOverlay
                seriesA={comparison.seriesA}
                seriesB={comparison.seriesB}
                labels={comparison.seriesLabels}
                colorA={AccentGradient[1]}
                colorB={c.textSecondary}
              />
              {txnsA.length === 0 ? (
                <Text style={{ marginTop: 8, color: c.textSecondary, fontSize: 12, fontWeight: W.semibold }}>
                  {t('compare.empty_period_a')}
                </Text>
              ) : null}
              {txnsB.length === 0 ? (
                <Text style={{ marginTop: 8, color: c.textSecondary, fontSize: 12, fontWeight: W.semibold }}>
                  {t('compare.empty_period_b')}
                </Text>
              ) : null}
            </View>

            {/* Categories */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={{ fontSize: 13.5, fontWeight: W.extrabold, color: c.text }}>
                {t('compare.categories_title')}
              </Text>
              <View style={{ marginTop: 10, gap: 10 }}>
                {comparison.categories.map((cat) => (
                  <CategoryRow key={cat.id} cat={cat} primary={primary} />
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <MonthPickerSheet ref={monthSheetA} selectedMonth={monthA} onSelect={setMonthA} includeCurrentMonth />
      <MonthPickerSheet ref={monthSheetB} selectedMonth={monthB} onSelect={setMonthB} includeCurrentMonth />
      <WeekPickerSheet  ref={weekSheetA}  selectedWeek={weekA}  onSelect={setWeekA}  includeCurrentWeek />
      <WeekPickerSheet  ref={weekSheetB}  selectedWeek={weekB}  onSelect={setWeekB}  includeCurrentWeek />
      <PeriodPickerSheet
        ref={presetSheet}
        type={type}
        yearOverYearAvailable={yearOverYearAvailable}
        selected={preset}
        onSelect={setPreset}
      />
    </View>
  );
}

function presetLabelKey(k: PresetKey): string {
  const map: Record<PresetKey, string> = {
    this_vs_last_month: 'compare.preset_this_vs_last_month',
    last_vs_prev_month: 'compare.preset_last_vs_prev_month',
    year_over_year:     'compare.preset_year_over_year',
    this_vs_last_week:  'compare.preset_this_vs_last_week',
    last_vs_prev_week:  'compare.preset_last_vs_prev_week',
    custom:             'compare.preset_custom',
  };
  return map[k];
}

function DeltaLine({
  pct, abs, primary, periodLabel, risingIsBad, compact,
}: {
  pct: number | null; abs: number; primary: string;
  periodLabel: string; risingIsBad: boolean; compact?: boolean;
}) {
  const c = useColors();
  const { t } = useT();
  if (pct === null && abs === 0) return null;
  const rising = abs > 0;
  const arrow = rising ? '▲' : abs < 0 ? '▼' : '·';
  const color = abs === 0
    ? c.textSecondary
    : (rising === risingIsBad ? Money.expense : Money.income);
  const pctText = pct === null ? t('delta.category_new') : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;
  const absText = abs !== 0 ? ` (${abs > 0 ? '+' : '−'}${Math.round(Math.abs(abs)).toLocaleString()})` : '';
  return (
    <Text
      style={{
        color: compact ? color : '#fff',
        fontSize: compact ? 11 : 13,
        fontWeight: W.bold,
        marginTop: compact ? 2 : 4,
      }}
    >
      {arrow} {pctText}{compact ? '' : absText} {periodLabel ? ` ${periodLabel}` : ''}
    </Text>
  );
}

function LegendChip({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, opacity: muted ? 0.6 : 1 }} />
      <Text style={{ fontSize: 11, fontWeight: W.semibold, color: c.textSecondary }}>{label}</Text>
    </View>
  );
}

function CategoryRow({
  cat, primary,
}: {
  cat: {
    id: string; label: string; color: string;
    valueA: number; valueB: number; deltaPct: number | null;
    status: 'both' | 'onlyA' | 'onlyB';
  };
  primary: string;
}) {
  const c = useColors();
  const { t } = useT();
  const max = Math.max(cat.valueA, cat.valueB, 1);
  const wA = Math.round((cat.valueA / max) * 100);
  const wB = Math.round((cat.valueB / max) * 100);
  const deltaText =
    cat.status === 'onlyA' ? t('delta.category_new') :
    cat.status === 'onlyB' ? t('delta.category_gone') :
    cat.deltaPct === null ? '' :
    `${cat.deltaPct > 0 ? '+' : ''}${Math.round(cat.deltaPct)}%`;
  const rising = cat.valueA > cat.valueB;
  const deltaColor = cat.status === 'onlyA' ? c.textSecondary
    : cat.status === 'onlyB' ? c.textSecondary
    : rising ? Money.expense : Money.income;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: cat.color }} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: W.semibold, color: c.text }}>{cat.label}</Text>
        <Text style={{ fontSize: 12, fontWeight: W.bold, color: deltaColor }}>{deltaText}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: cat.color, width: `${wA}%`, marginTop: 4 }} />
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.textSecondary, opacity: 0.5, width: `${wB}%`, marginTop: 3 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
        <Text style={{ fontSize: 10.5, color: c.textSecondary, fontWeight: W.semibold }}>
          A {formatCompact(cat.valueA, primary)}
        </Text>
        <Text style={{ fontSize: 10.5, color: c.textSecondary, fontWeight: W.semibold }}>
          B {formatCompact(cat.valueB, primary)}
        </Text>
      </View>
    </View>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.chip,
  },
  swapBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  presetChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.chip,
    marginTop: 10,
  },
  deltaCard: {
    marginTop: 14, borderRadius: Radius.cardLg, padding: 20, overflow: 'hidden',
  },
  deltaStats: { flexDirection: 'row', gap: 22, marginTop: 14 },
  deltaStatLabel: { fontSize: 11, fontWeight: W.semibold, color: 'rgba(255,255,255,0.6)' },
  deltaStatValue: { fontSize: 15, fontWeight: W.extrabold, color: '#fff', marginTop: 2 },
  card: {
    marginTop: 14, borderRadius: Radius.card, borderWidth: 1, padding: 16,
  },
});
```

- [ ] **Step 2: Register the route in the Stack**

Open `src/app/_layout.tsx`. Add after the existing `<Stack.Screen name="subscriptions" />`:

```tsx
<Stack.Screen name="compare" />
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors. Common fixes:
- `c.summaryCard` — if the color token is named differently for the gradient card, adjust.
- `AccentGradient[1]` — confirm export shape (array or object).
- `formatMoney(x, primary)` and `formatCompact(x, primary)` should accept the `settings.primaryCurrency` value directly; if signatures differ, adapt to match usage in `home.tsx`.

- [ ] **Step 4: Smoke test**

Start Expo dev. From Overview, tap "So sánh":
- Screen opens with default `this_vs_last_month`.
- Delta card shows expense number and delta.
- Bar chart shows two series side by side, 5 buckets.
- Category list shows all categories present in either period, sorted by max value.
- Toggle to Tuần — preset resets, chart shows 7 daily buckets Mon-Sun.
- Preset dropdown shows all applicable presets; "Cùng kỳ năm trước" is present only if you have data from 12 months ago.
- Swap ⇅ swaps and flips preset to "Tuỳ chọn".
- Open period pill → picker opens; select → chart updates.

- [ ] **Step 5: Commit**

```bash
git add src/app/compare.tsx src/app/_layout.tsx
git commit -m "feat(compare): add Compare screen with overlay chart and category deltas"
```

---

## Task 12: Manual QA walkthrough

**Files:**
- Modify: none (verification only)

**Interfaces:**
- Consumes: everything.
- Produces: verified working end-to-end feature.

- [ ] **Step 1: Run the spec's Manual QA checklist**

Execute every checkbox under "Manual QA checklist" in `docs/superpowers/specs/2026-08-04-transaction-history-and-compare-design.md`. For each item that fails, open a follow-up commit fixing only that issue (do not bundle multiple fixes into one commit).

Specifically:

**Monthly History Browser:**
- [ ] Button hides in Day/Week; hides when no past months with data
- [ ] Picker: only past months with data, grouped by year, no current month
- [ ] Selection propagates to summary + donut + list
- [ ] Tap transaction → detail screen
- [ ] Delete all txns of selected month → auto-switch or empty state

**Overview enhancements:**
- [ ] DeltaBadge visible with prev data, hidden without
- [ ] Day/Week/Month toggle updates label + value
- [ ] Expense-up = red, expense-down = green; income flipped
- [ ] Donut legend delta with "mới" for new categories
- [ ] "So sánh" opens `/compare`

**Compare screen:**
- [ ] Month/Week toggle resets periods
- [ ] Presets correct per type; "Cùng kỳ năm trước" hidden when data < 12 months
- [ ] Custom flow opens picker A then B
- [ ] Swap ⇅ swaps + preset → "Tuỳ chọn"
- [ ] BarChartOverlay side-by-side, shared scale, legend correct
- [ ] Category rows sorted, mini-bars proportional, "mới"/"không còn" correct
- [ ] Both empty → single empty state; one empty → skeleton for that side
- [ ] Dark mode readable

**Cross-cutting:**
- [ ] VI ↔ EN toggle — no hardcoded strings
- [ ] Currency change — all amounts update
- [ ] Scroll smooth with ~500 txns; picker opens instantly

- [ ] **Step 2: Final type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: No follow-up commit needed if all pass**

If QA passes cleanly with no fixes needed, no commit for this task. Otherwise, each fix should have its own targeted commit — do not bundle unrelated fixes.
