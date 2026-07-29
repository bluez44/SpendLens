# Multi-currency transactions — design

## Context

SpendLens today is single-currency (Vietnamese đồng). Amount columns
(`transactions.amount`, `settings.monthlyBudget`) are plain `REAL`s
interpreted as VND everywhere. Formatters (`formatVND`, `signedVND`,
`compactK`, `compactTr` in `src/lib/format.ts`) hard-code the đồng symbol
and grouping. The user wants to record occasional non-VND expenses (a
Claude Pro subscription in USD, a JPY receipt from a trip) without losing
the ability to see everything summed in one primary unit.

This spec covers the **currency system** for regular transactions. It is
foundational for a later **subscriptions** spec (subscriptions will store
amounts and reuse this currency machinery).

## Model in one sentence

The user records a transaction in whatever currency they choose. SpendLens
converts to the current primary currency using an FX rate table (auto-
fetched daily, manually overridable), stores **both** the original values
and the converted values, and displays the converted value everywhere with
a small "≈ $20" annotation whenever original ≠ converted.

## Goals

- Support 6 fixed currencies out of the box: **VND, USD, EUR, JPY, GBP,
  KRW**. No user-defined currencies.
- A single **primary currency** setting drives display, aggregation, chart
  totals, and the default currency preselected on the Entry screen.
- Every transaction stores its **original amount + original currency**
  (immutable audit trail) plus a **converted amount + currency-at-write**
  (fast to display and sum without on-the-fly conversion).
- FX rates are **auto-fetched daily** from a free public API
  (`api.exchangerate.host`, no API key). Users can **override any rate
  manually** — auto-fetches never clobber manual overrides.
- Changing the primary currency **recomputes every row's converted
  amount** from its original values using current rates, keeping totals
  meaningful. The monthly budget is converted at the same time.
- Existing VND-only data migrates transparently — no user action, no
  display change until they touch the new features.

## Non-goals

- **User-defined currencies.** The 6-currency catalog is fixed.
- **Historical rate lookup.** Rates are always "current" at the moment
  they're used. No point-in-time rate history.
- **Per-currency budgets or per-currency reports.** Budget is one number
  in primary currency. Reports aggregate in primary currency.
- **Currency-aware categorization / tax handling.** Out of scope.
- **Offline FX seeding via bundled monthly refresh.** One hard-coded
  fallback set at build time is enough — the app is expected to fetch
  fresh rates within its first days of use.

## Currency catalog

Static metadata lives in `src/lib/currency.ts`:

```ts
export const CURRENCIES = ['VND', 'USD', 'EUR', 'JPY', 'GBP', 'KRW'] as const;
export type CurrencyCode = typeof CURRENCIES[number];

export const CURRENCY_META: Record<CurrencyCode, {
  symbol: string;
  decimals: 0 | 2;
  position: 'prefix' | 'suffix';
}> = {
  VND: { symbol: '₫', decimals: 0, position: 'suffix' },
  USD: { symbol: '$', decimals: 2, position: 'prefix' },
  EUR: { symbol: '€', decimals: 2, position: 'prefix' },
  JPY: { symbol: '¥', decimals: 0, position: 'prefix' },
  GBP: { symbol: '£', decimals: 2, position: 'prefix' },
  KRW: { symbol: '₩', decimals: 0, position: 'prefix' },
};
```

`decimals` controls both input parsing and display. `position` controls
whether the symbol goes before or after the number.

## FX rate storage

**Anchor = USD.** Rates are stored as "how many USD is one unit of this
currency worth" — matching the shape returned by `exchangerate.host`.
Cross-currency conversion uses USD as the pivot:

```
amount_A_in_B = amount_A * rate_A_to_usd / rate_B_to_usd
```

USD's rate is implicitly 1 and is not stored.

**New table** created in `runMigrations`:

```sql
CREATE TABLE IF NOT EXISTS fx_rates (
  currency TEXT PRIMARY KEY,         -- 'VND', 'EUR', 'JPY', 'GBP', 'KRW'
  rate_to_usd REAL NOT NULL,
  source TEXT NOT NULL,              -- 'auto' | 'manual' | 'fallback'
  updated_at INTEGER NOT NULL
);
```

