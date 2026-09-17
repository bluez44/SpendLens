# Design Spec — Ultra-fast Entry (Roadmap sub-project B)

**Date:** 2026-09-17
**Roadmap:** [`2026-09-17-app-improvement-roadmap.md`](./2026-09-17-app-improvement-roadmap.md)
**Source findings:** [`docs/product-review/2026-09-17-gen-z-user-review.md`](../../product-review/2026-09-17-gen-z-user-review.md) §2.1, §2.3, §4 (P0 #2, #3; P2 #15), §5 (Entry rows)
**Depends on:** sub-project A (merged on `main`, `b3f53c7`) — `buildTxnPayload`, `useDraftTransaction`, `a11y.*` keys
**Branch:** `main`
**Status:** Design approved, pending implementation plan

## Goal

Make logging a spend take seconds: save an expense with only amount + category, without leaving the camera and without a photo; pick an existing screenshot from the library; confirm every new save with a haptic + an Undo toast; and suggest the user's frequent entries so a repeat purchase is one tap.

**Success criteria (from roadmap):** an expense can be saved with only amount + category (note optional); ≤ 3 taps from launch to saved without a photo (＋ → suggestion chip → Save); pick photo from library on camera; save toast with Undo + haptics; frequent-entry suggestions.

## Non-goals

- Income, currency or date selection inside the quick-add sheet (reachable through "More details…" → `/entry`).
- Time-of-day weighting for suggestions.
- Delaying or retracting budget alerts on Undo.
- Deleting the photo file on Undo.
- Navigation dock, onboarding/coachmarks, header unification (sub-project C).
- Receipt OCR (backlog).
- DB schema changes.

## Approved decisions

| # | Decision | Chosen |
|---|---|---|
| 1 | Quick-add form factor | `@gorhom/bottom-sheet` sheet on top of the camera, opened by a quick-add (＋) button |
| 2 | Capture-row layout | Left: 🖼 library picker · centre: shutter · right: ＋ quick add. Flip-camera moves to the viewfinder's top-left; zoom badge moves to top-centre |
| 3 | Sheet contents | Suggestion chips, amount (auto-focus), quick-amount chips, expense category chips, optional one-line note, "More details…" link, Save. Currency = primary; date = now; expense only |
| 4 | Suggestions | From history: expenses in the last 60 days with a non-empty note, grouped by (note, category, amount, currency), top 5 by count. Shown in the sheet and in Entry (new expense only) |
| 5 | Empty note | Stored as `name = ''`; displayed through a shared `txnTitle()` helper: name → legacy note → category label in the current language |
| 6 | Architecture | Shared `useSaveTransaction` hook used by Entry and the sheet; root-level `ToastProvider` (so a toast survives Entry's `router.replace('/')`) |
| 7 | Undo vs budget alert | Alert fires immediately on save; Undo removes the transaction but does not reset `budgetNotifiedMonth` |

## User flows

### Camera screen (`src/app/index.tsx`)

Capture row (`captureRow`), left to right:
1. **Library button** (`sideSlot` + `circleBtn` style) with a new `image` glyph added to `src/components/sl/icons.tsx` (the current set has no image icon). `accessibilityLabel = a11y.pick_photo`.
2. **Shutter** (unchanged).
3. **Quick-add button** — 48×48 circle filled with `GradientFill` (accent) and the existing `plus` glyph in white. A lightning glyph is deliberately **not** used: the flash toggle already uses `flash`/`flash-off`, and two lightning icons on one screen would be confused. `accessibilityLabel = a11y.quick_add`.

Without camera permission the capture row still shows the library and quick-add buttons (a 74 pt spacer replaces the shutter) — neither needs the camera.

Viewfinder overlays:
- **Flip camera** moves from the capture row to the top-left of the viewfinder, styled like `flashBtn` (40×40, `rgba(0,0,0,0.35)`), `accessibilityLabel = a11y.flip_camera`.
- **Zoom badge** moves from top-left to top-centre (`alignSelf: 'center'`).
- **Note preview** `Pressable` gets `accessibilityLabel = t('a11y.edit_note', { note })`; the empty note tap zone keeps `a11y.add_note`.

Library flow:
1. Tap 🖼 → `ImagePicker.launchImageLibraryAsync` (images only, quality 0.7; exact option names verified against the SDK 57 `expo-image-picker` docs during planning).
2. Cancelled → nothing. Error → `Alert(common.photo_failed_title, common.photo_failed_body)`.
3. Picked → `router.push({ pathname: '/entry', params: { photo: uri, note } })` (note omitted when empty) — identical to the capture path (the camera note is not cleared, same as capture today).

Quick-add flow:
1. Tap ＋ → `quickAddRef.current?.present(note)` (current viewfinder note pre-fills the note field).
2. User taps a suggestion chip **or** types an amount (+ optionally a quick-amount chip, category chip, note).
3. Save → sheet dismisses → `saveNew` (haptic + Undo toast) → camera clears its note state.
4. "More details…" → sheet dismisses → `router.push({ pathname: '/entry', params: { amount: amountDigits, category, note } })` (params omitted when empty; `amount` omitted when a suggestion switched the draft to a non-primary currency, because Entry interprets digits in the primary currency).

### Quick-add sheet (`src/components/sl/quick-add-sheet.tsx`)

Top to bottom:
1. Title `quick_add.title`.
2. `SuggestionChips` (hidden when `frequentEntries` returns `[]`). Tapping a chip sets amount digits, category and note from the suggestion. It does **not** save.
3. Amount input: large, `keyboardType="number-pad"`, `autoFocus`, formatted with `formatAmountInput(digits, primary)`, currency symbol per `CURRENCY_META`.
4. `QuickAmountChips` (hidden when `quickAmountsFor(primary)` is empty). Tapping **sets** the amount (not additive).
5. Horizontal `ScrollView` of `CategoryChip`s: `STATIC_CATEGORIES` + user categories. Default = category of the most recent expense in `transactions`, else `'food'`.
6. One-line note `BottomSheetTextInput`, placeholder `quick_add.note_placeholder`, `maxLength={140}`.
7. Row: link `quick_add.details` (left) · `GradientButton` `entry.save_expense` (right), disabled until amount > 0.

Handle: `QuickAddSheetHandle { present(initialNote?: string): void; dismiss(): void }`. Props: `onSaved?: () => void`, `onOpenDetails: (params: { amount?: string; category?: string; note?: string }) => void`. Each `present` resets the draft (amount empty, default category, note = `initialNote ?? ''`).

`keyboardBehavior="interactive"`, `keyboardBlurBehavior="restore"`, `enableDynamicSizing`, backdrop like `BudgetSheet`.

### Entry screen (`src/app/entry.tsx`)

- Note is optional: remove the required asterisk on the note label and the `entry.hint_missing_note` hint (keep `entry.hint_missing_amount`).
- New optional params `amount` (digit string) and `category` (category id); passed to `useDraftTransaction` as initial values when not editing.
- Amount `TextInput` gets `autoFocus` when not editing.
- When not editing and `!isIncome`: `SuggestionChips` directly under the amount block, then `QuickAmountChips` (VND only).
- Save:
  - new → `saveNew(payload)`; on success `router.replace('/')`; on failure stay on screen.
  - edit → `saveEdit(id, payload)`; on success `router.back()`.
- The budget-alert block moves out of `entry.tsx` into `useSaveTransaction`.

## Units

### `src/lib/txn-title.ts`

```ts
export function txnTitle(txn: Pick<Txn, 'name' | 'note' | 'category' | 'isIncome'>, extras?: Category[]): string
```
Returns `txn.name.trim()` if non-empty; else `txn.note?.trim()` if non-empty; else `i18n.t(INCOME_LABEL_KEY)` for income, otherwise `categoryLabel(categoryOf(txn.category, extras))`.

Adopt in: `src/components/sl/transaction-row.tsx`, `src/components/sl/txn-card.tsx`, `src/app/transaction/[id].tsx` (title line), `src/lib/export.ts` (name column), `src/lib/share-transaction.ts` (`nameText`, replacing `txn.note ?? txn.name`). Callers that already have user-category extras pass them.

### `src/lib/frequent-entries.ts`

```ts
export interface FrequentEntry {
  name: string;               // display text from the most recent use
  category: CategoryId;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  count: number;
  lastUsedAt: number;         // max createdAt in the group
}
export function frequentEntries(txns: Txn[], now: number = Date.now(), limit = 5): FrequentEntry[]
```
- Include only `!isIncome`, `name.trim() !== ''`, `createdAt >= now − 60 days` (60 × 86 400 000 ms).
- Group key: `name.trim().toLowerCase()` + `category` + `originalAmount` + `originalCurrency`.
- Sort by `count` desc, then `lastUsedAt` desc. Return the first `limit`.
- A group with a single use is still eligible (so a new user gets suggestions after the first entry).

### `src/lib/quick-amounts.ts`

```ts
export function quickAmountsFor(currency: CurrencyCode): number[]
```
`VND → [20000, 50000, 100000, 200000]`; every other currency → `[]`. Chip label uses `formatCompact(value, currency)`.

### `src/lib/use-draft-transaction.ts` (modify)

- `canSave = originalAmount > 0` (note no longer required).
- Options gain `initialAmountDigits?: string` and `initialCategory?: CategoryId`, used only when `existing` is undefined; `initialAmountDigits` passes through the same digit sanitiser as `setAmountDigits`; an `initialCategory` that is not a known static/custom id falls back to `'food'` in Entry (validated by the caller with `categoryOf`).
- Expose `applySuggestion(entry: FrequentEntry)`: sets currency, amount digits (via `digitsFromExistingAmount`), category, note.
- Expose `setAmount(value: number)`: sets amount digits from a major-unit number in the current currency (used by quick-amount chips).

### `src/lib/toast-context.tsx` + `src/components/sl/toast.tsx`

```ts
export interface ToastOptions { message: string; actionLabel?: string; onAction?: () => void; durationMs?: number }
export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element
export function useToast(): { show: (opts: ToastOptions) => void; hide: () => void }
```
- One toast at a time; `show` replaces the current toast and restarts the timer. Default `durationMs = 5000`.
- Pressing the action hides the toast first, then calls `onAction` (so an `onAction` that shows a follow-up toast, like Undo → "Undone", is not immediately hidden).
- `Toast` view: absolutely positioned above `insets.bottom + 24`, dark pill (`rgba(20,20,20,0.92)`, white `sl/text`), action label in `AccentGradient[1]`, `accessibilityLiveRegion="polite"`, action `accessibilityRole="button"`. Fades in with React Native's `Animated` API (not reanimated, which cannot run under Jest here).
- Mounted in `src/app/_layout.tsx` inside `BottomSheetModalProvider`, wrapping the `Stack` and the lock overlay.

### `src/lib/use-save-transaction.ts`

```ts
export function useSaveTransaction(): {
  saveNew: (payload: NewTxn) => Promise<number | null>;
  saveEdit: (id: number, payload: NewTxn) => Promise<boolean>;
}
```
`saveNew`:
1. `id = add(payload)`; on throw → `Alert(common.save_failed_title, common.save_failed_body)`, `console.warn`, return `null`.
2. `Haptics.notificationAsync(NotificationFeedbackType.Success)` — errors swallowed.
3. `toast.show({ message: t('toast.saved', { amount: signedMoney(convertedAmount, primary, payload.isIncome) }), actionLabel: t('toast.undo'), onAction: undo })` where `convertedAmount = convert(payload.originalAmount, payload.originalCurrency, primary, rates)`.
4. If `!payload.isIncome`: the budget-alert logic moved verbatim from `entry.tsx` (`decideBudgetAlert` → `updateSettings('budgetNotifiedMonth', …)` → `fireBudgetAlert`, errors warned).
5. Return `id`.

`undo`: `try { remove(id) } catch (err) { console.warn(…) }` then `toast.show({ message: t('toast.undone'), durationMs: 2000 })`.

`saveEdit`: `update(id, payload)`; on throw → same Alert, return `false`; else haptic, return `true`. No toast.

### `src/components/sl/suggestion-chips.tsx`

`SuggestionChips({ entries, onPick })` — horizontal `ScrollView` of pills `"{name} · {formatCompact(amount, currency)}"` with the category dot colour; each `accessibilityRole="button"`, `accessibilityLabel = t('a11y.suggestion', { note: name, amount })`. Renders `null` for `[]`.

### `src/components/sl/quick-amount-chips.tsx`

`QuickAmountChips({ currency, onPick })` — row of pills from `quickAmountsFor(currency)`; renders `null` when empty.

### Dependency

`expo-haptics` added with `npx expo install expo-haptics` (SDK 57-compatible version). Jest mock: `jest.mock('expo-haptics', …)` in the tests that need it (or `__mocks__/expo-haptics.ts` if more than one suite needs it).

## i18n (both `vi.json` and `en.json`)

| Key | vi | en |
|---|---|---|
| `quick_add.title` | Nhập nhanh | Quick add |
| `quick_add.note_placeholder` | Ghi chú (tuỳ chọn) | Note (optional) |
| `quick_add.details` | Chi tiết… | More details… |
| `toast.saved` | Đã lưu {{amount}} | Saved {{amount}} |
| `toast.undo` | Hoàn tác | Undo |
| `toast.undone` | Đã hoàn tác | Undone |
| `a11y.quick_add` | Nhập nhanh | Quick add |
| `a11y.pick_photo` | Chọn ảnh từ thư viện | Choose photo from library |
| `a11y.edit_note` | Sửa ghi chú: {{note}} | Edit note: {{note}} |
| `a11y.suggestion` | Điền {{note}} {{amount}} | Fill {{note}} {{amount}} |

Remove `entry.hint_missing_note` from both files (no longer used). Update `src/lib/i18n/locales.test.ts` `A11Y_KEYS` with the four new `a11y.*` keys.

## Error handling

| Situation | Behaviour |
|---|---|
| Insert/update throws | Existing "Không thể lưu" Alert; no haptic, no toast; Entry stays open, sheet stays open |
| Haptics unavailable/throws | Swallowed |
| Undo after the row is already gone | `remove` error warned; "Undone" toast still shown |
| Budget alert notification throws | Warned (unchanged) |
| Library permission denied / picker error | `common.photo_failed_*` Alert |
| Picker cancelled | No-op |
| Unknown `category` param in Entry | Falls back to `'food'` |

## Testing

- `src/lib/txn-title.test.ts`: name wins; empty name → legacy note; both empty → static category label; custom category via extras; income → income label; whitespace-only name treated as empty.
- `src/lib/frequent-entries.test.ts`: groups case-insensitively on name; different amount or category → different groups; excludes income, empty names, rows older than 60 days; sort by count then recency; `limit`; display `name` from the most recent row.
- `src/lib/quick-amounts.test.ts`: VND list; USD empty.
- `src/lib/use-draft-transaction.test.ts`: `canSave` true with amount and empty note; initial amount/category applied only when not editing; `applySuggestion` sets all four fields.
- `src/lib/toast-context.test.tsx`: show renders message; action press calls `onAction` and hides; auto-hide after `durationMs` (fake timers); second `show` replaces the first.
- `src/lib/use-save-transaction.test.tsx` (providers + mocked `expo-haptics`/notifications): success → toast with Undo + haptic; Undo → transaction removed + "Undone" toast; insert failure → Alert, no toast; `saveEdit` → no toast; budget alert fires at ≥ 80% (existing `decideBudgetAlert` covered separately).
- `src/components/sl/quick-add-sheet.test.tsx`: Save disabled at amount 0; suggestion chip fills fields; quick-amount chips only for VND; Save calls `saveNew` with a payload whose `name` is the typed note (or `''`) and `category` the selected one; "More details…" calls `onOpenDetails` with current values.
- Existing tests updated where display switches to `txnTitle` (`txn-card`, `share-transaction`, `export`).
- `locales.test.ts` parity + new a11y keys.

## Verification

- `npx jest` passes; no new tsc errors outside `*.test.*` (baseline: 3); no new eslint errors in changed files.
- Manual on device:
  1. Cold launch → ＋ → tap a suggestion → Save: saved in 3 taps, haptic felt, toast shows; Undo removes it from today's cards.
  2. ＋ → type 35000, pick "Di chuyển", no note → Save → card/History show "Di chuyển" as the title; switch language to English → shows "Transport".
  3. 🖼 → pick a screenshot → Entry opens with the photo; save without a note works.
  4. Entry from shutter: amount field is focused; suggestions visible; Save → back on camera with the toast still visible.
  5. Primary currency USD: no quick-amount chips in sheet or Entry.
  6. TalkBack: 🖼, ＋, flip (top-left), suggestion chips and the toast action are announced.
