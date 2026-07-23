# SpendLens — i18n + Polish Round Design

**Date:** 2026-07-24
**Scope:** Single spec covering 8 improvements. One implementation plan will follow.

---

## Goal

Ship a coordinated polish round covering: (1) VI/EN internationalization, (2) notification audit + smoke checklist, (3) migration of existing modals to `@gorhom/bottom-sheet`, (4) camera permission gating for the note tap zone, (5) camera zoom continuity bug fix, (6) slower camera page scroll, (7) entry-screen form validation with custom persistent categories and date/time picker, and (8) removal of auto-init seed data.

## Global Constraints

- **Expo SDK 57** — check `https://docs.expo.dev/versions/v57.0.0/` for any new API before adding a dep.
- **TypeScript strict** — no `any` in new code. `never` exhaustive checks on unions.
- **TDD** — every new pure module ships with Jest tests. UI wiring gets one integration smoke.
- **Support VI and EN only** in i18n. `auto` mode is a third option that resolves at load.
- **All existing tests must remain green.** No test regressions.
- **New deps only where necessary.** Justify each addition in its section.
- **No visible UI copy left hardcoded** after Section 1 lands (allow test-only strings).

---

## Section 1 — Internationalization (react-i18next)

### Deps

Add:
- `i18next` (^25.x)
- `react-i18next` (^15.x)
- `expo-localization` (`~17.0.x` matching SDK 57)

### File layout

```
src/lib/i18n/
├── index.ts         # init i18next, exports `i18n`, `useT` (thin re-export of useTranslation)
├── detect.ts        # resolveLanguage(settingsLanguage, deviceLocale) → 'vi' | 'en'
├── detect.test.ts
└── locales/
    ├── vi.json
    └── en.json
```

### Init

`src/lib/i18n/index.ts` runs once at module import. `_layout.tsx` imports it before providers so `useTranslation()` inside providers works.

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './locales/vi.json';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: { vi: { common: vi }, en: { common: en } },
  lng: 'vi',                  // will be overridden by SettingsProvider once loaded
  fallbackLng: 'vi',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18n };
export { useTranslation as useT } from 'react-i18next';
```

### Language resolution

`src/lib/i18n/detect.ts`:

```ts
export type LanguageSetting = 'auto' | 'vi' | 'en';
export type ResolvedLanguage = 'vi' | 'en';

export function resolveLanguage(setting: LanguageSetting, deviceLocale: string | null): ResolvedLanguage {
  if (setting === 'vi' || setting === 'en') return setting;
  if (deviceLocale?.toLowerCase().startsWith('en')) return 'en';
  return 'vi';   // VI is the fallback for null and non-EN locales
}
```

Test cases: `('auto', 'vi-VN') → 'vi'`, `('auto', 'en-US') → 'en'`, `('auto', 'ja-JP') → 'vi'`, `('auto', null) → 'vi'`, `('vi', 'en-US') → 'vi'`, `('en', 'vi-VN') → 'en'`.

### Settings integration

Extend `src/lib/settings.ts`:

```ts
export interface Settings {
  // ... existing keys
  language: 'auto' | 'vi' | 'en';
}

