# Ultra-fast Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save an expense in ≤ 3 taps from the camera (quick-add sheet with suggestions), pick a photo from the library, save without a note, and confirm every new save with a haptic + Undo toast.

**Architecture:** Pure helpers (`txnTitle`, `frequentEntries`, `quickAmountsFor`) feed a shared draft hook; a root `ToastProvider` plus a `useSaveTransaction` hook centralise saving, haptics, Undo and budget alerts for both the Entry screen and a new `QuickAddSheet` mounted on the camera.

**Tech Stack:** Expo SDK 57, React Native, TypeScript (strict), expo-sqlite (sync), `@gorhom/bottom-sheet`, `expo-image-picker`, `expo-haptics` (new), i18next, Jest + jest-expo + @testing-library/react-native v14.

**Spec:** `docs/superpowers/specs/2026-09-17-ultra-fast-entry-design.md`

## Global Constraints

- Work directly on `main`. Do not create branches. Commit after each task.
- No DB schema change. The only new dependency is `expo-haptics`, installed with `npx expo install expo-haptics` (never `npm install` directly; do not bump any other `expo-*` package).
- All UI strings go through `useT()` / `i18n.t()`; every new key is added to **both** `src/lib/i18n/locales/vi.json` and `src/lib/i18n/locales/en.json`.
- Use `sl/text` `Text` (never RN `Text`) in app/components code. Use `@/` path aliases in `src/app` and `src/components`; `src/lib` files use relative imports like their neighbours.
- Format money only through `src/lib/format.ts` helpers; signed amounts use `−` (U+2212).
- Empty note is stored as `name = ''`; display goes through `txnTitle()`.
- Quick amounts: VND → `[20000, 50000, 100000, 200000]`; any other currency → none.
- Suggestions: expenses only, non-empty name, `createdAt` within the last 60 days, grouped by (lower-cased trimmed name, category, originalAmount, originalCurrency), sorted by count desc then most recent use desc, top 5.
- Toast default duration 5000 ms; "Undone" toast 2000 ms; one toast at a time; action press hides first, then calls `onAction`.
- `CLAUDE.md` has an unrelated uncommitted user change: never stage it; never `git stash`, `git checkout -- .`, or `git add -A`/`.`. Stage explicit paths only.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Type-check gate: `npx tsc --noEmit 2>&1 | grep 'error TS' | grep -vE '\.test\.tsx?\('` prints only the 3 pre-existing errors (`__mocks__/@gorhom/bottom-sheet.ts`, `src/app/share.tsx:42`, `src/constants/theme.ts`).
- Lint gate: `npx eslint --quiet <changed files>` reports no errors other than the pre-existing `src/app/share.test.tsx:10 react/display-name`.
- Tests rendered inside `SettingsProvider` resolve the language to English (jest-expo's localization mock); tests without it run in Vietnamese. Compute expected strings with `i18n.t(...)` rather than hard-coding either language.
- Baseline before starting: `npx jest` → 47 suites / 348 tests pass.

---

### Task 1: `txnTitle` helper and adoption

**Files:**
- Create: `src/lib/txn-title.ts`
- Test: `src/lib/txn-title.test.ts`
- Modify: `src/components/sl/transaction-row.tsx`, `src/components/sl/txn-card.tsx`, `src/app/transaction/[id].tsx`, `src/lib/export.ts`, `src/lib/share-transaction.ts`
- Modify tests: `src/components/sl/txn-card.test.tsx`, `src/lib/export.test.ts`, `src/lib/share-transaction.test.ts`

**Interfaces:**
- Consumes: `categoryOf(id, extras)`, `categoryLabel(cat)`, `INCOME_LABEL_KEY`, `Category` from `src/lib/categories.ts`; `i18n` from `src/lib/i18n`.
- Produces: `txnTitle(txn: Pick<Txn, 'name' | 'note' | 'category' | 'isIncome'>, extras?: Category[]): string`.

- [ ] **Step 1: Write the failing unit tests**

Create `src/lib/txn-title.test.ts`:

```ts
import type { Category } from './categories';
import { i18n } from './i18n';
import { txnTitle } from './txn-title';

beforeAll(async () => { await i18n.changeLanguage('vi'); });

const base = { name: 'Cà phê', note: null as string | null, category: 'food' as const, isIncome: false };

describe('txnTitle', () => {
  it('uses the name when present', () => {
    expect(txnTitle({ ...base, note: 'Latte' })).toBe('Cà phê');
  });

  it('falls back to the legacy note when the name is empty or whitespace', () => {
    expect(txnTitle({ ...base, name: '', note: 'Latte' })).toBe('Latte');
    expect(txnTitle({ ...base, name: '   ', note: 'Latte' })).toBe('Latte');
  });

  it('falls back to the static category label when name and note are empty', () => {
    expect(txnTitle({ ...base, name: '', note: '  ' })).toBe(i18n.t('category.food'));
  });

  it('resolves a custom category label through extras', () => {
    const gym: Category = { id: 'custom_1', labelKey: null, label: 'Gym', chip: '#eee', fg: '#333' };
    expect(txnTitle({ ...base, name: '', category: 'custom_1' }, [gym])).toBe('Gym');
  });

  it('uses the income label for income without text', () => {
    expect(txnTitle({ ...base, name: '', isIncome: true })).toBe(i18n.t('category.income'));
  });

  it('follows the current language', async () => {
    await i18n.changeLanguage('en');
    expect(txnTitle({ ...base, name: '' })).toBe('Food');
    await i18n.changeLanguage('vi');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/txn-title.test.ts`
Expected: FAIL — `Cannot find module './txn-title'`.

- [ ] **Step 3: Implement**

Create `src/lib/txn-title.ts`:

```ts
import { categoryLabel, categoryOf, INCOME_LABEL_KEY } from './categories';
import type { Category } from './categories';
import { i18n } from './i18n';
import type { Txn } from './transactions';

/**
 * Display text for a transaction: the user's note (`name`), else the legacy
 * `note` column, else the category label in the current language.
 */
export function txnTitle(
  txn: Pick<Txn, 'name' | 'note' | 'category' | 'isIncome'>,
  extras: Category[] = [],
): string {
  const name = txn.name?.trim() ?? '';
  if (name) return name;
  const note = txn.note?.trim() ?? '';
  if (note) return note;
  return txn.isIncome ? i18n.t(INCOME_LABEL_KEY) : categoryLabel(categoryOf(txn.category, extras));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/lib/txn-title.test.ts` → PASS.

- [ ] **Step 5: Write failing adoption tests**

In `src/components/sl/txn-card.test.tsx`, append inside `describe('TxnCard', …)`:

```tsx
  it('shows the category label as the title when name and note are empty', async () => {
    const { getAllByText } = await render(<TxnCard txn={{ ...baseTxn, name: '', note: null }} />);
    // once in the category chip, once as the title
    expect(getAllByText('Ăn uống')).toHaveLength(2);
  });
```

In `src/lib/export.test.ts`, append inside `describe('buildTransactionsCsv', …)`:

```ts
  it('writes the category label in the Name column when the note is empty', () => {
    const csv = buildTransactionsCsv([
      {
        id: 1, date: '2026-07-17', time: '8:00', createdAt: 1, category: 'food',
        name: '', note: null, amount: 30000, isIncome: false, photoPath: null,
        currency: 'VND', originalAmount: 30000, originalCurrency: 'VND',
      } as never,
    ]);
    expect(csv.slice(1).split('\n')[1]).toBe('2026-07-17,8:00,Ăn uống,Ăn uống,30000.00,VND,30000.00,VND,Expense');
  });
```

In `src/lib/share-transaction.test.ts`:
- In `it('includes all four fields when every toggle is on', …)` change `nameText: 'Latte size L',` to `nameText: 'Cà phê',`.
- Append inside `describe('buildShareOverlay', …)`:

```ts
  it('uses the category label for nameText when name and note are empty', () => {
    const overlay = buildShareOverlay({ ...baseTxn, name: '', note: null }, DEFAULT_SHARE_TOGGLES, foodCategory, '2026-07-24');
    expect(overlay.nameText).toBe('Ăn uống');
  });
```

- [ ] **Step 6: Run to verify failure**

Run: `npx jest src/components/sl/txn-card.test.tsx src/lib/export.test.ts src/lib/share-transaction.test.ts`
Expected: the new card test FAILS (title empty → one match), the export test FAILS (empty Name column), `includes all four fields` and the new share test FAIL.

- [ ] **Step 7: Adopt `txnTitle`**

`src/components/sl/transaction-row.tsx`:
- Add `import { txnTitle } from '@/lib/txn-title';`
- Replace `{txn.name}` with `{txnTitle(txn, extras)}`.

`src/components/sl/txn-card.tsx`:
- Add `import { txnTitle } from '@/lib/txn-title';`
- Replace `{txn.name || txn.note || ''}` with `{txnTitle(txn, extras)}`.

`src/app/transaction/[id].tsx`:
- Add `import { txnTitle } from '@/lib/txn-title';`
- Replace `{txn.name}` (the title `Text` under the amount) with `{txnTitle(txn, categoryExtras)}`.

`src/lib/export.ts`:
- Add `import { txnTitle } from './txn-title';`
- In `buildTransactionsCsv` replace the `t.name,` row cell with `txnTitle(t, extras),`.

`src/lib/share-transaction.ts`:
- Add `import { txnTitle } from './txn-title';`
- Replace `nameText: toggles.showName ? (txn.note ?? txn.name) : null,` with `nameText: toggles.showName ? txnTitle(txn, [category]) : null,`.

- [ ] **Step 8: Verify**

Run: `npx jest src/lib src/components` → PASS. Run the type-check gate.

- [ ] **Step 9: Commit**

```bash
git add src/lib/txn-title.ts src/lib/txn-title.test.ts src/components/sl/transaction-row.tsx src/components/sl/txn-card.tsx src/components/sl/txn-card.test.tsx "src/app/transaction/[id].tsx" src/lib/export.ts src/lib/export.test.ts src/lib/share-transaction.ts src/lib/share-transaction.test.ts
git commit -m "feat(display): show category label when a transaction has no note

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `frequentEntries` and `quickAmountsFor`

**Files:**
- Create: `src/lib/frequent-entries.ts`, `src/lib/quick-amounts.ts`
- Test: `src/lib/frequent-entries.test.ts`, `src/lib/quick-amounts.test.ts`

**Interfaces:**
- Consumes: `Txn` (`src/lib/transactions.ts`), `CategoryId`, `CurrencyCode`.
- Produces:
  ```ts
  export const SUGGESTION_WINDOW_MS: number; // 60 days
  export interface FrequentEntry {
    name: string; category: CategoryId; originalAmount: number;
    originalCurrency: CurrencyCode; count: number; lastUsedAt: number;
  }
  export function frequentEntries(txns: Txn[], now?: number, limit?: number): FrequentEntry[];
  export function quickAmountsFor(currency: CurrencyCode): number[];
  ```

- [ ] **Step 1: Write failing tests**

Create `src/lib/frequent-entries.test.ts`:

```ts
import { frequentEntries, SUGGESTION_WINDOW_MS } from './frequent-entries';
import type { Txn } from './transactions';

const NOW = new Date(2026, 8, 17, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
let seq = 0;

function tx(p: Partial<Txn>): Txn {
  seq += 1;
  return {
    id: seq, uuid: `u${seq}`, updatedAt: 0, date: '2026-09-17', time: '12:00',
    createdAt: NOW - DAY, category: 'food', name: 'Cà phê', note: null,
    amount: 29000, currency: 'VND', originalAmount: 29000, originalCurrency: 'VND',
    isIncome: false, photoPath: null, subscriptionUuid: null,
    ...p,
  };
}

describe('frequentEntries', () => {
  it('uses a 60-day window', () => {
    expect(SUGGESTION_WINDOW_MS).toBe(60 * DAY);
  });

  it('groups case-insensitively on trimmed name with category, amount and currency', () => {
    const result = frequentEntries([
      tx({ name: 'Cà phê' }), tx({ name: ' cà phê ' }), tx({ name: 'CÀ PHÊ' }),
    ], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });

  it('separates groups by amount, category or currency', () => {
    const result = frequentEntries([
      tx({}), tx({ originalAmount: 35000 }), tx({ category: 'fun' }), tx({ originalCurrency: 'USD', originalAmount: 29000 }),
    ], NOW);
    expect(result).toHaveLength(4);
  });

  it('excludes income, empty names and rows older than 60 days', () => {
    const result = frequentEntries([
      tx({ isIncome: true, name: 'Lương' }),
      tx({ name: '   ' }),
      tx({ name: 'Old', createdAt: NOW - 61 * DAY }),
      tx({ name: 'Edge', createdAt: NOW - 60 * DAY }),
    ], NOW);
    expect(result.map((e) => e.name)).toEqual(['Edge']);
  });

  it('sorts by count, then by most recent use', () => {
    const result = frequentEntries([
      tx({ name: 'A', createdAt: NOW - 5 * DAY }),
      tx({ name: 'B', createdAt: NOW - 1 * DAY }),
      tx({ name: 'B', createdAt: NOW - 2 * DAY }),
      tx({ name: 'C', createdAt: NOW - 1000 }),
    ], NOW);
    expect(result.map((e) => e.name)).toEqual(['B', 'C', 'A']);
  });

  it('keeps the display name and lastUsedAt of the most recent use', () => {
    const result = frequentEntries([
      tx({ name: 'cà phê', createdAt: NOW - 3 * DAY }),
      tx({ name: 'Cà Phê', createdAt: NOW - 1 * DAY }),
    ], NOW);
    expect(result[0].name).toBe('Cà Phê');
    expect(result[0].lastUsedAt).toBe(NOW - 1 * DAY);
  });

  it('limits the result', () => {
    const txns = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => tx({ name: n }));
    expect(frequentEntries(txns, NOW)).toHaveLength(5);
    expect(frequentEntries(txns, NOW, 2)).toHaveLength(2);
  });

  it('returns the group fields', () => {
    expect(frequentEntries([tx({ category: 'transport', originalAmount: 12000 })], NOW)[0]).toEqual({
      name: 'Cà phê', category: 'transport', originalAmount: 12000, originalCurrency: 'VND',
      count: 1, lastUsedAt: NOW - DAY,
    });
  });
});
```

Create `src/lib/quick-amounts.test.ts`:

```ts
import { quickAmountsFor } from './quick-amounts';

describe('quickAmountsFor', () => {
  it('returns VND presets', () => {
    expect(quickAmountsFor('VND')).toEqual([20000, 50000, 100000, 200000]);
  });

  it('returns nothing for other currencies', () => {
    expect(quickAmountsFor('USD')).toEqual([]);
    expect(quickAmountsFor('JPY')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/frequent-entries.test.ts src/lib/quick-amounts.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `src/lib/frequent-entries.ts`:

```ts
import type { CategoryId } from './categories';
import type { CurrencyCode } from './currency';
import type { Txn } from './transactions';

export const SUGGESTION_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export interface FrequentEntry {
  /** Display text taken from the most recent use in the group. */
  name: string;
  category: CategoryId;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  count: number;
  /** Largest `createdAt` in the group. */
  lastUsedAt: number;
}

/** Most frequent recent expenses, used as one-tap entry suggestions. */
export function frequentEntries(txns: Txn[], now: number = Date.now(), limit = 5): FrequentEntry[] {
  const since = now - SUGGESTION_WINDOW_MS;
  const groups = new Map<string, FrequentEntry>();
  for (const t of txns) {
    if (t.isIncome || t.createdAt < since) continue;
    const name = t.name.trim();
    if (!name) continue;
    const key = [name.toLowerCase(), t.category, t.originalAmount, t.originalCurrency].join('|');
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        name,
        category: t.category,
        originalAmount: t.originalAmount,
        originalCurrency: t.originalCurrency,
        count: 1,
        lastUsedAt: t.createdAt,
      });
      continue;
    }
    group.count += 1;
    if (t.createdAt > group.lastUsedAt) {
      group.lastUsedAt = t.createdAt;
      group.name = name;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit);
}
```

Create `src/lib/quick-amounts.ts`:

```ts
import type { CurrencyCode } from './currency';

/** One-tap amount presets; only VND has sensible round numbers. */
export function quickAmountsFor(currency: CurrencyCode): number[] {
  return currency === 'VND' ? [20000, 50000, 100000, 200000] : [];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/lib/frequent-entries.test.ts src/lib/quick-amounts.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/frequent-entries.ts src/lib/frequent-entries.test.ts src/lib/quick-amounts.ts src/lib/quick-amounts.test.ts
git commit -m "feat(entry): frequent-entry suggestions and quick amount presets

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Draft hook — optional note, initial values, suggestions, preset amounts

**Files:**
- Modify: `src/lib/use-draft-transaction.ts`
- Test: `src/lib/use-draft-transaction.test.ts`

**Interfaces:**
- Consumes: Task 2 `FrequentEntry`.
- Produces (additions to `DraftTransaction` / options):
  ```ts
  useDraftTransaction(opts: {
    existing?: Txn; primaryCurrency: CurrencyCode; initialNote?: string;
    initialAmountDigits?: string; initialCategory?: CategoryId;
  }): DraftTransaction
  // DraftTransaction gains:
  applySuggestion: (entry: FrequentEntry) => void;
  setAmount: (value: number) => void; // major units in the current currency
  // canSave === originalAmount > 0
  ```

- [ ] **Step 1: Update and add tests (failing)**

In `src/lib/use-draft-transaction.test.ts`:

1. Replace the whole test `it('recomputes canSave as amount and note change', …)` with:

```ts
  it('canSave depends only on a positive amount', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ primaryCurrency: 'VND' })
    );
    expect(result.current.canSave).toBe(false);

    await act(async () => result.current.setAmountDigits('50000'));
    expect(result.current.canSave).toBe(true); // note is optional

    await act(async () => result.current.setAmountDigits(''));
    expect(result.current.canSave).toBe(false);
  });
```

2. Append inside `describe('useDraftTransaction', …)`:

```ts
  it('applies initial amount digits and category for a new draft', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ primaryCurrency: 'VND', initialAmountDigits: '35.000', initialCategory: 'transport' })
    );
    expect(result.current.amountDigits).toBe('35000');
    expect(result.current.category).toBe('transport');
    expect(result.current.originalAmount).toBe(35000);
  });

  it('ignores initial amount and category when editing', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ existing: editingTxn, primaryCurrency: 'VND', initialAmountDigits: '1', initialCategory: 'fun' })
    );
    expect(result.current.amountDigits).toBe('45000');
    expect(result.current.category).toBe('food');
  });

  it('applySuggestion fills currency, amount, category and note', async () => {
    const { result } = await renderHook(() => useDraftTransaction({ primaryCurrency: 'VND' }));
    await act(async () => result.current.applySuggestion({
      name: 'Latte', category: 'fun', originalAmount: 4.5, originalCurrency: 'USD', count: 2, lastUsedAt: 1,
    }));
    expect(result.current.currency).toBe('USD');
    expect(result.current.amountDigits).toBe('450');
    expect(result.current.originalAmount).toBe(4.5);
    expect(result.current.category).toBe('fun');
    expect(result.current.note).toBe('Latte');
  });

  it('setAmount converts a major-unit value to digits in the current currency', async () => {
    const { result } = await renderHook(() => useDraftTransaction({ primaryCurrency: 'VND' }));
    await act(async () => result.current.setAmount(50000));
    expect(result.current.amountDigits).toBe('50000');

    const usd = await renderHook(() => useDraftTransaction({ primaryCurrency: 'USD' }));
    await act(async () => usd.result.current.setAmount(12.5));
    expect(usd.result.current.amountDigits).toBe('1250');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/use-draft-transaction.test.ts`
Expected: FAIL — `canSave` still requires a note; `applySuggestion`/`setAmount` are not functions; initial values ignored.

- [ ] **Step 3: Implement**

In `src/lib/use-draft-transaction.ts`:

1. Imports become:
```ts
import { useMemo, useState } from 'react';

import { CURRENCY_META, type CurrencyCode } from './currency';
import type { CategoryId } from './categories';
import { formatHHMM, toDateKey } from './format';
import type { FrequentEntry } from './frequent-entries';
import type { NewTxn, Txn } from './transactions';
```

2. Add to `interface DraftTransaction` (after `canSave: boolean;`):
```ts
  /** Fill currency, amount, category and note from a suggestion. */
  applySuggestion: (entry: FrequentEntry) => void;
  /** Set the amount from a major-unit value in the current currency. */
  setAmount: (value: number) => void;
```

3. Add a sanitiser above `useDraftTransaction` and use it in `setAmountDigits`:
```ts
function sanitizeDigits(v: string): string {
  return v.replace(/\D/g, '').slice(0, MAX_AMOUNT_DIGITS);
}
```

4. Replace the hook's options, state initialisers, `setAmountDigits`, `canSave` and return with:
```ts
export function useDraftTransaction(opts: {
  existing?: Txn;
  primaryCurrency: CurrencyCode;
  initialNote?: string;
  initialAmountDigits?: string;
  initialCategory?: CategoryId;
}): DraftTransaction {
  const { existing, primaryCurrency, initialNote, initialAmountDigits, initialCategory } = opts;

  const [isIncome, setIsIncome] = useState(existing?.isIncome ?? false);
  const [currency, setCurrency] = useState<CurrencyCode>(
    existing ? existing.originalCurrency : primaryCurrency,
  );
  const [amountDigits, setAmountDigitsRaw] = useState<string>(
    existing
      ? digitsFromExistingAmount(existing.originalAmount, existing.originalCurrency)
      : sanitizeDigits(initialAmountDigits ?? ''),
  );
  const [category, setCategory] = useState<CategoryId>(
    existing ? existing.category : (initialCategory ?? 'food'),
  );
  const [note, setNote] = useState(mergeExistingText(existing) || initialNote || '');
  const [selectedDate, setSelectedDate] = useState<Date>(
    existing ? new Date(existing.createdAt) : new Date(),
  );

  const setAmountDigits = (v: string) => {
    setAmountDigitsRaw(sanitizeDigits(v));
  };

  const setAmount = (value: number) => {
    setAmountDigitsRaw(sanitizeDigits(digitsFromExistingAmount(value, currency)));
  };

  const applySuggestion = (entry: FrequentEntry) => {
    setCurrency(entry.originalCurrency);
    setAmountDigitsRaw(sanitizeDigits(digitsFromExistingAmount(entry.originalAmount, entry.originalCurrency)));
    setCategory(entry.category);
    setNote(entry.name);
  };

  const originalAmount = useMemo(() => {
    if (!amountDigits) return 0;
    const n = Number(amountDigits);
    return CURRENCY_META[currency].decimals === 2 ? n / 100 : n;
  }, [amountDigits, currency]);

  const canSave = originalAmount > 0;

  return {
    isIncome, setIsIncome,
    currency, setCurrency,
    amountDigits, setAmountDigits,
    category, setCategory,
    note, setNote,
    selectedDate, setSelectedDate,
    originalAmount, canSave,
    applySuggestion, setAmount,
  };
}
```

(Leave `digitsFromExistingAmount`, `mergeExistingText`, `BuildTxnPayloadInput` and `buildTxnPayload` unchanged.)

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/lib/use-draft-transaction.test.ts` → PASS. Run the type-check gate (Entry still compiles: it does not use removed fields).

- [ ] **Step 5: Commit**

```bash
git add src/lib/use-draft-transaction.ts src/lib/use-draft-transaction.test.ts
git commit -m "feat(entry): optional note, initial values and suggestions in the draft hook

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: i18n strings for quick add, toast and new accessibility labels

**Files:**
- Modify: `src/lib/i18n/locales/vi.json`, `src/lib/i18n/locales/en.json`, `src/lib/i18n/locales.test.ts`

**Interfaces:**
- Produces keys: `quick_add.title`, `quick_add.note_placeholder`, `quick_add.details`, `toast.saved` (`{{amount}}`), `toast.undo`, `toast.undone`, `a11y.quick_add`, `a11y.pick_photo`, `a11y.edit_note` (`{{note}}`), `a11y.suggestion` (`{{note}}`, `{{amount}}`).

- [ ] **Step 1: Write the failing test**

In `src/lib/i18n/locales.test.ts`:
- Extend `A11Y_KEYS` with `'quick_add', 'pick_photo', 'edit_note', 'suggestion'`.
- Append inside `describe('locale files', …)`:

```ts
  it('define the quick-add and toast strings', () => {
    const viKeys = keysOf(vi);
    for (const k of [
      'quick_add.title', 'quick_add.note_placeholder', 'quick_add.details',
      'toast.saved', 'toast.undo', 'toast.undone',
    ]) expect(viKeys).toContain(k);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/i18n/locales.test.ts` → the a11y and quick-add tests FAIL.

- [ ] **Step 3: Add strings**

In `src/lib/i18n/locales/vi.json`:
- Add these two top-level groups immediately before the `"a11y"` group:
```json
  "quick_add": {
    "title": "Nhập nhanh",
    "note_placeholder": "Ghi chú (tuỳ chọn)",
    "details": "Chi tiết…"
  },
  "toast": {
    "saved": "Đã lưu {{amount}}",
    "undo": "Hoàn tác",
    "undone": "Đã hoàn tác"
  },
```
- Add to the end of the `"a11y"` group (comma after the previous last entry):
```json
    "quick_add": "Nhập nhanh",
    "pick_photo": "Chọn ảnh từ thư viện",
    "edit_note": "Sửa ghi chú: {{note}}",
    "suggestion": "Điền {{note}} {{amount}}"
```

In `src/lib/i18n/locales/en.json`, same positions:
```json
  "quick_add": {
    "title": "Quick add",
    "note_placeholder": "Note (optional)",
    "details": "More details…"
  },
  "toast": {
    "saved": "Saved {{amount}}",
    "undo": "Undo",
    "undone": "Undone"
  },
```
```json
    "quick_add": "Quick add",
    "pick_photo": "Choose photo from library",
    "edit_note": "Edit note: {{note}}",
    "suggestion": "Fill {{note}} {{amount}}"
```

- [ ] **Step 4: Verify**

Run: `npx jest src/lib/i18n` → PASS (parity included).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/locales/vi.json src/lib/i18n/locales/en.json src/lib/i18n/locales.test.ts
git commit -m "feat(i18n): quick-add, toast and accessibility strings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Toast provider and view

**Files:**
- Create: `src/lib/toast-context.tsx`, `src/components/sl/toast.tsx`
- Test: `src/lib/toast-context.test.tsx`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Produces:
  ```ts
  export const DEFAULT_TOAST_MS = 5000;
  export interface ToastOptions { message: string; actionLabel?: string; onAction?: () => void; durationMs?: number }
  export function ToastProvider(props: { children: React.ReactNode }): React.JSX.Element;
  export function useToast(): { show: (opts: ToastOptions) => void; hide: () => void };
  // src/components/sl/toast.tsx
  export function Toast(props: { message: string; actionLabel?: string; onAction?: () => void }): React.JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/toast-context.test.tsx`:

```tsx
import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from '@/components/sl/text';
import { ToastProvider, useToast, type ToastOptions } from './toast-context';

const METRICS = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
};

function Trigger({ id, opts }: { id: string; opts: ToastOptions }) {
  const { show } = useToast();
  return (
    <Pressable testID={id} onPress={() => show(opts)}>
      <Text>{id}</Text>
    </Pressable>
  );
}

function renderWithToast(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('ToastProvider', () => {
  it('shows the message', async () => {
    const { getByTestId, getByText } = await renderWithToast(<Trigger id="a" opts={{ message: 'Saved' }} />);
    await act(async () => { fireEvent.press(getByTestId('a')); });
    expect(getByText('Saved')).toBeTruthy();
  });

  it('hides, then calls onAction when the action is pressed', async () => {
    const calls: string[] = [];
    let visibleDuringAction: boolean | null = null;
    const utils = await renderWithToast(
      <Trigger id="a" opts={{
        message: 'Saved', actionLabel: 'Undo',
        onAction: () => { calls.push('undo'); visibleDuringAction = utils.queryByText('Saved') !== null; },
      }} />,
    );
    await act(async () => { fireEvent.press(utils.getByTestId('a')); });
    await act(async () => { fireEvent.press(utils.getByRole('button', { name: 'Undo' })); });
    expect(calls).toEqual(['undo']);
    expect(visibleDuringAction).toBe(true); // onAction runs in the same tick; state update not yet flushed
    expect(utils.queryByText('Saved')).toBeNull();
  });

  it('lets onAction show a follow-up toast', async () => {
    function UndoFlow() {
      const { show } = useToast();
      return (
        <Pressable testID="go" onPress={() => show({
          message: 'Saved', actionLabel: 'Undo',
          onAction: () => show({ message: 'Undone', durationMs: 2000 }),
        })}>
          <Text>go</Text>
        </Pressable>
      );
    }
    const { getByTestId, getByRole, getByText, queryByText } = await renderWithToast(<UndoFlow />);
    await act(async () => { fireEvent.press(getByTestId('go')); });
    await act(async () => { fireEvent.press(getByRole('button', { name: 'Undo' })); });
    expect(queryByText('Saved')).toBeNull();
    expect(getByText('Undone')).toBeTruthy();
  });

  it('auto-hides after durationMs', async () => {
    const { getByTestId, queryByText } = await renderWithToast(<Trigger id="a" opts={{ message: 'Bye', durationMs: 1000 }} />);
    await act(async () => { fireEvent.press(getByTestId('a')); });
    await act(async () => { jest.advanceTimersByTime(999); });
    expect(queryByText('Bye')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(queryByText('Bye')).toBeNull();
  });

  it('defaults to 5 seconds', async () => {
    const { getByTestId, queryByText } = await renderWithToast(<Trigger id="a" opts={{ message: 'Bye' }} />);
    await act(async () => { fireEvent.press(getByTestId('a')); });
    await act(async () => { jest.advanceTimersByTime(4999); });
    expect(queryByText('Bye')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(queryByText('Bye')).toBeNull();
  });

  it('replaces the current toast and restarts the timer', async () => {
    const { getByTestId, queryByText } = await renderWithToast(
      <>
        <Trigger id="a" opts={{ message: 'First', durationMs: 1000 }} />
        <Trigger id="b" opts={{ message: 'Second', durationMs: 1000 }} />
      </>,
    );
    await act(async () => { fireEvent.press(getByTestId('a')); });
    await act(async () => { jest.advanceTimersByTime(800); });
    await act(async () => { fireEvent.press(getByTestId('b')); });
    expect(queryByText('First')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(800); });
    expect(queryByText('Second')).toBeTruthy();
  });
});
```

(If the `visibleDuringAction` assertion proves unreliable because the test renderer flushes synchronously, delete that single assertion and its variable — the follow-up-toast test is the behaviour that matters. Record the removal in your report.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/toast-context.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement the view**

Create `src/components/sl/toast.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/sl/text';
import { AccentGradient, W } from '@/constants/tokens';

export function Toast({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [opacity]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 24, opacity }]}>
      <Animated.View style={styles.pill} accessibilityLiveRegion="polite">
        <Text numberOfLines={2} style={styles.message}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
    elevation: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    maxWidth: 480,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(20,20,20,0.92)',
  },
  message: { flexShrink: 1, color: '#fff', fontSize: 14, fontWeight: W.semibold },
  action: { color: AccentGradient[1], fontSize: 14, fontWeight: W.extrabold },
});
```

- [ ] **Step 4: Implement the provider**

Create `src/lib/toast-context.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Toast } from '@/components/sl/toast';

