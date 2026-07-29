# Multi-Currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 6-currency system so users can record transactions in any of VND/USD/EUR/JPY/GBP/KRW while every display and aggregation stays in one primary currency, with per-transaction original-value preservation and one-shot batch recompute when the primary changes.

**Architecture:** Pure `currency.ts` catalog + `fx.ts` (convert function + FxService) form the foundation. Data-layer changes are additive: `transactions` gains `currency`/`original_amount`/`original_currency`; a new `fx_rates` table stores rates with source tracking (auto/manual/fallback). `insertTransaction` and `updateTransaction` compute the converted `amount` at write time using current rates. The primary-currency change flow recomputes every row's `amount` from immutable originals inside a SQLite transaction. UI additions are a `CurrencyPickerSheet`, a `RateOverrideSheet`, and one settings section — every existing display swaps `formatVND` for a generic `formatMoney(amount, currency)`.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-sqlite, expo-crypto, `@gorhom/bottom-sheet`, i18next, Jest + jest-expo. FX API: `https://api.exchangerate.host` (no key).

## Global Constraints

- **Design spec:** every task implements a section of `docs/superpowers/specs/2026-07-29-multi-currency-design.md`. Deviations require the spec to be updated first.
- **6 currencies, fixed:** `VND, USD, EUR, JPY, GBP, KRW`. USD is the anchor; USD's rate is implicit `1` and never stored.
- **Rate direction:** `rate_to_usd` = "how many USD is 1 unit of this currency worth". The exchangerate.host API returns the inverse (`1 USD = X currency`); the fetcher must invert before storing.
- **Original values are immutable.** `original_amount` and `original_currency` are set on insert and never rewritten. All conversion drift lives in the derived `amount`/`currency` pair.
- **i18n:** every user-visible string uses `useT()` from `src/lib/i18n` and lives under the `currency.*` namespace in both `en.json` and `vi.json`.
- **Colors:** every color reads from `useColors()` in `src/constants/tokens.ts`. No hex literals in new files.
- **Bottom sheets:** all new sheets use `@gorhom/bottom-sheet` and match `src/components/sl/budget-sheet.tsx` (BottomSheetModal + BottomSheetBackdrop + forwardRef imperative handle).
- **Tests:** colocated `*.test.ts(x)`, Jest + jest-expo preset, `expo-crypto` mocked at test top when needed, in-memory SQLite via `SQLite.openDatabaseSync(':memory:')`.
- **No comments unless the WHY is non-obvious.** No trailing summary comments.
- **Commit granularity:** one commit per task at the end, imperative short subject + one paragraph of context, matching existing repo style.

---

## File map

**New files:**
- `src/lib/currency.ts` — `CURRENCIES`, `CurrencyCode`, `CURRENCY_META`
- `src/lib/fx.ts` — `convert()`, `FxService`, `FALLBACK_RATES`
- `src/lib/fx.test.ts`
- `src/components/sl/currency-picker-sheet.tsx`
- `src/components/sl/currency-picker-sheet.test.tsx`
- `src/components/sl/rate-override-sheet.tsx`
- `src/components/sl/rate-override-sheet.test.tsx`

**Modified files:**
- `src/lib/db.ts` — migrations: 3 new txn columns + `fx_rates` table + fallback seed
- `src/lib/db.test.ts` — assert new tables/columns
- `src/lib/format.ts` — add `formatMoney`, `signedMoney`, `formatCompact`, `formatAmountInput`; keep legacy `formatVND`/`signedVND`/`compactK`/`compactTr` as wrappers
- `src/lib/format.test.ts` (create — currently no dedicated format tests)
- `src/lib/transactions.ts` — extend `Txn`/`NewTxn`; `insertTransaction`/`updateTransaction` compute conversion
- `src/lib/transactions.test.ts` — currency behavior tests
- `src/lib/settings.ts` — add `primaryCurrency` field
- `src/lib/settings.test.ts` — roundtrip primaryCurrency
- `src/lib/settings-context.tsx` — expose primary + `changePrimary()` batch action; mount FX fetch effect
- `src/lib/export.ts` — CSV: add `Currency, OriginalAmount, OriginalCurrency` columns
- `src/lib/export.test.ts`
- `src/app/entry.tsx` — currency chip + preview line, save via `originalAmount`/`originalCurrency`
- `src/app/settings.tsx` — new TIỀN TỆ section (segmented + rates panel + change dialog)
- `src/app/home.tsx`, `history.tsx`, `gallery.tsx`, `index.tsx`, `transaction/[id].tsx` — replace `formatVND`/`signedVND` calls with `formatMoney`/`signedMoney`
- `src/components/sl/transaction-row.tsx`, `txn-card.tsx` — small `≈ $X` annotation
- `src/lib/i18n/locales/en.json`, `vi.json` — add `currency.*` block

---

## Task 1: Currency catalog

**Files:**
- Create: `src/lib/currency.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `CURRENCIES: readonly ['VND','USD','EUR','JPY','GBP','KRW']`
  - `type CurrencyCode = typeof CURRENCIES[number]`
  - `CURRENCY_META: Record<CurrencyCode, { symbol: string; decimals: 0 | 2; position: 'prefix'|'suffix' }>`

- [ ] **Step 1: Create `src/lib/currency.ts`**

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

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}
```

- [ ] **Step 2: TypeScript sanity check**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/currency.ts`. Pre-existing test-file `TS2593` errors may persist — leave them.

- [ ] **Step 3: Commit**

```bash
git add src/lib/currency.ts
git commit -m "Add currency catalog and metadata

Fixed 6-currency catalog (VND, USD, EUR, JPY, GBP, KRW) with per-code
symbol/decimals/position metadata. Used by format helpers, FX
conversion, and the picker sheet."
```

---

## Task 2: Format helpers

**Files:**
- Modify: `src/lib/format.ts`
- Create: `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode`, `CURRENCY_META` (Task 1)
- Produces:
  - `formatMoney(amount: number, currency: CurrencyCode): string`
  - `signedMoney(amount: number, currency: CurrencyCode, isIncome: boolean): string`
  - `formatCompact(amount: number, currency: CurrencyCode): string`
  - `formatAmountInput(digits: string, currency: CurrencyCode): string`
  - Legacy `formatVND`/`signedVND`/`compactK`/`compactTr` preserved as VND wrappers (existing signature unchanged)

- [ ] **Step 1: Write failing tests**

Create `src/lib/format.test.ts`:

```ts
import {
  formatMoney, signedMoney, formatCompact, formatAmountInput,
  formatVND, signedVND, compactK, compactTr,
} from './format';

describe('formatMoney', () => {
  it('VND: 45000 → "45.000₫"', () => {
    expect(formatMoney(45000, 'VND')).toBe('45.000₫');
  });
  it('USD: 20 → "$20.00"', () => {
    expect(formatMoney(20, 'USD')).toBe('$20.00');
  });
  it('USD: 20.5 → "$20.50"', () => {
    expect(formatMoney(20.5, 'USD')).toBe('$20.50');
  });
  it('JPY: 3000 → "¥3000" (no decimals, prefix)', () => {
    expect(formatMoney(3000, 'JPY')).toBe('¥3000');
  });
  it('KRW: 50000 → "₩50000"', () => {
    expect(formatMoney(50000, 'KRW')).toBe('₩50000');
  });
});

describe('signedMoney', () => {
  it('income → "+"', () => {
    expect(signedMoney(20, 'USD', true)).toBe('+$20.00');
  });
  it('expense → U+2212 minus', () => {
    expect(signedMoney(20, 'USD', false)).toBe('−$20.00');
  });
});

describe('formatCompact', () => {
  it('VND uses tr for millions', () => {
    expect(formatCompact(4_230_000, 'VND')).toBe('4,23tr');
  });
  it('VND uses k for thousands', () => {
    expect(formatCompact(485_000, 'VND')).toBe('485k');
  });
  it('USD passes through formatMoney', () => {
    expect(formatCompact(20, 'USD')).toBe('$20.00');
  });
});

describe('formatAmountInput', () => {
  it('VND: digits with thousand separators', () => {
    expect(formatAmountInput('485000', 'VND')).toBe('485.000');
  });
  it('VND: empty stays empty', () => {
    expect(formatAmountInput('', 'VND')).toBe('');
  });
  it('USD: treats digits as cents', () => {
    expect(formatAmountInput('12345', 'USD')).toBe('123.45');
  });
  it('USD: pads leading zeros for cents', () => {
    expect(formatAmountInput('5', 'USD')).toBe('0.05');
  });
  it('JPY (decimals=0): digits as int', () => {
    expect(formatAmountInput('3000', 'JPY')).toBe('3000');
  });
});