export const DEFAULTS: Settings = {
  // ...
  language: 'auto',
};
```

Encode/decode: `case 'language': return value as string;` and validate on decode (`'auto' | 'vi' | 'en'`, else fall back to `'auto'`).

Extend `SettingsProvider`: after `loadSettings`, compute `resolveLanguage(settings.language, Localization.getLocales()[0]?.languageCode ?? null)` and call `i18n.changeLanguage(resolved)`. Also call this on every `update('language', ...)`.

### Settings screen — new "NGÔN NGỮ" section

```
NGÔN NGỮ
[Auto] [Tiếng Việt] [English]        ← Segmented
```

Placed above section "GIAO DIỆN". Labels themselves are translated so the Segmented text switches when EN is picked.

### Translation key structure

Single namespace `common`. Keys grouped by feature via dot notation:

```json
{
  "app": { "name": "SpendLens" },
  "nav": { "today": "Hôm nay" },
  "day": { "today": "Hôm nay", "yesterday": "Hôm qua" },
  "category": {
    "food": "Ăn uống",
    "transport": "Di chuyển",
    "shopping": "Mua sắm",
    "bills": "Hóa đơn",
    "health": "Sức khỏe",
    "fun": "Giải trí",
    "other": "Khác",
    "income": "Thu nhập"
  },
  "camera": {
    "permission_needed": "Cần quyền camera để chụp khoản chi",
    "permission_loading": "Đang tải camera…",
    "permission_grant": "Cho phép camera",
    "note_placeholder": "VD: Cà phê Highlands",
    "note_label": "Ghi chú"
  },
  "entry": {
    "amount_label": "SỐ TIỀN",
    "note_label": "GHI CHÚ",
    "note_placeholder_expense": "Bún bò Huế · gần công ty",
    "note_placeholder_income": "Lương, thưởng…",
    "date_label": "Ngày giờ",
    "save_expense": "Lưu khoản chi",
    "save_income": "Lưu khoản thu",
    "save_update": "Cập nhật",
    "custom_category_placeholder": "Tên danh mục mới",
    "custom_category_delete_title": "Xoá danh mục?",
    "custom_category_delete_body": "Danh mục sẽ bị xoá vĩnh viễn. Các giao dịch cũ vẫn giữ.",
    "required_asterisk": "*"
  },
  "settings": {
    "title": "Cài đặt",
    "section_budget": "NGÂN SÁCH",
    "section_reminder": "NHẮC NHỞ",
    "section_language": "NGÔN NGỮ",
    "section_theme": "GIAO DIỆN",
    "section_data": "DỮ LIỆU",
    "section_info": "THÔNG TIN",
    "budget_row": "Ngân sách tháng",
    "budget_not_set": "Chưa đặt",
    "reminder_row": "Nhắc chụp bill cuối ngày",
    "reminder_time": "Giờ nhắc",
    "reminder_not_set": "Chưa đặt",
    "budget_alerts_row": "Cảnh báo vượt ngân sách",
    "budget_alerts_hint": "Đặt ngân sách trước",
    "language_auto": "Auto",
    "language_vi": "Tiếng Việt",
    "language_en": "English",
    "theme_auto": "Auto",
    "theme_light": "Sáng",
    "theme_dark": "Tối",
    "export_row": "Xuất CSV",
    "reset_txns_row": "Xoá giao dịch",
    "reset_txns_title": "Xoá giao dịch",
    "reset_txns_body": "Tất cả giao dịch và ảnh sẽ bị xoá vĩnh viễn.",
    "reset_all_row": "Reset về mặc định",
    "reset_all_title": "Reset về mặc định",
    "reset_all_body": "Tất cả giao dịch, ảnh và cài đặt sẽ được đưa về mặc định.",
    "version_row": "Phiên bản",
    "github_row": "GitHub",
    "bug_row": "Báo lỗi",
    "license_row": "Giấy phép",
    "cancel": "Huỷ",
    "delete": "Xoá",
    "reset": "Reset",
    "save": "Lưu",
    "permission_needed_title": "Cần quyền thông báo",
    "permission_needed_body": "Hãy bật quyền thông báo trong Cài đặt hệ thống."
  },
  "history": { "title": "Lịch sử", "empty": "Chưa có giao dịch" },
  "notif": {
    "reminder_title": "SpendLens",
    "reminder_body": "Ghi lại chi tiêu hôm nay?",
    "budget_80_title": "Sắp vượt ngân sách",
    "budget_80_body": "Bạn đã chi hơn 80% ngân sách tháng này.",
    "budget_100_title": "Vượt ngân sách!",
    "budget_100_body": "Bạn đã chi vượt 100% ngân sách tháng này."
  },
  "export": { "share_dialog_title": "Xuất SpendLens" }
}
```

`en.json` mirrors this structure with English strings. Full EN translations are the implementer's job during the corresponding task.

### Refactoring pattern

Every hardcoded string in these files gets converted:

- `src/app/index.tsx`, `src/app/entry.tsx`, `src/app/home.tsx`, `src/app/history.tsx`, `src/app/settings.tsx`, `src/app/transaction/[id].tsx`, `src/components/sl/date-range-modal.tsx`
- Non-component modules that produce user-visible text: `src/lib/categories.ts` (labels become `t('category.food')` accessed via helper), `src/lib/format.ts` (dayLabel), `src/lib/notifications.ts` (title/body), `src/lib/export.ts` (dialogTitle)

For non-component modules that need translation, expose accessor functions that read from `i18n.t(...)` directly (module-level `import { i18n } from '@/lib/i18n'`). This avoids hook usage in non-React files.

Example (`categories.ts` refactor):

```ts
import { i18n } from '@/lib/i18n';

