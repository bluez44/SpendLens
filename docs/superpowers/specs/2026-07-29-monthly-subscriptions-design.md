# Monthly subscriptions — design

## Context

SpendLens tracks one-off transactions well but has no first-class concept
of recurring expenses. Users pay the same amount every month for Claude
Pro ($20), YouTube Premium ($13.99), Netflix (260.000₫), and dozens of
similar services. Today they have to remember the billing day, open the
app, and re-enter the same transaction — losing the audit trail whenever
they forget.

This spec adds a **subscription** entity that acts as a **template**: it
stores the recurring transaction shape (amount, currency, category,
optional photo) and a monthly billing anchor day. When a subscription
falls due, the app automatically inserts a real transaction on the user's
next foreground. Notifications warn the user 7 / 3 / 1 days ahead if the
per-subscription flags are set.

Multi-currency (`2026-07-29-multi-currency-design.md`) is a hard
prerequisite — subscriptions store `originalAmount + originalCurrency`
and auto-created transactions run through the same FX conversion path as
manual entries.

## Model in one sentence

A subscription is a template that spawns real transactions on its billing
day. Editing the template affects only future spawns; canceling pauses
the template without touching history; individual transactions produced
by a subscription remain editable/deletable like any other row.

## Goals

- Users can add / edit / pause / resume / delete recurring monthly
  subscriptions from Settings.
- On every app foreground, the app inserts transactions for any
  subscriptions whose `next_due_date` has passed — one transaction per
  missed cycle, back-dated to the actual due date.
- Amounts are stored in the subscription's own currency and converted to
  the current primary at insert time (reusing multi-currency machinery).
- Per-subscription notification flags (7 / 3 / 1 days ahead) fire at
  09:00 local time.
- Transactions produced by a subscription carry a link back to their
  source (`subscription_uuid`), surfaced on the transaction detail
  screen.
- Editing a subscription's amount / category / anchor day never
  retroactively rewrites already-created transactions.

## Non-goals

- **Non-monthly cadences** (weekly, quarterly, annual). Everything ships
  monthly for v1.
- **Reliable background delivery when the app is fully closed.** Auto-
  create runs on foreground only. Notifications are pre-scheduled with
  the OS so they still fire while the app is closed, but the transaction
  itself appears on the next foreground.
- **Retroactive edits of history.** Amount / category / anchor changes
  affect only the next auto-create onward.
- **Subscription-side reporting / analytics.** No dashboard, no monthly
  total per subscription. That's a follow-up.
- **Trial period / prorated first month.** Users start subscriptions on
  the actual full-price billing anchor.
- **Reminder to confirm payment** (hybrid model). Auto-create is
  unconditional at foreground; no "Confirm paid" tap.

## Data model

New table `subscriptions`:

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,               -- CategoryId (static or custom_*)
  original_amount REAL NOT NULL,
  original_currency TEXT NOT NULL,      -- CurrencyCode
  anchor_day INTEGER NOT NULL,          -- 1..31
  next_due_date TEXT NOT NULL,          -- YYYY-MM-DD
  photo_path TEXT,                      -- optional; reused on every auto-create
  notify_7 INTEGER NOT NULL DEFAULT 0,  -- 0/1
  notify_3 INTEGER NOT NULL DEFAULT 0,
  notify_1 INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,    -- 0/1 — cancel = pause
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Existing `transactions` gains one nullable column:

```sql
ALTER TABLE transactions ADD COLUMN subscription_uuid TEXT;
```

`Txn` and `NewTxn` both gain `subscriptionUuid: string | null`. Manual
inserts leave it `null`; auto-create writes `sub.uuid`. `insertTransaction`
already threads `primary` + `rates` for FX; the new column travels
alongside.

Migration is additive and idempotent in the existing `runMigrations`
pipeline. Existing rows land with `subscription_uuid = NULL`.

## Anchor day → next_due_date

Helper in `subscription-scheduler.ts`:

```ts
export function nextDueFromAnchor(anchor: number, from: Date): Date;
```

Semantics:
- `anchor` ∈ [1, 31]. Non-integer / out-of-range: throw.
- Returns the earliest date ≥ `from` that "hits" `anchor` in its month.
  Clamp to the last day of the month when the month is shorter than
  `anchor` (Q4-A). E.g. `anchor=31, from=2026-02-05 → 2026-02-28`;
  `anchor=31, from=2026-04-05 → 2026-04-30`; `anchor=15,
  from=2026-08-15 → 2026-08-15` (same-day is a hit); `anchor=15,
  from=2026-08-16 → 2026-09-15`.