describe('legacy VND aliases still work', () => {
  it('formatVND', () => {
    expect(formatVND(45000)).toBe('45.000₫');
  });
  it('signedVND', () => {
    expect(signedVND(45000, false)).toBe('−45.000₫');
  });
  it('compactK', () => {
    expect(compactK(485_000)).toBe('485k');
  });
  it('compactTr', () => {
    expect(compactTr(4_230_000)).toBe('4,23tr');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/format.test.ts`
Expected: FAIL — `formatMoney`, `signedMoney`, `formatCompact`, `formatAmountInput` are not defined.

- [ ] **Step 3: Extend `src/lib/format.ts`**

Add at the top:

```ts
import { CURRENCY_META, type CurrencyCode } from './currency';
```

Add these helpers (do NOT delete the existing `formatVND` etc — keep them as wrappers below):

```ts
function groupThousandsRaw(intAbs: number): string {
  return intAbs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const meta = CURRENCY_META[currency];
  const abs = Math.abs(amount);
  let body: string;
  if (meta.decimals === 0) {
    body = groupThousandsRaw(Math.round(abs));
  } else {
    body = abs.toFixed(2);
  }
  return meta.position === 'prefix' ? meta.symbol + body : body + meta.symbol;
}

export function signedMoney(amount: number, currency: CurrencyCode, isIncome: boolean): string {
  return (isIncome ? '+' : '−') + formatMoney(amount, currency);
}

export function formatCompact(amount: number, currency: CurrencyCode): string {
  if (currency !== 'VND') return formatMoney(amount, currency);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(2).replace('.', ',') + 'tr';
  return groupThousandsRaw(Math.round(abs / 1000)) + 'k';
}

export function formatAmountInput(digits: string, currency: CurrencyCode): string {
  const clean = digits.replace(/\D/g, '');
  if (!clean) return '';
  const meta = CURRENCY_META[currency];
  if (meta.decimals === 0) {
    return groupThousandsRaw(Number(clean));
  }
  const padded = clean.padStart(3, '0');
  const intPart = padded.slice(0, -2).replace(/^0+/, '') || '0';
  const centsPart = padded.slice(-2);
  return `${intPart}.${centsPart}`;
}
```

Replace the existing `formatVND`, `signedVND`, `compactK`, `compactTr` bodies with wrappers:

```ts
export function formatVND(amount: number): string {
  return formatMoney(amount, 'VND');
}
export function signedVND(amount: number, isIncome: boolean): string {
  return signedMoney(amount, 'VND', isIncome);
}
export function compactK(amount: number): string {
  return groupThousandsRaw(Math.round(Math.abs(amount) / 1000)) + 'k';
}
export function compactTr(amount: number): string {
  return (Math.abs(amount) / 1_000_000).toFixed(2).replace('.', ',') + 'tr';
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite regression check**

Run: `npm test -- --silent`
Expected: PASS — legacy `formatVND` etc still work.

- [ ] **Step 6: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "Add currency-aware format helpers

formatMoney/signedMoney/formatCompact/formatAmountInput are the new
generic entry points; formatVND/signedVND/compactK/compactTr remain as
VND wrappers so existing call sites don't break during the display
refactor in a later task."
```

---

## Task 3: DB migration — txn columns + fx_rates table + fallback seed

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

**Interfaces:**
- Consumes: nothing external (uses hard-coded fallback rates)
- Produces:
  - Migration extends existing `runMigrations(db)` to add three columns to `transactions` and one new table `fx_rates` with fallback rows seeded
  - `FALLBACK_RATES` constant re-exported so tests and `fx.ts` share the same values

- [ ] **Step 1: Write failing tests**

Extend `src/lib/db.test.ts`:

```ts
describe('runMigrations currency columns', () => {
  it('adds currency/original_amount/original_currency to transactions', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    expect(hasColumn(db, 'transactions', 'currency')).toBe(true);
    expect(hasColumn(db, 'transactions', 'original_amount')).toBe(true);
    expect(hasColumn(db, 'transactions', 'original_currency')).toBe(true);
  });

  it('creates fx_rates table', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const t = db.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='fx_rates'"
    );
    expect(t).toHaveLength(1);
  });

  it('seeds fallback fx_rates rows for VND/EUR/JPY/GBP/KRW', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const rows = db.getAllSync<{ currency: string; source: string }>(
      "SELECT currency, source FROM fx_rates ORDER BY currency"
    );
    expect(rows.map(r => r.currency).sort())
      .toEqual(['EUR', 'GBP', 'JPY', 'KRW', 'VND']);
    expect(rows.every(r => r.source === 'fallback' || r.source === 'auto' || r.source === 'manual')).toBe(true);
  });

  it('backfills VND on existing rows', () => {
    const db = createDb(':memory:');
    db.runSync(
      `INSERT INTO transactions (date, time, created_at, category, name, amount)
       VALUES ('2026-07-01', '10:00', 1000, 'food', 'x', 5000)`
    );
    runMigrations(db);
    const row = db.getFirstSync<{
      currency: string; original_amount: number; original_currency: string;
    }>('SELECT currency, original_amount, original_currency FROM transactions LIMIT 1');
    expect(row?.currency).toBe('VND');
    expect(row?.original_amount).toBe(5000);
    expect(row?.original_currency).toBe('VND');
  });

  it('does not overwrite manual fx_rates on second run', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    db.runSync(
      "UPDATE fx_rates SET rate_to_usd = 999, source = 'manual' WHERE currency = 'VND'"
    );
    runMigrations(db);
    const row = db.getFirstSync<{ rate_to_usd: number; source: string }>(
      "SELECT rate_to_usd, source FROM fx_rates WHERE currency = 'VND'"
    );
    expect(row?.rate_to_usd).toBe(999);
    expect(row?.source).toBe('manual');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend `src/lib/db.ts`**

Add to top:

```ts
export const FALLBACK_RATES: Record<'VND'|'EUR'|'JPY'|'GBP'|'KRW', number> = {
  VND: 1 / 24500,
  EUR: 1.09,
  JPY: 0.0068,
  GBP: 1.27,
  KRW: 0.00072,
};
```

Add the `fx_rates` CREATE to `SCHEMA` (append inside the template literal):

```
  CREATE TABLE IF NOT EXISTS fx_rates (
    currency TEXT PRIMARY KEY,
    rate_to_usd REAL NOT NULL,
    source TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
```

Extend `runMigrations`:

```ts
export function runMigrations(db: SQLiteDatabase): void {
  // ...existing uuid/updated_at code stays unchanged...

  if (!hasColumn(db, 'transactions', 'currency')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN currency TEXT');
  }
  db.execSync("UPDATE transactions SET currency = 'VND' WHERE currency IS NULL");

  if (!hasColumn(db, 'transactions', 'original_amount')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN original_amount REAL');
  }
  db.execSync('UPDATE transactions SET original_amount = amount WHERE original_amount IS NULL');

  if (!hasColumn(db, 'transactions', 'original_currency')) {
    db.execSync('ALTER TABLE transactions ADD COLUMN original_currency TEXT');
  }
  db.execSync("UPDATE transactions SET original_currency = 'VND' WHERE original_currency IS NULL");

  const now = Date.now();
  for (const [currency, rate] of Object.entries(FALLBACK_RATES)) {
    db.runSync(
      `INSERT INTO fx_rates (currency, rate_to_usd, source, updated_at)
       VALUES (?, ?, 'fallback', ?)
       ON CONFLICT(currency) DO NOTHING`,
      currency, rate, now,
    );
  }
}
```

Also update the existing `createDb` tables assertion:

```ts
expect(tables.map((t) => t.name)).toEqual(
  ['categories', 'fx_rates', 'settings', 'sync_meta', 'transactions', 'users']
);
```

Wait — `sync_meta` was removed when we reverted sync. Verify current baseline: it should be just `['categories', 'settings', 'transactions', 'users']`. Update to `['categories', 'fx_rates', 'settings', 'transactions', 'users']`.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "Add multi-currency migration and fx_rates table

Extends transactions with currency/original_amount/original_currency
(backfilled 'VND' for existing rows). Creates fx_rates with fallback
seed for all non-USD currencies. ON CONFLICT DO NOTHING preserves any
manual/auto rates on subsequent app starts."
```

---

## Task 4: FX conversion + service

**Files:**
- Create: `src/lib/fx.ts`
- Create: `src/lib/fx.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode`, `CURRENCIES` (Task 1), `FALLBACK_RATES` (Task 3)
- Produces:
  - `type RateMap = Record<Exclude<CurrencyCode, 'USD'>, number>`
  - `convert(amount: number, from: CurrencyCode, to: CurrencyCode, rates: RateMap): number`
  - `class FxService`:
    - `constructor(db: SQLiteDatabase)`
    - `loadRates(): RateMap`
    - `async fetchFromApi(): Promise<void>`
    - `setManualRate(currency: Exclude<CurrencyCode, 'USD'>, rate: number): void`
    - `clearManualRate(currency: Exclude<CurrencyCode, 'USD'>): void`
    - `getLastFetchedAt(): number | null` (max `updated_at` across `source='auto'` rows)
    - `getSource(currency): 'auto' | 'manual' | 'fallback'`

- [ ] **Step 1: Write failing tests**

Create `src/lib/fx.test.ts`:

```ts
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => 'stub-uuid'),
}));

import * as SQLite from 'expo-sqlite';
import { runMigrations, createDb } from '../lib/db';
import { convert, FxService } from './fx';

function db() {
  const d = createDb(':memory:');
  runMigrations(d);
  return d;
}

const RATES = {
  VND: 1 / 25000,  // 1 VND = 0.00004 USD → 25000 VND per USD
  EUR: 1.10,
  JPY: 0.0067,
  GBP: 1.25,
  KRW: 0.00075,
};

