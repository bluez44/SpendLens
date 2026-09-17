# Foundation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix user-review bugs B1–B6 and clean up money/status colour tokens and icon-button accessibility, without changing any other behaviour.

**Architecture:** Pure logic moves into testable functions (`buildTxnPayload`, `formatHHMM`), the repository `updateTransaction` learns to persist `created_at`, UI components take currency as a prop, new colour tokens replace hex literals, and icon-only buttons receive localised accessibility labels backed by an i18n key-parity test.

**Tech Stack:** Expo SDK 57, React Native, TypeScript (strict), expo-sqlite (sync API), i18next, Jest + jest-expo + @testing-library/react-native v14.

**Spec:** `docs/superpowers/specs/2026-09-17-foundation-polish-design.md`

## Global Constraints

- Work directly on `main`. Do not create branches. Commit after each task.
- No DB schema change. No new dependency. Do not bump any `expo-*` package.
- All UI strings go through `useT()` / `i18n.t()`; every new key is added to **both** `src/lib/i18n/locales/vi.json` and `src/lib/i18n/locales/en.json`.
- Use `sl/text` `Text`, never RN `Text`. Use `@/` path aliases.
- Signed amounts use `−` (U+2212). Format money only via `src/lib/format.ts` helpers.
- Camera dark surfaces (`#111111`, `#1a1a1a`, `#1D1D1D` in `src/app/index.tsx`, `#1A1A1A` in `src/app/history.tsx`) and `photo-tile.tsx` placeholder colours stay as literals.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Baseline before starting: `npx jest` → 44 suites / 329 tests pass.

---

### Task 1: Persist `created_at` on transaction update (B1, repository layer)

**Files:**
- Modify: `src/lib/transactions.ts:121-156` (`updateTransaction`)
- Test: `src/lib/transactions.test.ts`

**Interfaces:**
- Consumes: existing `insertTransaction(input: NewTxn, database, primary?, rates?): number`, `listTransactions(database): Txn[]`, `NewTxn.createdAt?: number`.
- Produces: `updateTransaction(id, input: NewTxn, database?, primary?, rates?)` now writes `created_at = input.createdAt` when defined; leaves it unchanged when `input.createdAt` is `undefined`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/transactions.test.ts` (after the `describe('updateTransaction currency', ...)` block):

```ts
describe('updateTransaction created_at', () => {
  const base = {
    date: '2026-07-01', time: '10:00',
    category: 'food' as const, name: 'x',
    originalAmount: 1000, originalCurrency: 'VND' as const, isIncome: false,
  };

  it('persists a new createdAt and the row re-sorts in listTransactions', () => {
    const db = freshDb();
    const a = insertTransaction({ ...base, createdAt: 1000 }, db);
    const b = insertTransaction({ ...base, createdAt: 2000 }, db);
    expect(listTransactions(db).map((t) => t.id)).toEqual([b, a]);

    updateTransaction(a, { ...base, date: '2026-07-02', time: '08:15', createdAt: 3000 }, db);

    const row = db.getFirstSync<{ created_at: number; date: string; time: string }>(
      'SELECT created_at, date, time FROM transactions WHERE id = ?', a,
    );
    expect(row?.created_at).toBe(3000);
    expect(row?.date).toBe('2026-07-02');
    expect(row?.time).toBe('08:15');
    expect(listTransactions(db).map((t) => t.id)).toEqual([a, b]);
  });

  it('leaves created_at unchanged when createdAt is omitted', () => {
    const db = freshDb();
    const id = insertTransaction({ ...base, createdAt: 1000 }, db);
    updateTransaction(id, { ...base, name: 'renamed' }, db);
    const row = db.getFirstSync<{ created_at: number; name: string }>(
      'SELECT created_at, name FROM transactions WHERE id = ?', id,
    );
    expect(row?.created_at).toBe(1000);
    expect(row?.name).toBe('renamed');
  });
});
```

- [ ] **Step 2: Run tests to verify the first fails**

Run: `npx jest src/lib/transactions.test.ts -t "updateTransaction created_at"`
Expected: `persists a new createdAt…` FAILS (`created_at` is still `1000`); `leaves created_at unchanged…` passes.

- [ ] **Step 3: Implement**

In `src/lib/transactions.ts`, in **both** `UPDATE` statements of `updateTransaction`, change the `SET` line and parameters.

Subscription branch becomes:

```ts
    database.runSync(
      `UPDATE transactions
       SET date = ?, time = ?, created_at = COALESCE(?, created_at), updated_at = ?,
           category = ?, name = ?, note = ?,
           amount = ?, currency = ?, original_amount = ?, original_currency = ?,
           is_income = ?, photo_path = ?, subscription_uuid = ?
       WHERE id = ?`,
      input.date, input.time, input.createdAt ?? null, Date.now(),
      input.category, input.name, input.note ?? null,
      amount, primary, input.originalAmount, input.originalCurrency,
      input.isIncome ? 1 : 0, input.photoPath ?? null,
      input.subscriptionUuid,
      id,
    );
