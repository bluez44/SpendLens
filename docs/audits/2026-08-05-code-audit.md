# SpendLens Code Audit — 2026-08-05

## Scope

Audit của 5 file lớn nhất trong codebase, theo 4 chiều:

1. **Form validation** — user input được validate chưa, edge cases (empty, negative, out-of-range, format sai), có hiển thị lỗi inline không.
2. **Component decomposition / custom hooks** — subsections nên tách sub-component, state groups nên gom thành hook, memoization thiếu.
3. **Async try-catch** — mọi async/DB/fetch/native call có bọc try-catch, có nuốt lỗi im lặng không.
4. **User-facing error UX** — lỗi có surface qua Alert/inline text không, message có rõ ràng và phân loại được không.

**Files audited:**

| File | LOC | Vai trò |
|---|---|---|
| `src/components/sl/subscription-sheet.tsx` | 690 | Bottom-sheet form tạo/sửa subscription |
| `src/app/index.tsx` | 512 | Màn Home — camera + note quick-entry |
| `src/app/settings.tsx` | 490 | Màn Settings — theme/lang/currency/lock/notif/data |
| `src/app/compare.tsx` | 440 | Màn Compare — so sánh 2 kỳ với overlay chart |
| `src/app/entry.tsx` | 439 | Màn Add/Edit transaction |

**Severity rubric:**

- 🔴 **High** — nguy cơ crash, mất data im lặng, hoặc user tưởng thành công mà thực ra thất bại.
- 🟡 **Medium** — UX kém, khó maintain, thiếu feedback, refactor opportunity rõ ràng.
- 🟢 **Low** — nice-to-have, polish nhỏ.

---

## Executive Summary — Top Issues Cross-File

**🔴 Data integrity — silent DB write failures (high risk of silent data loss)**

- `entry.tsx:162-192` — `add()` và `update()` không bọc try-catch → nếu DB fail (constraint, disk full), user tưởng đã lưu.
- `settings.tsx:358-360, 374-387` — `resetTransactions()`, `resetAll` sequence không có try-catch nhất quán; một số bước fail lặng lẽ.
- `subscription-sheet.tsx:237-255` — `tryAddCustomCategory` insert error → console.warn, user không biết bị skip hay auto-fix.

**🔴 Save button UX — bấm không thấy phản hồi**

- `subscription-sheet.tsx:272, 279` — Save button không disable khi form invalid; user bấm hit silent early-return, tưởng app hỏng.
- `entry.tsx:132` — `canSave` check tồn tại nhưng không có inline error dưới nút Save giải thích tại sao bị disable.
- `entry.tsx:134-192` — Sau khi save thành công cũng không có confirmation nào; chỉ navigate.

**🔴 Input bounds / overflow**

- `entry.tsx:66-70` — Amount không check overflow (JS number precision); giá trị lưu quá lớn có thể silent overflow.
- `subscription-sheet.tsx:375` — Amount input strip non-digit nhưng không max; paste số cực lớn OK.
- `compare.tsx:89-112` — Month arithmetic (`new Date(y, m-1, d-N)`) dựa vào JS Date self-correction; edge case như Feb 31 chưa được clamp.

**🔴 Photo capture failures nuốt lỗi**

- `subscription-sheet.tsx:180-197` — `ImagePicker` + file copy fail → console.warn, không alert.
- `index.tsx:83-93` — Camera capture fail → catch trống, navigate `/entry` như bình thường.

**🟡 Component sizes need decomposition**

- `settings.tsx` — 4 sections (Reminder, AppLock, Currency, Data) tổng ~180 lines → nên tách thành sub-components, còn lại ~250 lines.
- `subscription-sheet.tsx` — 11 useState + 3 near-identical notify handlers → cần `useSubscriptionFormState`, `useSyncedState`, `useNotifyToggle`.
- `entry.tsx` — 6 draft states rời rạc → cần `useDraftTransaction`.
- `compare.tsx` — 5 sheet refs + 4 period states → cần `useCompareSelection`.
- `index.tsx` — Camera UI state + gesture logic → cần `useCameraUIState`, `useCameraGesture`.

**🟡 Notification permission edge cases**

