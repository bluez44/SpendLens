# Subscription feature bugfixes

**Date:** 2026-07-31
**Branch:** feature/monthly-subscriptions
**Scope:** Fix three bugs in the subscription flow. Bug fixes only — no new features.

## Bugs

1. **Photo not saved/displayed (Android)** — In the subscription add/edit sheet, when the user opens the gallery picker and takes a photo via the gallery app's built-in camera, the returned image is neither displayed in the sheet nor persisted to the subscription record.
2. **Currency picker dismisses parent sheet** — Tapping the currency chip opens `CurrencyPickerSheet`, which visually replaces the `SubscriptionSheet` instead of stacking on top of it. When the user picks a currency and the child sheet dismisses, the subscription sheet is gone.
3. **Anchor-day picker dismisses parent sheet** — Same behavior as bug 2 with `AnchorDayPickerSheet`.

Reproduction platform: Android real device.

## Root causes

### Bugs 2 & 3 — bottom sheet stacking

`@gorhom/bottom-sheet` v5's `BottomSheetModal` defaults `stackBehavior` to `'switch'`, which minimizes the currently mounted modal when a new one is presented. The parent modal is not unmounted, but it is visually hidden. When the child dismisses, the parent is not automatically restored to view — the user sees the sheet as "gone".

### Bug 1 — Android photo persistence

Two contributing factors:

- `handlePickPhoto` in `subscription-sheet.tsx` uses `ImagePicker.MediaTypeOptions.Images`, which is deprecated in Expo SDK 57 (the picker types are `MediaType | MediaType[] | MediaTypeOptions`; the enum still works but the new API is `mediaTypes: ['images']`).
- On Android 13+, `launchImageLibraryAsync` can return a `content://` URI whose read-permission grant is scoped to the calling activity's lifetime. When the URI is stored to SQLite and later read back (or when the sheet re-renders after the picker activity finishes), `expo-image` cannot access the file → the tile renders empty. For a persistent entity like a subscription, the URI must be copied into app-owned storage.

## Design

### Fix 1 — Add `stackBehavior="push"` to picker sheets

Change to `src/components/sl/currency-picker-sheet.tsx` and `src/components/sl/anchor-day-picker-sheet.tsx`: add `stackBehavior="push"` prop to each `BottomSheetModal`. This mounts the child on top of the parent; both remain visible; the parent is not minimized and not unmounted. Child `dismiss()` restores focus to the parent naturally.

`CurrencyPickerSheet` is also used from `src/app/entry.tsx`, which is a full-screen route (not itself a modal). `stackBehavior="push"` has no effect when there is no parent modal, so this change is safe for that callsite.

### Fix 2 — Persist picked photo to app document directory

Rewrite `handlePickPhoto` in `src/components/sl/subscription-sheet.tsx`:

1. Call `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })`.
2. On non-canceled result, take `assets[0].uri` as the source.
3. Copy the source into `Paths.document` using the SDK 57 API:
   ```ts
   const ext = (source.split('.').pop() || 'jpg').toLowerCase();
   const dest = new File(Paths.document, `sub-${Crypto.randomUUID()}.${ext}`);
   new File(source).copySync(dest);
   setPhotoPathSynced(dest.uri);
   ```
4. Wrap the copy in `try/catch`. On failure, log a warning and fall back to setting the original URI so behavior degrades gracefully rather than silently dropping the pick.

Rationale for `copySync`: keeps the flow synchronous inside the already-awaited picker callback, avoids an extra tick where the sheet could re-render with stale state. File is small (JPEG at 0.8 quality, typically <500 KB) so blocking is negligible.

New imports required in `subscription-sheet.tsx`: `File, Paths` from `expo-file-system`, `* as Crypto` from `expo-crypto`.

### Fix 3 — Cleanup photo files on subscription delete / photo replace

To avoid leaking files in `Paths.document` when a subscription is removed or its photo replaced:

- **`deleteSubscription`** (`src/lib/subscriptions.ts`): before running the DELETE, `SELECT photo_path`; if it starts with `file://`, best-effort `new File(path).delete()` inside try/catch. Follows the pattern of `resetTransactions` in `src/lib/transactions.ts:276`.
- **`updateSubscription`**: before UPDATE, read the existing `photo_path`. If it changed and the previous value is a `file://` URI, best-effort delete the old file.

Rows with `http(s)://` paths (seed data) or `null` are skipped.

### Fix 4 — Test updates

- `src/components/sl/subscription-sheet.test.tsx`
  - Update the `expo-image-picker` mock: return `{ canceled: false, assets: [{ uri: 'file:///tmp/x.jpg' }] }` from `launchImageLibraryAsync` for the "picks and persists photo" case (new test).
  - Add a mock for `expo-file-system` exposing `File` (constructor + `copySync` no-op, `uri` getter returning the joined path) and `Paths.document` (a stub directory the constructor accepts), so the copy path doesn't touch disk.
  - Update the existing mock to drop `MediaTypeOptions` reference (no longer used) OR keep it but stop asserting on it.
  - New test: after triggering `handlePickPhoto` (simulated via `fireEvent.press` on the photo area), `save()` DTO carries the copied `file://` path from document dir.
- `src/lib/subscriptions.test.ts`
  - Mock `expo-file-system` `File.delete` and verify it is called on `deleteSubscription` for a subscription whose `photoPath` is a `file://` URI, and NOT called for `null` or `http(s)://` values.
  - Same verification on `updateSubscription` when photoPath changes to a new local URI, and no delete when photoPath is unchanged.

Bottom sheet `stackBehavior` cannot be verified in jest (behavior is native/runtime) — manual verification on device is required.

## Manual verification checklist

- On Android real device:
  - Open Subscriptions → add. Tap photo tile → gallery → take a photo via gallery's camera → return. Photo tile shows the picture. Save subscription. Reopen the subscription. Photo tile still shows the picture (survives app process kill).
  - Same flow using a pre-existing gallery photo.
  - Open subscription sheet. Tap currency chip. Currency picker mounts **on top of** subscription sheet (both visible; subscription sheet not minimized). Pick a currency. Currency picker dismisses; subscription sheet remains open with the new currency displayed.
  - Same test with the anchor-day picker.
  - Delete a subscription that has a local photo. Verify photo file is gone from the app's document directory (`adb shell run-as <pkg> ls files/`).
- Automated: `npm test` passes.

## Files changed

- `src/components/sl/currency-picker-sheet.tsx`
- `src/components/sl/anchor-day-picker-sheet.tsx`
- `src/components/sl/subscription-sheet.tsx`
- `src/components/sl/subscription-sheet.test.tsx`
- `src/lib/subscriptions.ts`
- `src/lib/subscriptions.test.ts`

## Out of scope

- Switching to camera capture (`launchCameraAsync`) — user confirmed picker is the intended entry point.
- iOS-side verification of the photo bug — user only reported it on Android; picker+file copy fix applies uniformly.
- Migration of existing subscriptions with `content://` `photoPath` values — such rows are broken already; a background migration is a separate concern.
- Refactoring the ref-mirroring pattern in `subscription-sheet.tsx` (used for save-after-setState correctness in tests).