```

Else branch becomes:

```ts
    database.runSync(
      `UPDATE transactions
       SET date = ?, time = ?, created_at = COALESCE(?, created_at), updated_at = ?,
           category = ?, name = ?, note = ?,
           amount = ?, currency = ?, original_amount = ?, original_currency = ?,
           is_income = ?, photo_path = ?
       WHERE id = ?`,
      input.date, input.time, input.createdAt ?? null, Date.now(),
      input.category, input.name, input.note ?? null,
      amount, primary, input.originalAmount, input.originalCurrency,
      input.isIncome ? 1 : 0, input.photoPath ?? null,
      id,
    );
```

Also update the doc comment on `NewTxn.createdAt` (around line 42) to:

```ts
  /** Transaction moment (epoch ms). Insert defaults to now; update leaves it unchanged when omitted. */
  createdAt?: number;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/transactions.test.ts`
Expected: all tests PASS (including the existing `updateTransaction preserves subscription_uuid when field omitted`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/transactions.ts src/lib/transactions.test.ts
git commit -m "fix(transactions): persist created_at when updating a transaction

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `formatHHMM` + `buildTxnPayload`, wire into Entry (B1, screen layer)

**Files:**
- Modify: `src/lib/format.ts` (add `formatHHMM`)
- Modify: `src/lib/use-draft-transaction.ts` (add `buildTxnPayload`)
- Modify: `src/app/entry.tsx` (use both; delete local `formatHHMM`)
- Test: `src/lib/format.test.ts`, `src/lib/use-draft-transaction.test.ts`

**Interfaces:**
- Consumes: Task 1's `updateTransaction` persisting `createdAt`; `toDateKey(date: Date): string` from `src/lib/format.ts`; `NewTxn`, `Txn` from `src/lib/transactions.ts`; `CategoryId` from `src/lib/categories.ts`; `CurrencyCode` from `src/lib/currency.ts`.
- Produces:
  - `formatHHMM(d: Date): string` — zero-padded local `HH:MM`.
  - `buildTxnPayload(input: BuildTxnPayloadInput): NewTxn` where
    ```ts
    export interface BuildTxnPayloadInput {
      selectedDate: Date;
      category: CategoryId;
      note: string;
      originalAmount: number;
      currency: CurrencyCode;
      isIncome: boolean;
      photoPath: string | null;
    }
    ```

- [ ] **Step 1: Write the failing `formatHHMM` test**

In `src/lib/format.test.ts`, add `formatHHMM,` to the existing `import { … } from './format';` list, then append:

```ts
describe('formatHHMM', () => {
  it('zero-pads hours and minutes', () => {
    expect(formatHHMM(new Date(2026, 0, 1, 9, 5))).toBe('09:05');
  });

  it('keeps two-digit values and uses 24h time', () => {
    expect(formatHHMM(new Date(2026, 0, 1, 21, 45))).toBe('21:45');
  });
});
```

- [ ] **Step 2: Write the failing `buildTxnPayload` tests**

In `src/lib/use-draft-transaction.test.ts`, change the import to:

```ts
import { buildTxnPayload, useDraftTransaction } from './use-draft-transaction';
```

and append:

```ts
describe('buildTxnPayload', () => {
  const base = {
    category: 'food' as const,
    note: '  Bún bò  ',
    originalAmount: 45000,
    currency: 'VND' as const,
    isIncome: false,
    photoPath: null,
  };

  it('derives date, time and createdAt from selectedDate for a new txn', () => {
    const d = new Date(2026, 7, 1, 9, 5);
    expect(buildTxnPayload({ ...base, selectedDate: d })).toEqual({
      date: '2026-08-01',
      time: '09:05',
      createdAt: d.getTime(),
      category: 'food',
      name: 'Bún bò',
      note: null,
      originalAmount: 45000,
      originalCurrency: 'VND',
      isIncome: false,
      photoPath: null,
    });
  });

  it('round-trips an edited txn whose date was not changed', () => {
    const created = new Date(2026, 7, 1, 10, 30).getTime();
    const p = buildTxnPayload({ ...base, selectedDate: new Date(created) });
    expect([p.date, p.time, p.createdAt]).toEqual(['2026-08-01', '10:30', created]);
  });

  it('reflects a changed date when editing', () => {
    const moved = new Date(2026, 6, 31, 21, 0);
    const p = buildTxnPayload({ ...base, selectedDate: moved });
    expect([p.date, p.time, p.createdAt]).toEqual(['2026-07-31', '21:00', moved.getTime()]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest src/lib/format.test.ts src/lib/use-draft-transaction.test.ts`
Expected: FAIL — `formatHHMM is not a function` / `buildTxnPayload is not a function`.

- [ ] **Step 4: Implement `formatHHMM`**

In `src/lib/format.ts`, directly after `toDateKey`, add:

```ts
/** Local wall-clock time as zero-padded 24h `HH:MM`. */
export function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
```

- [ ] **Step 5: Implement `buildTxnPayload`**

In `src/lib/use-draft-transaction.ts`, replace the imports block with:

```ts
import { useMemo, useState } from 'react';

import { CURRENCY_META, type CurrencyCode } from './currency';
import type { CategoryId } from './categories';
import { formatHHMM, toDateKey } from './format';
import type { NewTxn, Txn } from './transactions';
```

and append at the end of the file:

```ts
export interface BuildTxnPayloadInput {
  selectedDate: Date;
  category: CategoryId;
  note: string;
  originalAmount: number;
  currency: CurrencyCode;
  isIncome: boolean;
  photoPath: string | null;
}

/**
 * Build the repository payload for both create and edit. The picked
 * `selectedDate` is always authoritative for date/time/createdAt.
 * `name` holds the user's note; `note` is a legacy column and is written null.
 */
export function buildTxnPayload(input: BuildTxnPayloadInput): NewTxn {
  return {
    date: toDateKey(input.selectedDate),
    time: formatHHMM(input.selectedDate),
    createdAt: input.selectedDate.getTime(),
    category: input.category,
    name: input.note.trim(),
    note: null,
    originalAmount: input.originalAmount,
    originalCurrency: input.currency,
    isIncome: input.isIncome,
    photoPath: input.photoPath,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/lib/format.test.ts src/lib/use-draft-transaction.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire into `src/app/entry.tsx`**

1. Change the format import to:
   ```ts
   import { dayLabel, formatAmountInput, formatHHMM, formatMoney, toDateKey } from '@/lib/format';
   ```
2. Remove the now-unused `import type { NewTxn } from '@/lib/transactions';`.
3. Change the draft hook import to:
   ```ts
   import { buildTxnPayload, useDraftTransaction } from '@/lib/use-draft-transaction';
   ```
4. In `save`, replace the whole `const payload: NewTxn = { … };` object literal with:
   ```ts
    const payload = buildTxnPayload({
      selectedDate,
      category: effectiveCategory,
      note,
      originalAmount,
      currency,
      isIncome,
      photoPath: photoUri ?? null,
    });
   ```
5. Delete the local `function formatHHMM(d: Date): string { … }` near the bottom of the file (the date row keeps calling `formatHHMM(selectedDate)`, now imported).

- [ ] **Step 8: Type-check and run related tests**

Run: `npx tsc --noEmit` → no errors.
Run: `npx jest src/lib` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/lib/use-draft-transaction.ts src/lib/use-draft-transaction.test.ts src/app/entry.tsx
git commit -m "fix(entry): editing a transaction saves the picked date and time

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Budget displays the primary currency (B2)

**Files:**
- Modify: `src/components/sl/budget-bar.tsx`
- Modify: `src/components/sl/budget-sheet.tsx`
- Modify: `src/app/home.tsx` (`<BudgetBar …>`), `src/app/settings.tsx` (`<BudgetSheet …>`)
- Test: `src/components/sl/budget-bar.test.tsx`

**Interfaces:**
- Consumes: `formatMoney(amount: number, currency: CurrencyCode): string`; `CurrencyCode` from `@/lib/currency`.
- Produces: `BudgetBar` props `{ spent: number; budget: number; currency: CurrencyCode; onSetBudget: () => void }`; `BudgetSheet` props `{ onSave: (amount: number) => void; currency: CurrencyCode }`.

- [ ] **Step 1: Update tests (failing)**

Replace the body of `src/components/sl/budget-bar.test.tsx` with:

```tsx
import { render } from '@testing-library/react-native';

import { BudgetBar } from './budget-bar';

describe('BudgetBar', () => {
  it('renders the CTA when budget is 0', async () => {
    const { getByText } = await render(<BudgetBar spent={0} budget={0} currency="VND" onSetBudget={() => {}} />);
    expect(getByText(/Đặt ngân sách/)).toBeTruthy();
  });

  it('shows the percentage under 100 when within budget', async () => {
    const { getByText } = await render(<BudgetBar spent={1_500_000} budget={3_000_000} currency="VND" onSetBudget={() => {}} />);
    expect(getByText('50%')).toBeTruthy();
    expect(getByText('1.500.000₫ / 3.000.000₫')).toBeTruthy();
  });

  it('shows a true percentage over 100 when over budget', async () => {
    const { getByText } = await render(<BudgetBar spent={3_450_000} budget={3_000_000} currency="VND" onSetBudget={() => {}} />);
    expect(getByText('115%')).toBeTruthy();
  });

  it('formats spent and budget in the given non-VND currency', async () => {
    const { getByText } = await render(<BudgetBar spent={1500} budget={3000} currency="USD" onSetBudget={() => {}} />);
    expect(getByText('$1500.00 / $3000.00')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/components/sl/budget-bar.test.tsx`
Expected: the USD test FAILS (renders `1.500₫ / 3.000₫`); `tsc` would also flag the unknown `currency` prop.

- [ ] **Step 3: Implement `BudgetBar`**

In `src/components/sl/budget-bar.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import type { CurrencyCode } from '@/lib/currency';
import { formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';

interface Props {
  spent: number;
  budget: number;
  currency: CurrencyCode;
  onSetBudget: () => void;
}
```

Change the signature to `export function BudgetBar({ spent, budget, currency, onSetBudget }: Props) {` and the amount line to:

```tsx
          {formatMoney(spent, currency)} / {formatMoney(budget, currency)}
```

(The `pickColor` literals are replaced in Task 5 — leave them for now.)

- [ ] **Step 4: Implement `BudgetSheet`**

In `src/components/sl/budget-sheet.tsx`:
- Replace `import { formatVND } from '@/lib/format';` with
  ```ts
  import type { CurrencyCode } from '@/lib/currency';
  import { formatMoney } from '@/lib/format';
  ```
- Change `interface Props` to:
  ```ts
  interface Props {
    onSave: (amount: number) => void;
    currency: CurrencyCode;
  }
  ```
- Change the destructure to `function BudgetSheet({ onSave, currency }, ref) {`.
- Change the preview to `{formatMoney(Number(draft) || 0, currency)}`.

- [ ] **Step 5: Update callers**

`src/app/home.tsx`:
```tsx
        <BudgetBar
          spent={spentThisMonth}
          budget={settings.monthlyBudget}
          currency={settings.primaryCurrency}
          onSetBudget={() => router.push('/settings')}
        />
```

`src/app/settings.tsx`:
```tsx
      <BudgetSheet
        ref={budgetSheetRef}
        currency={settings.primaryCurrency}
        onSave={(n) => update('monthlyBudget', n)}
      />
```

- [ ] **Step 6: Verify**

Run: `npx jest src/components/sl/budget-bar.test.tsx` → PASS.
Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/sl/budget-bar.tsx src/components/sl/budget-bar.test.tsx src/components/sl/budget-sheet.tsx src/app/home.tsx src/app/settings.tsx
git commit -m "fix(budget): format budget in the primary currency instead of VND

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `name` is the primary text on the swipe-up card (B3)

**Files:**
- Modify: `src/components/sl/txn-card.tsx`
- Modify: `src/lib/transactions.ts` (doc comment on `Txn`)
- Test: `src/components/sl/txn-card.test.tsx`

**Interfaces:**
- Consumes: `Txn.name: string`, `Txn.note: string | null`.
- Produces: `TxnCard` renders `txn.name || txn.note || ''`.

- [ ] **Step 1: Replace the two note tests (failing)**

In `src/components/sl/txn-card.test.tsx`, replace the tests `renders the note when present` and `renders name when note is null` with:

```tsx
  it('renders name when both name and a legacy note are present', async () => {
    const { getByText, queryByText } = await render(
      <TxnCard txn={{ ...baseTxn, name: 'Cà phê', note: 'Latte size L' }} />,
    );
    expect(getByText('Cà phê')).toBeTruthy();
    expect(queryByText('Latte size L')).toBeNull();
  });

  it('renders name when note is null', async () => {
    const { getByText } = await render(<TxnCard txn={{ ...baseTxn, note: null }} />);
    expect(getByText('Cà phê')).toBeTruthy();
  });

  it('falls back to the legacy note when name is empty', async () => {
    const { getByText } = await render(<TxnCard txn={{ ...baseTxn, name: '', note: 'Latte size L' }} />);
    expect(getByText('Latte size L')).toBeTruthy();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/components/sl/txn-card.test.tsx`
Expected: `renders name when both…` FAILS (card shows the note).

- [ ] **Step 3: Implement**

In `src/components/sl/txn-card.tsx`, change:

```tsx
        <Text style={styles.note} numberOfLines={2}>{txn.note ?? txn.name}</Text>
```
to
```tsx
        <Text style={styles.note} numberOfLines={2}>{txn.name || txn.note || ''}</Text>
```

In `src/lib/transactions.ts`, on the `Txn` interface, put these comments directly above the `name` and `note` fields:

```ts
  /** The user-entered note shown everywhere as the transaction's text. */
  name: string;
  /** Legacy free-text column; new rows always store null. */
  note: string | null;
```

(Keep the existing field types exactly as they are; only add the comments.)

- [ ] **Step 4: Verify**

Run: `npx jest src/components/sl/txn-card.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sl/txn-card.tsx src/components/sl/txn-card.test.tsx src/lib/transactions.ts
git commit -m "fix(txn-card): show the transaction name before the legacy note

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Colour tokens + overlay contrast (token cleanup, B4)

**Files:**
- Modify: `src/constants/tokens.ts`
- Modify: `src/app/entry.tsx`, `src/components/sl/budget-bar.tsx`, `src/components/settings/data-section.tsx`, `src/app/transaction/[id].tsx`, `src/components/sl/gradient.tsx`, `src/app/gallery.tsx`, `src/components/sl/txn-card.tsx`
- Test: `src/constants/tokens.test.ts` (create)

**Interfaces:**
- Produces (in `@/constants/tokens`): `Money.warning`, `Money.incomeChip`, `IncomeGradient`, `OnPhoto.text`, `OnPhoto.textSecondary`.

- [ ] **Step 1: Write the failing token test**

Create `src/constants/tokens.test.ts`:

```ts
import { AccentGradient, IncomeGradient, Money, OnPhoto } from './tokens';

describe('design tokens', () => {
  it('exposes semantic money and status colours', () => {
    expect(Money.expense).toBe('#FB5B4D');
    expect(Money.income).toBe('#34C79A');
    expect(Money.warning).toBe('#F59E0B');
    expect(Money.incomeChip).toBe('#D1FAE5');
  });

  it('exposes gradients', () => {
    expect(AccentGradient).toEqual(['#FFB37B', '#FF6B6B']);
    expect(IncomeGradient).toEqual(['#34C79A', '#1FA07A']);
  });

  it('exposes theme-independent text colours for photo overlays', () => {
    expect(OnPhoto.text).toBe('#fff');
    expect(OnPhoto.textSecondary).toBe('rgba(255,255,255,0.78)');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/constants/tokens.test.ts`
Expected: FAIL (`Money.warning` undefined, `IncomeGradient`/`OnPhoto` not exported). If the test fails to load because `tokens.ts` imports `@/lib/theme-context`, that is fine as long as the failure is about the missing tokens; if it is a module-resolution error instead, add `jest.mock('@/lib/theme-context', () => ({ useEffectiveScheme: () => 'light' }));` at the top of the test file and re-run.

- [ ] **Step 3: Add tokens**

In `src/constants/tokens.ts`, replace the `Money` block with:

```ts
/** Semantic money colors — stable across light/dark. */
export const Money = {
  expense: '#FB5B4D',
  /** Softer coral used on dark camera surfaces. */
  expenseOnDark: '#FF9470',
  income: '#34C79A',
  /** Budget 80–100% warning. */
  warning: '#F59E0B',
  /** Light mint chip background for income labels. */
  incomeChip: '#D1FAE5',
} as const;

/** Gradient for income primary buttons. */
export const IncomeGradient = ['#34C79A', '#1FA07A'] as const;

/** Text on top of photos / dark scrims, independent of theme. */
export const OnPhoto = {
  text: '#fff',
  textSecondary: 'rgba(255,255,255,0.78)',
} as const;
```

- [ ] **Step 4: Run token test**

Run: `npx jest src/constants/tokens.test.ts` → PASS.

- [ ] **Step 5: Replace literals**

`src/app/entry.tsx`:
- Import: `import { IncomeGradient, Money, Radius, useColors, W } from '@/constants/tokens';`
- Note label asterisk: `<Text style={{ color: '#FB5B4D' }}>*</Text>` → `<Text style={{ color: Money.expense }}>*</Text>`
- Save button: `colors={isIncome ? (['#34C79A', '#1FA07A'] as const) : undefined}` → `colors={isIncome ? IncomeGradient : undefined}`

`src/components/sl/budget-bar.tsx`:
- Import: `import { AccentGradient, Money, useColors } from '@/constants/tokens';`
- `pickColor` becomes:
  ```ts
  function pickColor(pct: number): string {
    if (pct > 100) return Money.expense;   // over budget
    if (pct >= 80) return Money.warning;   // warning
    return AccentGradient[1];              // normal (coral)
  }
  ```

`src/components/settings/data-section.tsx`:
- Import: `import { Money, useColors } from '@/constants/tokens';`
- Both `style={{ color: '#FB5B4D', fontWeight: '500' }}` → `style={{ color: Money.expense, fontWeight: '500' }}`

`src/app/transaction/[id].tsx`:
- `const chipBg = txn.isIncome ? '#D1FAE5' : cat.chip;` → `const chipBg = txn.isIncome ? Money.incomeChip : cat.chip;` (`Money` is already imported).

`src/components/sl/gradient.tsx`:
- `shadowColor: '#FF6B6B',` → `shadowColor: AccentGradient[1],` (`AccentGradient` is already imported).

`src/app/gallery.tsx` (B4):
- Import: `import { OnPhoto, useColors, W } from '@/constants/tokens';`
- In the tile overlay, `<Text style={{ fontSize: 11, fontWeight: W.extrabold, color: '#fff' }}>` → `color: OnPhoto.text`
- `<Text style={{ color: c.textSecondary, fontSize: 10, marginTop: 2 }}>` → `<Text style={{ color: OnPhoto.textSecondary, fontSize: 10, marginTop: 2 }}>`

`src/components/sl/txn-card.tsx` (B4):
- Import: replace `import { useColors } from '@/constants/tokens';` with `import { OnPhoto } from '@/constants/tokens';`
- Delete `const c = useColors();`
- `<Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2, alignSelf: 'flex-end' }}>` → `color: OnPhoto.textSecondary`

- [ ] **Step 6: Verify no stray literals**

Run: `grep -rnE "'#(FB5B4D|34C79A|1FA07A|F59E0B|FF6B6B|D1FAE5)'" src --include=*.tsx --include=*.ts`
Expected: only matches in `src/constants/tokens.ts` and `src/constants/tokens.test.ts`.

Run: `npx tsc --noEmit` → no errors. Run: `npx jest` → all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/constants/tokens.ts src/constants/tokens.test.ts src/app/entry.tsx src/components/sl/budget-bar.tsx src/components/settings/data-section.tsx "src/app/transaction/[id].tsx" src/components/sl/gradient.tsx src/app/gallery.tsx src/components/sl/txn-card.tsx
git commit -m "refactor(tokens): replace money/status hex literals and raise photo overlay contrast

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Accessibility i18n keys + locale parity test (B6, strings)

**Files:**
- Create: `src/lib/i18n/locales.test.ts`
- Modify: `src/lib/i18n/locales/vi.json`, `src/lib/i18n/locales/en.json`

**Interfaces:**
- Produces i18n keys: `a11y.open_home`, `a11y.open_history`, `a11y.flash_on`, `a11y.flash_off`, `a11y.flip_camera`, `a11y.capture`, `a11y.add_note`, `a11y.share_cards`, `a11y.back`, `a11y.edit_txn`, `a11y.open_txn` (interpolates `{{amount}}`), `a11y.add_subscription`, `a11y.confirm_category`, `a11y.choose_currency`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/locales.test.ts`:

```ts
import en from './locales/en.json';
import vi from './locales/vi.json';

function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object'
      ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const A11Y_KEYS = [
  'open_home', 'open_history', 'flash_on', 'flash_off', 'flip_camera',
  'capture', 'add_note', 'share_cards', 'back', 'edit_txn', 'open_txn',
  'add_subscription', 'confirm_category', 'choose_currency',
];

describe('locale files', () => {
  it('vi and en define exactly the same keys', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(vi).sort());
  });

  it('define every accessibility label', () => {
    const viKeys = keysOf(vi);
    for (const k of A11Y_KEYS) expect(viKeys).toContain(`a11y.${k}`);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/i18n/locales.test.ts`
Expected: parity test PASSES (baseline is in sync); `define every accessibility label` FAILS.

- [ ] **Step 3: Add keys to both locale files**

In `src/lib/i18n/locales/vi.json`, add a comma after the last top-level object's closing `}` and append this as the final top-level key:

```json
  "a11y": {
    "open_home": "Mở Tổng quan",
    "open_history": "Mở Thu chi",
    "flash_on": "Bật đèn flash",
    "flash_off": "Tắt đèn flash",
    "flip_camera": "Đổi camera trước/sau",
    "capture": "Chụp ảnh",
    "add_note": "Thêm ghi chú",
    "share_cards": "Chia sẻ recap / streak",
    "back": "Quay lại",
    "edit_txn": "Sửa giao dịch",
    "open_txn": "Xem giao dịch {{amount}}",
    "add_subscription": "Thêm đăng ký",
    "confirm_category": "Thêm danh mục",
    "choose_currency": "Chọn tiền tệ"
  }
```

In `src/lib/i18n/locales/en.json`, same position:

```json
  "a11y": {
    "open_home": "Open overview",
    "open_history": "Open history",
    "flash_on": "Turn flash on",
    "flash_off": "Turn flash off",
    "flip_camera": "Flip camera",
    "capture": "Take photo",
    "add_note": "Add note",
    "share_cards": "Share recap / streak",
    "back": "Back",
    "edit_txn": "Edit transaction",
    "open_txn": "View transaction {{amount}}",
    "add_subscription": "Add subscription",
    "confirm_category": "Add category",
    "choose_currency": "Choose currency"
  }
```

- [ ] **Step 4: Verify**

Run: `npx jest src/lib/i18n` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/locales.test.ts src/lib/i18n/locales/vi.json src/lib/i18n/locales/en.json
git commit -m "feat(i18n): add accessibility labels and a vi/en key parity test

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Apply accessibility labels & touch targets (B6, UI)

**Files:**
- Modify: `src/components/sl/gradient.tsx` (`Shutter`)
- Modify: `src/app/index.tsx`, `src/app/gallery.tsx`, `src/app/transaction/[id].tsx`, `src/app/entry.tsx`, `src/app/subscriptions.tsx`, `src/app/share.tsx`, `src/components/sl/txn-card.tsx`
- Test: `src/components/sl/gradient.test.tsx` (create), `src/components/sl/txn-card.test.tsx`, `src/app/share.test.tsx`

**Interfaces:**
- Consumes: Task 6 `a11y.*` keys; existing keys `home.close_a11y`, `share.a11y_share`, `nav.back_to_camera`.
- Produces: `Shutter` props `{ onPress?: () => void; size?: number; gradientRing?: boolean; accessibilityLabel?: string }`.

- [ ] **Step 1: Write failing tests**

Create `src/components/sl/gradient.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';

import { Shutter } from './gradient';

describe('Shutter', () => {
  it('is exposed as a labelled button', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Shutter onPress={onPress} accessibilityLabel="Chụp ảnh" />);
    fireEvent.press(getByRole('button', { name: 'Chụp ảnh' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

In `src/components/sl/txn-card.test.tsx`, append inside `describe('TxnCard', …)`:

```tsx
  it('exposes the share control as a button', async () => {
    const { getByRole } = await render(<TxnCard txn={txnWithPhoto} onShare={jest.fn()} />);
    expect(getByRole('button', { name: 'Chia sẻ giao dịch' })).toBeTruthy();
  });
```

In `src/app/share.test.tsx`, append inside `describe('ShareScreen', …)`:

```tsx
  it('exposes a labelled close button', async () => {
    const { getByRole } = await renderWithProviders(<ShareScreen />);
    expect(getByRole('button', { name: 'Đóng' })).toBeTruthy();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/components/sl/gradient.test.tsx src/components/sl/txn-card.test.tsx src/app/share.test.tsx`
Expected: the three new tests FAIL (no element with role `button` and that name).

- [ ] **Step 3: `Shutter`**

In `src/components/sl/gradient.tsx`:

```tsx
export function Shutter({
  onPress, size = 74, gradientRing = false, accessibilityLabel,
}: { onPress?: () => void; size?: number; gradientRing?: boolean; accessibilityLabel?: string }) {
  const inner = size - 16;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
```

(Rest of the component unchanged.)

- [ ] **Step 4: `TxnCard` share button and Share screen close**

`src/components/sl/txn-card.tsx` — on the share `Pressable`, add `accessibilityRole="button"` next to the existing `accessibilityLabel`.

`src/app/share.tsx` — the close `Pressable` becomes:

```tsx
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('home.close_a11y')}
          style={[styles.iconBtn, { backgroundColor: c.segment }]}>
```

- [ ] **Step 5: Run the three test files**

Run: `npx jest src/components/sl/gradient.test.tsx src/components/sl/txn-card.test.tsx src/app/share.test.tsx` → PASS.

- [ ] **Step 6: Camera screen `src/app/index.tsx`**

1. `RoundButton`:
   ```tsx
   function RoundButton({
     children, onPress, accessibilityLabel,
   }: { children: React.ReactNode; onPress: () => void; accessibilityLabel: string }) {
     return (
       <Pressable
         onPress={onPress}
         accessibilityRole="button"
         accessibilityLabel={accessibilityLabel}
         style={({ pressed }) => [styles.roundBtn, { opacity: pressed ? 0.7 : 1 }]}>
         {children}
       </Pressable>
     );
   }
   ```
2. Nav usages:
   ```tsx
        <RoundButton onPress={() => router.push('/home')} accessibilityLabel={t('a11y.open_home')}><Icon name="home" /></RoundButton>
   ```
   ```tsx
        <RoundButton onPress={() => router.push('/history')} accessibilityLabel={t('a11y.open_history')}><Icon name="menu" /></RoundButton>
   ```
3. Flash:
   ```tsx
              <Pressable
                style={styles.flashBtn}
                accessibilityRole="button"
                accessibilityLabel={flash === 'on' ? t('a11y.flash_off') : t('a11y.flash_on')}
                onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}>
   ```
4. Note tap zone and note preview — add to each `Pressable`:
   ```tsx
                accessibilityRole="button"
                accessibilityLabel={t('a11y.add_note')}
   ```
5. Shutter: `<Shutter onPress={capture} accessibilityLabel={t('a11y.capture')} />`
6. Flip:
   ```tsx
            <Pressable
              style={[styles.sideSlot, styles.circleBtn]}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.flip_camera')}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
   ```
7. Back-to-camera `Pressable` (already labelled): add `accessibilityRole="button"`.
8. Share-cards icon `Pressable` (`testID="share-cards-icon"`): add
   ```tsx
          accessibilityRole="button"
          accessibilityLabel={t('a11y.share_cards')}
   ```

- [ ] **Step 7: Gallery `src/app/gallery.tsx`**

- Back button:
  ```tsx
        <Pressable
          style={[styles.iconBtn, { backgroundColor: c.segment }]}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.back')}
          onPress={goBack}>
  ```
- Tile:
  ```tsx
            <Pressable
              key={txn.id}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.open_txn', { amount: signedMoney(txn.amount, txn.currency, txn.isIncome) })}
              onPress={() => router.push(`/transaction/${txn.id}`)}>
  ```

- [ ] **Step 8: Transaction detail `src/app/transaction/[id].tsx`**

- Back: `<Pressable style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('a11y.back')} onPress={goBack}>`
- Share (already labelled): add `accessibilityRole="button"`.
- Edit:
  ```tsx
            <Pressable
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.edit_txn')}
              onPress={() => router.push({ pathname: '/entry', params: { id: String(txn.id) } })}>
  ```

- [ ] **Step 9: Entry `src/app/entry.tsx`**

- Close-photo button (30×30 → hitSlop for ≥ 44pt):
  ```tsx
          <Pressable
            style={styles.close}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('home.close_a11y')}
            onPress={() => router.back()}>
  ```
- Currency chip `Pressable`: add `accessibilityRole="button"` and `accessibilityLabel={t('a11y.choose_currency')}`.
- Custom-category confirm:
  ```tsx
                <Pressable
                  onPress={tryAddCustomCategory}
                  disabled={customInput.trim() === ''}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.confirm_category')}>
  ```

- [ ] **Step 10: Subscriptions `src/app/subscriptions.tsx`**

```tsx
            <Pressable
              onPress={openAdd}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.add_subscription')}>
```

- [ ] **Step 11: Verify**

Run: `npx tsc --noEmit` → no errors.
Run: `npx jest` → all PASS.
Run: `npm run lint` → no new errors.

- [ ] **Step 12: Commit**

```bash
git add src/components/sl/gradient.tsx src/components/sl/gradient.test.tsx src/components/sl/txn-card.tsx src/components/sl/txn-card.test.tsx src/app/share.tsx src/app/share.test.tsx src/app/index.tsx src/app/gallery.tsx "src/app/transaction/[id].tsx" src/app/entry.tsx src/app/subscriptions.tsx
git commit -m "feat(a11y): label icon-only buttons and enlarge small touch targets

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: README accuracy (B5)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Remove the seed claim**

Replace the line (≈ line 136):

```markdown
On first launch the SQLite database is seeded with a small sample of transactions so every screen has realistic data immediately.
```

with:

```markdown
The app starts with an empty database. For development, `seedIfEmpty()` in `src/lib/seed.ts` can be called manually to insert sample transactions; it is never run automatically.
```

- [ ] **Step 2: Extend Features**

Append these bullets to the end of the `## Features` list (after "Muted shutter."):

```markdown
- **Multi-currency.** Record in VND, USD, EUR, JPY, GBP or KRW; amounts are normalised to your primary currency with live or manually overridden FX rates.
- **Monthly subscriptions.** Track recurring charges with 7/3/1-day reminders, pause/resume, and automatic transactions on the due date.
- **Budget alerts.** Optional notifications when monthly spend reaches 80% and 100% of the budget.
- **Compare periods.** Month-vs-month or week-vs-week totals, overlay bar chart and per-category deltas.
- **Shareable cards.** Weekly recap and streak cards rendered as 1080×1920 images for stories, with a hide-amounts toggle and a weekly recap notification.
- **App lock.** Biometric unlock with PIN fallback.
```

- [ ] **Step 3: Extend Screens table**

After the `| \`/settings\` | …` row, add:

```markdown
| `/history-months` | **Tháng cũ**. Pick any past month: summary, category donut, day-grouped feed. |
| `/compare` | **So sánh**. Month or week A vs B with presets, overlay bars, category deltas. |
| `/subscriptions` | **Đăng ký hàng tháng**. List, add, edit, pause and delete recurring charges. |
| `/share` | **Chia sẻ card**. Preview a weekly recap or streak card, save to gallery or share. |
```

- [ ] **Step 4: Update Testing list**

Replace everything from the line `Suite covers:` through the line `- \`sanity.test.ts\` — smoke check the harness.` with:

```markdown
Tests are colocated as `*.test.ts(x)` next to the code they cover. Highlights:

- `src/lib/` — formatting, categories, transactions repository (in-memory SQLite), settings, notifications, CSV export, FX conversion, comparison, streaks, share-card data, subscriptions and their scheduler, app lock, draft-transaction hook, locale key parity.
- `src/components/` — budget bar, transaction card, share cards, picker sheets, PIN pad and lock screen.
- `src/app/` — share preview screen.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): remove seed claim and document current features and routes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Final verification

**Files:** none (verification only; fix-ups go in a new commit if needed).

- [ ] **Step 1: Full automated checks**

Run each and confirm:
- `npx tsc --noEmit` → exit 0.
- `npm run lint` → no errors.
- `npx jest` → all suites pass; test count ≥ 329 + new tests (≈ 345).
- `grep -rnE "'#(FB5B4D|34C79A|1FA07A|F59E0B|FF6B6B|D1FAE5)'" src --include=*.tsx --include=*.ts` → only `src/constants/tokens.ts` / `tokens.test.ts`.
- `grep -rn "formatVND" src/components --include=*.tsx | grep -v test` → no output.

- [ ] **Step 2: Manual device checklist (report results to the user; do not claim done without them)**

1. Edit an existing transaction, change its date to yesterday, save → it appears under "Hôm qua" in History and is gone from today's swipe-up cards; reopening edit shows yesterday's date.
2. Settings → Currency: set primary to USD; set a budget → Home budget bar and the budget sheet preview show `$`.
3. Enable TalkBack (Android) / VoiceOver (iOS) on the camera screen → home, history, flash, flip, shutter, note zone and share-cards are announced with their labels.
4. Gallery and swipe-up card: the `≈` converted amount is readable on bright photos.

- [ ] **Step 3: Update roadmap status**

In `docs/superpowers/specs/2026-09-17-app-improvement-roadmap.md`, change the **Status** line to:

```markdown
**Status:** Roadmap approved. Sub-project A implemented on `main`; B–F not yet designed.
```

```bash
git add docs/superpowers/specs/2026-09-17-app-improvement-roadmap.md
git commit -m "docs(roadmap): mark sub-project A implemented

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