- `settings.tsx:133` — `scheduleDailyReminder` không try-catch; nếu fail user thấy giờ đã update nhưng reminder không chạy.
- `subscription-sheet.tsx:199-211` — `coerceNotifyFlags` gọi `requestPermission()` không try-catch.

**🟡 Missing memoization**

- `index.tsx:37` — `categoryExtras` compute mỗi render, không `useMemo`.
- `index.tsx:98-127` — `renderItem` dependency array quá lớn, cause child re-render.

---

## Recommended Refactor Order

Xếp theo ROI (impact / effort). Nếu chỉ có thời gian làm phần đầu list, gain lớn nhất.

1. **[1-2h] Wrap tất cả DB writes với try-catch + Alert** (`entry.tsx:162`, `settings.tsx:358,374`, `subscription-sheet.tsx:261,272`). Fix silent data-loss trước tiên — đây là data integrity.
2. **[30min] Save button disable + inline error** (`subscription-sheet.tsx:272`, `entry.tsx:132,374`). Fix bug user-visible dễ nhất — chỉ cần thêm `disabled` prop và text.
3. **[1h] Input bounds validation** — amount max, note max-length, date `maximumDate={today}` (`entry.tsx:58,66,132`; `subscription-sheet.tsx:375`).
4. **[30min] Alert khi photo/permission fail** (`subscription-sheet.tsx:180,199`; `index.tsx:83`). Thay `catch { console.warn }` bằng `Alert.alert` với message cụ thể.
5. **[2h] Extract `useDraftTransaction` hook** (`entry.tsx`) — file phức tạp nhất về state, refactor này mở đường cho form validation logic dùng chung.
6. **[3h] Split `settings.tsx` thành 4 sub-components** (Reminder, AppLock, Currency, Data). File giảm 490→~250, dễ maintain.
7. **[2h] Extract `useSubscriptionFormState` + `useSyncedState`** (`subscription-sheet.tsx`) — giảm ~40 lines boilerplate state/ref pairs.
8. **[1h] Extract `useCompareSelection`** (`compare.tsx`) — gom 9 state vars picker/period.
9. **[1h] Memoize `categoryExtras` + trim `renderItem` deps** (`index.tsx`). Quick perf win.
10. **[1h] Date arithmetic safety** trong `compare.tsx:89-112` — clamp day-of-month hoặc dùng date-fns.

**Cross-cutting patterns nên introduce:**

- **Toast/Snackbar component** — hiện tại chỉ có `Alert.alert` (modal, cần user tap OK). Nhiều feedback (save success, silent-refresh failed) phù hợp với toast hơn.
- **`useAsyncAction<T>()` hook** — chuẩn hoá pattern `try/setLoading/setError/catch/finally`. Nhiều nơi đang lặp lại `try { ... } catch { setFetchError(t(...)) }`.
- **Form validation helper** — hiện không dùng lib nào; nếu form phức tạp thêm sẽ đau. Có thể là 1 helper nhỏ `validateForm({name: {min: 1}, amount: {gt: 0}})` thay vì lib nặng.

---

## Per-file Details

### 1. `src/components/sl/subscription-sheet.tsx` (690 lines)

**Purpose:** Bottom-sheet form modal tạo/sửa subscription với các trường name, amount, currency, category, anchor day, photo, notification reminders.

#### Form validation

- 🔴 **L272, L279** — Save button không có disabled state khi form invalid (empty name, zero/negative amount). User bấm và hit silent early-return, appearing broken. Fix: compute `isValid = name.trim() && amountDigits && Number(amountDigits) > 0` và disable save button khi false.
- 🟡 **L375** — Amount input strip non-digits nhưng không có min/max check; user paste số cực lớn OK. Fix: thêm reasonable max (10M in any currency) trong input handler.
- 🟡 **L238-254** — Custom category name chỉ có `.trim()` check, không max length, không filter ký tự đặc biệt. Tên rất dài có thể phá layout. Fix: thêm `maxLength={30}` prop.
- 🟡 **L261-294** — Save đọc từ refs mà không validate refs match state; không guard NaN trong `curOriginalAmount`. Fix: thêm `if (isNaN(curOriginalAmount))` check trước return.
- 🟢 **L357, L373, L431** — Whitespace-only name pass được nếu amountDigits có (L272 chỉ check `trim()` sau đó). Fix: pre-trim ở input handler.

