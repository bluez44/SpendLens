# Design Spec — Foundation Polish (Roadmap sub-project A)

**Date:** 2026-09-17
**Roadmap:** [`2026-09-17-app-improvement-roadmap.md`](./2026-09-17-app-improvement-roadmap.md)
**Source findings:** [`docs/product-review/2026-09-17-gen-z-user-review.md`](../../product-review/2026-09-17-gen-z-user-review.md) §3
**Branch:** `main` (product owner chose to work directly on `main`, 2026-09-17)
**Status:** Design approved, pending implementation plan

## Goal

Fix the bugs found in the user review and clean up the colour-token and accessibility debt in the screens that later sub-projects (B–F) will touch. No behaviour changes beyond the fixes listed here.

## Non-goals

- No DB schema change, no new dependency.
- No note-field redesign or making the note optional (sub-project B).
- No header / navigation unification (sub-project C).
- Fixed dark camera surfaces (`#111111`, `#1a1a1a`, `#1D1D1D` in `index.tsx`, `#1A1A1A` FAB in `history.tsx`) and `photo-tile.tsx` placeholder colours are out of scope — they are intentionally theme-independent.

## Approved decisions

| # | Decision | Chosen |
|---|---|---|
| 1 | `note` column handling (B3) | Keep a single user-facing field: `name` **is** the note. No second input. Detail keeps the "Note" row only for legacy rows with non-null `note`. |
| 2 | Edit-mode date (B1) | Editing persists the picked `selectedDate` into `date`, `time`, `createdAt`, same as create. |
| 3 | Budget currency (B2) | Budget is displayed in `settings.primaryCurrency` via `formatMoney`; components receive currency as a prop. |
| 4 | Scope of token cleanup | Money / status colours only (expense, income, warning, income chip, gradients). |
| 5 | Accessibility scope | Icon-only `Pressable`s get `accessibilityRole="button"` + localised `accessibilityLabel`; touch targets < 44pt get `hitSlop`. |

## Changes

### B1 — Editing a transaction cannot change its date/time

**Problem.** Two layers discard the edit:
1. `save()` in `src/app/entry.tsx` builds the payload with `existing.date`, `existing.time`, `existing.createdAt` when editing, so the date picker's value is thrown away.
2. `updateTransaction` in `src/lib/transactions.ts` never writes `created_at` (neither SQL branch). `listTransactions` orders by `created_at` and `filterRange` filters on `createdAt`, and the edit screen re-initialises the picker from `existing.createdAt` — so fixing only the screen would still leave the row in the wrong period and show the old date on re-edit.

**Design.**
- Extract payload construction into a pure function in `src/lib/use-draft-transaction.ts`:

  ```ts
  export function buildTxnPayload(input: {
    selectedDate: Date;
    category: CategoryId;
    note: string;
    originalAmount: number;
    currency: CurrencyCode;
    isIncome: boolean;
    photoPath: string | null;
  }): NewTxn
  ```

  It returns `date: toDateKey(selectedDate)`, `time: HH:MM of selectedDate`, `createdAt: selectedDate.getTime()`, `name: note.trim()`, `note: null`, and the remaining fields as passed. There is no `existing` branch — create and edit behave identically.
- Move `formatHHMM` from `entry.tsx` into `src/lib/format.ts` (exported, tested) and use it from both places.
- `entry.tsx` keeps category resolution (custom-category auto-create, income → `'other'`) and then calls `buildTxnPayload`.
- `updateTransaction` writes `created_at = input.createdAt` in both SQL branches when `input.createdAt` is defined; when undefined, `created_at` is left unchanged (other callers keep working). `uuid` is never written by update; `subscription_uuid` is only written when `input.subscriptionUuid !== undefined` (existing behaviour, unchanged).

**Tests:**
- `src/lib/use-draft-transaction.test.ts`:
  1. New txn: date/time/createdAt derived from `selectedDate`.
  2. Edit with unchanged `selectedDate` (initialised from `existing.createdAt`): payload date/time/createdAt equal the original.
  3. Edit with a different `selectedDate`: payload reflects the new date/time/createdAt.