**Hard-coded fallback** seeded on first run (only if the row is missing —
never overwrites an existing row):

```ts
const FALLBACK_RATES: Record<Exclude<CurrencyCode, 'USD'>, number> = {
  VND: 1 / 24500,
  EUR: 1.09,
  JPY: 0.0068,
  GBP: 1.27,
  KRW: 0.00072,
};
```

## FX fetching

Module: `src/lib/fx.ts`. Two shapes live here — a pure `convert()`
function used everywhere for computation, and an `FxService` class that
owns the DB reads/writes and the network fetch.

```ts
export function convert(
  amount: number, from: CurrencyCode, to: CurrencyCode,
  rates: Record<Exclude<CurrencyCode, 'USD'>, number>,
): number;

export class FxService {
  loadRates(db): Record<Exclude<CurrencyCode, 'USD'>, number>;
  async fetchFromApi(): Promise<void>;   // updates auto+fallback rows only
  setManualRate(currency, rate): void;   // source='manual'
  clearManualRate(currency): void;       // deletes row → auto refetch
  getLastFetchedAt(): number | null;
}
```

**Trigger for `fetchFromApi()`:** on app foreground, if
`getLastFetchedAt() < now - 24h`. Called from an effect in the settings
context or a small `FxProvider`. Silent on failure — the previous cached
rates keep working.

**API request:**
```
GET https://api.exchangerate.host/latest?base=USD&symbols=VND,EUR,JPY,GBP,KRW
```
Response body: `{ rates: { VND: 24500, EUR: 0.92, ... } }`. Note the API
returns "1 USD = X currency". We store the inverse (`1/x`) to keep the
schema consistent with the rest of the app.

**Manual override behavior:** when the user edits a rate, the row's
`source` becomes `'manual'`. `fetchFromApi()` iterates the 5 non-USD
currencies and skips any row currently marked `manual`. Users clear a
manual override with a "Trở về tự động" affordance in the settings sheet,
which deletes the row so the next auto-fetch (or on-demand refetch) will
rewrite it as `'auto'`.

## Data model changes

Migration additions in `src/lib/db.ts::runMigrations`:

```sql
ALTER TABLE transactions ADD COLUMN currency TEXT;
ALTER TABLE transactions ADD COLUMN original_amount REAL;
ALTER TABLE transactions ADD COLUMN original_currency TEXT;
-- plus fx_rates CREATE from above
```

Backfill (idempotent — only touches NULL rows):

```sql
UPDATE transactions SET currency = 'VND'          WHERE currency          IS NULL;
UPDATE transactions SET original_amount = amount  WHERE original_amount   IS NULL;
UPDATE transactions SET original_currency = 'VND' WHERE original_currency IS NULL;
```

**Semantics:**
- `amount` = value in `currency`. `currency` = primary at write time.
- `original_amount`, `original_currency` = exactly what the user typed and
  picked. Never rewritten after insert.
- If `original_currency == currency`: no conversion happened; the two
  amounts are equal.
- If `original_currency != currency`: conversion happened at write time
  using rates then in effect. `amount` may be later recomputed if the
  primary currency changes (see below).

**Settings.** `monthlyBudget` stays a `REAL`. Its currency is always the
current `primaryCurrency`. A new settings key `primaryCurrency`
(`'VND' | 'USD' | ...`) defaults to `'VND'`. Both are converted together
during a primary-currency change (see §Primary change flow).

**Type additions:**

```ts
interface Txn {
  // ...existing
  amount: number;
  currency: CurrencyCode;
  originalAmount: number;
  originalCurrency: CurrencyCode;
}

interface NewTxn {
  // ...existing (except amount is removed from the input)
  originalAmount: number;
  originalCurrency: CurrencyCode;
}
```

`insertTransaction(input)` reads primary + rates, computes `amount`/
`currency`, and writes all four columns. `updateTransaction` does the
same for edits.

## Format helpers

Refactor `src/lib/format.ts`:

```ts
export function formatMoney(amount: number, currency: CurrencyCode): string;
export function signedMoney(amount: number, currency: CurrencyCode, isIncome: boolean): string;
export function formatCompact(amount: number, currency: CurrencyCode): string;   // "485k", "4,23tr" for VND; "$20" / "€18" for others
export function formatAmountInput(digitsOnly: string, currency: CurrencyCode): string;  // for the Entry input field
```

