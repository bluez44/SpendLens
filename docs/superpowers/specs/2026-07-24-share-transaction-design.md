# SpendLens — Share transaction to social stories

**Date:** 2026-07-24
**Status:** Approved (brainstorming)
**Baseline:** `main` at `329cb77` (DateRangeSheet active chip highlight).

## Goal

Let users share a transaction's photo — plus optionally its date/time, amount, category, and name — to Instagram/Facebook Story (or any other app) via the OS share sheet. Entry points: a share button on the full-screen `TxnCard` (camera screen, scroll-up feed) and a share button next to Edit on the transaction detail screen.

## Scope

**In**
- New `ShareSheet` component: a `BottomSheetModal` with a live 9:16 preview of the shareable image and four toggles (date/time, amount, category, name — default all on).
- Share button on `TxnCard`, top-right corner, visible only when `txn.photoPath` is set.
- Share button on `transaction/[id].tsx` header controls, next to Edit, visible only when `txn.photoPath` is set.
- Image composition via `react-native-view-shot` (captures the preview `View` as PNG) and hand-off via `react-native-share`'s generic `Share.open()` (OS share sheet — user picks Instagram, Facebook, or any other app; no direct-to-story API).
- New i18n keys under `share.*` in `vi.json`/`en.json`.

**Out**
- Direct-to-Story API (`shareSingle` with `INSTAGRAM_STORIES`/`FACEBOOK_STORIES` social constants, Facebook App ID registration, native config plugin) — explicitly deferred; generic share sheet chosen instead.
- Persisting toggle preferences across sessions — toggles always reset to all-on when the sheet opens.
- Sharing transactions with no photo — share buttons are hidden entirely (photo is a mandatory part of the shared asset).
- Tests for `transaction/[id].tsx` beyond what already exists (no test file for it today; not adding one as part of this feature).

## Dependencies

- `react-native-share` — `Share.open({ url, type: 'image/png', failOnCancel: false })`.
- `react-native-view-shot` — `<ViewShot ref>` wrapping the preview, `.capture()` returns a local file URI.

Both are native modules. The project already builds a custom dev client (`expo-dev-client` in `dependencies`), so no Expo config plugin is required for either — a dev client rebuild (`expo prebuild` + native build) picks up the autolinked modules.

## Entry points

