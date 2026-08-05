# Transaction history browser & comparison — design

## Context

SpendLens has been persisting transactions in SQLite from day one, so
users who have been logging for weeks or months already have rich
history sitting in the database. The UI, however, only exposes the
*current* day / week / month — the Income & Expenses screen
(`history.tsx`) filters through `filterRange(range)` anchored on `new
Date()`, and the Overview (`home.tsx`) shows a 6-month bar chart plus a
category donut for the current range. There is no way to open past
months, and no way to compare two arbitrary periods side by side.

This spec adds:

1. **Monthly History Browser** — a new screen that lets users select any
   past month with data and inspect its transactions, summary, and
   category breakdown.
2. **Overview enhancements** — a delta badge on the balance card and
   per-category delta indicators in the donut legend, plus an entry
   point into the new Compare screen.
3. **Compare screen** — a dedicated screen that overlays two periods
   (month-vs-month or week-vs-week) with a delta card, an overlay bar
   chart, and a per-category comparison list.

None of these features require a schema change. All logic is in-memory
over the `Txn[]` already loaded by `useTransactions()`.

## Goals

- Users can reach the Monthly History Browser from a "Xem tháng cũ"
  button that appears at the bottom of the transaction list in Income &
  Expenses when the Month tab is active and past months have data.
- Users can pick any past month (excluding the current month) that has
  at least one transaction, and see its summary, category donut, and
  day-grouped transaction list.
- Users can tap any transaction in the browser to open the existing
  transaction detail screen.
- Users see a delta badge on the Overview's balance card showing the
  current period's expense change vs. the previous period of the same
  type (day / week / month).
- Users see per-category delta percentages in the Overview donut legend.
- Users can open a Compare screen from a "So sánh" button on the
  Overview's monthly bar chart card, pick two periods
  (month-vs-month or week-vs-week) via presets or a custom picker, and
  view an overlaid comparison.

## Non-goals

- **Day-vs-day comparison.** Two arbitrary days rarely produce a useful
  comparison; only month-vs-month and week-vs-week are supported.
- **Editing past transactions from the browser.** Tap opens the
  existing detail screen; edits happen there.
- **Data export from the browser or Compare screen.** CSV export
  remains only on Income & Expenses.
- **Delta / comparison for the Day tab of Income & Expenses.**
- **Rolling averages, trend lines, heatmaps, or per-month drill-down
  from the bar chart.** These were explicitly deferred.
- **Any new database queries or migrations.** All computation is
  in-memory over the existing `transactions` context.
- **Analytics / telemetry** for preset usage.

## Model in one sentence

Everything derives from the `Txn[]` already loaded in memory:
`comparison.ts` exposes month / week filters, delta computations, and a
`buildComparison()` function that produces every value the Compare
screen and Overview enhancements need.

## Routes and files

**New files:**

```
src/app/
  history-months.tsx           Screen: Monthly History Browser (/history-months)
  compare.tsx                  Screen: Compare (/compare)

src/components/sl/
  month-picker-sheet.tsx       Bottom sheet — pick a month with data
  period-picker-sheet.tsx      Bottom sheet — pick period A/B with presets
  bar-chart-overlay.tsx        BarChart variant with 2 series side by side
  delta-badge.tsx              Reusable ▲/▼ +N% pill

src/lib/
  comparison.ts                All new derivation logic (pure functions)
```

**Modified files:**

```
src/app/history.tsx            Add "Xem tháng cũ" button at end of Month tab list
src/app/home.tsx               Add DeltaBadge in balance card;
                               category delta in donut legend;
                               "So sánh" button in monthly bar chart card
src/lib/i18n/locales/en.json   Add namespaces: history_months, compare, delta
src/lib/i18n/locales/vi.json   Vietnamese translations for the above
```

**Route params:** none. Both new screens use local state, seeded
sensibly on mount (Monthly History Browser defaults to the most recent
month with data; Compare defaults to "Tháng này vs Tháng trước").

## Data layer — `src/lib/comparison.ts`

Pure functions, no React, no side effects.