Legacy `formatVND`, `signedVND`, `compactK`, `compactTr` stay as thin
wrappers around the new helpers (currency = `'VND'`) so existing call
sites don't break during the incremental refactor.

## Entry UI

Change scoped to `src/app/entry.tsx`.

**Layout under the AMOUNT label:**

```
     ┌───────────────┐
     │  485.000  ₫   │   ← existing input, symbol swaps with currency
     └───────────────┘
       [ VND ▾ ]         ← new chip Pressable, opens CurrencyPickerSheet
       ≈ $19.80          ← preview line, only when originalCurrency ≠ primaryCurrency
```

**`CurrencyPickerSheet`** (`src/components/sl/currency-picker-sheet.tsx`)
— a `@gorhom/bottom-sheet` modal following the existing pattern
(`budget-sheet.tsx`, `pin-setup-sheet.tsx`):

- Title: `t('currency.picker_title')` — "Chọn đơn vị" / "Choose currency"
- Grid of 6 tiles (3 columns × 2 rows), current selection has an accent
  border, tap → invoke `onChange(currency)` and `dismiss()`
- Backdrop as usual

**Amount input formatting:** delegated to `formatAmountInput(raw, currency)`:
- `decimals: 0` currencies (VND, JPY, KRW): strip non-digits, group by
  thousands with `.` separator, no decimal point
- `decimals: 2` currencies (USD, EUR, GBP): strip non-digits, treat as
  cents, format `12345 → "123.45"`. Locale-agnostic — always `.` decimal
  separator for simplicity.

**Preview line:** re-renders on every keystroke or currency change. Uses
`FxService.loadRates()` cached in a React ref; no network on the hot
path.

**Save:** the Entry screen passes `originalAmount` + `originalCurrency`
in `NewTxn`. The transaction module computes `amount`/`currency`.

## Display

Every place that shows an amount uses `formatMoney(amount, currency)`.
Because `currency` on every row equals the current primary (post
migration, post-batch-recompute), aggregations sum `amount` freely
without any conversion at read time.

**Original-currency annotation** appears only in row-level UI:

| Component | Annotation |
|---|---|
| `TransactionRow` | Small `≈ $4` (11 px, `textSecondary`), right-aligned under the primary amount, rendered only when `original_currency !== currency` |
| `TxnCard` (camera feed) | Same treatment |
| `gallery.tsx` cell | Same treatment |
| `transaction/[id].tsx` detail | Dedicated grid row `Original` showing `$20.00 USD` |
| `home.tsx` / `history.tsx` summaries and charts | None — aggregations are in primary currency; noting per-row originals would be noisy |
| `settings.tsx` monthly budget | None — budget is always in primary currency |

**CSV export** (`src/lib/export.ts`) gains two columns after `Amount`:
`Currency`, `OriginalAmount`, `OriginalCurrency`. Existing header rows
regenerated per this order.

## Settings UI

New section `TIỀN TỆ` inserted between NGÔN NGỮ and BẢO MẬT.

**Primary currency picker** — `Segmented` control with 6 slots
(horizontally scrollable if it overflows on narrow screens). Tapping a
different currency triggers the primary-change flow (below), NOT an
immediate write.

**FX rates panel** — a card containing:

- Header row: `Tỷ giá  ·  Cập nhật lúc HH:mm` + `Cập nhật ngay` button
- 5 rows, one per non-USD currency (or all 6 minus current primary):
  ```
  1 USD = 24.500 ₫       Tự động           ›
  1 JPY = 165 ₫          Thủ công    Trở về tự động
  ```
- Row is a Pressable; tap opens `RateOverrideSheet` (a tiny bottom sheet
  with one input and Save/Cancel). Saving writes `source='manual'`.
- The "Trở về tự động" affordance appears only on `source='manual'`
  rows; tapping deletes the row (auto will refetch next cycle).
- "Cập nhật ngay" force-triggers `FxService.fetchFromApi()` regardless
  of the 24h cadence; failures show an inline error line for 3s.

