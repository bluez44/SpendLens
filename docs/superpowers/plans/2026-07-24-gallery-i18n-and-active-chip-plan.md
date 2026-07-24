# Gallery i18n + DateRangeSheet Active Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two small polish items — internationalize the Gallery screen and add active-chip visual feedback to the DateRangeSheet quick-range presets.

**Architecture:** Two independent tasks. Task 1 is a pure string-swap in one screen + two locale keys. Task 2 extracts a pure derivation helper `activeQuick(from, to, today)` and applies inverted-pill styling to matched chips.

**Tech Stack:** React Native 0.86 / Expo SDK 57 / TypeScript strict. Existing deps: `i18next`, `react-i18next`, `@gorhom/bottom-sheet`. No new deps.

## Global Constraints

- No hardcoded VN literals remain in `src/app/gallery.tsx` after Task 1.
- Locale keys added in both `vi.json` and `en.json` in the same edit — never one side only.
- `activeQuick` is a pure function (no React, no side effects) so it can be unit-tested at the module boundary.
- Active-chip logic is DERIVED from `from`/`to` — no separate `activeQuick` state.
- Active chip styling: `backgroundColor: colors.text`, text `color: colors.bg`, `fontWeight: '700'`. Non-active chips unchanged.
- On sheet open with default from/to (initialFrom = first of this month, initialTo = today), "Tháng này" chip is highlighted automatically.
- No changes to snap point, backdrop, keyboard behavior, or export flow.
- All existing tests must remain green. `npm test` passes at end of every task.

## File map

Files created:
- `src/components/sl/date-range-sheet.test.ts` — 5 unit tests for `activeQuick`

Files modified:
- `src/app/gallery.tsx` — add `useT` hook, swap 2 literals
- `src/lib/i18n/locales/vi.json` — add `gallery.title` + `gallery.subtitle`
- `src/lib/i18n/locales/en.json` — add `gallery.title` + `gallery.subtitle`
- `src/components/sl/date-range-sheet.tsx` — export `firstOfMonth` + new `activeQuick` helper; apply active styling to chips

---

### Task 1: Gallery i18n

**Files:**
- Modify: `src/app/gallery.tsx`
- Modify: `src/lib/i18n/locales/vi.json`
- Modify: `src/lib/i18n/locales/en.json`

**Interfaces:**
- Consumes: `useT` from `@/lib/i18n` (already in codebase)
- Produces: no external API changes

- [ ] **Step 1: Add locale keys to `vi.json`**

Open `src/lib/i18n/locales/vi.json`. Find the alphabetically appropriate spot for a new top-level `gallery` block (before `history`, after `entry`). Add:

```json
"gallery": {
  "title": "Thư viện",
  "subtitle": "{{count}} khoảnh khắc chi tiêu"
},
```

Verify JSON is still valid: `node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/vi.json', 'utf8'))"` — expected: no output (silent success).

- [ ] **Step 2: Add same keys to `en.json`**

Open `src/lib/i18n/locales/en.json`. Add the same block at the same position:

```json
"gallery": {
  "title": "Gallery",
  "subtitle": "{{count}} spending moments"
},
```

Verify JSON is still valid with the same node command.

- [ ] **Step 3: Add `useT` hook to gallery.tsx**

Edit `src/app/gallery.tsx`. Add the import at the top with the other `@/` imports:

```tsx
import { useT } from '@/lib/i18n';
```

Inside `GalleryScreen`, at the top of the function body (just after `const { transactions } = useTransactions();`), add:

```tsx
const { t } = useT();
```

- [ ] **Step 4: Replace the two hardcoded strings**

In `src/app/gallery.tsx`, find:

```tsx
<Text style={{ fontSize: 19, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>Thư viện</Text>
<Text style={{ fontSize: 12.5, fontWeight: W.medium, color: c.textSecondary }}>
  {transactions.length} khoảnh khắc chi tiêu
</Text>
```

Replace with:

```tsx
<Text style={{ fontSize: 19, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>{t('gallery.title')}</Text>
<Text style={{ fontSize: 12.5, fontWeight: W.medium, color: c.textSecondary }}>
  {t('gallery.subtitle', { count: transactions.length })}
</Text>
```

- [ ] **Step 5: Grep-verify no VN literals remain**

Run:

```bash
grep -rn "['\"][A-ZĐ][a-zàáâãèéêìíòóôõùúýăĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]" src/app/gallery.tsx
```

Expected: 0 hits (no output).

- [ ] **Step 6: Run test suite**

Run: `npm test`

Expected: all suites green (should be 81/81 or higher).

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit`

Expected: no NEW errors (pre-existing @types/jest baseline may remain).

- [ ] **Step 8: Commit**

```bash
git add src/app/gallery.tsx src/lib/i18n/locales/vi.json src/lib/i18n/locales/en.json
git commit -m "Gallery screen i18n: title + subtitle via i18next"
```

---

### Task 2: DateRangeSheet active chip

**Files:**
- Modify: `src/components/sl/date-range-sheet.tsx` — export `firstOfMonth`, add `activeQuick`, apply active styling
- Create: `src/components/sl/date-range-sheet.test.ts`

**Interfaces:**
- Consumes: existing `toDateKey`, `shiftDateKey` from `@/lib/format`; existing `useColors` tokens
- Produces:
  - `export function activeQuick(from: string, to: string, today: string): 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all' | null`
  - `export function firstOfMonth(dateKey: string): string` (was module-private; now exported for tests)
  - `export type Quick = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all'` (was module-private; export for test file)

- [ ] **Step 1: Write the failing test**