- Purely date-based: strips the time from both `from` and the returned
  date.

`insertSubscription` computes `next_due_date` from `anchor_day` and
`Date.now()`. If today already matches the anchor and no auto-create has
run yet, the next foreground catch-up will handle it.

## Auto-create flow (Q3-C — foreground, back-dated)

Module: `src/lib/subscription-scheduler.ts`.

```ts
export function catchUpSubscriptions(
  db: SQLiteDatabase,
  primary: CurrencyCode,
  rates: RateMap,
  now: Date = new Date(),
): number; // returns the number of transactions created
```

Algorithm:

1. `SELECT * FROM subscriptions WHERE paused = 0 AND next_due_date <= ?`
   with `?` = `toDateKey(now)`.
2. For each subscription found, LOOP:
   a. Insert a transaction via `insertTransaction`, passing:
      - `date = subscription.next_due_date`
      - `createdAt = new Date(next_due_date + 'T12:00:00').getTime()` —
        noon local time; picking noon avoids DST edge cases and the
        exact wall-clock is not semantically important for a
        subscription auto-log.
      - `originalAmount = subscription.original_amount`
      - `originalCurrency = subscription.original_currency`
      - `category = subscription.category`
      - `name = subscription.name`
      - `note = null`
      - `isIncome = false`
      - `photoPath = subscription.photo_path` (or `null`)
      - `subscriptionUuid = subscription.uuid`
      - `primary`, `rates` from arguments — FX conversion happens exactly
        as for manual entries.
   b. Recompute `next_due_date = nextDueFromAnchor(anchor,
      previous_next_due_date + 1 day)`. Loop back to (a) if the new date
      is still `≤ toDateKey(now)`.
   c. `UPDATE subscriptions SET next_due_date = ?, updated_at = ? WHERE
      id = ?`.
   d. After the loop, call `rescheduleNotifications(subscription)` so the
      pre-scheduled 7 / 3 / 1 fire dates reflect the new `next_due_date`.
3. Return the total transactions created.

This function runs on every AppState `active` transition **and** on cold
start. It is idempotent within a single day (a subscription whose
`next_due_date` is strictly future is skipped).

**Multi-cycle catch-up example.** User last opened the app on 2026-05-01.
Subscription anchor is 15, `next_due_date = 2026-05-15`. Today is
2026-08-05. The loop runs:

- `2026-05-15 ≤ 2026-08-05` → insert txn dated 2026-05-15, bump to
  `2026-06-15`.
- `2026-06-15 ≤ 2026-08-05` → insert txn dated 2026-06-15, bump to
  `2026-07-15`.
- `2026-07-15 ≤ 2026-08-05` → insert txn dated 2026-07-15, bump to
  `2026-08-15`.
- `2026-08-15 > 2026-08-05` → stop.

Three transactions land, one per cycle, each back-dated correctly.

## Notifications

Module: `src/lib/subscription-notifications.ts`. Reuses the Expo
`Notifications` API pattern already established in
`src/lib/notifications.ts`.

**Identifier convention.** `sub-${uuid}-${offset}` where `offset ∈
{7, 3, 1}`. This makes cancel-by-subscription trivial (`getAllScheduled →
filter startsWith sub-uuid → cancelAll`).

**Fire time.** 09:00 local on the day `next_due_date - offset` days.

**Body.** `t('sub.notif_body', { name, amount, days })` renders as
"Claude Pro sắp đến hạn trong 3 ngày — $20.00" (VN) or "Claude Pro is
due in 3 days — $20.00" (EN). `amount` uses `formatMoney(sub.original_amount,
sub.original_currency)`.

**Public functions:**

```ts
export function computeFireDates(sub: Subscription, now: Date): {
  offset: 7 | 3 | 1; fireAt: Date;
}[]; // filters out past dates

export function notificationId(uuid: string, offset: 7 | 3 | 1): string;

export async function rescheduleNotifications(
  sub: Subscription,
  now?: Date,
): Promise<void>;