export type StaticCategoryId = 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'fun' | 'other';

export type CustomCategoryId = `custom_${string}`;
export type CategoryId = StaticCategoryId | CustomCategoryId;

export interface Category {
  id: CategoryId;
  labelKey: string | null;         // 'category.food' etc.; null for custom (use `label`)
  label: string;                   // resolved label (for custom rows)
  chip: string;
  fg: string;
}

export const STATIC_CATEGORIES: Category[] = [
  { id: 'food', labelKey: 'category.food', label: '', chip: '#FFEDD5', fg: '#EA580C' },
  // ... etc.
];

export function categoryLabel(cat: Category): string {
  return cat.labelKey ? i18n.t(cat.labelKey) : cat.label;
}
```

Consumers call `categoryLabel(cat)` instead of reading `cat.label` directly.

### Testing

- `detect.test.ts` — 5 cases above
- `i18n/index.test.ts` — imports `i18n`, verifies `t('app.name') === 'SpendLens'` in VI, and `i18n.changeLanguage('en')` swaps at least one known key (`t('day.today') === 'Today'`)
- Existing tests that assert Vietnamese text (`export.test.ts:20` expects `Ăn uống`) may need to lock language to VI in `beforeEach`

---

## Section 2 — Notifications audit + smoke-test checklist

### Code audit tasks

Read and verify these paths, fix any defect found inline:

1. `src/lib/notifications.ts` — permissions, handler, schedule, cancel, fireBudgetAlert
2. `src/app/settings.tsx` — `onToggleReminder`, `onTimePicked` flow
3. `src/app/entry.tsx` — budget alert branch (already extracted to `decideBudgetAlert`)
4. `src/lib/settings.ts` — `budgetNotifiedMonth` encoding
5. `_layout.tsx` — verify `Notifications.setNotificationHandler` runs at module load (should, since `notifications.ts` executes it at import)

### Known suspicions to verify

- **Scheduled reminders survive app restart?** SDK 57 scheduled notifications should persist. Verify by scheduling for 1 min ahead and killing the app.
- **Foreground notifications shown?** `setNotificationHandler` returns `shouldShowBanner: true, shouldShowList: true`. Should show banner even when app is open.
- **Budget alert dedup:** Same-month re-fire prevented by `budgetNotifiedMonth`. Cross-month resets. Verify by manually editing DB or waiting.
- **Permission denial path:** If user denies once, `requestPermission` returns false, we show Alert. Verify Android + iOS behavior on repeated denies (need `Linking.openSettings()` fallback? — out of scope for this round unless bug found).

### Deliverable

Write `docs/testing/notifications-smoke-checklist.md` with:

- **Setup:** dev build with Expo Dev Client
- **Test 1 — Daily reminder in foreground:** Settings > enable reminder > pick a time 1 minute ahead > lock phone > wait > banner should appear even if locked
- **Test 2 — Daily reminder background survival:** Same, but kill app process before waiting
- **Test 3 — Reminder off cancels:** Enable + set time, disable, wait — no notification
- **Test 4 — Budget alert 80%:** Set budget 100k, add txn 80k, expect banner "Sắp vượt ngân sách"
- **Test 5 — Budget alert 100%:** Continue, add txn 20k more (total 100k), expect "Vượt ngân sách!"
- **Test 6 — Dedup:** Add another 10k → no re-alert (still 100%)
- **Test 7 — Cross-month reset:** Change device date to next month, add expense → 80% alert re-fires
- **Test 8 — Alerts disabled:** Toggle `budgetAlertsEnabled` off, add over-budget txn → no alert
- **Test 9 — Permission denied path:** Fresh install, deny permission → toggle stays off, no crash

Each test row has: steps, expected result, pass/fail checkbox.

---

## Section 3 — @gorhom/bottom-sheet migration

### Deps

Add:
- `@gorhom/bottom-sheet` (^5.x — supports RN 0.86 + Reanimated 4)

Already have peers: `react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context`.

### Root wiring

`src/app/_layout.tsx` — wrap after `SafeAreaProvider`, before other providers:

```tsx
<GestureHandlerRootView>
  <SafeAreaProvider>
    <BottomSheetModalProvider>
      <SettingsProvider>
        {/* ... */}
      </SettingsProvider>
    </BottomSheetModalProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