Create `src/components/sl/date-range-sheet.test.ts`:

```ts
import { shiftDateKey } from '@/lib/format';

import { activeQuick, firstOfMonth } from './date-range-sheet';

describe('activeQuick', () => {
  const today = '2026-07-24';

  it('matches thisMonth when from is first-of-month and to is today', () => {
    expect(activeQuick(firstOfMonth(today), today, today)).toBe('thisMonth');
  });

  it('matches lastMonth when from is 1st of last month and to is last day of last month', () => {
    expect(activeQuick('2026-06-01', '2026-06-30', today)).toBe('lastMonth');
  });

  it('matches threeMonths when from is today-90 and to is today', () => {
    expect(activeQuick(shiftDateKey(today, -90), today, today)).toBe('threeMonths');
  });

  it('matches all when from is 2000-01-01 and to is today', () => {
    expect(activeQuick('2000-01-01', today, today)).toBe('all');
  });

  it('returns null when from/to do not match any preset (custom range)', () => {
    expect(activeQuick('2026-07-10', '2026-07-15', today)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `npm test -- date-range-sheet.test`

Expected: FAIL with something like `TypeError: (0 , _dateRangeSheet.activeQuick) is not a function` (or `firstOfMonth` not exported).

- [ ] **Step 3: Export `firstOfMonth` and `Quick`, and add `activeQuick`**

Edit `src/components/sl/date-range-sheet.tsx`.

Change:
```tsx
type Quick = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all';

function firstOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, 1));
}
```

To:
```tsx
export type Quick = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all';

export function firstOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, 1));
}

/** Return the preset that exactly matches (from, to) given today, else null. */
export function activeQuick(from: string, to: string, today: string): Quick | null {
  const [y, m] = today.split('-').map(Number);
  const thisMonthFrom = firstOfMonth(today);
  if (from === thisMonthFrom && to === today) return 'thisMonth';
  const lastMonthFrom = toDateKey(new Date(y, m - 2, 1));
  const lastMonthTo = toDateKey(new Date(y, m - 1, 0));
  if (from === lastMonthFrom && to === lastMonthTo) return 'lastMonth';
  if (from === shiftDateKey(today, -90) && to === today) return 'threeMonths';
  if (from === '2000-01-01' && to === today) return 'all';
  return null;
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm test -- date-range-sheet.test`

Expected: PASS (5 assertions).

- [ ] **Step 5: Apply active-chip styling in the JSX**

In the same file, inside the component's return, find the chips block:

```tsx
<View style={styles.chips}>
  {(['thisMonth', 'lastMonth', 'threeMonths', 'all'] as Quick[]).map((q) => (
    <Pressable
      key={q}
      onPress={() => applyQuick(q)}
      style={[styles.chip, { borderColor: colors.hairline, backgroundColor: colors.chipBg }]}>
      <Text style={{ fontWeight: '500', color: colors.chipText }}>
        {q === 'thisMonth' ? t('history.range_this_month')
         : q === 'lastMonth' ? t('history.range_last_month')
         : q === 'threeMonths' ? t('history.range_three_months')
         : t('history.range_all')}
      </Text>
    </Pressable>
  ))}
</View>
```

Just above it, compute:

```tsx
const todayKey = toDateKey(new Date());
const active = activeQuick(from, to, todayKey);
```

Replace the chips block with:

```tsx
<View style={styles.chips}>
  {(['thisMonth', 'lastMonth', 'threeMonths', 'all'] as Quick[]).map((q) => {
    const isActive = active === q;
    return (
      <Pressable
        key={q}
        onPress={() => applyQuick(q)}
        style={[
          styles.chip,
          { borderColor: colors.hairline, backgroundColor: isActive ? colors.text : colors.chipBg },
        ]}>
        <Text style={{
          fontWeight: isActive ? '700' : '500',
          color: isActive ? colors.bg : colors.chipText,
        }}>
          {q === 'thisMonth' ? t('history.range_this_month')
           : q === 'lastMonth' ? t('history.range_last_month')
           : q === 'threeMonths' ? t('history.range_three_months')
           : t('history.range_all')}
        </Text>
      </Pressable>
    );
  })}
</View>
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all suites green (should now be 82+ / 82+, with the 5 new activeQuick tests added).

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit`

Expected: no NEW errors.

- [ ] **Step 8: Manual smoke test (optional but recommended)**

Boot the app (`npx expo start`). Open Settings → Xuất CSV:
- Sheet opens with "Tháng này" chip visually highlighted (inverted colors, bold text)
- Tap "Tháng trước" → highlight moves to it
- Tap "Từ" or "Đến" and pick a random date → no chip highlighted anymore
- Tap "Toàn bộ" → highlight moves to it

If any check fails, investigate before committing.

- [ ] **Step 9: Commit**

```bash
git add src/components/sl/date-range-sheet.tsx src/components/sl/date-range-sheet.test.ts
git commit -m "DateRangeSheet: highlight active quick-range chip"
```

---

## Post-tasks checklist

Once both tasks are complete:

- [ ] `npm test` — all green
- [ ] `npx tsc --noEmit` — no new prod errors (pre-existing @types/jest baseline OK)
- [ ] Grep `grep -rn "['\"][A-ZĐ][a-zàáâã…]" src/app/gallery.tsx` — 0 hits
- [ ] Manual: gallery header + subtitle change when Settings > Language toggled VI ↔ EN
- [ ] Manual: opening DateRangeSheet highlights "Tháng này" by default; tapping chips moves highlight; manual date pick clears highlight