#### Component decomposition / hooks

- 🟡 **L100-108** — 9 paired state/ref setter functions (`nameRef/setName`, ...) với boilerplate sync. Tạo `useSyncedState<T>(initialValue, ref)` hook giảm ~40 lines.
- 🟡 **L73-95, L111-124** — 11 useState calls cho form fields. Extract thành `useSubscriptionFormState()` gom setters + resetToDefaults.
- 🟡 **L180-197** — Photo picker try-catch (copy sync, fallback to source) nên tách thành `usePhotoCapture()` hook.
- 🟡 **L213-235** — 3 handler notification (handleNotify7/3/1) gần giống hệt nhau với boilerplate `coerceNotifyFlags`. Extract `useNotifyToggle(index)` wrap permission check.
- 🟢 **L154-159** — `renderBackdrop` useCallback với deps rỗng — correct.

#### Async try-catch

- 🔴 **L180-197** — `handlePickPhoto` await `ImagePicker.launchImageLibraryAsync` + file copy không có user feedback on error. Catch chỉ console.warns. Fix: `Alert.alert('Failed to save photo', err.message)` trong catch.
- 🔴 **L199-211** — `coerceNotifyFlags` await `requestPermission()` không try-catch. Nếu throw, handler crash lặng lẽ. Fix: wrap trong try-catch.
- 🟡 **L237-255** — `tryAddCustomCategory` catch insert error rồi re-query DB (L247) không retry. Nếu query fail, function silently return. Fix: `Alert.alert('Cannot add category', 'Please try again.')`.
- 🟢 **L168-178** — `nextDuePreview` wrap try-catch, return '' on error (safe).

#### User-facing error UX

- 🔴 **L180-197** — Photo copy fail log nhưng không show; user không biết tại sao photo không save.
- 🟡 **L207-208** — `"perm_needed_body"` alert generic, không giải thích tại sao (which notification?). Fix: include reason "We need notification permission to send 7-day reminders."
- 🔴 **L237-255** — Category add fail console.warn im lặng; nếu category tồn tại, silently sets it (L248-250) không feedback.
- 🟡 **L272, L279** — Save silently return, user click nút không thấy gì. Fix: inline error text hoặc Alert.
- 🟢 **L299-313** — Delete confirm modal rõ ràng, 2-option pattern OK.

#### Top 3 priorities cho file này

1. Save button disabled state + inline validation feedback (L272, L279).
2. Photo picker + category add phải show Alert on failure (L180, L237).
3. Extract 11-field form state + 3 notification handlers thành custom hooks (L73-108, L213-235).

---

### 2. `src/app/index.tsx` (512 lines)

**Purpose:** Camera-first transaction entry screen với viewfinder, note editor, và today's transaction list carousel.

#### Form validation

- 🟡 **L40** — Note input accept mọi string không trim; empty/whitespace-only note pass qua `/entry` page. Fix: trim trước khi `capture()` hoặc validate ở `setNote()`.
- 🟢 **L334** — Note có `maxLength={140}` enforce bởi platform; không có inline error khi hit limit (acceptable UX).
- 🟢 **L81-94** — Note captured trước navigation; validation ở `/entry` page.

#### Component decomposition / hooks

- 🟡 **L38-43** — 6 UI state vars rời rạc (`facing`, `flash`, `note`, `noteFocused`, `isSnapping`, `currentIndex`). Extract `useCameraUIState()` hook.
- 🟡 **L203-228** — Gesture logic với 3 `useSharedValue`/`useState` + complex `useMemo` deps. Extract `useCameraGesture(zoom, setZoom)` hook.
- 🟡 **L98-127** — `renderItem` callback có dependency array quá lớn (`[insets, permission, requestPermission, granted, facing, flash, note, noteFocused, todayExpense, capture, categoryExtras]`) → cause unnecessary re-renders.
- 🟡 **L37** — `categoryExtras` compute inline mỗi render với `userCategories.map()`; wrap `useMemo([userCategories])`.
- 🟢 **L144-152** — Scroll event handlers dùng `Math.round()` an toàn.