### DateRangeModal refactor

Change from prop-driven `visible` to imperative ref:

```tsx
export interface DateRangeSheetHandle {
  present: () => void;
  dismiss: () => void;
}

export const DateRangeSheet = forwardRef<DateRangeSheetHandle, {
  initialFrom: string;
  initialTo: string;
  onExport: (from: string, to: string) => void;
}>((props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }));
  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['60%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView>
        {/* existing body */}
      </BottomSheetView>
    </BottomSheetModal>
  );
});
```

`history.tsx` and `settings.tsx` consumers switch from `<DateRangeModal visible={...}/>` to holding a ref and calling `.present()`.

### Budget keypad sheet

Convert the inline `<Modal>` in `settings.tsx` into a similar `BottomSheetModal` component `src/components/sl/budget-sheet.tsx`. `keyboardBehavior="interactive"` handles keyboard avoidance — no more `KeyboardAvoidingView`. Uses `BottomSheetTextInput` (from `@gorhom/bottom-sheet`) instead of RN's `TextInput` so the sheet resizes with keyboard.

Snap point: dynamic via `enableDynamicSizing` (auto-fit content height).

### Testing

- One integration test per sheet: present → renders content → dismiss → not visible. Use `@testing-library/react-native` `fireEvent`.
- No shallow snapshot tests (they're brittle with reanimated).

---

## Section 4 — Camera: gate note tap zone by permission

### Change

In `src/app/index.tsx`, `CameraPage`: wrap `noteTapZone` and `notePreview` render in `{granted ? (...) : null}`. Also the note input overlay (`noteFocused` branch) should not render if `!granted`.

Behavior when permission not granted:
- Only shows the permission prompt centered in viewfinder
- Bottom capture row still visible but shutter disabled? — **Decision: shutter also disabled (Shutter component gets `disabled` prop, use existing `disabled` styling)**. Prevents confusion tapping a shutter that can't shoot.
- Flip button also hidden (nothing to flip)

### Testing

Manual visual check: fresh install → deny → note tap does nothing, no keyboard opens. Grant → tap zone works.

---

## Section 5 — Camera zoom continuity fix

### Root cause hypothesis

`FlatList`'s inline `renderItem` returns a new JSX identity each parent re-render. React reconciles by list key, so `CameraPage` should not remount — but the `useMemo(() => Gesture.Simultaneous(...), [])` closure captures the initial refs. If for any reason `CameraPage` does unmount (e.g., FlatList windowing when scrolling far away), refs reset.

The `zoom` state lives on `CameraScreen` (parent) and is passed as a prop. On unmount+remount of `CameraPage`, `useRef(zoom)` is called with the prop value, and `zoomRef.current` starts equal to the current `zoom`. This should be fine — but `useEffect` sync of `zoomRef.current` from prop may lag.

### Fix

1. **Move zoom state INTO `CameraPage`** (local `useState`). This eliminates the prop-sync issue entirely.
2. **Memoize `renderItem`** with `useCallback` in `CameraScreen`, deps `[todayTxns]`.
3. **Add `Gesture.Pinch().onEnd(...)`** that commits `initialZoomRef.current = zoomRef.current` — safety net so the next pinch always starts from the correct baseline.
4. **Keep double-tap gesture on `CameraView`** (inside `viewfinderWrap`) so it never fires from the capture area.

### Testing

Manual on-device: pinch to zoom (0.5x → 3x), release, pinch again — should continue from 3x, not reset. Double-tap viewfinder → resets to 1x. Double-tap capture area → nothing.

Unit test not feasible (gesture handler is native).

---

## Section 6 — Camera scroll deceleration slower

### Change

`FlatList` in `src/app/index.tsx`:
- `decelerationRate={0.5}` (numeric, slower than string `'normal'` which is ~0.985)
- Keep `disableIntervalMomentum` and `pagingEnabled`
- Keep `snapToInterval={SCREEN_HEIGHT}` and `snapToAlignment="start"`

**Alternative if 0.5 feels too slow:** `0.6` or `0.7`. Implementer tries 0.5 first, adjusts by feel and reports in the task report.

### Testing

Manual only.

---

## Section 7 — Entry form validation + custom categories + date/time picker

### Required fields UI

- Amount label becomes `"SỐ TIỀN *"` — asterisk in `Money.expense` color (red)
- Note label becomes `"GHI CHÚ *"` — asterisk same color
- Category and Ngày giờ: no asterisk (always have valid defaults)

Asterisk implementation: append span with color style. `<Text>SỐ TIỀN <Text style={{color:'#FB5B4D'}}>*</Text></Text>`.

### Save button disabled state

```ts
const canSave = amount > 0 && note.trim() !== '';
```

Pass `disabled={!canSave}` to `GradientButton`. Existing disabled styling handles the visual (grayscale).

### Custom category persistence

**Schema (new SQLite table):**

```sql
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
```

Add to `SCHEMA` string in `src/lib/db.ts`.

**Module `src/lib/user-categories.ts`:**

```ts
export interface UserCategory { id: string; label: string; createdAt: number }

export function listUserCategories(db = defaultDb): UserCategory[];
export function insertUserCategory(label: string, db = defaultDb): UserCategory;
export function deleteUserCategory(id: string, db = defaultDb): void;
```

Insert generates `id = 'custom_' + Date.now()`. Trims label, rejects empty.

**Entry screen integration:**

- New state: `userCategories` loaded via context or direct query on mount
- Render chips: `[...STATIC_CATEGORIES, ...userCategories]`
- Long-press custom chip → `Alert.alert(t('entry.custom_category_delete_title'), body, [Cancel, Delete])`; on delete → remove from DB, refresh list, if current selection was that id → reset to `food`

**"Khác" tap flow — inline custom input:**

- Tapping the "Khác" chip: selects it (as before, sets `category = 'other'`)
- Underneath the chips row, when `category === 'other'`, render an inline TextInput:
  `[Tên danh mục mới ___________________] [+ button]`
- User types a name → tap `+` → calls `insertUserCategory(name)`, updates local list, sets `category = newId`, clears the input
- Empty input + `+` tap → no-op

### Date/time picker

- New field below note: `Ngày · Giờ` row (same style as existing `dateRow`)
- Tap → open picker

Platform behavior:
- **iOS:** `<DateTimePicker mode="datetime" ...>` — single sheet
- **Android:** State machine `pickerStep: 'idle' | 'date' | 'time'`. Tap opens date first, on close open time, on close commit both.

State: `selectedDate: Date` (default `new Date()` on mount, or from `existing` when editing). On save, extract `date`, `time`, `createdAt` from `selectedDate` instead of computing from `new Date()`.

### Save payload change

```ts
const payload: NewTxn = {
  date: editing && existing ? existing.date : toDateKey(selectedDate),
  time: editing && existing ? existing.time : formatHHMM(selectedDate),
  createdAt: editing && existing ? existing.createdAt : selectedDate.getTime(),
  category,   // now can be a custom_ id
  name: note.trim(),   // was: `note.trim() || fallback`. With validation, note is guaranteed non-empty.
  note: null,
  amount,
  isIncome,
  photoPath: photoUri ?? null,
};
```

**Note:** the `category === 'other' && customInputHasText` path — if user typed a custom name but didn't tap `+` before Save, we auto-create the category at save time so no data is lost. Alternative: refuse to save until they tap `+`. **Choice: auto-create at save** for smoother UX.

### Testing

- `user-categories.test.ts` — CRUD + label uniqueness constraint
- Component test for Entry: renders asterisks, disabled state, and canSave logic across amount/note toggles

---

## Section 8 — Remove auto-init seed

### Change

`src/lib/transactions-context.tsx:35` — delete the line `seedIfEmpty(db);`. Keep import commented out or replace with a comment referencing seed.ts for dev use.

Update `src/lib/seed.ts` top comment to explicitly say it's dev-only, no longer called automatically.

### Reset button coverage

`Reset về mặc định` in Settings (which invokes `resetTransactions()` + `resetSettings()`) must also wipe the new `categories` table (from Section 7). Add `resetUserCategories(db)` helper in `src/lib/user-categories.ts` and call it from the Settings reset handler. Otherwise custom categories from previous runs persist across a "full reset".

### Testing

- `sanity.test.ts` and other tests that create fresh DBs must not depend on seed data (verify by grep)
- Manually confirm fresh install (or `Reset về mặc định`) shows empty state in home/history without crash

---

## Cross-cutting concerns

### Ordering constraint

i18n (Section 1) MUST land before Sections 3, 4, 7 introduce new copy. Otherwise those tasks create hardcoded strings that must be re-migrated.

Suggested task order in the plan: 8 (seed removal — smallest) → 1 (i18n — biggest) → 2 (notif audit) → 6 (scroll deceleration) → 5 (zoom fix) → 4 (permission gate) → 3 (bottom-sheet) → 7 (form + custom cat + date picker).

### Commits

TDD, small commits. Each task ends with tests green + one commit.

### Risk register

| # | Risk | Mitigation |
|---|------|------------|
| 1 | i18n missed strings — grep must catch all Vietnamese literals | Grep pattern in checklist; run `grep -rn "'[A-ZĐ][a-zàáâã…]" src/` after refactor and require zero hits outside i18n locale files |
| 5 | Zoom root cause is different from hypothesis | Add JS logs during implementation, allow implementer to escalate BLOCKED with logs |
| 7 | Auto-create category on save could produce duplicate labels | `UNIQUE` constraint on `label` handles it — insert catches error, falls back to existing id |
| 3 | Reanimated 4 + bottom-sheet 5.x compatibility | Verify version in package.json before installing; try `npm ls @gorhom/bottom-sheet` after install |

### Out of scope for this round

- Splash / adaptive icon updates (already done)
- Currency selector (deferred from Plan 4)
- iOS bundle identifier / Apple Dev signing
- Notification permission fallback via `Linking.openSettings()` (unless bug found in audit)

---

## Acceptance criteria (whole round)

- All 8 sections implemented
- Jest: `npm test` fully green
- `npx tsc --noEmit` no new errors (pre-existing @types/jest issue may remain if not tackled)
- Grep `grep -rn "['\"][A-ZĐ][a-zàáâã…]" src/app src/components src/lib | grep -v test` returns 0 hits outside `src/lib/i18n/locales/`
- Fresh install: empty DB, no seed
- Language toggle: VI → EN swaps all visible copy without app restart
- Bottom sheets open/close smoothly with keyboard support
- Camera: zoom persists between pinches, resets only on double-tap in viewfinder; permission-not-granted state hides note tap zone; slower scroll
- Entry: `*` on required fields, disabled Save until valid, custom category creation persists, custom category chips render on next open, date/time picker works iOS + Android
- Notifications smoke checklist committed to `docs/testing/`