**`src/components/sl/txn-card.tsx`**
- Add a round icon button (style consistent with `index.tsx`'s `notePreview`/`headerBtn`-style buttons: `rgba(0,0,0,0.35)` background, white `share` icon) positioned top-right: `position: 'absolute', top: 60, right: 20` — same fixed offset `TodayBadge` already uses on the opposite (top-left) corner, so the two badges/buttons align visually.
- Rendered only when `txn.photoPath` is truthy.
- `TxnCard` gains an `onShare?: (txn: Txn) => void` prop. The button's `onPress` calls `onShare?.(txn)` and must stop propagation so it doesn't also trigger the card's own `onPress` (navigate to detail) — implemented as a sibling `Pressable` positioned above the card's base `Pressable`, same pattern as the existing `notePreview` button in `index.tsx` sitting outside `noteTapZone`.
- `ShareSheet` itself is mounted once in `src/app/index.tsx` (`CameraScreen`), not per-card. `CameraScreen` holds a `shareSheetRef` and passes `onShare={(txn) => shareSheetRef.current?.present(txn)}` down through `renderItem`.

**`src/app/transaction/[id].tsx`**
- Add a share button inside the existing `headerControls` row, between the back button and the edit button (visual order left→right: back, share, edit — edit keeps its familiar rightmost position).
- Same `headerBtn` style (40×40 circle, `rgba(0,0,0,0.35)`) as back/edit.
- Rendered only when `txn.photoPath` is truthy.
- `ShareSheet` is mounted directly in this screen; `onPress` calls `shareSheetRef.current?.present(txn)`.

## `ShareSheet` component

New file: `src/components/sl/share-sheet.tsx`, following the existing `forwardRef` handle pattern used by `BudgetSheet`/`DateRangeSheet`:

```ts
export interface ShareSheetHandle {
  present: (txn: Txn) => void;
  dismiss: () => void;
}
```

Internal state: `{ showDate, showAmount, showCategory, showName }`, all `true`, reset every time `present(txn)` is called (not persisted).

Layout inside `BottomSheetModal` (`enableDynamicSizing`, same `BottomSheetBackdrop` setup as `BudgetSheet`):

1. Title text (`share.sheet_title`).
2. **Preview card** — fixed `aspectRatio: 9/16`, width `Math.min(screenWidth - 48, 300)`, rounded corners, wrapped in `<ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>`:
   - `expo-image` `Image` from `txn.photoPath`, `contentFit="cover"` fills the 9:16 frame (crop-to-fill handled automatically by `contentFit`, no manual crop math).
   - Bottom `LinearGradient` fade (same colors as `TxnCard.bottomFade`).
   - Overlay content sits in a bottom-anchored info block (like `TxnCard.info`), reusing `TxnCard`'s visual language. Within that block, items stack top-to-bottom in this order:
     - Category chip (`showCategory`) — same chip/label styling as `TxnCard`.
     - Amount (`showAmount`) — `signedVND(txn.amount, txn.isIncome)`, large bold text.
     - Name/note (`showName`) — `txn.note ?? txn.name`, `numberOfLines={2}`.
     - Date/time (`showDate`) — new line not present in `TxnCard`: `${dayLabel(txn.date, todayKey)} · ${txn.time}`, smaller/dimmer text below the name.
   - Export resolution follows the on-screen rendered size × device pixel ratio (view-shot default) — no forced 1080×1920, sufficiently sharp on modern devices.
3. Four toggle rows (label + `Switch`, pattern matching toggles already used in `settings.tsx`): `share.toggle_date`, `share.toggle_amount`, `share.toggle_category`, `share.toggle_name`. Flipping a switch re-renders the preview immediately.
   - Note: `share.toggle_category` is labelled "Danh mục" (not "Loại") to avoid colliding with `transaction.type_label` ("Loại"), which already means Income/Expense elsewhere in the app — this toggle is about the spending category chip (Ăn uống, Di chuyển, …), a different concept.
4. `GradientButton` labeled `share.share_btn` at the bottom, triggers the share action.

## Share action & error handling

On pressing the share button:

1. `const uri = await viewShotRef.current?.capture()`.
2. `await Share.open({ url: uri, type: 'image/png', failOnCancel: false })`.
3. `failOnCancel: false` so a user-cancelled share sheet does not surface as an error.
4. Regardless of resolve/reject from `Share.open`, dismiss the `BottomSheetModal` afterward (the captured image is single-use).
5. If step 1 (`capture()`) throws — e.g. image not yet decoded — keep the sheet open and show `Alert.alert(t('share.error_title'), t('share.error_body'))` so the user can retry, mirroring the `Alert.alert` pattern already used for `confirmDelete` in the transaction detail screen.

No manual temp-file cleanup: `react-native-view-shot` manages its own cache output, unlike the `expo-file-system` `File` object `exportAndShareCsv` creates and deletes explicitly.

## i18n

Add a `share` namespace to both `src/lib/i18n/locales/vi.json` and `en.json`:

```json
"share": {
  "sheet_title": "Chia sẻ giao dịch",
  "toggle_date": "Ngày giờ",
  "toggle_amount": "Giá tiền",
  "toggle_category": "Danh mục",
  "toggle_name": "Tên",
  "share_btn": "Chia sẻ",
  "error_title": "Không thể chia sẻ",
  "error_body": "Đã có lỗi khi tạo ảnh, vui lòng thử lại.",
  "a11y_share": "Chia sẻ giao dịch"
}
```

(English strings mirror the existing translation style used for other namespaces.)

## Testing

Following the `jest-expo` + `@testing-library/react-native` conventions already in the repo (see `txn-card.test.tsx`):

- New `src/components/sl/share-sheet.test.tsx`:
  - Mock `react-native-share` (`Share.open` as `jest.fn()` resolving), `react-native-view-shot` (`ViewShot` → `RN.View`, ref exposing a fake `capture()` returning a stub URI), plus the existing `expo-image`/`expo-linear-gradient` mocks.
  - Sheet opens with all four toggles on by default and the corresponding preview text visible.
  - Toggling a switch off removes the corresponding overlay text from the preview.
  - Pressing the share button calls `capture()` then `Share.open()` with the captured URI.
- Update `src/components/sl/txn-card.test.tsx`:
  - Share button does not render when `photoPath: null` (current `baseTxn`).
  - Share button renders and calls the `onShare` prop with the transaction when `photoPath` is set (add a txn variant with a non-null `photoPath`).