```ts
// Month utilities
export function availableMonthsDesc(txns: Txn[], now = new Date()): string[];
export function filterByMonth(txns: Txn[], monthKey: string): Txn[];
export function groupMonthsByYear(months: string[]): Array<{year: number; months: string[]}>;

// Week utilities (ISO-ish: week starts Monday)
export function weekStartOf(dateKey: string): string;
export function availableWeeksDesc(txns: Txn[], now = new Date()): string[];
export function filterByWeek(txns: Txn[], weekStart: string): Txn[];

// Delta primitives
export function deltaPct(current: number, previous: number): number | null;
export function deltaAbs(current: number, previous: number): number;

// Category delta
export type CategoryDelta = {
  id: string;
  label: string;
  color: string;
  valueA: number;
  valueB: number;
  deltaPct: number | null;
  status: 'both' | 'onlyA' | 'onlyB';
};

// Compare screen data
export type Comparison = {
  sumA: { income: number; expense: number; net: number };
  sumB: { income: number; expense: number; net: number };
  deltaExpensePct: number | null;
  deltaIncomePct: number | null;
  deltaNetPct: number | null;
  categories: CategoryDelta[];
  seriesA: number[];
  seriesB: number[];
  seriesLabels: string[];
};

export function buildComparison(
  txnsA: Txn[],
  txnsB: Txn[],
  type: 'month' | 'week',
  categoriesRegistry: CategoryObj[],
): Comparison;

// Overview delta badge
export function previousPeriodTxns(txns: Txn[], range: Range, now = new Date()): Txn[];
export function previousPeriodLabel(range: Range, t: TFunction, now = new Date()): string;
```

**Contract details:**

- `availableMonthsDesc` and `availableWeeksDesc` **exclude** the current
  period. Month/week membership uses `tx.date` (local `YYYY-MM-DD`) as
  source of truth — no timezone conversion.
- `deltaPct(current, prev)` returns `null` when `prev === 0` to avoid
  divide-by-zero. Callers render this as "mới" or hide the badge.
- `buildComparison` sorts categories by `max(valueA, valueB)` desc and
  does not truncate — the Compare screen shows all categories.
- `seriesA` / `seriesB` are always the same length so bars line up
  bucket-for-bucket:
    - `type === 'month'` → 5 fixed buckets by day-of-month
      (W1 = days 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–28, W5 = 29–31).
      Months shorter than 29 days simply have W5 = 0.
    - `type === 'week'` → 7 buckets, one per weekday (Mon–Sun).
  Amounts are expense-only, converted primary currency.
- `previousPeriodTxns` returns yesterday / last week / last month
  depending on `range`. Crosses year boundaries correctly.

**Reused (not modified):** `filterRange`, `groupByDay`, `summarize`,
`categoryBreakdown` from `transactions.ts`; `monthKey`, `toDateKey`,
`shiftDateKey` from `format.ts`; `toCategoryObj` from
`user-categories.ts`.

## Screen 1 — Monthly History Browser (`/history-months`)

**Entry point** (in `history.tsx`): after the last day group of the
Month tab's transaction list, render a text-style button "Xem tháng cũ
→" centered, `color: c.textSecondary`, weight semibold. Rendered only
when `range === 'month'` **and**
`availableMonthsDesc(transactions).length > 0`.

**Layout** (top to bottom):

1. Header row: back arrow, title "Xem tháng cũ", close button (same
   pattern as `history.tsx`).
2. Month picker trigger: pressable with the selected month label +
   chevron. Tap opens `MonthPickerSheet`.
3. Summary card: reuses the three-cell layout from `history.tsx`
   (Thu / Chi / Chênh lệch).
4. Category donut card: reuses the `Donut` + legend layout from
   `home.tsx`, showing top 5 categories for the selected month.
5. Transaction list: `groupByDay(monthTxns)` rendered with existing
   `TransactionRow`. Tap → `router.push('/transaction/${id}')`.

**MonthPickerSheet:**

- Bottom sheet using `@gorhom/bottom-sheet` (already in the project for
  subscription sheets).
- Content: months grouped by year (year header + rows), newest year
  first, newest month first.
- Each row: month label ("Tháng 6, 2026") + total spend hint
  ("2.8M chi", formatted with `formatCompact`).
- Selected row shows a radio marker and highlight.
- Props: `{ selectedMonth, onSelect, includeCurrentMonth?: boolean }`.
  When `includeCurrentMonth` is falsy (Screen 1 usage), the sheet only
  lists past months from `availableMonthsDesc`. When `true` (Compare's
  custom flow), the current month is prepended if it has data.

**State and defaulting:**

```ts
const months = useMemo(() => availableMonthsDesc(transactions), [transactions]);
const [selectedMonth, setSelectedMonth] = useState(months[0] ?? '');
const monthTxns = useMemo(() => filterByMonth(transactions, selectedMonth), [transactions, selectedMonth]);
```

An effect keeps `selectedMonth` valid: if the current selection
disappears from `months` (e.g., user deletes the last transaction in
that month), auto-select `months[0]`; if `months` is now empty, render
the empty state.

## Screen 2 — Overview enhancements (`home.tsx`)