export const DEFAULT_TOAST_MS = 5000;

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastContextValue {
  show: (opts: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback((opts: ToastOptions) => {
    clearTimer();
    seqRef.current += 1;
    setToast({ ...opts, id: seqRef.current });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, opts.durationMs ?? DEFAULT_TOAST_MS);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  const onAction = toast?.onAction;
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={onAction ? () => { hide(); onAction(); } : undefined}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx jest src/lib/toast-context.test.tsx` → PASS.

- [ ] **Step 6: Mount at the root**

In `src/app/_layout.tsx`:
- Add `import { ToastProvider } from '@/lib/toast-context';`
- Inside `ThemedShell`, wrap the `Stack` and the lock overlay:

```tsx
        <BottomSheetModalProvider>
          <ToastProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
              }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="home" />
              <Stack.Screen name="history" />
              <Stack.Screen name="history-months" />
              <Stack.Screen name="gallery" />
              <Stack.Screen name="entry" options={{ presentation: 'modal' }} />
              <Stack.Screen name="transaction/[id]" />
              <Stack.Screen name="subscriptions" />
              <Stack.Screen name="compare" />
              <Stack.Screen name="share" />
            </Stack>
            {isLocked && <LockScreen biometricEnabled={settings.appLockBiometricEnabled} onUnlock={unlock} />}
          </ToastProvider>
        </BottomSheetModalProvider>
```

- [ ] **Step 7: Verify**

Run: `npx jest` → all PASS. Type-check gate. `npx eslint --quiet src/lib/toast-context.tsx src/components/sl/toast.tsx src/app/_layout.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/toast-context.tsx src/lib/toast-context.test.tsx src/components/sl/toast.tsx src/app/_layout.tsx
git commit -m "feat(ui): root toast provider with action and auto-hide

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `useSaveTransaction` (haptics, Undo, budget alert)

**Files:**
- Create: `src/lib/use-save-transaction.ts`
- Test: `src/lib/use-save-transaction.test.tsx`
- Modify: `package.json`, `package-lock.json` (via `npx expo install expo-haptics`)

**Interfaces:**
- Consumes: `useTransactions()` → `{ add(input): number; update(id, input): void; remove(id): void; transactions: Txn[] }`; `useSettings()` → `{ settings, rates, update }`; Task 5 `useToast()`; `decideBudgetAlert` (`src/lib/budget-alert.ts`); `fireBudgetAlert` (`src/lib/notifications.ts`); `convert` (`src/lib/fx.ts`); `signedMoney`, `toDateKey` (`src/lib/format.ts`); Task 4 keys `toast.saved`, `toast.undo`, `toast.undone`.
- Produces:
  ```ts
  export function useSaveTransaction(): {
    saveNew: (payload: NewTxn) => Promise<number | null>;
    saveEdit: (id: number, payload: NewTxn) => Promise<boolean>;
  };
  ```

- [ ] **Step 1: Install the dependency**

Run: `npx expo install expo-haptics`
Expected: `package.json` gains `"expo-haptics": "~57.0.x"` and the lock file updates. No other dependency versions change (`git diff package.json` shows one added line).

- [ ] **Step 2: Write the failing test**

Create `src/lib/use-save-transaction.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

import { toDateKey } from './format';
import { i18n } from './i18n';
import { fireBudgetAlert } from './notifications';
import type { NewTxn, Txn } from './transactions';
import { useSaveTransaction } from './use-save-transaction';

const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
let mockTransactions: Txn[] = [];
jest.mock('./transactions-context', () => ({
  useTransactions: () => ({ add: mockAdd, update: mockUpdate, remove: mockRemove, transactions: mockTransactions }),
}));

let mockSettings = { primaryCurrency: 'VND', monthlyBudget: 0, budgetAlertsEnabled: true, budgetNotifiedMonth: '' };
const mockUpdateSettings = jest.fn();
jest.mock('./settings-context', () => ({
  useSettings: () => ({ settings: mockSettings, rates: {}, update: mockUpdateSettings }),
}));

const mockShow = jest.fn();
jest.mock('./toast-context', () => ({
  useToast: () => ({ show: mockShow, hide: jest.fn() }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('./notifications', () => ({
  fireBudgetAlert: jest.fn().mockResolvedValue(undefined),
}));

const payload: NewTxn = {
  date: '2026-09-17', time: '10:00', createdAt: 1,
  category: 'food', name: 'Cà phê', note: null,
  originalAmount: 45000, originalCurrency: 'VND', isIncome: false, photoPath: null,
};

beforeAll(async () => { await i18n.changeLanguage('vi'); });

beforeEach(() => {
  jest.clearAllMocks();
  mockTransactions = [];
  mockSettings = { primaryCurrency: 'VND', monthlyBudget: 0, budgetAlertsEnabled: true, budgetNotifiedMonth: '' };
  mockAdd.mockReturnValue(7);
});

describe('useSaveTransaction', () => {
  it('saveNew adds, vibrates and shows an Undo toast', async () => {
    const { result } = await renderHook(() => useSaveTransaction());
    let id: number | null = null;
    await act(async () => { id = await result.current.saveNew(payload); });

    expect(id).toBe(7);
    expect(mockAdd).toHaveBeenCalledWith(payload);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({
      message: i18n.t('toast.saved', { amount: '−45.000₫' }),
      actionLabel: i18n.t('toast.undo'),
    }));
  });

  it('Undo removes the transaction and confirms', async () => {
    const { result } = await renderHook(() => useSaveTransaction());
    await act(async () => { await result.current.saveNew(payload); });
    const { onAction } = mockShow.mock.calls[0][0];
    await act(async () => { onAction(); });

    expect(mockRemove).toHaveBeenCalledWith(7);
    expect(mockShow).toHaveBeenLastCalledWith({ message: i18n.t('toast.undone'), durationMs: 2000 });
  });

  it('Undo still confirms when the row is already gone', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRemove.mockImplementation(() => { throw new Error('gone'); });
    const { result } = await renderHook(() => useSaveTransaction());
    await act(async () => { await result.current.saveNew(payload); });
    await act(async () => { mockShow.mock.calls[0][0].onAction(); });
    expect(mockShow).toHaveBeenLastCalledWith({ message: i18n.t('toast.undone'), durationMs: 2000 });
    mockRemove.mockReset();
    warn.mockRestore();
  });

  it('saveNew alerts and returns null when the insert fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAdd.mockImplementation(() => { throw new Error('db'); });
    const { result } = await renderHook(() => useSaveTransaction());
    let id: number | null = 1;
    await act(async () => { id = await result.current.saveNew(payload); });

    expect(id).toBeNull();
    expect(alert).toHaveBeenCalledWith(i18n.t('common.save_failed_title'), i18n.t('common.save_failed_body'));
    expect(mockShow).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    warn.mockRestore();
    alert.mockRestore();
  });

  it('saveEdit updates and vibrates without a toast', async () => {
    const { result } = await renderHook(() => useSaveTransaction());
    let ok = false;
    await act(async () => { ok = await result.current.saveEdit(3, payload); });
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(3, payload);
    expect(Haptics.notificationAsync).toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('saveEdit alerts and returns false when the update fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUpdate.mockImplementation(() => { throw new Error('db'); });
    const { result } = await renderHook(() => useSaveTransaction());
    let ok = true;
    await act(async () => { ok = await result.current.saveEdit(3, payload); });
    expect(ok).toBe(false);
    expect(alert).toHaveBeenCalled();
    mockUpdate.mockReset();
    warn.mockRestore();
    alert.mockRestore();
  });

  it('fires the 80% budget alert for an expense crossing the threshold', async () => {
    const month = toDateKey(new Date()).slice(0, 7);
    mockSettings = { ...mockSettings, monthlyBudget: 100000 };
    mockTransactions = [{
      id: 1, uuid: 'u', updatedAt: 0, date: `${month}-01`, time: '09:00', createdAt: 0,
      category: 'food', name: 'x', note: null, amount: 50000, currency: 'VND',
      originalAmount: 50000, originalCurrency: 'VND', isIncome: false, photoPath: null, subscriptionUuid: null,
    }];
    const { result } = await renderHook(() => useSaveTransaction());
    await act(async () => { await result.current.saveNew({ ...payload, originalAmount: 40000 }); });

    expect(mockUpdateSettings).toHaveBeenCalledWith('budgetNotifiedMonth', `${month}:80`);
    expect(fireBudgetAlert).toHaveBeenCalledWith(80);
  });

  it('does not check the budget for income', async () => {
    mockSettings = { ...mockSettings, monthlyBudget: 1000 };
    const { result } = await renderHook(() => useSaveTransaction());
    await act(async () => { await result.current.saveNew({ ...payload, isIncome: true }); });
    expect(fireBudgetAlert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/lib/use-save-transaction.test.tsx` → FAIL (module not found).

- [ ] **Step 4: Implement**

Create `src/lib/use-save-transaction.ts`:

```ts
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { decideBudgetAlert } from './budget-alert';
import { signedMoney, toDateKey } from './format';
import { convert } from './fx';
import { useT } from './i18n';
import { fireBudgetAlert } from './notifications';
import { useSettings } from './settings-context';
import { useToast } from './toast-context';
import type { NewTxn } from './transactions';
import { useTransactions } from './transactions-context';

const UNDONE_TOAST_MS = 2000;

function successHaptic(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // haptics unavailable — ignore
  }
}

/** Saves transactions with haptic feedback, an Undo toast and budget alerts. */
export function useSaveTransaction() {
  const { t } = useT();
  const { add, update, remove, transactions } = useTransactions();
  const { settings, rates, update: updateSettings } = useSettings();
  const toast = useToast();

  const saveNew = useCallback(async (payload: NewTxn): Promise<number | null> => {
    let id: number;
    try {
      id = add(payload);
    } catch (err) {
      console.warn('Failed to save transaction', err);
      Alert.alert(t('common.save_failed_title'), t('common.save_failed_body'));
      return null;
    }

    successHaptic();

    const primary = settings.primaryCurrency;
    const primaryAmount = convert(payload.originalAmount, payload.originalCurrency, primary, rates);
    toast.show({
      message: t('toast.saved', { amount: signedMoney(primaryAmount, primary, payload.isIncome) }),
      actionLabel: t('toast.undo'),
      onAction: () => {
        try {
          remove(id);
        } catch (err) {
          console.warn('Failed to undo transaction', err);
        }
        toast.show({ message: t('toast.undone'), durationMs: UNDONE_TOAST_MS });
      },
    });

    if (!payload.isIncome) {
      const budget = settings.monthlyBudget;
      if (budget > 0 && settings.budgetAlertsEnabled) {
        const currentMonth = toDateKey(new Date()).slice(0, 7);
        const spent = transactions
          .filter((tx) => !tx.isIncome && tx.date.slice(0, 7) === currentMonth)
          .reduce((s, tx) => s + tx.amount, 0) + primaryAmount;
        const fireLevel = decideBudgetAlert({
          spent,
          budget,
          notifiedMonth: settings.budgetNotifiedMonth,
          currentMonth,
        });
        if (fireLevel) {
          updateSettings('budgetNotifiedMonth', `${currentMonth}:${fireLevel}`);
          try {
            await fireBudgetAlert(fireLevel);
          } catch (err) {
            console.warn('Failed to fire budget alert', err);
          }
        }
      }
    }

    return id;
  }, [add, remove, transactions, settings, rates, updateSettings, toast, t]);

  const saveEdit = useCallback(async (id: number, payload: NewTxn): Promise<boolean> => {
    try {
      update(id, payload);
    } catch (err) {
      console.warn('Failed to save transaction', err);
      Alert.alert(t('common.save_failed_title'), t('common.save_failed_body'));
      return false;
    }
    successHaptic();
    return true;
  }, [update, t]);

  return { saveNew, saveEdit };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx jest src/lib/use-save-transaction.test.tsx` → PASS. Then `npx jest` (full) and the type-check gate.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/use-save-transaction.ts src/lib/use-save-transaction.test.tsx
git commit -m "feat(entry): shared save hook with haptics, Undo toast and budget alert

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Suggestion and quick-amount chip rows

**Files:**
- Create: `src/components/sl/suggestion-chips.tsx`, `src/components/sl/quick-amount-chips.tsx`
- Test: `src/components/sl/suggestion-chips.test.tsx`, `src/components/sl/quick-amount-chips.test.tsx`

**Interfaces:**
- Consumes: Task 2 `FrequentEntry`, `quickAmountsFor`; Task 4 key `a11y.suggestion`; `formatCompact`, `formatMoney`; `categoryOf`, `Category`.
- Produces:
  ```ts
  export function SuggestionChips(props: { entries: FrequentEntry[]; onPick: (entry: FrequentEntry) => void; extras?: Category[] }): React.JSX.Element | null;
  export function QuickAmountChips(props: { currency: CurrencyCode; onPick: (amount: number) => void }): React.JSX.Element | null;
  ```

- [ ] **Step 1: Write failing tests**

Create `src/components/sl/suggestion-chips.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';

import type { FrequentEntry } from '@/lib/frequent-entries';
import { i18n } from '@/lib/i18n';
import { SuggestionChips } from './suggestion-chips';

const entry: FrequentEntry = {
  name: 'Cà phê', category: 'food', originalAmount: 29000, originalCurrency: 'VND', count: 3, lastUsedAt: 1,
};

beforeAll(async () => { await i18n.changeLanguage('vi'); });

describe('SuggestionChips', () => {
  it('renders nothing without entries', async () => {
    const { toJSON } = await render(<SuggestionChips entries={[]} onPick={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('renders "name · compact amount" and reports the picked entry', async () => {
    const onPick = jest.fn();
    const { getByText } = await render(<SuggestionChips entries={[entry]} onPick={onPick} />);
    fireEvent.press(getByText('Cà phê · 29k'));
    expect(onPick).toHaveBeenCalledWith(entry);
  });

  it('labels each chip for screen readers', async () => {
    const { getByRole } = await render(<SuggestionChips entries={[entry]} onPick={jest.fn()} />);
    expect(getByRole('button', { name: i18n.t('a11y.suggestion', { note: 'Cà phê', amount: '29k' }) })).toBeTruthy();
  });
});
```

Create `src/components/sl/quick-amount-chips.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';

import { QuickAmountChips } from './quick-amount-chips';

describe('QuickAmountChips', () => {
  it('renders VND presets and reports the picked amount', async () => {
    const onPick = jest.fn();
    const { getByText } = await render(<QuickAmountChips currency="VND" onPick={onPick} />);
    for (const label of ['20k', '50k', '100k', '200k']) expect(getByText(label)).toBeTruthy();
    fireEvent.press(getByText('50k'));
    expect(onPick).toHaveBeenCalledWith(50000);
  });

  it('renders nothing for currencies without presets', async () => {
    const { toJSON } = await render(<QuickAmountChips currency="USD" onPick={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/components/sl/suggestion-chips.test.tsx src/components/sl/quick-amount-chips.test.tsx` → FAIL (modules not found).

- [ ] **Step 3: Implement**

Create `src/components/sl/suggestion-chips.tsx`:

```tsx
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, W } from '@/constants/tokens';
import { categoryOf, type Category } from '@/lib/categories';
import { formatCompact } from '@/lib/format';
import type { FrequentEntry } from '@/lib/frequent-entries';
import { useT } from '@/lib/i18n';

export function SuggestionChips({
  entries,
  onPick,
  extras = [],
}: {
  entries: FrequentEntry[];
  onPick: (entry: FrequentEntry) => void;
  extras?: Category[];
}) {
  const c = useColors();
  const { t } = useT();
  if (entries.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}>
      {entries.map((entry) => {
        const amount = formatCompact(entry.originalAmount, entry.originalCurrency);
        return (
          <Pressable
            key={`${entry.name}|${entry.category}|${entry.originalAmount}|${entry.originalCurrency}`}
            onPress={() => onPick(entry)}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.suggestion', { note: entry.name, amount })}
            style={({ pressed }) => [styles.chip, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.dot, { backgroundColor: categoryOf(entry.category, extras).fg }]} />
            <Text numberOfLines={1} style={[styles.label, { color: c.chipText }]}>
              {`${entry.name} · ${amount}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.chip,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: W.semibold, maxWidth: 180 },
});
```

Create `src/components/sl/quick-amount-chips.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, W } from '@/constants/tokens';
import type { CurrencyCode } from '@/lib/currency';
import { formatCompact, formatMoney } from '@/lib/format';
import { quickAmountsFor } from '@/lib/quick-amounts';