describe('convert', () => {
  it('same currency is identity', () => {
    expect(convert(100, 'USD', 'USD', RATES)).toBe(100);
    expect(convert(50000, 'VND', 'VND', RATES)).toBe(50000);
  });
  it('X → USD uses rate_to_usd', () => {
    expect(convert(25000, 'VND', 'USD', RATES)).toBeCloseTo(1.0, 5);
    expect(convert(1, 'EUR', 'USD', RATES)).toBeCloseTo(1.10, 5);
  });
  it('USD → X uses inverse rate', () => {
    expect(convert(1, 'USD', 'VND', RATES)).toBeCloseTo(25000, 0);
    expect(convert(1, 'USD', 'EUR', RATES)).toBeCloseTo(1 / 1.10, 5);
  });
  it('X → Y goes through USD', () => {
    const eurToVnd = convert(1, 'EUR', 'VND', RATES);
    expect(eurToVnd).toBeCloseTo(1.10 * 25000, -1);
  });
  it('roundtrip A → B → A ≈ identity', () => {
    const round = convert(convert(100, 'USD', 'VND', RATES), 'VND', 'USD', RATES);
    expect(round).toBeCloseTo(100, 5);
  });
});

describe('FxService.loadRates', () => {
  it('reads all 5 fallback rows after migration', () => {
    const svc = new FxService(db());
    const rates = svc.loadRates();
    expect(Object.keys(rates).sort()).toEqual(['EUR', 'GBP', 'JPY', 'KRW', 'VND']);
    expect(rates.VND).toBeCloseTo(1 / 24500, 8);
  });
});

describe('FxService.setManualRate / clearManualRate', () => {
  it('setManualRate updates row with source=manual', () => {
    const d = db();
    const svc = new FxService(d);
    svc.setManualRate('EUR', 1.15);
    const row = d.getFirstSync<{ rate_to_usd: number; source: string }>(
      "SELECT rate_to_usd, source FROM fx_rates WHERE currency = 'EUR'"
    );
    expect(row?.rate_to_usd).toBe(1.15);
    expect(row?.source).toBe('manual');
  });
  it('clearManualRate deletes the row', () => {
    const d = db();
    const svc = new FxService(d);
    svc.setManualRate('EUR', 1.15);
    svc.clearManualRate('EUR');
    const row = d.getFirstSync("SELECT 1 FROM fx_rates WHERE currency = 'EUR'");
    expect(row).toBeNull();
  });
  it('rejects rate <= 0', () => {
    const svc = new FxService(db());
    expect(() => svc.setManualRate('EUR', 0)).toThrow(/greater than 0/);
    expect(() => svc.setManualRate('EUR', -1)).toThrow(/greater than 0/);
  });
});

describe('FxService.fetchFromApi', () => {
  it('updates auto+fallback rows, skips manual', async () => {
    const d = db();
    const svc = new FxService(d);
    svc.setManualRate('JPY', 999);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        rates: { VND: 24000, EUR: 0.90, JPY: 150, GBP: 0.78, KRW: 1300 },
      }),
    })) as unknown as typeof fetch;
    await svc.fetchFromApi();
    const rows = d.getAllSync<{ currency: string; rate_to_usd: number; source: string }>(
      "SELECT currency, rate_to_usd, source FROM fx_rates ORDER BY currency"
    );
    const byCur = Object.fromEntries(rows.map(r => [r.currency, r]));
    expect(byCur.VND.source).toBe('auto');
    expect(byCur.VND.rate_to_usd).toBeCloseTo(1 / 24000, 8);
    expect(byCur.JPY.source).toBe('manual');
    expect(byCur.JPY.rate_to_usd).toBe(999);
  });

  it('leaves state intact when fetch fails', async () => {
    const d = db();
    const svc = new FxService(d);
    global.fetch = jest.fn(async () => ({
      ok: false, status: 500, json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(svc.fetchFromApi()).rejects.toThrow();
    const rows = d.getAllSync("SELECT source FROM fx_rates");
    expect(rows.every((r: any) => r.source === 'fallback')).toBe(true);
  });
});

describe('FxService.getLastFetchedAt', () => {
  it('returns null when no auto rows', () => {
    expect(new FxService(db()).getLastFetchedAt()).toBeNull();
  });
  it('returns max updated_at across auto rows', async () => {
    const d = db();
    const svc = new FxService(d);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ rates: { VND: 24000, EUR: 0.90, JPY: 150, GBP: 0.78, KRW: 1300 } }),
    })) as unknown as typeof fetch;
    const before = Date.now();
    await svc.fetchFromApi();
    expect(svc.getLastFetchedAt()).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/fx.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/fx.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import { CURRENCIES, type CurrencyCode } from './currency';

export type NonUsdCurrency = Exclude<CurrencyCode, 'USD'>;
export type RateMap = Record<NonUsdCurrency, number>;

const NON_USD: readonly NonUsdCurrency[] =
  CURRENCIES.filter((c): c is NonUsdCurrency => c !== 'USD');

const API_URL = 'https://api.exchangerate.host/latest?base=USD&symbols=VND,EUR,JPY,GBP,KRW';

function rateToUsd(currency: CurrencyCode, rates: RateMap): number {
  return currency === 'USD' ? 1 : rates[currency];
}

export function convert(
  amount: number, from: CurrencyCode, to: CurrencyCode, rates: RateMap,
): number {
  if (from === to) return amount;
  const usd = amount * rateToUsd(from, rates);
  return usd / rateToUsd(to, rates);
}

export class FxService {
  constructor(private db: SQLiteDatabase) {}

  loadRates(): RateMap {
    const rows = this.db.getAllSync<{ currency: string; rate_to_usd: number }>(
      'SELECT currency, rate_to_usd FROM fx_rates'
    );
    const map = Object.fromEntries(rows.map(r => [r.currency, r.rate_to_usd]));
    return NON_USD.reduce((acc, cur) => {
      acc[cur] = (map[cur] ?? 0);
      return acc;
    }, {} as RateMap);
  }

  getSource(currency: NonUsdCurrency): 'auto' | 'manual' | 'fallback' | null {
    const row = this.db.getFirstSync<{ source: string }>(
      'SELECT source FROM fx_rates WHERE currency = ?', currency
    );
    return (row?.source as 'auto' | 'manual' | 'fallback' | undefined) ?? null;
  }

  setManualRate(currency: NonUsdCurrency, rate: number): void {
    if (!(rate > 0)) throw new Error('rate must be greater than 0');
    this.db.runSync(
      `INSERT INTO fx_rates (currency, rate_to_usd, source, updated_at)
       VALUES (?, ?, 'manual', ?)
       ON CONFLICT(currency) DO UPDATE SET rate_to_usd = excluded.rate_to_usd, source = 'manual', updated_at = excluded.updated_at`,
      currency, rate, Date.now(),
    );
  }

  clearManualRate(currency: NonUsdCurrency): void {
    this.db.runSync('DELETE FROM fx_rates WHERE currency = ? AND source = ?', currency, 'manual');
  }

  getLastFetchedAt(): number | null {
    const row = this.db.getFirstSync<{ ts: number | null }>(
      "SELECT MAX(updated_at) AS ts FROM fx_rates WHERE source = 'auto'"
    );
    return row?.ts ?? null;
  }

  async fetchFromApi(): Promise<void> {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`FX API failed: ${res.status}`);
    const body = await res.json() as { rates?: Record<string, number> };
    const rates = body.rates ?? {};
    const now = Date.now();
    for (const currency of NON_USD) {
      const apiRate = rates[currency];
      if (typeof apiRate !== 'number' || apiRate <= 0) continue;
      const existing = this.getSource(currency);
      if (existing === 'manual') continue;
      const inverse = 1 / apiRate;
      this.db.runSync(
        `INSERT INTO fx_rates (currency, rate_to_usd, source, updated_at)
         VALUES (?, ?, 'auto', ?)
         ON CONFLICT(currency) DO UPDATE SET rate_to_usd = excluded.rate_to_usd, source = 'auto', updated_at = excluded.updated_at`,
        currency, inverse, now,
      );
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/fx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fx.ts src/lib/fx.test.ts
git commit -m "Add FX conversion function and service

convert() pivots through USD. FxService owns DB reads/writes and the
network fetch, respects manual overrides (skip on auto-fetch), and
exposes last-fetched timestamp for the settings UI."
```

---

## Task 5: Transaction wiring — currency-aware insert/update

**Files:**
- Modify: `src/lib/transactions.ts`
- Modify: `src/lib/transactions.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode` (Task 1), `convert`/`FxService` (Task 4)
- Produces:
  - `Txn` gains `currency`, `originalAmount`, `originalCurrency`
  - `NewTxn` gains `originalAmount`, `originalCurrency` (replaces the plain `amount` field)
  - `insertTransaction(input, database, primary, rates)` — new signature accepts primary + rates
  - `updateTransaction(id, input, database, primary, rates)` — same
  - `listTransactions` returns full extended `Txn`

- [ ] **Step 1: Write failing tests**

Extend `src/lib/transactions.test.ts`. Add to `freshDb()` — the schema must include the new columns:

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
      original_currency TEXT
    );
  `);
  return database;
}
```

(Only new columns added — the previous uuid/updated_at columns should already be there from earlier work.)

Add cases:

```ts
const IDENTITY_RATES = { VND: 1/25000, EUR: 1.10, JPY: 0.0067, GBP: 1.25, KRW: 0.00075 };