Three additive changes.

### 2.1 Delta badge in the balance card

Rendered right below the large balance number, using the new
`DeltaBadge` component.

```tsx
<DeltaBadge
  current={sum.expense}
  previous={prevSum.expense}
  compareType="expense"
  periodLabel={previousPeriodLabel(range, t)}
/>
```

- Anchor metric: **expense** — the change users most care about.
- Colors: expense increase = `Money.expense` (red), decrease =
  `Money.income` (green); income colors flip; net decrease = red,
  increase = green.
- Renders nothing when `previous === 0` and `current === 0`, or when
  there are no transactions in the previous period at all.
- When `previous === 0` and `current > 0`, shows an ▲ arrow without a
  percentage (deltaPct returns null).
- `periodLabel`: "hôm qua" / "tuần trước" / "T6" via
  `previousPeriodLabel`.

### 2.2 Category delta in the donut legend

Each of the top-5 category rows in the donut legend appends a delta
segment on the right:

```
● Ăn uống         35%  ▲+18%
● Di chuyển       22%  ▼-5%
● Mua sắm         16%  mới
```

- Delta text: `+/-N%`, colored using the same rule as `DeltaBadge` (an
  expense category increase is red).
- Category present in current but absent in previous → "mới".
- Category present in previous but absent in current → not shown (it's
  not in the top 5 anymore).
- Font size 11px, semibold; the percentage share stays 12px.
- Entire delta column is hidden when the previous period has zero
  transactions.

### 2.3 "So sánh" button on the monthly bar chart card

The existing title row `Chi tiêu theo tháng` gets a right-aligned
`Pressable` with text "So sánh →", `color: c.textSecondary`, semibold.
Always enabled; `onPress={() => router.push('/compare')}`.

## Screen 3 — Compare (`/compare`)

**Layout** (top to bottom):

1. Header: back, title "So sánh", close.
2. Type toggle: `Segmented` with `[Tháng, Tuần]`, default index 0.
3. Period pills row: `[Period A pill]  ⇅  [Period B pill]`. Each pill
   shows the selected period label with a chevron and opens
   `PeriodPickerSheet` on tap. The center ⇅ button swaps A and B with
   no confirmation.
4. Preset dropdown row: chip labeled with the current preset (e.g.,
   "Tháng này vs Tháng trước"). Tap opens a small sheet listing
   presets for the current type. Selecting a preset overwrites both A
   and B. Any manual pill change flips the preset back to "Tuỳ chọn".
5. Delta card: gradient background matching `home.tsx`'s balance card.
   Primary line = expense delta ("Chi: 2.8M ▲ +18% (+425K) so với T6"),
   secondary line = income delta and net delta in smaller columns.
6. Overlay bar chart card: legend chips for A and B colors, then a
   `BarChartOverlay` — same buckets for both series
   (5 week buckets for Month type, Mon–Sun for Week type). Bars are
   rendered **side by side within each bucket** (not overlapped) —
   easier to read.
7. Category comparison list: one row per category union of A and B.
   Each row: color dot + label + two mini horizontal bars (widths
   normalized against the max value across all rows and both series) +
   delta pill on the right. Sort by `max(valueA, valueB)` desc, no
   truncation.

**Presets:**

Month type:
- `Tháng này vs Tháng trước` (default)
- `Tháng trước vs 2 tháng trước`
- `Cùng kỳ năm trước` — only listed when there is data ≥ 12 months
  back (`availableMonthsDesc` contains the key from 12 months ago)
- `Tuỳ chọn` — opens `MonthPickerSheet` for A, then B, in sequence

Week type:
- `Tuần này vs Tuần trước` (default)
- `Tuần trước vs 2 tuần trước`
- `Tuỳ chọn` — opens `WeekPickerSheet` for A, then B

Switching between Month and Week resets the preset to the type's
default.

**Custom pickers:**

- `MonthPickerSheet` (reused from Screen 1) — invoked with
  `includeCurrentMonth={true}` so the current month is also
  selectable in Compare's custom flow.
- `WeekPickerSheet` (new) — same skeleton as MonthPickerSheet but
  lists weeks. Row label: "23/6 - 29/6" (formatted range); group by
  year is not needed for weeks (too granular) — just a flat list with
  ~26 weeks visible.

**BarChartOverlay:**

- Input: `{ seriesA, seriesB, labels, colorA, colorB }`. `seriesA` and
  `seriesB` are equal-length number arrays.
- Rendering: for each bucket, two thin SVG rects side by side with a
  small gap. Height normalizes against `max(all values from both
  series)` — the two series share a scale so bars are directly
  comparable.