#### Async try-catch

- 🟡 **L83-93** — `capture()` catch silent (`catch { ... }`) và vẫn navigate `/entry`; user không thấy photo-capture failure. Fix: thêm feedback hoặc log.
- 🟢 **L85-90** — Route navigation wrap try-catch; prevent uncaught rejections.
- 🟢 — Không có DB `runSync` hay context mutations trong file này.

#### User-facing error UX

- 🟡 **L269-275** — Permission state có "loading" → "grant" flow nhưng thiếu explicit "failed" state nếu `requestPermission()` fail.
- 🟢 **L119, L345-366** — Empty-state với `<EmptyTodayCard>` component (emoji + hint) OK.
- 🟢 **L270** — Permission UI dùng `t()` localization; messages rõ ràng.
- 🟡 **L91-92** — Photo capture fail silently fallback note-only; user không biết photo không save.

#### Top 3 priorities cho file này

1. Extract camera UI state + gesture logic vào hooks (L38-43, L203-228).
2. Memoize `categoryExtras` + trim `renderItem` deps (L37, L127) — quick perf win.
3. Thêm error logging/UX feedback cho photo capture failure (L83-93).

---

### 3. `src/app/settings.tsx` (490 lines)

**Purpose:** Settings screen quản lý app preferences (theme, language, currency/FX rates, budget, PIN lock, notifications, data export/reset).

#### Form validation

- 🟡 **L49-50** — `verifyMode`, `timePicker`, `fetchError` là 3 related state vars có thể extract vào custom hook `reminderSetup`.
- 🟡 **L152** — Budget sheet nhận number nhưng không validate `> 0` trong settings.tsx; delegate sang BudgetSheet. Fix: validate ở callback hoặc BudgetSheet.
- 🟡 **L429** — Export date-range validation chỉ trong DateRangeSheet; không check `from > to`. Fix: validate trong `onExport` callback.
- 🟢 **L319** — RateOverrideSheet validation (`parsed > 0`) OK; inline error display OK.

#### Component decomposition / hooks

- 🟡 **L159-189** — Reminder section (3 rows + toggle + time picker) → extract `<ReminderSection />` (~30 lines).
- 🟡 **L201-260** — Security/AppLock section (switch + verify/change PIN + biometric toggle) 60 lines nested state + handlers → extract `<AppLockSection />`.
- 🟡 **L285-341** — Currency section (primary selector + FX rates + override) 56 lines → extract `<CurrencySection />`; move `nonUsdCurrencies`, `referenceFor` helpers vào đó.
- 🟡 **L343-391** — Data section (export, reset txns, reset all) 48 lines Alert handlers → extract `<DataSection />`.
- 🟡 **L234** — Inline biometric toggle handler 23 lines nested try-catch → extract named async function `handleBiometricToggle()`.

#### Async try-catch

- 🟡 **L98-106** — `doRefetch()` wrap `refetchRates()` + set inline error 3s timeout. Không re-throw. Fix: explicit error logging hoặc retry mechanism.
- 🟡 **L110-122** — `onToggleReminder()` gọi `requestPermission()` + `scheduleDailyReminder()` không try-catch.
- 🟡 **L124-134** — `onTimePicked()` gọi `scheduleDailyReminder()` không try-catch; nếu fail, user thấy giờ update nhưng reminder không chạy.
- 🟡 **L358-360** — `resetTransactions()` trong onPress không try-catch. DB error có thể crash.
- 🟡 **L374-387** — `resetAll` gọi 5 async functions sequence; chỉ `clearPin()` có try-catch (L379-383); còn lại unguarded. Fix: wrap tất cả hoặc dùng `Promise.allSettled`.
- 🟡 **L92** — `changePrimary()` error swallowed `.catch(() => {})`. Không Alert.

#### User-facing error UX