- `src/lib/transactions.test.ts` (in-memory DB):
  4. `updateTransaction` with a new `createdAt` persists it and the row sorts accordingly in `listTransactions`.
  5. `updateTransaction` without `createdAt` leaves `created_at` unchanged.
  6. Updating a subscription-generated txn without `subscriptionUuid` keeps its `subscription_uuid` — already covered by the existing test `updateTransaction preserves subscription_uuid when field omitted`; no new test.
- `src/lib/format.test.ts`:
  7. `formatHHMM` pads hours/minutes.

### B2 — Budget always formatted as VND

**Design.**
- `BudgetBar` (`src/components/sl/budget-bar.tsx`) gains `currency: CurrencyCode`; replace `formatVND` with `formatMoney(value, currency)`.
- `BudgetSheet` (`src/components/sl/budget-sheet.tsx`) gains `currency: CurrencyCode` on its props; preview uses `formatMoney`.
- Callers pass `settings.primaryCurrency`: `src/app/home.tsx` (`BudgetBar`), `src/app/settings.tsx` (`BudgetSheet`).
- Budget input stays whole major units (existing behaviour); no decimal entry added.

**Tests** (`src/components/sl/budget-bar.test.tsx`): update existing cases to pass `currency="VND"`; add one case with `currency="USD"` asserting a `$`-formatted string.

### B3 — Ambiguous `name` vs `note`

**Problem.** Entry always saves the user's text into `name` with `note: null`, but readers disagree on which field is primary: `TxnCard` renders `txn.note ?? txn.name` (note-first), while detail uses `name` as the title and shows a "Note" row that new rows never populate. A row with `note: ''` (empty string, not null) makes the card show nothing.

**Design.** `TxnCard` renders `txn.name || txn.note || ''` (name-first, empty-string safe). Transaction detail is unchanged (title = `name`, "Note" row only when `note` is non-empty). Add a code comment in `src/lib/transactions.ts` on the `Txn` type: `name` is the user-entered note; `note` is legacy.

**Tests** (`src/components/sl/txn-card.test.tsx`): renders `name` when both are present; falls back to `note` when `name` is empty.

### B4 — Low-contrast secondary text on photo overlays

**Design.**
- Add to `src/constants/tokens.ts`:

  ```ts
  /** Text on top of photos / dark scrims, independent of theme. */
  export const OnPhoto = {
    text: '#fff',
    textSecondary: 'rgba(255,255,255,0.78)',
  } as const;
  ```
- Use `OnPhoto.textSecondary` for the `≈ original amount` line in `src/app/gallery.tsx` and `src/components/sl/txn-card.tsx` (replacing `c.textSecondary`).

### Token cleanup (money / status colours)

Add to `tokens.ts`:

```ts
Money.warning    = '#F59E0B'
Money.incomeChip = '#D1FAE5'
export const IncomeGradient = ['#34C79A', '#1FA07A'] as const;
```

Replace:

| File | Literal | Token |
|---|---|---|
| `src/app/entry.tsx` | `'#FB5B4D'` (required asterisk) | `Money.expense` |
| `src/app/entry.tsx` | `['#34C79A', '#1FA07A']` | `IncomeGradient` |
| `src/components/sl/budget-bar.tsx` | `'#FB5B4D'`, `'#F59E0B'`, `'#FF6B6B'` | `Money.expense`, `Money.warning`, `AccentGradient[1]` |
| `src/components/settings/data-section.tsx` | `'#FB5B4D'` ×2 | `Money.expense` |
| `src/app/transaction/[id].tsx` | `'#D1FAE5'` | `Money.incomeChip` |
| `src/components/sl/gradient.tsx` | `shadowColor: '#FF6B6B'` | `AccentGradient[1]` |

Verification: `grep -rnE "'#(FB5B4D|34C79A|1FA07A|F59E0B|FF6B6B|D1FAE5)'" src --include=*.tsx` returns only `tokens.ts` (and tests, if any).