- `colorA` uses the app's accent (existing gradient or the primary
  accent solid). `colorB` uses `c.textSecondary` at low opacity for the
  muted look.

## i18n additions

Vietnamese (`vi.json`):

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

English (`en.json`): mirror keys with English text (e.g.,
`"header": "Older transactions"`, `"picker_title": "Select month"`,
`"category_new": "new"`, `"category_gone": "gone"`).

`format.month_abbrev` already exists — reuse for month labels ("T6").
`home.range_day/week/month` reuse for the type toggle labels.

## Edge cases

**Monthly History Browser:**

- Empty `availableMonthsDesc` on entry (defensive; entry button already
  hides): render "Chưa có dữ liệu các tháng trước" placeholder + back
  button.
- User deletes the last transaction in the currently selected month
  while on the screen: effect on `months` re-selects `months[0]` or
  falls back to the empty state.
- Very long history (2+ years): the year-grouped picker scrolls; no
  virtualization needed for typical usage.

**Overview enhancements:**

- Previous period has zero transactions: `DeltaBadge` renders nothing;
  category delta column is hidden.
- Category new in current period (`prev === 0`): "mới" instead of a
  percentage.
- Category disappeared (in prev but not current): not shown — it left
  the top 5.

**Compare screen:**

- Both A and B empty: hide delta card + chart; show "Chưa có dữ liệu để
  so sánh" once. Pickers remain interactive.
- Only A empty: chart renders zero-height A bars; delta pills show
  "mới" for all B categories.
- Only B empty: symmetric.
- A and B are the same period: allowed; deltas are 0%, chart shows
  equal series. No warning — the user may want a clean view.
- "Cùng kỳ năm trước" preset hidden when ≥12-months-back data is
  absent.
- Switching type Month↔Week: reset periods to that type's default
  preset.
- Swap ⇅ that breaks a preset match: preset label flips to "Tuỳ chọn".

**Cross-cutting:**

- Multi-currency: use `tx.amount` (already converted to primary) — same
  as home/history. Changing primary currency triggers re-render through
  `useTransactions()`; no extra work.
- Timezone: `tx.date` (local `YYYY-MM-DD`) is the source of truth
  everywhere. No `Date` timezone conversion in filter functions.
- Navigation: back / close use the existing pattern
  (`router.canGoBack() ? router.back() : router.replace('/')`).

## Not handled

- No pull-to-refresh (`useTransactions()` is not async once mounted).
- No loading skeletons — initial load is a single sync read.
- No test suite. The project has no existing test harness; verification
  is manual per the QA checklist below.

## Manual QA checklist

**Monthly History Browser:**

- [ ] "Xem tháng cũ" button appears only on Month tab **and** only when
      past months with data exist.
- [ ] Button hidden when only the current month has data (fresh
      install case).
- [ ] `MonthPickerSheet` lists only months with data, grouped by year,
      newest first, and the current month never appears.
- [ ] Selecting a month updates summary, donut, and transaction list
      correctly.
- [ ] Tapping a transaction opens `/transaction/[id]` as usual.
- [ ] Deleting all transactions of the currently selected month
      auto-switches to the next available month, or shows the empty
      state.
- [ ] Returning to Income & Expenses preserves the Month tab position.

**Overview enhancements:**

- [ ] `DeltaBadge` visible when a previous period exists; hidden
      otherwise.
- [ ] Switching Day / Week / Month updates the delta label and value.
- [ ] Colors correct: expense up = red, down = green; income flipped.
- [ ] Donut legend shows per-category delta; "mới" for new
      categories.
- [ ] "So sánh" button opens `/compare`.

**Compare screen:**

- [ ] Month / Week toggle resets periods.
- [ ] Presets correct for each type; "Cùng kỳ năm trước" hidden when
      data is shorter than 12 months.
- [ ] Custom flow opens picker for A, then B.
- [ ] Swap ⇅ swaps periods; preset label becomes "Tuỳ chọn".
- [ ] `BarChartOverlay` shows two series side by side, shared scale,
      legend colors match.
- [ ] Category rows sorted correctly; mini bar widths proportional;
      delta pill shows "mới" / "không còn" appropriately.
- [ ] Empty states: both empty → single message; one side empty →
      skeleton for that side.
- [ ] Dark mode: text, borders, and gradient card remain readable.

**Cross-cutting:**

- [ ] Language toggle VI ↔ EN — no hard-coded strings.
- [ ] Currency change — all amounts update.
- [ ] Scroll performance smooth with ~500 transactions;
      `MonthPickerSheet` opens instantly.