export function QuickAmountChips({
  currency,
  onPick,
}: {
  currency: CurrencyCode;
  onPick: (amount: number) => void;
}) {
  const c = useColors();
  const amounts = quickAmountsFor(currency);
  if (amounts.length === 0) return null;
  return (
    <View style={styles.row}>
      {amounts.map((amount) => (
        <Pressable
          key={amount}
          onPress={() => onPick(amount)}
          accessibilityRole="button"
          accessibilityLabel={formatMoney(amount, currency)}
          style={({ pressed }) => [styles.chip, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.label, { color: c.chipText }]}>{formatCompact(amount, currency)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.chip },
  label: { fontSize: 13, fontWeight: W.bold },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/components/sl/suggestion-chips.test.tsx src/components/sl/quick-amount-chips.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sl/suggestion-chips.tsx src/components/sl/suggestion-chips.test.tsx src/components/sl/quick-amount-chips.tsx src/components/sl/quick-amount-chips.test.tsx
git commit -m "feat(ui): suggestion and quick-amount chip rows

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: `QuickAddSheet`

**Files:**
- Create: `src/components/sl/quick-add-sheet.tsx`
- Test: `src/components/sl/quick-add-sheet.test.tsx`

**Interfaces:**
- Consumes: Task 2 `frequentEntries`; Task 3 `useDraftTransaction` (`initialNote`, `initialCategory`, `applySuggestion`, `setAmount`), `buildTxnPayload`; Task 6 `useSaveTransaction().saveNew`; Task 7 `SuggestionChips`, `QuickAmountChips`; `useTransactions()` (`transactions`, `userCategories`); `useSettings()` (`settings.primaryCurrency`); `toCategoryObj`; `STATIC_CATEGORIES`; `CategoryChip`; `GradientButton`; Task 4 keys `quick_add.*`; existing `entry.save_expense`, `entry.amount_label`.
- Produces:
  ```ts
  export interface QuickAddDetailsParams { amount?: string; category?: string; note?: string }
  export interface QuickAddSheetHandle { present: (initialNote?: string) => void; dismiss: () => void }
  export const QuickAddSheet: React.ForwardRefExoticComponent<{
    onSaved?: () => void;
    onOpenDetails: (params: QuickAddDetailsParams) => void;
  } & React.RefAttributes<QuickAddSheetHandle>>;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/sl/quick-add-sheet.test.tsx`:

```tsx
import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';

import { i18n } from '@/lib/i18n';
import type { Txn } from '@/lib/transactions';
import { QuickAddSheet, type QuickAddSheetHandle } from './quick-add-sheet';

let mockTransactions: Txn[] = [];
jest.mock('@/lib/transactions-context', () => ({
  useTransactions: () => ({ transactions: mockTransactions, userCategories: [] }),
}));

let mockPrimary = 'VND';
jest.mock('@/lib/settings-context', () => ({
  useSettings: () => ({ settings: { primaryCurrency: mockPrimary } }),
}));

const mockSaveNew = jest.fn();
jest.mock('@/lib/use-save-transaction', () => ({
  useSaveTransaction: () => ({ saveNew: mockSaveNew, saveEdit: jest.fn() }),
}));

function txn(p: Partial<Txn>): Txn {
  return {
    id: 1, uuid: 'u', updatedAt: 0, date: '2026-09-17', time: '09:00', createdAt: Date.now() - 1000,
    category: 'transport', name: 'Grab', note: null, amount: 29000, currency: 'VND',
    originalAmount: 29000, originalCurrency: 'VND', isIncome: false, photoPath: null, subscriptionUuid: null,
    ...p,
  };
}

async function setup(onOpenDetails = jest.fn(), onSaved = jest.fn()) {
  const ref = createRef<QuickAddSheetHandle>();
  const utils = await render(<QuickAddSheet ref={ref} onOpenDetails={onOpenDetails} onSaved={onSaved} />);
  return { ref, onOpenDetails, onSaved, ...utils };
}

const saveLabel = () => i18n.t('entry.save_expense');

beforeAll(async () => { await i18n.changeLanguage('vi'); });

beforeEach(() => {
  jest.clearAllMocks();
  mockTransactions = [];
  mockPrimary = 'VND';
  mockSaveNew.mockResolvedValue(10);
});

describe('QuickAddSheet', () => {
  it('does not save while the amount is empty', async () => {
    const { getByText } = await setup();
    await act(async () => { fireEvent.press(getByText(saveLabel())); });
    expect(mockSaveNew).not.toHaveBeenCalled();
  });

  it('saves amount + category with an empty note', async () => {
    const { getByTestId, getByText, onSaved } = await setup();
    await act(async () => { fireEvent.changeText(getByTestId('quick-add-amount'), '35000'); });
    await act(async () => { fireEvent.press(getByText(i18n.t('category.transport'))); });
    await act(async () => { fireEvent.press(getByText(saveLabel())); });

    expect(mockSaveNew).toHaveBeenCalledWith(expect.objectContaining({
      name: '', note: null, category: 'transport', originalAmount: 35000,
      originalCurrency: 'VND', isIncome: false, photoPath: null,
    }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('does not call onSaved when saving fails', async () => {
    mockSaveNew.mockResolvedValue(null);
    const { getByTestId, getByText, onSaved } = await setup();
    await act(async () => { fireEvent.changeText(getByTestId('quick-add-amount'), '1000'); });
    await act(async () => { fireEvent.press(getByText(saveLabel())); });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('fills the form from a suggestion chip', async () => {
    mockTransactions = [txn({ name: 'Grab', category: 'transport', originalAmount: 29000 })];
    const { getByText, getByTestId } = await setup();
    await act(async () => { fireEvent.press(getByText('Grab · 29k')); });
    expect(getByTestId('quick-add-amount').props.value).toBe('29.000');
    expect(getByTestId('quick-add-note').props.value).toBe('Grab');
    await act(async () => { fireEvent.press(getByText(saveLabel())); });
    expect(mockSaveNew).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Grab', category: 'transport', originalAmount: 29000,
    }));
  });

  it('defaults the category to the most recent expense', async () => {
    mockTransactions = [txn({ category: 'fun', name: '' }), txn({ id: 2, category: 'food' })];
    const { getByTestId, getByText } = await setup();
    await act(async () => { fireEvent.changeText(getByTestId('quick-add-amount'), '1000'); });
    await act(async () => { fireEvent.press(getByText(saveLabel())); });
    expect(mockSaveNew).toHaveBeenCalledWith(expect.objectContaining({ category: 'fun' }));
  });

  it('sets the amount from a VND quick-amount chip', async () => {
    const { getByText, getByTestId } = await setup();
    await act(async () => { fireEvent.press(getByText('50k')); });
    expect(getByTestId('quick-add-amount').props.value).toBe('50.000');
  });

  it('hides quick amounts for non-VND primary currency', async () => {
    mockPrimary = 'USD';
    const { queryByText } = await setup();
    expect(queryByText('50k')).toBeNull();
  });

  it('prefills the note passed to present()', async () => {
    const { ref, getByTestId } = await setup();
    await act(async () => { ref.current?.present('Trà sữa'); });
    expect(getByTestId('quick-add-note').props.value).toBe('Trà sữa');
  });

  it('opens details with the current values, omitting empty ones', async () => {
    const { getByTestId, getByText, onOpenDetails } = await setup();
    await act(async () => { fireEvent.changeText(getByTestId('quick-add-amount'), '12000'); });
    await act(async () => { fireEvent.press(getByText(i18n.t('quick_add.details'))); });
    expect(onOpenDetails).toHaveBeenCalledWith({ amount: '12000', category: 'food' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/components/sl/quick-add-sheet.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/components/sl/quick-add-sheet.tsx`:

```tsx
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryChip } from '@/components/sl/category-chip';
import { GradientButton } from '@/components/sl/gradient';
import { QuickAmountChips } from '@/components/sl/quick-amount-chips';
import { SuggestionChips } from '@/components/sl/suggestion-chips';
import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';
import { STATIC_CATEGORIES, type CategoryId } from '@/lib/categories';
import { CURRENCY_META } from '@/lib/currency';
import { formatAmountInput } from '@/lib/format';
import { frequentEntries } from '@/lib/frequent-entries';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useTransactions } from '@/lib/transactions-context';
import { buildTxnPayload, useDraftTransaction } from '@/lib/use-draft-transaction';
import { useSaveTransaction } from '@/lib/use-save-transaction';
import { toCategoryObj } from '@/lib/user-categories';

export interface QuickAddDetailsParams {
  amount?: string;
  category?: string;
  note?: string;
}

export interface QuickAddSheetHandle {
  present: (initialNote?: string) => void;
  dismiss: () => void;
}

interface Props {
  onSaved?: () => void;
  onOpenDetails: (params: QuickAddDetailsParams) => void;
}

export const QuickAddSheet = forwardRef<QuickAddSheetHandle, Props>(
  function QuickAddSheet({ onSaved, onOpenDetails }, ref) {
    const colors = useColors();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [session, setSession] = useState(0);
    const [initialNote, setInitialNote] = useState('');

    useImperativeHandle(ref, () => ({
      present: (note) => {
        setInitialNote(note ?? '');
        setSession((s) => s + 1);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
      >
        <BottomSheetView style={styles.body}>
          <QuickAddForm
            key={session}
            initialNote={initialNote}
            onSaved={() => {
              sheetRef.current?.dismiss();
              onSaved?.();
            }}
            onOpenDetails={(params) => {
              sheetRef.current?.dismiss();
              onOpenDetails(params);
            }}
          />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

function QuickAddForm({
  initialNote,
  onSaved,
  onOpenDetails,
}: {
  initialNote: string;
  onSaved: () => void;
  onOpenDetails: (params: QuickAddDetailsParams) => void;
}) {
  const c = useColors();
  const { t } = useT();
  const { transactions, userCategories } = useTransactions();
  const { settings } = useSettings();
  const { saveNew } = useSaveTransaction();
  const primary = settings.primaryCurrency;

  const extras = useMemo(() => userCategories.map(toCategoryObj), [userCategories]);
  const categories = useMemo(() => [...STATIC_CATEGORIES, ...extras], [extras]);
  const suggestions = useMemo(() => frequentEntries(transactions), [transactions]);
  const defaultCategory = useMemo<CategoryId>(() => {
    const recent = transactions.find((tx) => !tx.isIncome)?.category;
    return recent && categories.some((cat) => cat.id === recent) ? recent : 'food';
  }, [transactions, categories]);

  const draft = useDraftTransaction({ primaryCurrency: primary, initialNote, initialCategory: defaultCategory });
  const [saving, setSaving] = useState(false);
  const meta = CURRENCY_META[draft.currency];

  const save = async () => {
    if (!draft.canSave || saving) return;
    setSaving(true);
    const payload = buildTxnPayload({
      selectedDate: new Date(),
      category: draft.category,
      note: draft.note,
      originalAmount: draft.originalAmount,
      currency: draft.currency,
      isIncome: false,
      photoPath: null,
    });
    const id = await saveNew(payload);
    setSaving(false);
    if (id !== null) onSaved();
  };

  const openDetails = () => {
    const params: QuickAddDetailsParams = { category: draft.category };
    if (draft.amountDigits && draft.currency === primary) params.amount = draft.amountDigits;
    if (draft.note.trim()) params.note = draft.note.trim();
    onOpenDetails(params);
  };

  return (
    <View style={styles.form}>
      <Text style={[styles.title, { color: c.text }]}>{t('quick_add.title')}</Text>

      <SuggestionChips entries={suggestions} extras={extras} onPick={draft.applySuggestion} />

      <View style={styles.amountRow}>
        {meta.position === 'prefix' ? <Text style={[styles.symbol, { color: c.text }]}>{meta.symbol}</Text> : null}
        <BottomSheetTextInput
          testID="quick-add-amount"
          autoFocus
          value={draft.amountDigits ? formatAmountInput(draft.amountDigits, draft.currency) : ''}
          onChangeText={draft.setAmountDigits}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={c.textSecondary}
          accessibilityLabel={t('entry.amount_label')}
          style={[styles.amountInput, { color: c.text }]}
        />
        {meta.position === 'suffix' ? <Text style={[styles.symbol, { color: c.text }]}>{meta.symbol}</Text> : null}
      </View>

      <QuickAmountChips currency={draft.currency} onPick={draft.setAmount} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.categoryRow}>
        {categories.map((cat) => (
          <CategoryChip
            key={cat.id}
            category={cat}
            selected={draft.category === cat.id}
            onPress={() => draft.setCategory(cat.id)}
          />
        ))}
      </ScrollView>

      <BottomSheetTextInput
        testID="quick-add-note"
        value={draft.note}
        onChangeText={draft.setNote}
        placeholder={t('quick_add.note_placeholder')}
        placeholderTextColor={c.textSecondary}
        maxLength={140}
        style={[styles.note, { color: c.text, borderColor: c.hairline }]}
      />

      <View style={styles.actions}>
        <Pressable onPress={openDetails} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: c.textSecondary, fontWeight: W.bold }}>{t('quick_add.details')}</Text>
        </Pressable>
        <GradientButton
          label={t('entry.save_expense')}
          onPress={save}
          disabled={!draft.canSave || saving}
          style={styles.saveButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 },
  form: { gap: 14 },
  title: { fontSize: 18, fontWeight: W.extrabold },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 36, fontWeight: W.extrabold },
  amountInput: { fontSize: 36, fontWeight: W.extrabold, minWidth: 80, textAlign: 'center', padding: 0 },
  categoryRow: { gap: 8 },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  saveButton: { flex: 1 },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/components/sl/quick-add-sheet.test.tsx` → PASS. Then `npx jest` (full), the type-check gate and `npx eslint --quiet src/components/sl/quick-add-sheet.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/sl/quick-add-sheet.tsx src/components/sl/quick-add-sheet.test.tsx
git commit -m "feat(entry): quick-add bottom sheet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Entry screen — optional note, suggestions, shared save

**Files:**
- Modify: `src/app/entry.tsx`, `src/lib/i18n/locales/vi.json`, `src/lib/i18n/locales/en.json`

**Interfaces:**
- Consumes: Task 3 (`initialAmountDigits`, `initialCategory`, `applySuggestion`, `setAmount`, `canSave`), Task 2 `frequentEntries`, Task 6 `useSaveTransaction`, Task 7 chip rows. Route params from Task 10's quick-add "More details…": `amount?: string`, `category?: string`, `note?: string`.
- Produces: no new exports. Removes i18n key `entry.hint_missing_note`.

- [ ] **Step 1: Imports and hooks**

In `src/app/entry.tsx`:

1. Remove these imports:
```ts
import { decideBudgetAlert } from '@/lib/budget-alert';
import { fireBudgetAlert } from '@/lib/notifications';
```
2. Add these imports (keep alphabetical grouping with neighbours):
```ts
import { QuickAmountChips } from '@/components/sl/quick-amount-chips';
import { SuggestionChips } from '@/components/sl/suggestion-chips';
import { frequentEntries } from '@/lib/frequent-entries';
import { useSaveTransaction } from '@/lib/use-save-transaction';
```
3. Replace the params line and context destructuring:
```ts
  const params = useLocalSearchParams<{ photo?: string; note?: string; id?: string; amount?: string; category?: string }>();
  const { photo, id } = params;
  const { getById, transactions, refreshUserCategories } = useTransactions();
  const { settings, rates } = useSettings();
  const { saveNew, saveEdit } = useSaveTransaction();
```
4. Move `const [userCategories, setUserCategories] = useState<UserCategory[]>(() => listUserCategories());` to directly after `const photoUri = …;` (it must exist before the draft hook), and replace the draft hook call and destructuring with:
```ts
  const initialCategory = ((): CategoryId | undefined => {
    const raw = params.category;
    if (editing || !raw) return undefined;
    const known = [...STATIC_CATEGORIES, ...userCategories.map(toCategoryObj)].some((cat) => cat.id === raw);
    return known ? (raw as CategoryId) : 'food';
  })();

  const draft = useDraftTransaction({
    existing,
    primaryCurrency: settings.primaryCurrency,
    initialNote: params.note,
    initialAmountDigits: editing ? undefined : params.amount,
    initialCategory,
  });
  const {
    isIncome, setIsIncome,
    currency, setCurrency,
    amountDigits, setAmountDigits,
    category, setCategory,
    note, setNote,
    selectedDate, setSelectedDate,
    originalAmount, canSave,
    applySuggestion, setAmount,
  } = draft;

  const suggestions = useMemo(() => frequentEntries(transactions), [transactions]);
```
(Delete the original `useState<UserCategory[]>` line from its old position.)

- [ ] **Step 2: Save via the shared hook**

Replace everything in `save` from `const payload = buildTxnPayload({` to the end of the function with:

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
    if (editing) {
      if (await saveEdit(Number(id), payload)) router.back();
      return;
    }
    if ((await saveNew(payload)) !== null) router.replace('/');
  };
```

- [ ] **Step 3: UI changes**

1. Amount `TextInput`: add `autoFocus={!editing}`.
2. Directly after the closing `</View>` of the amount block (`styles.amountBlock`), insert:
```tsx
        {!editing && !isIncome ? (
          <View style={styles.suggestions}>
            <SuggestionChips
              entries={suggestions}
              extras={userCategories.map(toCategoryObj)}
              onPick={applySuggestion}
            />
            <QuickAmountChips currency={currency} onPick={setAmount} />
          </View>
        ) : null}
```
3. Note label: remove the required asterisk, so the label becomes:
```tsx
          <Text style={{ fontSize: 11, fontWeight: W.bold, color: c.textSecondary, marginBottom: 3 }}>{t('entry.note_label')}</Text>
```
4. Replace the missing-field hint block with:
```tsx
        {!canSave ? (
          <Text style={{
            color: c.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 12,
          }}>
            {t('entry.hint_missing_amount')}
          </Text>
        ) : null}
```
5. Add to `styles`: `suggestions: { marginTop: 14, gap: 10 },`

- [ ] **Step 4: Remove the unused key**

Delete the `"hint_missing_note"` line from the `"entry"` group in both `src/lib/i18n/locales/vi.json` and `src/lib/i18n/locales/en.json` (fix the trailing comma of the preceding line if needed).

- [ ] **Step 5: Verify**

- `grep -rn "hint_missing_note\|decideBudgetAlert\|fireBudgetAlert" src/app/entry.tsx` → no output.
- Type-check gate; `npx eslint --quiet src/app/entry.tsx`.
- `npx jest` → all PASS (including locale parity).

- [ ] **Step 6: Commit**

```bash
git add src/app/entry.tsx src/lib/i18n/locales/vi.json src/lib/i18n/locales/en.json
git commit -m "feat(entry): optional note, suggestions, quick amounts and undoable save

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Camera — library picker, quick-add button, flip and zoom placement

**Files:**
- Modify: `src/components/sl/icons.tsx`, `src/app/index.tsx`

**Interfaces:**
- Consumes: Task 8 `QuickAddSheet`, `QuickAddSheetHandle`, `QuickAddDetailsParams`; Task 4 keys `a11y.pick_photo`, `a11y.quick_add`, `a11y.edit_note`; existing `common.photo_failed_title/body`; `GradientFill`; `expo-image-picker` (already a dependency; SDK 57 API: `launchImageLibraryAsync({ mediaTypes: ['images'], quality })` returning `{ canceled, assets }`).
- Produces: `IconName` gains `'image'`.

- [ ] **Step 1: Add the `image` glyph**

In `src/components/sl/icons.tsx`:
- Add `| 'image'` to the `IconName` union (after `'check'`).
- Add before the closing `</Svg>`:
```tsx
      {name === 'image' && (
        <>
          <Path d="M4 5h16v14H4z" {...p} strokeWidth={2} />
          <Circle cx={9} cy={10} r={1.6} {...p} strokeWidth={2} />
          <Path d="M4 17l5-5 4 4 3-3 4 4" {...p} strokeWidth={2} />
        </>
      )}
```

- [ ] **Step 2: Parent screen wiring (`CameraScreen`)**

In `src/app/index.tsx`:

1. Imports:
```ts
import * as ImagePicker from 'expo-image-picker';
```
Change `import { GradientButton, Shutter } from '@/components/sl/gradient';` to `import { GradientButton, GradientFill, Shutter } from '@/components/sl/gradient';` and add:
```ts
import { QuickAddSheet, type QuickAddDetailsParams, type QuickAddSheetHandle } from '@/components/sl/quick-add-sheet';
```

2. After `const cardPickerRef = useRef<CardPickerSheetHandle>(null);` add:
```ts
  const quickAddRef = useRef<QuickAddSheetHandle>(null);

  const openQuickAdd = useCallback(() => {
    setNoteFocused(false);
    quickAddRef.current?.present(note);
  }, [note]);

  const pickFromLibrary = useCallback(async () => {
    const currentNote = note;
    setNoteFocused(false);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    } catch (err) {
      console.warn('Library pick failed', err);
      Alert.alert(t('common.photo_failed_title'), t('common.photo_failed_body'));
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    router.push({ pathname: '/entry', params: currentNote ? { photo: uri, note: currentNote } : { photo: uri } });
  }, [note, t]);

  const openEntryDetails = useCallback((params: QuickAddDetailsParams) => {
    router.push({ pathname: '/entry', params: { ...params } });
  }, []);
```

3. In `renderItem`'s `<CameraPage … />` add the props `onPickPhoto={pickFromLibrary}` and `onQuickAdd={openQuickAdd}`, and add `pickFromLibrary, openQuickAdd` to the `useCallback` dependency array.

4. After `<CardPickerSheet … />` add:
```tsx
      <QuickAddSheet
        ref={quickAddRef}
        onSaved={() => setNote('')}
        onOpenDetails={openEntryDetails}
      />
```

- [ ] **Step 3: `CameraPage` changes**

1. Props: add `onPickPhoto, onQuickAdd,` to the destructuring and `onPickPhoto: () => void; onQuickAdd: () => void;` to the props type.

2. Zoom badge — replace:
```tsx
              {zoom > 0 && (
                <View style={styles.zoomBadge}>
                  <Text style={styles.zoomBadgeText}>{(1 + zoom * 4).toFixed(1)}x</Text>
                </View>
              )}
```
with:
```tsx
              {zoom > 0 && (
                <View style={styles.zoomBadgeWrap} pointerEvents="none">
                  <View style={styles.zoomBadge}>
                    <Text style={styles.zoomBadgeText}>{(1 + zoom * 4).toFixed(1)}x</Text>
                  </View>
                </View>
              )}
```

3. Directly after the flash `Pressable` (still inside the `granted` fragment) add the flip button:
```tsx
              <Pressable
                style={styles.flipBtn}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.flip_camera')}
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
                <Icon name="flip" size={19} color="#fff" />
              </Pressable>
```

4. Note preview label: change the note preview `Pressable`'s `accessibilityLabel={t('a11y.add_note')}` to `accessibilityLabel={t('a11y.edit_note', { note })}` (the empty `noteTapZone` keeps `a11y.add_note`).

5. Replace the whole capture-row conditional:
```tsx
        {granted ? (
          <View style={styles.captureRow}>
            …
          </View>
        ) : (
          <View style={styles.captureRow} />
        )}
```
with:
```tsx
        <View style={styles.captureRow}>
          <Pressable
            style={[styles.sideSlot, styles.circleBtn]}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.pick_photo')}
            onPress={onPickPhoto}>
            <Icon name="image" size={22} color="#fff" />
          </Pressable>
          {granted ? (
            <Shutter onPress={capture} accessibilityLabel={t('a11y.capture')} />
          ) : (
            <View style={styles.shutterSpacer} />
          )}
          <Pressable
            style={[styles.sideSlot, styles.quickAddBtn]}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.quick_add')}
            onPress={onQuickAdd}>
            <GradientFill />
            <Icon name="plus" size={22} color="#fff" />
          </Pressable>
        </View>
```

6. Styles — replace `zoomBadge` and add the new entries:
```ts
  flipBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBadgeWrap: {
    position: 'absolute', top: 18, left: 0, right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  zoomBadge: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  quickAddBtn: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  shutterSpacer: { width: 74, height: 74 },
```

- [ ] **Step 4: Verify**

- Type-check gate; `npx eslint --quiet src/app/index.tsx src/components/sl/icons.tsx`.
- `npx jest` → all PASS.
- `grep -n "a11y.flip_camera" src/app/index.tsx` → exactly one match (inside the viewfinder).

- [ ] **Step 5: Commit**

```bash
git add src/app/index.tsx src/components/sl/icons.tsx
git commit -m "feat(camera): library picker, quick-add sheet and flip button on the viewfinder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Final verification and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-app-improvement-roadmap.md`, `README.md`

- [ ] **Step 1: Automated checks**

- `npx jest` → all suites pass (≈ 57 suites).
- Type-check gate → only the 3 baseline errors.
- `npx eslint --quiet $(git diff --name-only <commit before Task 1>..HEAD | grep -E '\.tsx?$')` → only the baseline `share.test.tsx` error.
- `git diff <commit before Task 1>..HEAD -- package.json` → exactly one added dependency line for `expo-haptics`.

- [ ] **Step 2: README**

In `README.md` `## Features`, append after the "Camera-first capture." bullet:
```markdown
- **Quick add.** Tap ＋ next to the shutter to log a spend without a photo: amount, category and an optional note, with one-tap suggestions from your frequent entries and 20k/50k/100k/200k presets (VND). Every new save vibrates and shows a 5-second Undo toast.
- **Pick from library.** Tap the image button left of the shutter to attach an existing screenshot or receipt photo.
```

- [ ] **Step 3: Roadmap status**

In `docs/superpowers/specs/2026-09-17-app-improvement-roadmap.md` change the **Status** line to:
```markdown
**Status:** Roadmap approved. Sub-projects A and B implemented on `main`; C–F not yet designed.
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-17-app-improvement-roadmap.md
git commit -m "docs: document quick add and mark sub-project B implemented

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual device checklist (report to the user; requires a new dev/release build because `expo-haptics` is a native module)**

1. Cold launch → ＋ → tap a suggestion → Save: saved in 3 taps, haptic felt, toast shows; Undo removes it from today's cards and shows "Đã hoàn tác".
2. ＋ → type 35000, pick "Di chuyển", no note → Save → card and History show "Di chuyển" as the title; switch language to English → "Transport".
3. 🖼 → pick a screenshot → Entry opens with the photo; save without a note works; toast visible back on the camera.
4. Entry via shutter: amount field focused; suggestions and presets visible; switching to Thu hides them.
5. Primary currency USD: no preset chips in the sheet or Entry.
6. Deny camera permission: 🖼 and ＋ still work.
7. TalkBack: 🖼, ＋, flip (top-left), suggestion chips and the toast's Undo are announced.
