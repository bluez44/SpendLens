# Gallery i18n + DateRangeSheet Active Chip Design

**Date:** 2026-07-24
**Scope:** Two small polish items in one spec + plan.

## Goal

Fix two rough edges left after the previous i18n + polish round:

1. Gallery screen is not internationalised — its two visible strings ("Thư viện" and "N khoảnh khắc chi tiêu") are still hardcoded VN literals.
2. In `DateRangeSheet` (opened via "Xuất CSV" from Settings/History), the four quick-range chips (Tháng này / Tháng trước / 3 tháng / Toàn bộ) don't give the user any visual feedback about which one is currently active — tapping them changes `from`/`to` but the chip itself looks identical to the others.

## Global Constraints

- Every user-visible Vietnamese literal in `src/app/gallery.tsx` becomes a `t(...)` call after this round. Grep verification: `grep -rn "['\"][A-ZĐ][a-zàáâã…]" src/app/gallery.tsx` returns 0 hits.
- Locale keys ALWAYS added to both `vi.json` and `en.json` in the same edit — no key present in only one side.
- The active-chip logic is **derived from `from`/`to`, not stored as separate state.** The derivation is a pure helper unit-tested at the module boundary.
- No new deps. Uses existing `@/lib/i18n`, `@/lib/format`, existing `useColors` tokens.

---

## Section 1 — Gallery i18n

### File

`src/app/gallery.tsx`

### Changes

Add hook + swap two literals:

```tsx
import { useT } from '@/lib/i18n';
// ...
const { t } = useT();
// ...
<Text ...>{t('gallery.title')}</Text>
<Text ...>{t('gallery.subtitle', { count: transactions.length })}</Text>
```

### Locale keys

Add to both `src/lib/i18n/locales/vi.json` and `en.json`:

- `gallery.title`
  - VI: `"Thư viện"`
  - EN: `"Gallery"`
- `gallery.subtitle` (uses i18next interpolation)
  - VI: `"{{count}} khoảnh khắc chi tiêu"`
  - EN: `"{{count}} spending moments"`

Placement: top-level `"gallery": { ... }` block, ordered alphabetically among existing top-level keys.

### Testing

Grep verification after the change:

```bash
grep -rn "['\"][A-ZĐ][a-zàáâã…]" src/app/gallery.tsx
```

Expected: 0 hits.

No unit test needed — pure string swaps, verified by the existing i18n smoke tests in `src/lib/i18n/index.test.ts` (which cover interpolation).

---

## Section 2 — DateRangeSheet active chip

### File

`src/components/sl/date-range-sheet.tsx`

### Pure helper

Extract this function inside the file (module scope, not inside the component). It replaces the current inline range logic in `applyQuick`:

```ts
type Quick = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all';

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

`firstOfMonth`, `toDateKey`, `shiftDateKey` all exist already.

### Render change

Compute in render:

```tsx
const todayKey = toDateKey(new Date());
const active = activeQuick(from, to, todayKey);
```

Each chip:

```tsx
const isActive = active === q;
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
    {labelFor(q)}
  </Text>
</Pressable>
```

Style rationale: use `colors.text` (near-black in light mode, near-white in dark mode) as the filled-pill background and `colors.bg` as its foreground. Contrast is guaranteed in both themes because the two tokens are always opposed. Non-active chips keep their existing `colors.chipBg` background and `colors.chipText` foreground unchanged.

### Behavior on open

When the sheet's `present()` is called by the parent, it resets `from`/`to` to `initialFrom`/`initialTo`. Callers pass `initialFrom = firstOfMonth(today)` and `initialTo = today`, so `activeQuick` returns `'thisMonth'` on open — "Tháng này" chip is highlighted by default. If a caller changes those defaults later, the derivation still works — no manual sync needed.

### Behavior when user picks dates manually

The date picker calls `setFrom(k)` or `setTo(k)` with arbitrary values. `activeQuick(from, to, todayKey)` will return `null` unless the new pair happens to match a preset. In that null case, no chip is highlighted — correct feedback that the user is in "custom range" mode.

### Testing

Create `src/components/sl/date-range-sheet.test.ts` (pure helper test, no React):

- Export `activeQuick` and `firstOfMonth` from `date-range-sheet.tsx` (add to the exports list).
- Test cases:
  - `activeQuick(firstOfMonth('2026-07-24'), '2026-07-24', '2026-07-24') === 'thisMonth'`
  - `activeQuick('2026-06-01', '2026-06-30', '2026-07-24') === 'lastMonth'`
  - `activeQuick(shiftDateKey('2026-07-24', -90), '2026-07-24', '2026-07-24') === 'threeMonths'`
  - `activeQuick('2000-01-01', '2026-07-24', '2026-07-24') === 'all'`
  - `activeQuick('2026-07-10', '2026-07-15', '2026-07-24') === null` (custom range)

### Out of scope

- Do NOT change the sheet's snap point, backdrop, keyboard behavior, or export flow — those work today.
- Do NOT change existing locale keys for the chip labels (`history.range_*`) — they stay as-is.
- Do NOT touch `home.tsx`'s Segmented control — it already has built-in active state via the `Segmented` component.

---

## Acceptance criteria

- Grep for VN literals in `src/app/gallery.tsx` returns 0 hits.
- New keys `gallery.title` and `gallery.subtitle` present in both locale files with the exact translations above.
- `activeQuick` helper exists, is exported, and its 5 tests pass.
- Opening the export sheet with default from/to visually highlights "Tháng này".
- Tapping another chip moves the highlight.
- Manually changing from/to via the date picker (to a pair that doesn't match any preset) clears all highlights.
- `npm test` fully green.
- `npx tsc --noEmit` — no new prod errors.