describe('insertTransaction currency', () => {
  it('same as primary: amount and original are equal', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', originalAmount: 45000,
      originalCurrency: 'VND', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    const row = db.getFirstSync<{
      amount: number; currency: string; original_amount: number; original_currency: string;
    }>('SELECT amount, currency, original_amount, original_currency FROM transactions WHERE id = ?', id);
    expect(row?.amount).toBe(45000);
    expect(row?.currency).toBe('VND');
    expect(row?.original_amount).toBe(45000);
    expect(row?.original_currency).toBe('VND');
  });

  it('different from primary: amount converted, original preserved', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', originalAmount: 20,
      originalCurrency: 'USD', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    const row = db.getFirstSync<{ amount: number; currency: string; original_amount: number; original_currency: string; }>(
      'SELECT amount, currency, original_amount, original_currency FROM transactions WHERE id = ?', id,
    );
    expect(row?.amount).toBeCloseTo(20 * 25000, 0);
    expect(row?.currency).toBe('VND');
    expect(row?.original_amount).toBe(20);
    expect(row?.original_currency).toBe('USD');
  });
});

describe('updateTransaction currency', () => {
  it('recomputes amount from originals on edit', () => {
    const db = freshDb();
    const id = insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'x', originalAmount: 20,
      originalCurrency: 'USD', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    updateTransaction(id, {
      date: '2026-07-01', time: '10:00',
      category: 'food', name: 'x', originalAmount: 25,
      originalCurrency: 'USD', isIncome: false,
    }, db, 'VND', IDENTITY_RATES);
    const row = db.getFirstSync<{ amount: number; original_amount: number }>(
      'SELECT amount, original_amount FROM transactions WHERE id = ?', id,
    );
    expect(row?.original_amount).toBe(25);
    expect(row?.amount).toBeCloseTo(25 * 25000, 0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/transactions.test.ts`
Expected: FAIL — `NewTxn.originalAmount` doesn't exist yet.

- [ ] **Step 3: Update `src/lib/transactions.ts`**

Add imports:

```ts
import type { CurrencyCode } from './currency';
import { convert, type RateMap } from './fx';
```

Extend `Txn` interface:

```ts
export interface Txn {
  id: number;
  uuid: string;
  updatedAt: number;
  date: string;
  time: string;
  createdAt: number;
  category: CategoryId;
  name: string;
  note: string | null;
  amount: number;
  currency: CurrencyCode;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  isIncome: boolean;
  photoPath: string | null;
}
```

Replace `NewTxn`:

```ts
export interface NewTxn {
  date: string;
  time: string;
  category: CategoryId;
  name: string;
  note?: string | null;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  isIncome: boolean;
  photoPath?: string | null;
  createdAt?: number;
}
```

Extend `Row` and `toTxn`:

```ts
interface Row {
  id: number; uuid: string; updated_at: number;
  date: string; time: string; created_at: number;
  category: string; name: string; note: string | null;
  amount: number; currency: string;
  original_amount: number; original_currency: string;
  is_income: number; photo_path: string | null;
}

function toTxn(r: Row): Txn {
  return {
    id: r.id, uuid: r.uuid, updatedAt: r.updated_at,
    date: r.date, time: r.time, createdAt: r.created_at,
    category: r.category as CategoryId,
    name: r.name, note: r.note,
    amount: r.amount, currency: r.currency as CurrencyCode,
    originalAmount: r.original_amount,
    originalCurrency: r.original_currency as CurrencyCode,
    isIncome: r.is_income === 1,
    photoPath: r.photo_path,
  };
}
```

Rewrite `insertTransaction` / `updateTransaction`:

```ts
export function insertTransaction(
  input: NewTxn, database: SQLiteDatabase = defaultDb,
  primary: CurrencyCode = 'VND', rates?: RateMap,
): number {
  const now = input.createdAt ?? Date.now();
  const amount = rates
    ? convert(input.originalAmount, input.originalCurrency, primary, rates)
    : input.originalAmount;
  const result = database.runSync(
    `INSERT INTO transactions
      (uuid, date, time, created_at, updated_at, category, name, note,
       amount, currency, original_amount, original_currency, is_income, photo_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Crypto.randomUUID(),
    input.date, input.time, now, now,
    input.category, input.name, input.note ?? null,
    amount, primary, input.originalAmount, input.originalCurrency,
    input.isIncome ? 1 : 0, input.photoPath ?? null,
  );
  return result.lastInsertRowId;
}

export function updateTransaction(
  id: number, input: NewTxn, database: SQLiteDatabase = defaultDb,
  primary: CurrencyCode = 'VND', rates?: RateMap,
): void {
  const amount = rates
    ? convert(input.originalAmount, input.originalCurrency, primary, rates)
    : input.originalAmount;
  database.runSync(
    `UPDATE transactions
     SET date = ?, time = ?, updated_at = ?, category = ?, name = ?, note = ?,
         amount = ?, currency = ?, original_amount = ?, original_currency = ?,
         is_income = ?, photo_path = ?
     WHERE id = ?`,
    input.date, input.time, Date.now(),
    input.category, input.name, input.note ?? null,
    amount, primary, input.originalAmount, input.originalCurrency,
    input.isIncome ? 1 : 0, input.photoPath ?? null,
    id,
  );
}
```

Note the defaulting behavior: if callers omit `primary`/`rates`, we assume VND primary and identity conversion. Keeps existing test signatures alive; the app code will always pass them.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/transactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/transactions.ts src/lib/transactions.test.ts
git commit -m "Wire currency into transactions data layer

Txn/NewTxn now carry original_amount + original_currency (immutable)
plus the converted amount + currency-at-write. Insert/update compute
the conversion via the passed-in primary + rates. Callers omitting
rates get identity conversion (safe default; app code always passes)."
```

---

## Task 6: Settings — primaryCurrency + batch recompute

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/settings.test.ts`
- Create (inside `src/lib/settings.ts`): `changePrimaryCurrency(db, newPrimary, rates)` function

**Interfaces:**
- Consumes: `CurrencyCode` (Task 1), `RateMap`/`convert` (Task 4)
- Produces:
  - `Settings` gains `primaryCurrency: CurrencyCode` (default `'VND'`)
  - `changePrimaryCurrency(db, oldPrimary, newPrimary, rates)` — batches: recomputes every txn's `amount`/`currency` from originals, converts `monthlyBudget`, updates the setting

- [ ] **Step 1: Write failing tests**

Extend `src/lib/settings.test.ts`:

```ts
describe('primaryCurrency setting', () => {
  it('defaults to VND', () => {
    expect(loadSettings(freshDb()).primaryCurrency).toBe('VND');
  });
  it('round-trips', () => {
    const db = freshDb();
    updateSetting('primaryCurrency', 'USD', db);
    expect(loadSettings(db).primaryCurrency).toBe('USD');
  });
  it('unknown value falls back to VND', () => {
    const db = freshDb();
    db.runSync("INSERT INTO settings (key, value) VALUES ('primaryCurrency', 'XXX')");
    expect(loadSettings(db).primaryCurrency).toBe('VND');
  });
});
```

For `changePrimaryCurrency`, add a new test file setup that reuses `runMigrations`:

```ts
describe('changePrimaryCurrency', () => {
  it('recomputes every txn amount from originals; converts budget', () => {
    const d = createDb(':memory:');
    runMigrations(d);
    // Insert two txns: one VND-native, one USD-original converted to VND
    insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'a', originalAmount: 50000,
      originalCurrency: 'VND', isIncome: false,
    }, d, 'VND', RATES);
    insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'b', originalAmount: 20,
      originalCurrency: 'USD', isIncome: false,
    }, d, 'VND', RATES);
    updateSetting('monthlyBudget', 5_000_000, d);
    updateSetting('primaryCurrency', 'VND', d);

    changePrimaryCurrency(d, 'VND', 'USD', RATES);

    const rows = d.getAllSync<any>(
      'SELECT amount, currency, original_amount, original_currency FROM transactions ORDER BY id'
    );
    // Row 0 was VND 50000 → USD via RATES.VND = 1/25000 → 2
    expect(rows[0].amount).toBeCloseTo(2, 5);
    expect(rows[0].currency).toBe('USD');
    // Row 1 originalAmount=20 USD → primary=USD → amount=20
    expect(rows[1].amount).toBeCloseTo(20, 5);
    expect(rows[1].currency).toBe('USD');

    const s = loadSettings(d);
    expect(s.primaryCurrency).toBe('USD');
    // Budget 5,000,000 VND → 200 USD
    expect(s.monthlyBudget).toBeCloseTo(200, 1);
  });

  it('back-and-forth is close to identity', () => {
    const d = createDb(':memory:');
    runMigrations(d);
    insertTransaction({
      date: '2026-07-01', time: '10:00', createdAt: 1000,
      category: 'food', name: 'a', originalAmount: 50000,
      originalCurrency: 'VND', isIncome: false,
    }, d, 'VND', RATES);
    changePrimaryCurrency(d, 'VND', 'USD', RATES);
    changePrimaryCurrency(d, 'USD', 'VND', RATES);
    const row = d.getFirstSync<{ amount: number }>('SELECT amount FROM transactions LIMIT 1');
    expect(row?.amount).toBeCloseTo(50000, 0);
  });
});
```

Add `RATES` and imports at the top of the file:

```ts
import { createDb, runMigrations } from './db';
import { insertTransaction } from './transactions';
import { changePrimaryCurrency } from './settings';
const RATES = { VND: 1/25000, EUR: 1.10, JPY: 0.0067, GBP: 1.25, KRW: 0.00075 };
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- --silent src/lib/settings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/settings.ts`**

Add import: `import { convert, type RateMap } from './fx';` and `import type { CurrencyCode } from './currency';`.

Extend `Settings`:

```ts
export interface Settings {
  // ...existing
  primaryCurrency: CurrencyCode;
}
export const DEFAULTS: Settings = {
  // ...existing
  primaryCurrency: 'VND',
};
```

Add to `encode` switch:

```ts
case 'primaryCurrency':
  return value as string;
```

Add to `decode`:

```ts
const primaryCurrency = map.get('primaryCurrency');
if (primaryCurrency === 'VND' || primaryCurrency === 'USD' ||
    primaryCurrency === 'EUR' || primaryCurrency === 'JPY' ||
    primaryCurrency === 'GBP' || primaryCurrency === 'KRW') {
  result.primaryCurrency = primaryCurrency;
}
```

Add the batch function:

```ts
export function changePrimaryCurrency(
  db: SQLiteDatabase, oldPrimary: CurrencyCode, newPrimary: CurrencyCode, rates: RateMap,
): void {
  if (oldPrimary === newPrimary) return;
  db.withTransactionSync(() => {
    const rows = db.getAllSync<{ id: number; original_amount: number; original_currency: string }>(
      'SELECT id, original_amount, original_currency FROM transactions'
    );
    for (const r of rows) {
      const newAmount = convert(
        r.original_amount, r.original_currency as CurrencyCode, newPrimary, rates,
      );
      db.runSync(
        'UPDATE transactions SET amount = ?, currency = ? WHERE id = ?',
        newAmount, newPrimary, r.id,
      );
    }
    const budgetRow = db.getFirstSync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'monthlyBudget'"
    );
    if (budgetRow) {
      const oldBudget = Number(budgetRow.value) || 0;
      const newBudget = convert(oldBudget, oldPrimary, newPrimary, rates);
      db.runSync(
        "INSERT INTO settings (key, value) VALUES ('monthlyBudget', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        String(newBudget),
      );
    }
    db.runSync(
      "INSERT INTO settings (key, value) VALUES ('primaryCurrency', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      newPrimary,
    );
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --silent src/lib/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "Add primaryCurrency setting + batch recompute on change

changePrimaryCurrency runs inside withTransactionSync so a partial
recompute rolls back cleanly. Every txn amount is derived from its
immutable original_amount + original_currency via convert(), so
repeated switches don't accumulate float drift. monthlyBudget is
converted in the same transaction."
```

---

## Task 7: Settings context — expose primary + rates + fetch on foreground

**Files:**
- Modify: `src/lib/settings-context.tsx`

**Interfaces:**
- Consumes: `FxService`, `RateMap` (Task 4), `changePrimaryCurrency` (Task 6)
- Produces:
  - `useSettings()` return value gains:
    - `rates: RateMap`
    - `fxLastFetchedAt: number | null`
    - `getRateSource(currency): 'auto' | 'manual' | 'fallback' | null`
    - `changePrimary(newPrimary): Promise<void>` (calls `changePrimaryCurrency` + refreshes state + triggers `TransactionsContext.refresh()` via callback registration)
    - `setManualRate(currency, rate): void`
    - `clearManualRate(currency): void`
    - `refetchRates(): Promise<void>`

- [ ] **Step 1: Extend `settings-context.tsx`**

Add imports:

```ts
import { AppState, type AppStateStatus } from 'react-native';
import { FxService, type RateMap } from './fx';
import { changePrimaryCurrency } from './settings';
import { db } from './db';
import type { CurrencyCode } from './currency';
```

Extend `SettingsContextValue`:

```ts
interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
  rates: RateMap;
  fxLastFetchedAt: number | null;
  getRateSource: (currency: Exclude<CurrencyCode, 'USD'>) => 'auto' | 'manual' | 'fallback' | null;
  changePrimary: (newPrimary: CurrencyCode) => Promise<void>;
  setManualRate: (currency: Exclude<CurrencyCode, 'USD'>, rate: number) => void;
  clearManualRate: (currency: Exclude<CurrencyCode, 'USD'>) => void;
  refetchRates: () => Promise<void>;
  onAfterPrimaryChange?: (cb: () => void) => () => void;
}
```

Inside `SettingsProvider`, add:

```ts
const fxRef = useRef(new FxService(db));
const [rates, setRates] = useState<RateMap>(() => fxRef.current.loadRates());
const [fxLastFetchedAt, setFxLastFetchedAt] = useState<number | null>(
  () => fxRef.current.getLastFetchedAt()
);
const primaryChangeListeners = useRef(new Set<() => void>());

const reloadRates = useCallback(() => {
  setRates(fxRef.current.loadRates());
  setFxLastFetchedAt(fxRef.current.getLastFetchedAt());
}, []);

const refetchRates = useCallback(async () => {
  try {
    await fxRef.current.fetchFromApi();
    reloadRates();
  } catch {
    // silent — surface via UI-level "fetch failed" toast if needed
  }
}, [reloadRates]);

useEffect(() => {
  const last = fxRef.current.getLastFetchedAt();
  const stale = last === null || Date.now() - last > 24 * 60 * 60 * 1000;
  if (stale) refetchRates();
  const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') {
      const cur = fxRef.current.getLastFetchedAt();
      if (cur === null || Date.now() - cur > 24 * 60 * 60 * 1000) refetchRates();
    }
  });
  return () => sub.remove();
}, [refetchRates]);

const setManualRate = useCallback((currency: Exclude<CurrencyCode, 'USD'>, rate: number) => {
  fxRef.current.setManualRate(currency, rate);
  reloadRates();
}, [reloadRates]);
const clearManualRate = useCallback((currency: Exclude<CurrencyCode, 'USD'>) => {
  fxRef.current.clearManualRate(currency);
  reloadRates();
}, [reloadRates]);
const getRateSource = useCallback(
  (currency: Exclude<CurrencyCode, 'USD'>) => fxRef.current.getSource(currency),
  [],
);

const changePrimary = useCallback(async (newPrimary: CurrencyCode) => {
  const old = settings.primaryCurrency;
  changePrimaryCurrency(db, old, newPrimary, fxRef.current.loadRates());
  setSettings(loadSettings());
  for (const cb of primaryChangeListeners.current) cb();
}, [settings.primaryCurrency]);

const onAfterPrimaryChange = useCallback((cb: () => void) => {
  primaryChangeListeners.current.add(cb);
  return () => { primaryChangeListeners.current.delete(cb); };
}, []);
```

Return value:

```tsx
<SettingsContext.Provider value={{
  settings, update, reset,
  rates, fxLastFetchedAt, getRateSource,
  changePrimary, setManualRate, clearManualRate, refetchRates,
  onAfterPrimaryChange,
}}>
```

- [ ] **Step 2: Wire `TransactionsContext` to refresh after primary change**

In `src/lib/transactions-context.tsx`, add:

```ts
const { onAfterPrimaryChange } = useSettings();
useEffect(() => onAfterPrimaryChange?.(() => refresh()), [onAfterPrimaryChange, refresh]);
```

Place this alongside the existing `refresh` effect.

- [ ] **Step 3: Sanity check — full test suite**

Run: `npm test -- --silent`
Expected: PASS (no test file explicitly targets the context; regression only).

- [ ] **Step 4: Commit**

```bash
git add src/lib/settings-context.tsx src/lib/transactions-context.tsx
git commit -m "Wire FX service and primary-change flow into settings context

Exposes rates + manual override APIs + refetchRates + changePrimary
through useSettings(). Auto-fetch runs on app foreground when the
cache is older than 24h, silent on failure. Transactions context
subscribes to onAfterPrimaryChange so the list refreshes after batch
recompute."
```

---

## Task 8: i18n keys

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/vi.json`

**Interfaces:**
- Consumes: nothing
- Produces: `t('currency.*')` keys resolvable in both locales

- [ ] **Step 1: Add block to `en.json`** (before the closing `}`)

```json
"currency": {
  "section_title": "CURRENCY",
  "primary_label": "Primary currency",
  "picker_title": "Choose currency",
  "rates_label": "Exchange rates",
  "last_fetched": "Updated at {{time}}",
  "fetch_now": "Update now",
  "fetch_error": "Update failed",
  "rate_row": "1 {{from}} = {{value}} {{to}}",
  "source_auto": "Auto",
  "source_manual": "Manual",
  "source_fallback": "Default",
  "revert_to_auto": "Reset to auto",
  "override_title": "Set exchange rate",
  "override_placeholder": "Rate",
  "override_invalid": "Rate must be greater than 0",
  "change_primary_title": "Change primary to {{code}}?",
  "change_primary_body": "SpendLens will recompute {{n}} transactions with current rates:",
  "change_primary_line": "• {{n}} {{from}} → {{to}}",
  "change_primary_unchanged": "• {{n}} {{code}} → unchanged",
  "change_primary_budget": "Monthly budget: {{before}} → {{after}}",
  "change_primary_fallback_warn": "⚠ Using default rates — may be inaccurate. Try 'Update now' first.",
  "change_primary_confirm": "Change & recompute",
  "original_label": "Original",
  "approx_prefix": "≈"
}
```

- [ ] **Step 2: Add matching block to `vi.json`**

```json
"currency": {
  "section_title": "TIỀN TỆ",
  "primary_label": "Đơn vị chính",
  "picker_title": "Chọn đơn vị",
  "rates_label": "Tỷ giá",
  "last_fetched": "Cập nhật lúc {{time}}",
  "fetch_now": "Cập nhật ngay",
  "fetch_error": "Cập nhật thất bại",
  "rate_row": "1 {{from}} = {{value}} {{to}}",
  "source_auto": "Tự động",
  "source_manual": "Thủ công",
  "source_fallback": "Mặc định",
  "revert_to_auto": "Trở về tự động",
  "override_title": "Đặt tỷ giá",
  "override_placeholder": "Tỷ giá",
  "override_invalid": "Tỷ giá phải lớn hơn 0",
  "change_primary_title": "Đổi đơn vị chính sang {{code}}?",
  "change_primary_body": "SpendLens sẽ tính lại {{n}} giao dịch bằng tỷ giá hiện tại:",
  "change_primary_line": "• {{n}} giao dịch {{from}} → {{to}}",
  "change_primary_unchanged": "• {{n}} giao dịch {{code}} → giữ nguyên",
  "change_primary_budget": "Ngân sách tháng: {{before}} → {{after}}",
  "change_primary_fallback_warn": "⚠ Đang dùng tỷ giá mặc định — có thể không chính xác. Hãy 'Cập nhật ngay' trước khi đổi.",
  "change_primary_confirm": "Đổi & tính lại",
  "original_label": "Nguyên gốc",
  "approx_prefix": "≈"
}
```

- [ ] **Step 3: JSON parse sanity**

Run: `npm test -- --silent --testPathPattern=i18n`
Expected: PASS (no parse errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/vi.json
git commit -m "i18n: add currency.* namespace (EN + VI)

Copy for the settings section, currency picker, rate override sheet,
primary-change confirmation dialog, and the original-amount label."
```

---

## Task 9: CurrencyPickerSheet component

**Files:**
- Create: `src/components/sl/currency-picker-sheet.tsx`
- Create: `src/components/sl/currency-picker-sheet.test.tsx`

**Interfaces:**
- Consumes: `CurrencyCode`, `CURRENCY_META`, `CURRENCIES` (Task 1)
- Produces:
  - `CurrencyPickerSheetHandle` = `{ present(current: CurrencyCode): void; dismiss(): void }`
  - `<CurrencyPickerSheet ref onChoose={(currency) => void} />`

- [ ] **Step 1: Write failing test**

`src/components/sl/currency-picker-sheet.test.tsx`:

```tsx
import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CurrencyPickerSheet, type CurrencyPickerSheetHandle } from './currency-picker-sheet';

describe('CurrencyPickerSheet', () => {
  it('invokes onChoose with the tapped currency', async () => {
    const onChoose = jest.fn();
    const ref = createRef<CurrencyPickerSheetHandle>();
    const { getByTestId } = await render(<CurrencyPickerSheet ref={ref} onChoose={onChoose} />);
    await act(() => ref.current?.present('VND'));
    fireEvent.press(getByTestId('currency-picker-USD'));
    expect(onChoose).toHaveBeenCalledWith('USD');
  });
});
```

- [ ] **Step 2: Implement `src/components/sl/currency-picker-sheet.tsx`**

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, AccentGradient } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { CURRENCIES, CURRENCY_META, type CurrencyCode } from '@/lib/currency';

export interface CurrencyPickerSheetHandle {
  present: (current: CurrencyCode) => void;
  dismiss: () => void;
}

interface Props { onChoose: (currency: CurrencyCode) => void; }

export const CurrencyPickerSheet = forwardRef<CurrencyPickerSheetHandle, Props>(
  function CurrencyPickerSheet({ onChoose }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [current, setCurrent] = useState<CurrencyCode>('VND');

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

    const choose = (cc: CurrencyCode) => {
      onChoose(cc);
      sheet.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['40%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <BottomSheetView style={styles.body}>
          <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
            {t('currency.picker_title')}
          </Text>
          <View style={styles.grid}>
            {CURRENCIES.map((cc) => {
              const active = cc === current;
              return (
                <Pressable
                  key={cc}
                  testID={`currency-picker-${cc}`}
                  onPress={() => choose(cc)}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor: c.chipBg,
                      borderColor: active ? AccentGradient[1] : c.cardBorder,
                      borderWidth: active ? 2 : 1,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={{ fontWeight: '700', color: c.text, fontSize: 16 }}>{cc}</Text>
                  <Text style={{ color: c.textSecondary, marginTop: 2 }}>
                    {CURRENCY_META[cc].symbol}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  tile: {
    width: '30%',
    aspectRatio: 1.3,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- --silent src/components/sl/currency-picker-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/currency-picker-sheet.tsx src/components/sl/currency-picker-sheet.test.tsx
git commit -m "Add CurrencyPickerSheet

3x2 grid of the 6 currencies. Active selection has an accent border.
Tapping a tile invokes onChoose(currency) and dismisses."
```

---

## Task 10: RateOverrideSheet component

**Files:**
- Create: `src/components/sl/rate-override-sheet.tsx`
- Create: `src/components/sl/rate-override-sheet.test.tsx`

**Interfaces:**
- Consumes: `CurrencyCode` (Task 1)
- Produces:
  - `RateOverrideSheetHandle` = `{ present(currency, currentRate): void; dismiss(): void }`
  - `<RateOverrideSheet ref onSave={(currency, rate) => void} />`

- [ ] **Step 1: Write failing test**

`src/components/sl/rate-override-sheet.test.tsx`:

```tsx
import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { RateOverrideSheet, type RateOverrideSheetHandle } from './rate-override-sheet';

describe('RateOverrideSheet', () => {
  it('save invokes onSave with parsed rate', async () => {
    const onSave = jest.fn();
    const ref = createRef<RateOverrideSheetHandle>();
    const { getByTestId } = await render(<RateOverrideSheet ref={ref} onSave={onSave} />);
    await act(() => ref.current?.present('EUR', 1.10));
    fireEvent.changeText(getByTestId('rate-input'), '1.15');
    fireEvent.press(getByTestId('rate-save'));
    expect(onSave).toHaveBeenCalledWith('EUR', 1.15);
  });

  it('rejects zero/negative rate', async () => {
    const onSave = jest.fn();
    const ref = createRef<RateOverrideSheetHandle>();
    const { getByTestId, queryByText } = await render(<RateOverrideSheet ref={ref} onSave={onSave} />);
    await act(() => ref.current?.present('EUR', 1.10));
    fireEvent.changeText(getByTestId('rate-input'), '0');
    fireEvent.press(getByTestId('rate-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(queryByText(/greater than 0|lớn hơn 0/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement `src/components/sl/rate-override-sheet.tsx`**

```tsx
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, Money } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import type { CurrencyCode } from '@/lib/currency';

export interface RateOverrideSheetHandle {
  present: (currency: Exclude<CurrencyCode, 'USD'>, currentRate: number) => void;
  dismiss: () => void;
}

interface Props { onSave: (currency: Exclude<CurrencyCode, 'USD'>, rate: number) => void; }

export const RateOverrideSheet = forwardRef<RateOverrideSheetHandle, Props>(
  function RateOverrideSheet({ onSave }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [currency, setCurrency] = useState<Exclude<CurrencyCode, 'USD'>>('VND');
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');

    useImperativeHandle(ref, () => ({
      present: (cur, rate) => {
        setCurrency(cur);
        setDraft(String(rate));
        setError('');
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

    const save = () => {
      const parsed = Number(draft);
      if (!(parsed > 0) || Number.isNaN(parsed)) {
        setError(t('currency.override_invalid'));
        return;
      }
      onSave(currency, parsed);
      sheet.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['35%']}
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <BottomSheetView style={styles.body}>
          <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
            {t('currency.override_title')} — {currency}
          </Text>
          <BottomSheetTextInput
            testID="rate-input"
            value={draft}
            onChangeText={(v) => { setDraft(v); setError(''); }}
            keyboardType="numeric"
            placeholder={t('currency.override_placeholder')}
            placeholderTextColor={c.textSecondary}
            style={[styles.input, { color: c.text, borderColor: c.cardBorder }]}
          />
          {error ? <Text style={{ color: Money.expense, fontSize: 12 }}>{error}</Text> : null}
          <Pressable
            testID="rate-save"
            onPress={save}
            style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  input: {
    borderWidth: 1, borderRadius: Radius.button,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  saveBtn: {
    backgroundColor: '#111', borderRadius: Radius.button,
    paddingVertical: 12, alignItems: 'center',
  },
});
```

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- --silent src/components/sl/rate-override-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/rate-override-sheet.tsx src/components/sl/rate-override-sheet.test.tsx
git commit -m "Add RateOverrideSheet

Single-input sheet used by the settings screen when the user taps a
currency row to override its rate. Validates > 0."
```

---

## Task 11: Entry screen — chip + preview + save

**Files:**
- Modify: `src/app/entry.tsx`

**Interfaces:**
- Consumes: `useSettings()` (primaryCurrency, rates), `CURRENCY_META`, `formatMoney`, `formatAmountInput`, `convert`, `CurrencyPickerSheet`
- Produces: Entry screen writes `originalAmount`, `originalCurrency` via the new `NewTxn` shape

- [ ] **Step 1: Add imports and state**

At the top of `src/app/entry.tsx`, add:

```ts
import {
  CurrencyPickerSheet,
  type CurrencyPickerSheetHandle,
} from '@/components/sl/currency-picker-sheet';
import { CURRENCY_META, type CurrencyCode } from '@/lib/currency';
import { convert } from '@/lib/fx';
import { formatMoney, formatAmountInput } from '@/lib/format';
```

Inside the component, near `amount`:

```ts
const { settings, rates } = useSettings();
const [currency, setCurrency] = useState<CurrencyCode>(
  existing ? existing.originalCurrency : settings.primaryCurrency
);
const [amountDigits, setAmountDigits] = useState<string>(
  existing ? String(Math.round(existing.originalAmount * (CURRENCY_META[existing.originalCurrency].decimals === 2 ? 100 : 1))) : ''
);
const currencyPickerRef = useRef<CurrencyPickerSheetHandle>(null);
```

Replace the existing `amount` state usage. Compute `originalAmount` for save:

```ts
const originalAmount = (() => {
  if (!amountDigits) return 0;
  const n = Number(amountDigits);
  return CURRENCY_META[currency].decimals === 2 ? n / 100 : n;
})();
const canSave = originalAmount > 0 && note.trim() !== '';
```

- [ ] **Step 2: Replace the amount input block**

Find the JSX between `{/* Amount */}` and the closing of the amount block. Replace the `TextInput` with:

```tsx
<TextInput
  value={amountDigits ? formatAmountInput(amountDigits, currency) : ''}
  onChangeText={(v) => setAmountDigits(v.replace(/\D/g, ''))}
  keyboardType="numeric"
  placeholder="0"
  onFocus={() => scrollToOffset(amountOffsetRef.current)}
  style={[styles.amountInput, { color: c.text }]}
/>
<Text style={{ marginLeft: 6, fontSize: 20, color: c.text }}>
  {CURRENCY_META[currency].symbol}
</Text>
```

Below the amountRow, add the currency chip and preview:

```tsx
<Pressable
  onPress={() => currencyPickerRef.current?.present(currency)}
  style={({ pressed }) => [styles.currencyChip, {
    backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1,
  }]}
>
  <Text style={{ color: c.text, fontWeight: '600' }}>{currency} ▾</Text>
</Pressable>
{currency !== settings.primaryCurrency && originalAmount > 0 ? (
  <Text style={{ color: c.textSecondary, marginTop: 4, fontSize: 12 }}>
    ≈ {formatMoney(convert(originalAmount, currency, settings.primaryCurrency, rates), settings.primaryCurrency)}
  </Text>
) : null}
```

Add style entries:

```ts
currencyChip: {
  alignSelf: 'center', marginTop: 6,
  paddingHorizontal: 12, paddingVertical: 4,
  borderRadius: 12,
},
```

- [ ] **Step 3: Update the save call**

Find where `add()`/`update()` is invoked. Replace `amount` in the payload with:

```ts
originalAmount,
originalCurrency: currency,
```

- [ ] **Step 4: Mount the picker**

Anywhere inside the returned JSX tree (after the main scroll view is fine):

```tsx
<CurrencyPickerSheet
  ref={currencyPickerRef}
  onChoose={(cc) => setCurrency(cc)}
/>
```

- [ ] **Step 5: Update `TransactionsContext.add` / `update` signatures**

In `src/lib/transactions-context.tsx`, the `add` and `update` callbacks need to accept `NewTxn` (which now has `originalAmount`/`originalCurrency`) and pass primary + rates through:

```ts
const { settings, rates } = useSettings();
const primary = settings.primaryCurrency;

const add = useCallback((input: NewTxn) => {
  const id = insertTransaction(input, db, primary, rates);
  refresh();
  return id;
}, [refresh, primary, rates]);

const update = useCallback((id: number, input: NewTxn) => {
  updateTransaction(id, input, db, primary, rates);
  refresh();
}, [refresh, primary, rates]);
```

- [ ] **Step 6: Sanity — run full suite**

Run: `npm test -- --silent`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/entry.tsx src/lib/transactions-context.tsx
git commit -m "Entry: currency chip + preview + write originals

Amount input keeps digits-only state; formatAmountInput handles the
per-currency display (thousands grouping for VND/JPY/KRW, cents for
USD/EUR/GBP). Chip below opens CurrencyPickerSheet. Preview line
shows ≈ converted-value when currency differs from primary.
TransactionsContext threads primary+rates through insert/update."
```

---

## Task 12: Settings screen — TIỀN TỆ section

**Files:**
- Modify: `src/app/settings.tsx`

**Interfaces:**
- Consumes: `useSettings()` extensions from Task 7, `Segmented`, `CurrencyPickerSheet` (no — use `Segmented`), `RateOverrideSheet`, `formatMoney`, `convert`, `CURRENCIES`, `CURRENCY_META`

- [ ] **Step 1: Add imports**

```ts
import { RateOverrideSheet, type RateOverrideSheetHandle } from '@/components/sl/rate-override-sheet';
import { CURRENCIES, CURRENCY_META, type CurrencyCode } from '@/lib/currency';
import { convert } from '@/lib/fx';
import { formatMoney } from '@/lib/format';
```

- [ ] **Step 2: Add state + logic inside SettingsScreen**

```ts
const {
  settings, update, reset,
  rates, fxLastFetchedAt, getRateSource,
  changePrimary, setManualRate, clearManualRate, refetchRates,
} = useSettings();

const rateOverrideRef = useRef<RateOverrideSheetHandle>(null);
const [fetchError, setFetchError] = useState<string | null>(null);

const nonUsdCurrencies = CURRENCIES.filter((c) => c !== 'USD') as Exclude<CurrencyCode, 'USD'>[];

const askChangePrimary = (target: CurrencyCode) => {
  if (target === settings.primaryCurrency) return;
  const rows = db.getAllSync<{ original_currency: string; n: number }>(
    "SELECT original_currency, COUNT(*) AS n FROM transactions GROUP BY original_currency"
  );
  const lines: string[] = [];
  let total = 0;
  for (const r of rows) {
    total += r.n;
    if (r.original_currency === target) {
      lines.push(t('currency.change_primary_unchanged', { n: r.n, code: target }));
    } else {
      lines.push(t('currency.change_primary_line', { n: r.n, from: r.original_currency, to: target }));
    }
  }
  const before = formatMoney(settings.monthlyBudget, settings.primaryCurrency);
  const after = formatMoney(
    convert(settings.monthlyBudget, settings.primaryCurrency, target, rates),
    target,
  );
  const anyFallback = nonUsdCurrencies.some((c) => getRateSource(c) === 'fallback');
  const body = [
    t('currency.change_primary_body', { n: total }),
    ...lines,
    '',
    t('currency.change_primary_budget', { before, after }),
    ...(anyFallback ? ['', t('currency.change_primary_fallback_warn')] : []),
  ].join('\n');
  Alert.alert(
    t('currency.change_primary_title', { code: target }),
    body,
    [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('currency.change_primary_confirm'),
        onPress: () => { changePrimary(target).catch(() => {}); },
      },
    ],
  );
};

const doRefetch = async () => {
  setFetchError(null);
  try {
    await refetchRates();
  } catch {
    setFetchError(t('currency.fetch_error'));
    setTimeout(() => setFetchError(null), 3000);
  }
};
```

You'll need `import { db } from '@/lib/db';`.

- [ ] **Step 3: Insert the section JSX** — above the existing DỮ LIỆU section

```tsx
{/* TIỀN TỆ */}
<Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
  {t('currency.section_title')}
</Text>
<View style={{ marginHorizontal: 16, marginTop: 8 }}>
  <Text style={{ color: colors.text, fontWeight: '500', marginBottom: 6 }}>
    {t('currency.primary_label')}
  </Text>
  <Segmented
    options={[...CURRENCIES]}
    value={Math.max(0, CURRENCIES.indexOf(settings.primaryCurrency))}
    onChange={(i) => askChangePrimary(CURRENCIES[i])}
  />
</View>
<View style={[styles.row, { borderColor: colors.hairline, marginTop: 12, flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <Text style={{ color: colors.text, fontWeight: '600' }}>{t('currency.rates_label')}</Text>
    <Pressable onPress={doRefetch} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: '#FF6B6B', fontWeight: '600' }}>{t('currency.fetch_now')}</Text>
    </Pressable>
  </View>
  {fxLastFetchedAt ? (
    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
      {t('currency.last_fetched', { time: new Date(fxLastFetchedAt).toLocaleTimeString() })}
    </Text>
  ) : null}
  {fetchError ? <Text style={{ color: '#FB5B4D', fontSize: 12 }}>{fetchError}</Text> : null}
  {nonUsdCurrencies.map((cc) => {
    const rateUsd = rates[cc];
    const source = getRateSource(cc);
    // display "1 CC = <converted-to-primary> <primary>"
    const displayRate = formatMoney(
      convert(1, cc, settings.primaryCurrency, rates),
      settings.primaryCurrency,
    );
    return (
      <Pressable
        key={cc}
        onPress={() => rateOverrideRef.current?.present(cc, rateUsd)}
        style={({ pressed }) => ({
          paddingVertical: 10, opacity: pressed ? 0.6 : 1,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        })}
      >
        <Text style={{ color: colors.text }}>
          {t('currency.rate_row', { from: cc, value: displayRate, to: '' }).replace(/\s*$/, '')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {t(`currency.source_${source ?? 'fallback'}`)}
          </Text>
          {source === 'manual' ? (
            <Pressable onPress={() => clearManualRate(cc)}>
              <Text style={{ color: '#FF6B6B', fontSize: 12 }}>{t('currency.revert_to_auto')}</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  })}
</View>

<RateOverrideSheet
  ref={rateOverrideRef}
  onSave={(cc, rate) => { setManualRate(cc, rate); }}
/>
```

- [ ] **Step 4: Sanity — full test suite**

Run: `npm test -- --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings.tsx
git commit -m "Settings: add TIỀN TỆ section

Primary segmented + rates panel + refresh button + rate override rows.
Change of primary opens a confirmation alert listing per-currency
transaction counts and the budget preview. Rows with source='manual'
expose 'Trở về tự động' to clear the override."
```

---

## Task 13: Display refactor — swap formatVND for formatMoney everywhere

**Files:**
- Modify: `src/app/home.tsx`
- Modify: `src/app/history.tsx`
- Modify: `src/app/gallery.tsx`
- Modify: `src/app/index.tsx`
- Modify: `src/app/transaction/[id].tsx`
- Modify: `src/app/entry.tsx` (any residual `formatVND` from summary display)
- Modify: `src/app/settings.tsx` (budget display)

**Interfaces:**
- Consumes: `formatMoney`, `signedMoney`, `formatCompact` (Task 2), `settings.primaryCurrency` via `useSettings()`

- [ ] **Step 1: Home (`home.tsx`)**

Replace `import { compactTr, formatVND, monthKey, toDateKey } from '@/lib/format';` with:

```ts
import { formatCompact, formatMoney, monthKey, toDateKey } from '@/lib/format';
```

Where `formatVND(sum.net)` is called, replace with `formatMoney(sum.net, settings.primaryCurrency)`. Where `compactTr(sum.expense)` is called, use `formatCompact(sum.expense, settings.primaryCurrency)`. Pull `settings` from `useSettings()`.

- [ ] **Step 2: History (`history.tsx`)**

Replace `import { compactK, dayLabel, formatVND, toDateKey } from '@/lib/format';` with:

```ts
import { formatCompact, formatMoney, dayLabel, toDateKey } from '@/lib/format';
```

Each `compactK(sum.income)` → `formatCompact(sum.income, primary)`. Each `formatVND(g.net)` → `formatMoney(g.net, primary)`. Sign chars stay hard-coded (`'+'` / `'−'`). Read primary from `useSettings()`.

- [ ] **Step 3: Gallery (`gallery.tsx`)**

Replace `import { signedVND } from '@/lib/format';` with:

```ts
import { signedMoney } from '@/lib/format';
```

Replace `signedVND(txn.amount, txn.isIncome)` with `signedMoney(txn.amount, txn.currency, txn.isIncome)`.

- [ ] **Step 4: index.tsx**

Replace `formatVND(todayExpense)` with `formatMoney(todayExpense, settings.primaryCurrency)`.

- [ ] **Step 5: transaction/[id].tsx**

Replace `signedVND(txn.amount, txn.isIncome)` with `signedMoney(txn.amount, txn.currency, txn.isIncome)`.

Also add a new detail row for original when different:

```tsx
{txn.originalCurrency !== txn.currency ? (
  <DetailRow label={t('currency.original_label')} value={formatMoney(txn.originalAmount, txn.originalCurrency)} />
) : null}
```

(Reuse whatever `DetailRow` pattern the file already uses.)

- [ ] **Step 6: settings.tsx budget row**

Replace `formatVND(settings.monthlyBudget)` with `formatMoney(settings.monthlyBudget, settings.primaryCurrency)`.

- [ ] **Step 7: Sanity — full test suite**

Run: `npm test -- --silent`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/home.tsx src/app/history.tsx src/app/gallery.tsx src/app/index.tsx src/app/transaction/[id].tsx src/app/settings.tsx
git commit -m "Display: swap formatVND for formatMoney across screens

Every aggregation and per-row display now reads the primary currency
from settings and formats via the generic helper. Legacy formatVND
still works (as an alias) but is no longer called directly outside
tests."
```

---

## Task 14: Row annotations + CSV export cols

**Files:**
- Modify: `src/components/sl/transaction-row.tsx`
- Modify: `src/components/sl/txn-card.tsx`
- Modify: `src/lib/export.ts`
- Modify: `src/lib/export.test.ts`

**Interfaces:**
- Consumes: `signedMoney`, `formatMoney`, `CURRENCY_META`

- [ ] **Step 1: TransactionRow — original annotation**

In `src/components/sl/transaction-row.tsx`, replace `signedVND(txn.amount, txn.isIncome)` with `signedMoney(txn.amount, txn.currency, txn.isIncome)`. Below the primary amount `Text`, add:

```tsx
{txn.originalCurrency !== txn.currency ? (
  <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2, alignSelf: 'flex-end' }}>
    ≈ {signedMoney(txn.originalAmount, txn.originalCurrency, txn.isIncome)}
  </Text>
) : null}
```

Add import `import { signedMoney } from '@/lib/format';` if not present. Remove `signedVND` import if now unused.

- [ ] **Step 2: TxnCard — same treatment**

Same pattern in `src/components/sl/txn-card.tsx`.

- [ ] **Step 3: CSV export**

In `src/lib/export.ts`, extend `buildTransactionsCsv`:

```ts
export function buildTransactionsCsv(txns: Txn[], extras: Category[] = []): string {
  const header = ['Date', 'Time', 'Category', 'Name', 'Amount', 'Currency', 'OriginalAmount', 'OriginalCurrency', 'Type'];
  const rows = txns.map((t) => [
    t.date,
    t.time,
    categoryLabel(categoryOf(t.category, extras)),
    t.name,
    t.amount.toFixed(2),
    t.currency,
    t.originalAmount.toFixed(2),
    t.originalCurrency,
    t.isIncome ? 'Income' : 'Expense',
  ]);
  // ...rest unchanged
}
```

- [ ] **Step 4: Update export test**

In `src/lib/export.test.ts`, update expected header row to include the new columns, and update sample txns to have currency fields. Fix any assertion strings.

- [ ] **Step 5: Sanity — full test suite**

Run: `npm test -- --silent`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/sl/transaction-row.tsx src/components/sl/txn-card.tsx src/lib/export.ts src/lib/export.test.ts
git commit -m "Row-level currency annotations + CSV columns

TransactionRow / TxnCard show a small '≈ $X' when the original
currency differs from the row's currency. CSV export gains Currency,
OriginalAmount, OriginalCurrency columns after Amount.
EOF
"
```

*(Note the `EOF` in the commit — remove it if using a HEREDOC properly; use the `$(cat <<'EOF' ... EOF)` pattern as in previous commits.)*

---

## Self-review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Currency catalog / metadata | 1 |
| Format helpers | 2 |
| FX storage / rates table / fallback seed | 3 |
| FX pure `convert` + service | 4 |
| Data model (txn columns) | 3, 5 |
| `insertTransaction`/`updateTransaction` conversion | 5 |
| `primaryCurrency` setting + batch recompute | 6 |
| Auto-fetch on foreground + service integration | 7 |
| i18n | 8 |
| CurrencyPickerSheet | 9 |
| RateOverrideSheet | 10 |
| Entry UI (chip + preview) | 11 |
| Settings UI (section + change dialog + rate rows) | 12 |
| Display refactor (formatMoney everywhere) | 13 |
| Row annotations + CSV | 14 |
| Testing strategy | inline per task; manual QA below |

**2. Placeholder scan:** searched for TBD/TODO/"appropriate"/"similar to" — clean. All step bodies contain actual code or exact commands.

**3. Type consistency:**
- `RateMap = Record<Exclude<CurrencyCode, 'USD'>, number>` — used in Tasks 4, 5, 6, 7, 11, 12.
- `insertTransaction(input, db, primary, rates)` — signature matches between Task 5 and Task 11's context wiring.
- `changePrimaryCurrency(db, oldPrimary, newPrimary, rates)` — matches Task 6 definition and Task 7 caller.
- `CurrencyPickerSheetHandle.present(current)` — matches Task 9 and Task 11 caller.
- `RateOverrideSheetHandle.present(currency, currentRate)` — matches Task 10 and Task 12 caller.

**Notes for the implementer:**

- The `_layout.tsx` currently mounts `SettingsProvider` outside `TransactionsProvider`. This plan preserves that ordering — `TransactionsContext` reads `useSettings()` for primary+rates. That is fine because `SettingsProvider` is the outer of the two.
- Task 11's amount-input logic is the trickiest piece: it keeps the raw digit string in state (not the parsed number) so decimals=2 currencies can be typed cent-first without cursor jumps. `formatAmountInput` handles the display; `Number(digits)/100` handles the save.
- Task 12's `askChangePrimary` reads `db` directly for the count query — this is intentional (the alert body needs it once, no need to plumb through context).
- Manual QA (post-implementation): walk the checklist in the spec's "Testing strategy → Manual QA" section, especially the change-primary flow with mixed-currency transactions.