export async function cancelNotifications(uuid: string): Promise<void>;
```

**Lifecycle triggers:**

| Event | Action |
|---|---|
| Create subscription | `rescheduleNotifications(sub)` |
| Edit subscription (any field) | `cancelNotifications(uuid)` + `rescheduleNotifications(sub)` |
| Pause subscription | `cancelNotifications(uuid)` |
| Resume subscription | `rescheduleNotifications(sub)` |
| Delete subscription | `cancelNotifications(uuid)` |
| Auto-create advances `next_due_date` | `rescheduleNotifications(sub)` |
| App cold start | Loop active subscriptions → `rescheduleNotifications(sub)` (self-heal after OS clears queue on reboot) |

**Permission.** Reuse `requestPermission` from `src/lib/notifications.ts`.
If permission is denied at subscription-creation time, the subscription
is still saved but the three `notify_*` flags are silently coerced to 0
and the sheet shows a one-line toast: "Bật quyền thông báo trong Cài đặt
để nhận nhắc nhở" / "Enable notifications in Settings to receive
reminders". The user can flip the flags back on later once permission is
granted.

**iOS pending-notification limit** (~64). With ≤ 20 subscriptions and 3
flags each we're at 60 pending — close to but under the limit. If the
user ever exceeds this, notifications are best-effort: later
`scheduleNotificationAsync` calls may silently drop. No dedicated
handling in v1.

**Singular vs plural notification body.** When `offset === 1`, the body
uses `sub.notif_body_one_day` (e.g. "Claude Pro sắp đến hạn ngày mai —
$20.00"); otherwise it uses `sub.notif_body` with the `days`
interpolation. Both keys are in the i18n table below.

## Deep link on tap

Notification `data: { route: '/subscriptions' }`. The existing
`_layout.tsx` notification-response listener routes it via
`router.push('/subscriptions')`. No new deep-link infrastructure.

## UI

All new UI matches the existing design system: bottom sheets modeled on
`budget-sheet.tsx` (BottomSheetModal + BottomSheetBackdrop + forwardRef
imperative handle), colors from `useColors()`, `Text` from
`@/components/sl/text`, `GradientFill` for primary buttons, `Segmented`
for boolean pickers, `CategoryChip` for category grids, `Radius` tokens
for corner rounding, no hex literals in new files.

### Settings entry

New row inserted **above** the TIỀN TỆ section in `src/app/settings.tsx`
under a new section header `ĐĂNG KÝ HÀNG THÁNG`:

```
━━ ĐĂNG KÝ HÀNG THÁNG ━━━━━━━━━━━━━━
Quản lý đăng ký       3 đang hoạt động  ›
```

Tap → `router.push('/subscriptions')`. Count reads from
`useSubscriptions().count({ activeOnly: true })`.

### List screen `src/app/subscriptions.tsx`

Full-screen navigation route. Header shows a back button, the localized
title, and a `+` icon that opens `AddSubscriptionSheet`. Body is a
`FlatList` (or ScrollView + map for v1 — subscription counts stay small)
of `SubscriptionRow`, sorted `paused ASC, next_due_date ASC`.

Empty state: single centered `Text` "Chưa có đăng ký nào. Bấm ＋ để tạo
mới." on `useColors().bg`.

### `SubscriptionRow` (`src/components/sl/subscription-row.tsx`)

Reuses `PhotoTile` on the left (falls back to a category-color circle
when `photo_path` is null), name + `Ngày X hàng tháng` in the middle,
`signedMoney(original_amount, original_currency, false)` + `≈ formatMoney(
convert(...), primary)` on the right. Paused subscriptions render with
`opacity: 0.5` and a small `⏸` badge next to the name.

Tap opens `EditSubscriptionSheet` for that row.

### `SubscriptionSheet` (`src/components/sl/subscription-sheet.tsx`)

Dual-purpose add/edit sheet, `mode: 'add' | 'edit'`. Full-height
(`snapPoints: ['90%']`).

Fields, top to bottom:
- Photo picker (optional) — `PhotoTile` tap opens image library via
  `expo-image-picker`. If the dependency is missing at implementation
  time, the plan adds it via `npx expo install` (matches how earlier
  tasks installed `expo-network` etc.). If the picker fails to launch
  (permission denied or user cancel), the photo stays null and the flow
  proceeds — no error alert.
- Name — `BottomSheetTextInput`.
- Amount — digit-only input, mirrors Entry screen exactly (uses
  `formatAmountInput` + `CurrencyPickerSheet` chip below the input +
  preview line when currency ≠ primary).
- Category — reuse `CategoryChip` grid pattern from Entry, including
  custom-category creation flow.
- Anchor day — a small "Ngày X" pressable that opens
  `AnchorDayPickerSheet`. Below the pressable, a computed preview: "Kỳ
  tới: DD/MM/YYYY" using `nextDueFromAnchor(anchor, today)`.
- Notify — three checkboxes labeled "7 ngày trước", "3 ngày trước", "1
  ngày trước". Each is a `Pressable` with a checkbox-style icon.
- Primary CTA `Lưu đăng ký` (add) / `Cập nhật` (edit) — `GradientFill`
  button.
- Edit-mode extras below primary CTA:
  - "⏸ Tạm dừng" / "▶ Kích hoạt lại" toggle (calls `pauseSubscription` /
    `resumeSubscription`).
  - "🗑 Xoá đăng ký" — red destructive button; taps show a confirm alert
    reusing existing `Alert.alert` pattern, then calls
    `deleteSubscription(uuid)` and dismisses the sheet.

Save handler validates: name non-empty, `originalAmount > 0`, `anchor_day
∈ [1, 31]`. On save-in-add-mode, if any notify flag is on but permission
is denied, coerce all flags to 0 and show the permission toast.

### `AnchorDayPickerSheet` (`src/components/sl/anchor-day-picker-sheet.tsx`)

Compact bottom sheet with a `BottomSheetScrollView` listing 31 pressable
rows (`Ngày 1`, `Ngày 2`, ..., `Ngày 31`). Current selection highlighted
via `AccentGradient[1]` border. Tap → callback + dismiss.

### Transaction detail addition

`src/app/transaction/[id].tsx` gains one `DetailRow` at the bottom of the
existing detail grid when `txn.subscriptionUuid !== null`:

```
Từ đăng ký:  <sub.name>            (if the subscription still exists)
Từ đăng ký:  Đã xoá                (if lookup returns nothing)
```

The lookup is a synchronous `SELECT name FROM subscriptions WHERE uuid =
?`. No caching needed — the detail screen renders once per navigation.

## Context — `SubscriptionsContext`

`src/lib/subscriptions-context.tsx`. Wraps the CRUD module and exposes:

```ts
interface SubscriptionsContextValue {
  subscriptions: Subscription[];
  ready: boolean;
  add: (input: NewSubscription) => Promise<number>;
  update: (id: number, input: NewSubscription) => Promise<void>;
  remove: (id: number) => Promise<void>;
  pause: (id: number) => Promise<void>;
  resume: (id: number) => Promise<void>;
  refresh: () => void;
  count: (opts?: { activeOnly?: boolean }) => number;
  findByUuid: (uuid: string) => Subscription | null;
}
```

Provider mounted in `_layout.tsx` **after** `SettingsProvider` (needs
`primaryCurrency` + `rates`) and **after** `TransactionsProvider` (calls
`refresh()` on the transactions context whenever auto-create fires).

On mount and on `AppState 'active'`, the provider runs
`catchUpSubscriptions(db, primary, rates, new Date())` inside an async
effect. If it returns > 0, it calls `transactionsContext.refresh()` and
`refresh()` for itself.

**Refresh coordination.** Auto-create needs to refresh two contexts
after it fires: `transactionsContext.refresh()` so the new transactions
appear in History, and its own `refresh()` so the subscription list
reflects the new `next_due_date`. `SubscriptionsProvider` reaches into
`TransactionsContext` directly via `useTransactions().refresh` — the
transactions provider is mounted higher in the tree so this call is
always safe. No new pubsub method needed. The reverse direction
(subscriptions responding to a transaction-context event) is not
required.

## Migration on existing installs

Applied automatically at app start via `runMigrations`. Ordering:

1. `CREATE TABLE IF NOT EXISTS subscriptions ...`
2. `if (!hasColumn(db, 'transactions', 'subscription_uuid')) db.execSync('ALTER
   TABLE transactions ADD COLUMN subscription_uuid TEXT');`

Both idempotent. No backfill needed — new column defaults to NULL, new
table starts empty.

## i18n

All new strings live under the `sub.*` namespace in
`src/lib/i18n/locales/en.json` and `.../vi.json`.

| Key | English | Vietnamese |
|---|---|---|
| `sub.section_title` | MONTHLY SUBSCRIPTIONS | ĐĂNG KÝ HÀNG THÁNG |
| `sub.section_row` | Manage subscriptions | Quản lý đăng ký |
| `sub.count_active` | {{n}} active | {{n}} đang hoạt động |
| `sub.list_title` | Subscriptions | Đăng ký hàng tháng |
| `sub.empty_state` | No subscriptions yet. Tap + to create one. | Chưa có đăng ký nào. Bấm ＋ để tạo mới. |
| `sub.add_title` | New subscription | Đăng ký mới |
| `sub.edit_title` | Edit subscription | Sửa đăng ký |
| `sub.field_name` | Name | Tên |
| `sub.field_amount` | Amount | Số tiền |
| `sub.field_category` | Category | Danh mục |
| `sub.field_anchor_day` | Billing day | Ngày tính tiền |
| `sub.next_due` | Next due: {{date}} | Kỳ tới: {{date}} |
| `sub.field_photo` | Photo (optional) | Ảnh (tuỳ chọn) |
| `sub.notify_label` | Remind me before | Nhắc trước |
| `sub.notify_7` | 7 days | 7 ngày |
| `sub.notify_3` | 3 days | 3 ngày |
| `sub.notify_1` | 1 day | 1 ngày |
| `sub.save_add` | Save subscription | Lưu đăng ký |
| `sub.save_edit` | Update | Cập nhật |
| `sub.pause` | ⏸ Pause | ⏸ Tạm dừng |
| `sub.resume` | ▶ Resume | ▶ Kích hoạt lại |
| `sub.delete` | 🗑 Delete subscription | 🗑 Xoá đăng ký |
| `sub.delete_confirm_title` | Delete this subscription? | Xoá đăng ký này? |
| `sub.delete_confirm_body` | Existing transactions will remain. | Các giao dịch cũ vẫn được giữ. |
| `sub.paused_badge` | Paused | Đã tạm dừng |
| `sub.day_row` | Day {{day}} of every month | Ngày {{day}} hàng tháng |
| `sub.anchor_picker_title` | Choose billing day | Chọn ngày tính tiền |
| `sub.anchor_day_row` | Day {{day}} | Ngày {{day}} |
| `sub.transaction_source` | From subscription | Từ đăng ký |
| `sub.transaction_source_deleted` | Deleted | Đã xoá |
| `sub.notif_body` | {{name}} is due in {{days}} days — {{amount}} | {{name}} sắp đến hạn trong {{days}} ngày — {{amount}} |
| `sub.notif_body_one_day` | {{name}} is due tomorrow — {{amount}} | {{name}} sắp đến hạn ngày mai — {{amount}} |
| `sub.perm_needed_body` | Enable notifications in Settings to receive reminders. | Bật quyền thông báo trong Cài đặt để nhận nhắc nhở. |
| `sub.validation_name` | Please enter a name. | Vui lòng nhập tên. |
| `sub.validation_amount` | Amount must be greater than 0. | Số tiền phải lớn hơn 0. |

## Error handling & edge cases

| Situation | Handling |
|---|---|
| User creates sub with anchor=31 in a 30-day month | `nextDueFromAnchor` clamps → subscription's `next_due_date` = last day of that month |
| Notification permission denied at create time | Save proceeds; `notify_*` flags coerced to 0; single toast surfaces |
| User was offline for months → dozens of missed cycles | Loop caps at 12 iterations per subscription per catch-up run (safety valve). If more than 12 cycles were missed, the loop stops and logs a `console.warn`; the remaining cycles roll forward on the next foreground. This shouldn't happen in practice (one year of inactivity) but prevents a runaway. |
| User deletes a subscription that has already created transactions | Sub row deleted; transactions retain their `subscription_uuid` (orphan link). Detail screen shows `t('sub.transaction_source_deleted')` |
| User taps a subscription notification while the app is cold-started | `_layout.tsx` notification response handler routes to `/subscriptions` after fonts + initial state load |
| Primary currency changes while auto-create is in flight | Not possible in practice — the settings-context batch runs inside its own transaction and the subscriptions catch-up runs inside `AppState 'active'` handler. Same-frame ordering is fine because both use synchronous SQLite. |
| User edits an auto-created transaction | Freely allowed (C1). Editing does not touch the source subscription; the next cycle still auto-creates with the subscription's current template values. |
| Malformed anchor_day in DB (0, 32, etc.) | Guard in `nextDueFromAnchor` throws; catch-up wraps the loop body in try/catch, logs a warning, skips that subscription for the run. |
| iOS pending-notification limit exceeded | Best-effort — later `scheduleNotificationAsync` calls may silently drop. Not addressed in v1; expected users have < 20 subscriptions. |

## Testing strategy

**Unit tests (Jest + jest-expo, in-memory SQLite via the existing mock):**

- `subscriptions.ts`
  - CRUD roundtrip
  - `listActive()` filters `paused=0` and orders by `next_due_date`
  - `count({ activeOnly: true })` correct
  - `pause` / `resume` toggle the flag without touching other fields
  - `updateSubscription` bumps `updated_at`

- `subscription-scheduler.ts::nextDueFromAnchor`
  - `anchor=15, from=2026-08-01` → `2026-08-15`
  - `anchor=15, from=2026-08-15` → `2026-08-15` (same-day is a hit)
  - `anchor=15, from=2026-08-16` → `2026-09-15`
  - `anchor=31, from=2026-02-05` → `2026-02-28`
  - `anchor=31, from=2028-02-05` → `2028-02-29` (leap year)
  - `anchor=31, from=2026-04-05` → `2026-04-30`
  - `anchor=1, from=2026-08-15` → `2026-09-01`
  - Invalid anchor throws (0, 32, 1.5)

- `subscription-scheduler.ts::catchUpSubscriptions`
  - `next_due_date` equals today → creates 1 txn, bumps to next month
  - `next_due_date` is 3 months in the past → creates 3 txns each
    back-dated correctly, ends with future next_due_date
  - Paused subscription is skipped
  - Multi-currency: sub USD, primary VND → txn has `currency='VND'`,
    `amount ≈ 25000 * 20`, `originalAmount = 20`, `originalCurrency='USD'`
  - Auto-created txn carries `subscription_uuid = sub.uuid`
  - `catchUpSubscriptions` returns the total transaction count

- `subscription-notifications.ts`
  - `computeFireDates` with all flags on and `next_due` 10 days out →
    three fireAt Date objects, all at 09:00
  - `computeFireDates` filters past dates (e.g. `next_due` = today, day-7
    was a week ago → only the 3-day and 1-day fireAts remain if those
    are still in the future)
  - `rescheduleNotifications` cancels all `sub-${uuid}-*` then schedules
    per-flag (Notifications mocked at test top)
  - `cancelNotifications(uuid)` cancels only that subscription's
    identifiers

- `transactions.ts` extension
  - `insertTransaction` with `subscriptionUuid` writes the column
  - `toTxn` maps `subscription_uuid` → `subscriptionUuid: string | null`
  - Existing tests continue to pass with `subscriptionUuid = null` by
    default

- Migration
  - `subscriptions` table exists after `runMigrations`
  - `subscription_uuid` column exists on `transactions`
  - Idempotent on second run

- UI components
  - `SubscriptionRow` renders name, day label, amount; paused variant
    grayed with badge
  - `SubscriptionSheet` add mode: form validation, save fires callback
    with correct DTO
  - `SubscriptionSheet` edit mode: preloads values, pause / resume /
    delete buttons visible
  - `AnchorDayPickerSheet` renders 31 rows, tap invokes callback with
    the chosen day and dismisses

**Manual QA checklist:**

1. Create Claude Pro (USD $20, anchor=15, notify 7 / 3 / 1 all on). Fast-
   forward system clock or set anchor to today+7 — verify 09:00
   notification fires with correct body.
2. On the due date, launch the app cold — verify a transaction appears
   with correct date, category, photo, and multi-currency conversion.
3. Skip the app for 2 months — launch cold — verify 2 back-dated
   transactions.
4. Pause Netflix — notifications disappear from OS queue; no auto-create
   next foreground.
5. Resume Netflix — notifications reschedule; if due date already
   passed, next foreground auto-creates.
6. Edit Claude Pro amount $20 → $25 — verify next auto-create uses $25;
   historical transactions unchanged.
7. Set anchor=31 for a test subscription in February → auto-create lands
   on 28th (or 29th in a leap year).
8. Delete a subscription with 3 historical transactions → subscription
   row gone from list; open one of the transactions in detail → shows
   "Từ đăng ký: Đã xoá".
9. Switch primary VND → USD while an active USD subscription exists →
   subscription card still shows `$20`; existing transactions recompute
   per multi-currency flow; next auto-create still writes USD-original.
10. Toggle dark ↔ light and VN ↔ EN — every subscription screen renders
    correctly.
11. Deny notification permission when creating the first subscription →
    subscription saves; notify flags forced to 0; toast surfaces.
12. Tap a subscription notification — app opens on `/subscriptions`
    list.