- 🟡 **L103-105** — `doRefetch()` error inline Text 3s rồi biến mất. User có thể miss. Fix: Alert hoặc persist đến khi user dismiss.
- 🟡 **L113-120** — Nếu `requestPermission()` return false, Alert OK. Nhưng nếu `scheduleDailyReminder()` fail sau đó (L133), silent.
- 🟡 **L241-245** — Nếu biometric unavailable, Alert. Nếu `authenticateBiometric()` fail (L247), Alert generic "Verify failed" không phân biệt cancel/timeout/hardware.
- 🟡 **L358-361** — `resetTransactions()` không error handling. DB error → Alert không fire, có thể crash.
- 🟡 **L374-387** — `resetAll`: nếu bất kỳ bước fail, các bước sau không chạy hoặc fail; `refresh()` etc vẫn được gọi.
- 🟡 **L429** — `exportAndShareCsv()` return value (boolean) bị ignore; nếu export fail (unavailable, user cancel), không Alert.

#### Top 3 priorities cho file này

1. Wrap async operations với try-catch + user feedback — `scheduleDailyReminder()` (L133), `resetTransactions()` (L358), `resetAll` sequence (L375-387) đang fail lặng lẽ.
2. Extract 4 sections thành sub-components (Reminder, AppLock, Currency, Data) — 180+ lines → file 490→~250.
3. Validate export date range + handle export failures (L429).

---

### 4. `src/app/compare.tsx` (440 lines)

**Purpose:** Compare screen — hiển thị expense/income/net deltas giữa 2 kỳ (month-to-month, week-to-week, hoặc preset ranges) với overlay bar chart + category-level breakdowns.

#### Form validation

- 🔴 **L89-112** — Preset-driven date updates giả sử `new Date()` month/year math an toàn; không guard invalid dates (Feb 31) khi compute month offsets qua `new Date(y, m - 1, d - N, ...)`. Fix: `toDateKey()` round-trip validation hoặc clamp day to max(month).
- 🟡 **L105, 109** — Week arithmetic (`d - 7` / `d - 14`) có thể ra negative day; dựa vào JS Date self-correct. Fix: explicit constructor với confirmed serialization check.
- 🟡 **L206-209** — `bothEmpty` state show fallback text nhưng không giải thích tại sao empty (no data, invalid range, future dates). Fix: check `txnsA.length === 0 && txnsB.length === 0` phân biệt scenarios.
- 🟢 **L254-256** — `buildComparison()` nhận fallback `weekStartA ?? '1970-01-05'` nếu week undefined; silently dùng epoch week. Fix: assert weekStart defined trước.

#### Component decomposition / hooks

- 🟡 **L42-67** — State explosion: 5 sheet refs + typeIndex + 4 period states (monthA/B, weekA/B) + preset state scattered 26 LOC. Extract `useCompareSelection()` return `{ periods, sheetRefs, preset, setPreset }`.
- 🟡 **L114-125** — 3 nested useMemo cho txnsA, txnsB, comparison; O(n + m) aggregation + category sorting. Memoized nhưng có thể tăng scope memoization.
- 🟡 **L212-292** — Render logic pha trộn summary card, bar chart, category list; 81 LOC. Extract `<CompareSummary/>`, `<CompareChart/>`, `<CompareCategories/>`.
- 🟢 **L323-350** — `DeltaLine` pure function component; OK giữ inline vì nhỏ và data-driven.

#### Async try-catch

- ✅ No issues found. (Tất cả data loading qua `useTransactions()` context; không có direct DB queries/network/await trong file.)

#### User-facing error UX

- 🟡 **L152, L206-209** — `bothEmpty` state render generic message, không phân biệt: (a) truly no txns, (b) both periods identical, (c) data loading. Fix: check `transactions.length === 0` separate, pass `ready` flag.
- 🟡 **L270-279** — Chart warn nếu txnsA/B empty (inline `<Text>`) nhưng chỉ display *sau khi* BarChartOverlay render empty bars; 2 lớp feedback confusing. Fix: warning trước chart hoặc consolidate.
- 🟢 **L135-139, L141-150** — Period picker triggers work correctly.

#### Top 3 priorities cho file này

1. Extract custom hook `useCompareSelection()` — consolidate 5 sheet refs + 4 period states + 1 preset state.
2. Date validation trên month arithmetic (L92-101) — clamp day-of-month tránh silent bug Feb 31.
3. Cải thiện empty state messaging — phân biệt "no txns in range" vs "same period selected" vs "loading".

---