## Primary change flow

When the user taps a non-current currency in the primary segmented control,
show a confirmation dialog **before** any writes:

```
┌───────────────────────────────────────────┐
│ Đổi đơn vị chính sang USD?                │
│                                           │
│ SpendLens sẽ tính lại 128 giao dịch bằng │
│ tỷ giá hiện tại:                          │
│   • 84 giao dịch VND → USD                │
│   • 12 giao dịch EUR → USD                │
│   • 32 giao dịch USD → giữ nguyên         │
│                                           │
│ Ngân sách tháng: 5.000.000₫ → $203        │
│                                           │
│  [Huỷ]              [Đổi & tính lại]      │
└───────────────────────────────────────────┘
```

Counts are computed on the fly from a `SELECT original_currency, COUNT(*)`.
The budget preview uses `convert(monthlyBudget, oldPrimary, newPrimary)`.

**On confirm**, inside `db.withTransactionSync`:

```ts
for each row in transactions:
  row.amount = convert(row.original_amount, row.original_currency, newPrimary, rates)
  row.currency = newPrimary
settings.monthlyBudget = convert(oldBudget, oldPrimary, newPrimary, rates)
settings.primaryCurrency = newPrimary
```

Because `original_*` is never touched, repeated primary switches don't
accumulate float drift. Every recompute is one hop through USD.

**If any FX rate row is still `source='fallback'`**, the dialog adds a
warning line: `⚠ Đang dùng tỷ giá mặc định — có thể không chính xác. Hãy
'Cập nhật ngay' trước khi đổi.` User can still proceed if they wish.

**Post-confirm:** `refresh()` on transactions context; UI re-renders.

## i18n

All new strings live under the `currency.*` namespace in
`src/lib/i18n/locales/en.json` and `src/lib/i18n/locales/vi.json`.

| Key | English | Vietnamese |
|---|---|---|
| `currency.section_title` | CURRENCY | TIỀN TỆ |
| `currency.primary_label` | Primary currency | Đơn vị chính |
| `currency.picker_title` | Choose currency | Chọn đơn vị |
| `currency.rates_label` | Exchange rates | Tỷ giá |
| `currency.last_fetched` | Updated at {{time}} | Cập nhật lúc {{time}} |
| `currency.fetch_now` | Update now | Cập nhật ngay |
| `currency.fetch_error` | Update failed | Cập nhật thất bại |
| `currency.rate_row` | 1 {{from}} = {{value}} {{to}} | 1 {{from}} = {{value}} {{to}} |
| `currency.source_auto` | Auto | Tự động |
| `currency.source_manual` | Manual | Thủ công |
| `currency.source_fallback` | Default | Mặc định |
| `currency.revert_to_auto` | Reset to auto | Trở về tự động |
| `currency.override_title` | Set exchange rate | Đặt tỷ giá |
| `currency.override_placeholder` | Rate | Tỷ giá |
| `currency.override_invalid` | Rate must be greater than 0 | Tỷ giá phải lớn hơn 0 |
| `currency.change_primary_title` | Change primary to {{code}}? | Đổi đơn vị chính sang {{code}}? |
| `currency.change_primary_body` | SpendLens will recompute {{n}} transactions with current rates: | SpendLens sẽ tính lại {{n}} giao dịch bằng tỷ giá hiện tại: |
| `currency.change_primary_line` | • {{n}} {{from}} → {{to}} | • {{n}} giao dịch {{from}} → {{to}} |
| `currency.change_primary_unchanged` | • {{n}} {{code}} → unchanged | • {{n}} giao dịch {{code}} → giữ nguyên |
| `currency.change_primary_budget` | Monthly budget: {{before}} → {{after}} | Ngân sách tháng: {{before}} → {{after}} |
| `currency.change_primary_fallback_warn` | ⚠ Using default rates — may be inaccurate. Try 'Update now' first. | ⚠ Đang dùng tỷ giá mặc định — có thể không chính xác. Hãy 'Cập nhật ngay' trước khi đổi. |
| `currency.change_primary_confirm` | Change & recompute | Đổi & tính lại |
| `currency.original_label` | Original | Nguyên gốc |
| `currency.approx_prefix` | ≈ | ≈ |