### B6 — Accessibility labels & touch targets

**Design.**
- Add an `a11y` group to **both** `src/lib/i18n/locales/vi.json` and `en.json`. Reuse existing keys where they already exist (`home.settings_a11y`, `home.close_a11y`, `share.a11y_share`, `history.export_a11y`, `compare.swap_a11y`, `nav.back_to_camera`). New keys:

  | Key | vi | en |
  |---|---|---|
  | `a11y.open_home` | Mở Tổng quan | Open overview |
  | `a11y.open_history` | Mở Thu chi | Open history |
  | `a11y.flash_on` | Bật đèn flash | Turn flash on |
  | `a11y.flash_off` | Tắt đèn flash | Turn flash off |
  | `a11y.flip_camera` | Đổi camera trước/sau | Flip camera |
  | `a11y.capture` | Chụp ảnh | Take photo |
  | `a11y.add_note` | Thêm ghi chú | Add note |
  | `a11y.share_cards` | Chia sẻ recap / streak | Share recap / streak |
  | `a11y.back` | Quay lại | Back |
  | `a11y.edit_txn` | Sửa giao dịch | Edit transaction |
  | `a11y.open_txn` | Xem giao dịch {{amount}} | View transaction {{amount}} |
  | `a11y.add_subscription` | Thêm đăng ký | Add subscription |
  | `a11y.confirm_category` | Thêm danh mục | Add category |
  | `a11y.choose_currency` | Chọn tiền tệ | Choose currency |

- Apply `accessibilityRole="button"` + label to icon-only pressables in:
  - `src/app/index.tsx`: home, history, flash, flip, shutter (`Shutter` in `gradient.tsx` currently accepts only `onPress`/`size`/`gradientRing` — add an optional `accessibilityLabel` prop forwarded to its `Pressable`), note tap zone, note preview, share-cards icon, back-to-camera.
  - `src/app/gallery.tsx`: back button; each tile (`a11y.open_txn` with signed amount).
  - `src/app/transaction/[id].tsx`: back, share, edit.
  - `src/app/entry.tsx`: close-photo button, custom-category confirm, currency chip.
  - `src/app/subscriptions.tsx`: header `＋`.
  - `src/app/share.tsx`: close button.
  - `src/components/sl/txn-card.tsx`: share button (already labelled — add role).
- Touch targets: entry close-photo button (30×30) gets `hitSlop={8}` → ≥ 44pt effective. Other icon buttons are already ≥ 40pt with `hitSlop` or ≥ 44pt.

**Tests:**
- `txn-card.test.tsx`: `getByLabelText` for the share button.
- `src/app/share.test.tsx`: `getByLabelText` for the close button.
- i18n parity: add `src/lib/i18n/locales.test.ts` (no such test exists today) asserting `vi.json` and `en.json` have identical key sets, so new `a11y.*` keys cannot drift.

### B5 — README out of date

- Remove the claim that first launch seeds sample data (`seed.ts` is dev-only and never called); keep a one-line note that `seedIfEmpty` exists for manual dev use.
- Update **Features** and **Screens** to cover existing routes and features: `/subscriptions`, `/compare`, `/history-months`, `/share`, app lock (biometric/PIN), multi-currency, budget alerts, weekly recap notification.
- Update the **Testing** list to mention the suites added since (streaks, share-cards, subscriptions, fx, app-lock, comparison) without enumerating every file.

## Error handling

No new failure paths. `buildTxnPayload` is pure; `entry.tsx` keeps its existing try/catch + `Alert` on save failure.

## Verification

- `npm test`, `npx tsc --noEmit`, `npm run lint` all pass.
- Manual on device:
  1. Edit an existing transaction, change its date to yesterday → it moves to yesterday's group in History and disappears from today's swipe-up cards.
  2. Set primary currency to USD, set a budget → Home budget bar and Settings budget sheet show `$`.
  3. Enable TalkBack/VoiceOver on the camera screen → every control is announced with its label.