### 5. `src/app/entry.tsx` (439 lines)

**Purpose:** Entry screen add/edit expense/income transactions với amount, category, currency, note, date, optional photo.

#### Form validation

- 🔴 **L66-70** — Amount conversion back từ stored format không bounds check; extremely large stored values có thể overflow JS numbers không warning. Fix: validate `originalAmount` finite và < 1e15.
- 🔴 **L132** — Save enable với `canSave = originalAmount > 0 && note.trim() !== ''` nhưng amount input accept leading zeros/malformed decimals; `formatAmountInput` pad zeros, risk silent data entry errors. Fix: strip leading zeros và validate decimal places match currency decimals.
- 🟡 **L132** — Note không max length; accept thousands chars. Fix: cap 500 chars, disable save nếu vượt.
- 🟡 **L58-59** — Date picker allow future dates (không `maxDate`); user có thể vô tình record txns tháng sau. Fix: `maximumDate={new Date()}`.
- 🟡 **L72** — Category default 'food' cả cho income; income nên default 'other'. Minor inconsistency.

#### Component decomposition / hooks

- 🟡 **L47-75** — 6 state vars cho form draft (amountDigits, currency, category, note, selectedDate, customInput) + 4 refs; không single source of truth. Extract `useDraftTransaction` hook.
- 🟡 **L85-90** — Scroll-to-offset Android-specific duplicated cho `amountOffsetRef` và `noteOffsetRef` với handlers giống nhau. Extract `useScrollOnFocus(ref)` hook.
- 🟡 **L134-193** — Save handler 60 lines với nested try-catch, custom category auto-creation, budget alert logic, navigation interleaved. Fix: tách budget-check + navigation side effects; consider move budget-alert orchestration lên context-level.
- 🟡 **L289-302** — Custom category input row (chỉ show khi `category === 'other'`) → sub-component `<CustomCategoryInput />`.
- 🟡 **L343-369** — DateTimePicker mode logic repetitive (3 conditional branches gần giống nhau). Extract picker mode handling thành component/hook.

#### Async try-catch

- 🔴 **L162-192** — `update()` và `add()` calls (L163, L166) không try-catch; nếu DB insert/update fail (constraint, disk full), không alert, user không có feedback. Fix: wrap try-catch + `Alert.alert` on failure.
- 🔴 **L184** — `fireBudgetAlert()` error swallowed (console.warn only); user không biết notification fail. Fix: show error Alert chỉ nếu user opt-in alerts.
- 🟡 **L95-109** — `tryAddCustomCategory()` có try-catch nhưng swallow + fallback-query DB thay vì re-throw/alert. Fix: Alert nếu duplicate check cũng fail.

#### User-facing error UX

- 🔴 **L134-192** — Sau save (income/expense) không có success feedback; user tap save, navigate im ru không toast/alert confirmation.
- 🔴 **L162-192** — Không error alert nếu `update()` hoặc `add()` throw; app silently fail persist.
- 🟡 **L210** — Close (back) button không offer discard-changes prompt; user có thể mất unsaved edits.
- 🟡 **L374** — Save button disabled khi `!canSave` nhưng không có inline error text giải thích tại sao (VD: "Amount required" / "Note required").
- 🟡 **L337-354** — Date picker mode transitions (date → time → idle) không có error handling; silent nếu system picker fail.

#### Top 3 priorities cho file này

1. Wrap `add()` và `update()` với try-catch + Alert on DB failure — silent data loss là risk cao nhất.
2. Thêm max-length validation cho note field + display inline error — cap 500 chars.
3. Extract draft state thành `useDraftTransaction` hook — giảm 6 scattered state vars thành 1, centralize validation, dễ test.

---

## Notes

- Audit này KHÔNG chạm code; chỉ đọc và report. Không có test nào bị ảnh hưởng.
- Line numbers dựa trên snapshot tại commit `c1e277a` (main branch, 2026-08-05).
- Nếu implement theo Recommended Refactor Order, có thể chia thành plans/PRs riêng theo từng nhóm (1-2-3-4 gộp thành 1 PR "critical UX/data fixes"; 5-8 gộp "custom hooks refactor"; 6 riêng "settings decomposition").