## Migration on existing installs

Applied automatically at app start via the existing `runMigrations`
pipeline. Sequence per column, all idempotent, safe to re-run:

1. `ALTER TABLE transactions ADD COLUMN currency TEXT` (skip if exists)
2. Same for `original_amount`, `original_currency`
3. `CREATE TABLE IF NOT EXISTS fx_rates ...`
4. Backfill NULL columns with `'VND'` / `amount`
5. Seed missing `fx_rates` rows from `FALLBACK_RATES` (only where the row
   does not already exist)

Existing installs land with every txn tagged VND/VND and one primary
setting `'VND'` — display and behavior are identical to today until the
user changes something.

## Error handling & edge cases

| Situation | Handling |
|---|---|
| FX API offline | Silent skip, cached rates used; last-fetched timestamp visible in settings |
| Rate row missing entirely | `convert()` throws; UI wraps the throw so entry save + display don't crash. Fallback seed prevents this in practice. |
| User enters `originalAmount = 0` in a currency ≠ primary | Same as any zero — validation currently blocks save; unchanged |
| Primary change dialog dismissed | No writes; segmented visually reverts to old primary |
| Batch recompute throws mid-way | SQLite transaction rolls back, primary stays as-is, error surfaced via toast |
| Manual rate = 0 or negative | Rate override sheet validates > 0 |
| Legacy CSV consumer expecting the old export header | Header changed. Documented in release notes. |

## Testing strategy

**Unit tests (no network):**

- `format.ts`
  - `formatMoney` per currency (decimals 0 vs 2, symbol prefix vs suffix)
  - `signedMoney` `+` / `−` prefix per income flag
  - `formatCompact` — legacy `compactK`/`compactTr` outputs preserved
    for VND
  - `formatAmountInput` — digit-only input, cents interpretation for
    decimals=2 currencies

- `fx.ts`
  - `convert` — same currency = passthrough; A → B via USD; VND ↔ USD
    ↔ VND is close to identity within float epsilon
  - `FxService.loadRates` — reads all 5 non-USD rows; missing rows use
    fallback constants
  - `FxService.fetchFromApi` — mocked `fetch` returns rate map; verifies
    auto rows get updated, manual rows unchanged
  - `FxService.setManualRate` / `clearManualRate` — DB writes/deletes

- `db.ts runMigrations`
  - Adds all three new columns + `fx_rates` table
  - Backfills existing VND-era rows correctly
  - Idempotent — second run does not error, does not overwrite manual
    fx_rates

- `transactions.ts`
  - `insertTransaction` primary=VND, input=VND → amount==originalAmount,
    currency=originalCurrency='VND'
  - `insertTransaction` primary=VND, input=USD → amount converted,
    originals preserved
  - `updateTransaction` — same

- `settings/primary-change`
  - Set up 3 mixed-currency txns → change primary → verify every
    `amount` re-derived from `original_amount` via current rates
  - `monthlyBudget` converted
  - `primaryCurrency` setting updated
  - Idempotent: change primary back → data returns to original values
    within float epsilon

- `CurrencyPickerSheet` (react-native-testing-library)
  - `present()` shows the grid; tapping a currency invokes `onChange`
    and dismisses

- `RateOverrideSheet`
  - Present with a rate → edit → save invokes `onSave(rate)` with a
    positive number; rejects `0` and negative input

**Manual QA:**

1. Fresh install: Entry chip defaults to VND, no conversion note.
2. Change primary VND → USD: dialog shows counts, budget conversion
   preview correct, confirming updates every screen.
3. Enter a USD txn under primary=VND: history shows `≈ $20` note; detail
   shows `Original: $20.00 USD` row.
4. Airplane mode: rate list shows old timestamp, entry still works
   (uses stale rates).
5. Override JPY rate manually → "Cập nhật ngay" leaves JPY untouched,
   updates the other 4.
6. Change primary rapidly VND → USD → EUR → VND: original amounts
   preserved every hop; final `amount` values close to initial.
7. Toggle language and theme: currency section, sheets, preview line
   all localized + themed correctly.
8. CSV export: header includes `Currency, OriginalAmount, OriginalCurrency`
   in that order; rows populated correctly.
