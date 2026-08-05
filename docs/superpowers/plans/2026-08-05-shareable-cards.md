# Shareable Spend Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Home-header share entry point + preview screen that renders two 1080×1920 branded card types (weekly recap, log-days streak) and shares them via the OS share sheet, driving organic virality among Gen Z users.

**Architecture:** Pure-function data assembly (`share-cards.ts`, `streaks.ts`) → presentation-only React components (`RecapCard`, `StreakCard`) → thin orchestration route (`share.tsx`) using `react-native-view-shot` for capture and `react-native-share` for OS share sheet. Weekly Sunday 8pm push notification schedules via existing `expo-notifications` pattern; deep-link handler in root layout routes tap to `/share?type=recap`.

**Tech Stack:** Expo SDK v57 (React Native), TypeScript, `@gorhom/bottom-sheet`, `react-native-view-shot` (installed), `react-native-share` (installed), `expo-notifications` (installed), `expo-media-library` (**to install**), `expo-router`, `jest` + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-05-shareable-cards-design.md`

## Global Constraints

- Expo SDK **v57.0.0** — verify all Expo API shapes at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code (per AGENTS.md).
- Card PNG output **must be exactly 1080×1920** (Instagram Story format).
- No new DB migration — new settings key uses existing key-value `settings` table via `encode`/`decode` functions in `src/lib/settings.ts`.
- Follow existing patterns:
  - Notification IDs as `const` strings (see `REMINDER_ID` in `src/lib/notifications.ts`).
  - Notification tap payload uses `content.data.route` key (see `_layout.tsx:97,103`), NOT `deepLink`.
  - i18n keys nested by feature namespace (see `src/lib/i18n/locales/en.json`).
  - Test files colocated with source (`.test.ts` / `.test.tsx` next to `.ts` / `.tsx`).
  - Vietnamese-first i18n; every user-visible string has both `en.json` and `vi.json` entries.
- **Never silent-fail** user-initiated actions (capture, save, share) — surface via `Alert.alert` with i18n keys (per audit priority #4 fix pattern).
- This plan implements **feature #1 of 4**. Features #2 (envelope budgets), #3 (AI money coach), #4 (e-wallet import) are separate specs — do not scope-creep.
- Every task ends with a commit. Prefer small commits: one deliverable per commit unless subtasks are trivial glue.

## File Map

```
CREATE:
  src/lib/streaks.ts
  src/lib/streaks.test.ts
  src/lib/share-cards.ts
  src/lib/share-cards.test.ts
  src/lib/use-share-card.ts
  src/components/share/recap-card.tsx
  src/components/share/recap-card.test.tsx
  src/components/share/streak-card.tsx
  src/components/share/streak-card.test.tsx
  src/components/share/card-picker-sheet.tsx
  src/components/share/card-picker-sheet.test.tsx
  src/app/share.tsx
  src/app/share.test.tsx

MODIFY:
  src/lib/settings.ts                    (add `shareHideAmounts` key)
  src/lib/notifications.ts               (add WEEKLY_RECAP_ID + schedule/cancel fns)
  src/lib/notifications.test.ts          (extend with tests for new fns)
  src/app/_layout.tsx                    (add weekly schedule effect + extend deep-link listener)
  src/app/index.tsx                      (add Share icon in Home header)
  src/lib/i18n/locales/en.json           (add share.*, narrative.*, hype.* keys)
  src/lib/i18n/locales/vi.json           (same)
  package.json + native config           (add expo-media-library via `npx expo install`)
```

---

## Task 1: i18n keys + `shareHideAmounts` setting

**Files:**
- Modify: `src/lib/i18n/locales/en.json` (add 3 new top-level keys)
- Modify: `src/lib/i18n/locales/vi.json` (same)
- Modify: `src/lib/settings.ts:7-31,35-62,64-100+` (extend `Settings`, `DEFAULTS`, `encode`, `decode`)
- Test: `src/lib/settings.test.ts` (extend existing test)

**Interfaces:**
- Consumes: nothing (foundation task)
- Produces:
  - i18n key namespaces `share.*`, `narrative.*`, `hype.*` (used by all card + preview components)
  - `Settings.shareHideAmounts: boolean` (default `false`)

- [ ] **Step 1: Add i18n keys to `en.json`**

Open `src/lib/i18n/locales/en.json`. Add three new top-level objects (place after `notif` block for consistency):

```json
"share": {
  "preview_title": "Preview & share",
  "picker_title": "Share as…",
  "picker_recap": "📊 Weekly recap",
  "picker_streak": "🔥 Streak",
  "hide_amounts": "Hide amounts",
  "save_to_gallery": "Save to gallery",
  "share_button": "Share",
  "saved_toast": "Saved",
  "no_data_title": "Nothing to share yet",
  "no_data_body": "Log some transactions first, then come back!",
  "capture_failed_title": "Couldn't create card",
  "capture_failed_body": "Something went wrong rendering the card. Please try again.",
  "share_failed_title": "Sharing failed",
  "share_failed_body": "Couldn't open the share sheet. Please try again.",
  "save_failed_title": "Save failed",
  "save_failed_body": "Couldn't save the card to your gallery. Please try again.",
  "gallery_perm_title": "Photo library permission needed",
  "gallery_perm_body": "Enable photo library access in Settings to save cards.",
  "weekly_notif_title": "Your weekly recap is ready",
  "weekly_notif_body": "See your week and share it in one tap.",
  "recap_header": "WEEKLY RECAP",
  "recap_days_range": "{{from}} – {{to}}",
  "recap_vs_last_week": "vs last week",
  "recap_pct_of_budget": "{{pct}}% of budget",
  "streak_days_label": "days logged\nin a row",
  "streak_micro_stat": "{{n}} txns this week",
  "watermark": "spendlens"
},
"narrative": {
  "blew_budget": "Blew past budget 💸",
  "splurged": "Splurged this week 👀",
  "locked_in": "Locked in 🔒",
  "under_budget_hero": "Under budget hero 🎯",
  "single_cat_focus": "This week was all {{cat}} 💯",
  "new_obsession": "New obsession: {{cat}}",
  "another_log": "Another week logged 📊"
},
"hype": {
  "unstoppable": "Unstoppable 🚀",
  "on_a_roll": "On a roll 🎯",
  "locked_in_streak": "Locked in 💯",
  "warming_up": "Warming up 🔥",
  "just_started": "Just started ✨"
}
```

- [ ] **Step 2: Add matching Vietnamese keys to `vi.json`**

```json
"share": {
  "preview_title": "Xem trước & chia sẻ",
  "picker_title": "Chia sẻ dạng…",
  "picker_recap": "📊 Recap tuần",
  "picker_streak": "🔥 Streak",
  "hide_amounts": "Ẩn số tiền",
  "save_to_gallery": "Lưu vào thư viện",
  "share_button": "Chia sẻ",
  "saved_toast": "Đã lưu",
  "no_data_title": "Chưa có gì để chia sẻ",
  "no_data_body": "Log vài giao dịch trước đã nhé!",
  "capture_failed_title": "Không tạo được card",
  "capture_failed_body": "Có lỗi khi render card. Thử lại nhé.",
  "share_failed_title": "Chia sẻ thất bại",
  "share_failed_body": "Không mở được share sheet. Thử lại nhé.",
  "save_failed_title": "Lưu thất bại",
  "save_failed_body": "Không lưu được card vào thư viện. Thử lại nhé.",
  "gallery_perm_title": "Cần quyền truy cập thư viện ảnh",
  "gallery_perm_body": "Bật quyền truy cập ảnh trong Settings để lưu card.",
  "weekly_notif_title": "Recap tuần của bạn đã sẵn sàng",
  "weekly_notif_body": "Xem tuần vừa qua và chia sẻ chỉ với 1 tap.",
  "recap_header": "RECAP TUẦN",
  "recap_days_range": "{{from}} – {{to}}",
  "recap_vs_last_week": "so với tuần trước",
  "recap_pct_of_budget": "{{pct}}% budget",
  "streak_days_label": "ngày liên tiếp\ncó log",
  "streak_micro_stat": "{{n}} txns tuần này",
  "watermark": "spendlens"
},
"narrative": {
  "blew_budget": "Vượt budget rồi 💸",
  "splurged": "Xả láng tuần này 👀",
  "locked_in": "Locked in 🔒",
  "under_budget_hero": "Under budget hero 🎯",
  "single_cat_focus": "Tuần này chỉ có {{cat}} 💯",
  "new_obsession": "Ám ảnh mới: {{cat}}",
  "another_log": "Thêm một tuần đã log 📊"
},
"hype": {
  "unstoppable": "Bất khả chiến bại 🚀",
  "on_a_roll": "On a roll 🎯",
  "locked_in_streak": "Locked in 💯",
  "warming_up": "Warming up 🔥",
  "just_started": "Just started ✨"
}
```

- [ ] **Step 3: Extend `Settings` interface, `DEFAULTS`, `encode`, `decode`**

Modify `src/lib/settings.ts`:

Add to `interface Settings` (after `primaryCurrency`):
```ts
  shareHideAmounts: boolean;
```

Add to `DEFAULTS`:
```ts
  shareHideAmounts: false,
```

Add to `encode` switch (before `default:`):
```ts
    case 'shareHideAmounts':
      return (value as boolean) ? '1' : '0';
```

Add to `decode` (near the other boolean decodes, e.g. after `appLockBiometricEnabled`):
```ts
  const shareHideAmounts = map.get('shareHideAmounts');
  if (shareHideAmounts !== undefined) result.shareHideAmounts = shareHideAmounts === '1';
```

- [ ] **Step 4: Extend `settings.test.ts` to cover the new key**

Find the existing test file `src/lib/settings.test.ts`. Locate the `'round-trips every key type'` test. Add these lines inside that test (after existing `updateSetting` calls):

```ts
    updateSetting('shareHideAmounts', true, db);
```

Add a matching assertion near the other assertions:
```ts
    expect(loadSettings(db).shareHideAmounts).toBe(true);
```

- [ ] **Step 5: Run tests**

```bash
cd D:/SpendLens
npx jest src/lib/settings.test.ts
```

Expected: PASS (all tests including the extended round-trip).

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/vi.json src/lib/settings.ts src/lib/settings.test.ts
git commit -m "feat(share): add i18n keys and shareHideAmounts setting

Foundation for shareable spend cards feature — adds share/narrative/hype
i18n namespaces (VN + EN) and the shareHideAmounts boolean setting."
```

---

## Task 2: `computeLogDaysStreak` pure function

**Files:**
- Create: `src/lib/streaks.ts`
- Test: `src/lib/streaks.test.ts`

**Interfaces:**
- Consumes: `Txn` type from `src/lib/transactions.ts`, `toDateKey` from `src/lib/format.ts`
- Produces: `export function computeLogDaysStreak(txns: Txn[], today?: Date): number`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/streaks.test.ts`:

```ts
import type { Txn } from './transactions';
import { computeLogDaysStreak } from './streaks';

function mkTxn(date: string, id: number): Txn {
  return {
    id, uuid: `u${id}`, updatedAt: 0,
    date, time: '10:00', createdAt: 0,
    category: 'food', name: 't', note: null,
    amount: 100, currency: 'VND',
    originalAmount: 100, originalCurrency: 'VND',
    isIncome: false, photoPath: null, subscriptionUuid: null,
  };
}

const TODAY = new Date('2026-08-05T12:00:00Z');

function dateShift(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('computeLogDaysStreak', () => {
  it('returns 0 for empty txns', () => {
    expect(computeLogDaysStreak([], TODAY)).toBe(0);
  });

  it('returns 1 when only today has a txn', () => {
    const txns = [mkTxn(dateShift(TODAY, 0), 1)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(1);
  });

  it('returns 2 when today and yesterday both have txns', () => {
    const txns = [mkTxn(dateShift(TODAY, 0), 1), mkTxn(dateShift(TODAY, -1), 2)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(2);
  });

  it('grace: returns 1 when only yesterday has a txn (today not logged yet)', () => {
    const txns = [mkTxn(dateShift(TODAY, -1), 1)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(1);
  });

  it('returns 1 when today has txn but 2 days ago has txn (gap breaks streak)', () => {
    const txns = [mkTxn(dateShift(TODAY, 0), 1), mkTxn(dateShift(TODAY, -2), 2)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(1);
  });

  it('returns 0 when today missing and day-before-yesterday only (2-day gap)', () => {
    const txns = [mkTxn(dateShift(TODAY, -2), 1)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(0);
  });

  it('counts 30-day continuous streak', () => {
    const txns = Array.from({ length: 30 }, (_, i) => mkTxn(dateShift(TODAY, -i), i));
    expect(computeLogDaysStreak(txns, TODAY)).toBe(30);
  });

  it('dedupes multiple txns on same day', () => {
    const txns = [
      mkTxn(dateShift(TODAY, 0), 1),
      mkTxn(dateShift(TODAY, 0), 2),
      mkTxn(dateShift(TODAY, 0), 3),
    ];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx jest src/lib/streaks.test.ts
```

Expected: FAIL — `Cannot find module './streaks'`.

- [ ] **Step 3: Implement `streaks.ts`**

Create `src/lib/streaks.ts`:

```ts
import type { Txn } from './transactions';
import { toDateKey } from './format';

/**
 * Counts consecutive days ending at `today` (or `today - 1` as grace) that have
 * at least one transaction. Multiple txns on the same day count once.
 * Returns 0 if neither today nor yesterday have any txn.
 */
export function computeLogDaysStreak(txns: Txn[], today: Date = new Date()): number {
  if (txns.length === 0) return 0;

  const dateSet = new Set<string>();
  for (const t of txns) dateSet.add(t.date);

  const todayKey = toDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);

  let cursor: Date;
  if (dateSet.has(todayKey)) {
    cursor = new Date(today);
  } else if (dateSet.has(yesterdayKey)) {
    cursor = new Date(yesterday);
  } else {
    return 0;
  }

  let streak = 0;
  while (dateSet.has(toDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest src/lib/streaks.test.ts
```

Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/lib/streaks.ts src/lib/streaks.test.ts
git commit -m "feat(share): add computeLogDaysStreak pure function

Counts consecutive-day log streak ending at today (or yesterday as
grace period). Dedupes multiple txns per day. Foundation for streak card."
```

---

## Task 3: `share-cards.ts` — types + `pickNarrative` + `pickHype`

**Files:**
- Create: `src/lib/share-cards.ts` (types + 2 picker functions; assembly comes in Task 4)
- Test: `src/lib/share-cards.test.ts`

**Interfaces:**
- Consumes: `CategoryLike` from `src/lib/comparison.ts`, `CurrencyCode` from `src/lib/currency.ts`
- Produces:
  - Types: `CardType`, `NarrativeKey`, `HypeKey`, `RecapData`, `StreakData`, `ShareData`
  - Functions: `pickNarrative(recap, previousWeekTopCatId)`, `pickHype(logDays)`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/share-cards.test.ts`:

```ts
import { pickNarrative, pickHype, type RecapData } from './share-cards';

function baseRecap(overrides: Partial<RecapData> = {}): RecapData {
  return {
    weekStart: '2026-08-04',
    weekEnd: '2026-08-10',
    totalExpense: 500,
    totalIncome: 0,
    topCategories: [
      { id: 'food', label: 'Food', color: '#f00', value: 200, pctOfWeek: 40 },
      { id: 'fun', label: 'Fun', color: '#0f0', value: 200, pctOfWeek: 40 },
      { id: 'bills', label: 'Bills', color: '#00f', value: 100, pctOfWeek: 20 },
    ],
    deltaExpensePct: 0,
    narrative: 'another_log',
    budgetPctUsed: 50,
    primary: 'VND',
    ...overrides,
  };
}

describe('pickNarrative', () => {
  it('priority 1: blew_budget when budgetPctUsed > 100', () => {
    const r = baseRecap({ budgetPctUsed: 150, deltaExpensePct: 200 });
    expect(pickNarrative(r, null)).toBe('blew_budget');
  });

  it('priority 2: splurged when deltaExpensePct > 30 and under budget', () => {
    const r = baseRecap({ budgetPctUsed: 40, deltaExpensePct: 45 });
    expect(pickNarrative(r, null)).toBe('splurged');
  });

  it('priority 3: locked_in when deltaExpensePct < -20 and not budget-blowing', () => {
    const r = baseRecap({ budgetPctUsed: 30, deltaExpensePct: -25 });
    expect(pickNarrative(r, null)).toBe('locked_in');
  });

  it('priority 4: under_budget_hero when budgetPctUsed < 70 and no delta drama', () => {
    const r = baseRecap({ budgetPctUsed: 50, deltaExpensePct: 5 });
    expect(pickNarrative(r, null)).toBe('under_budget_hero');
  });

  it('priority 5: single_cat_focus when top category > 50%', () => {
    const r = baseRecap({
      budgetPctUsed: null,
      deltaExpensePct: 0,
      topCategories: [
        { id: 'food', label: 'Food', color: '#f00', value: 600, pctOfWeek: 60 },
        { id: 'fun', label: 'Fun', color: '#0f0', value: 400, pctOfWeek: 40 },
      ],
    });
    expect(pickNarrative(r, null)).toBe('single_cat_focus');
  });

  it('priority 6: new_obsession when top category shifted vs previous week', () => {
    const r = baseRecap({ budgetPctUsed: null, deltaExpensePct: 0 });
    expect(pickNarrative(r, 'transport')).toBe('new_obsession');
  });

  it('priority 6: no new_obsession when top matches previous', () => {
    const r = baseRecap({ budgetPctUsed: null, deltaExpensePct: 0 });
    expect(pickNarrative(r, 'food')).toBe('another_log');
  });

  it('fallback: another_log when nothing else fires', () => {
    const r = baseRecap({ budgetPctUsed: null, deltaExpensePct: 0 });
    expect(pickNarrative(r, null)).toBe('another_log');
  });

  it('gracefully handles empty topCategories', () => {
    const r = baseRecap({
      budgetPctUsed: null,
      deltaExpensePct: 0,
      topCategories: [],
    });
    expect(pickNarrative(r, null)).toBe('another_log');
  });
});

describe('pickHype', () => {
  it('returns just_started for 0', () => {
    expect(pickHype(0)).toBe('just_started');
  });

  it('returns just_started for 1-2', () => {
    expect(pickHype(1)).toBe('just_started');
    expect(pickHype(2)).toBe('just_started');
  });

  it('returns warming_up for 3-6', () => {
    expect(pickHype(3)).toBe('warming_up');
    expect(pickHype(6)).toBe('warming_up');
  });

  it('returns locked_in_streak for 7-13', () => {
    expect(pickHype(7)).toBe('locked_in_streak');
    expect(pickHype(13)).toBe('locked_in_streak');
  });

  it('returns on_a_roll for 14-29', () => {
    expect(pickHype(14)).toBe('on_a_roll');
    expect(pickHype(29)).toBe('on_a_roll');
  });

  it('returns unstoppable for >= 30', () => {
    expect(pickHype(30)).toBe('unstoppable');
    expect(pickHype(100)).toBe('unstoppable');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/lib/share-cards.test.ts
```

Expected: FAIL — `Cannot find module './share-cards'`.

- [ ] **Step 3: Create `share-cards.ts` with types + pickers**

Create `src/lib/share-cards.ts`:

```ts
import type { CurrencyCode } from './currency';

export type CardType = 'recap' | 'streak';

export type NarrativeKey =
  | 'blew_budget'
  | 'splurged'
  | 'locked_in'
  | 'under_budget_hero'
  | 'single_cat_focus'
  | 'new_obsession'
  | 'another_log';

export type HypeKey =
  | 'unstoppable'
  | 'on_a_roll'
  | 'locked_in_streak'
  | 'warming_up'
  | 'just_started';

export interface RecapTopCategory {
  id: string;
  label: string;
  color: string;
  value: number;      // in primary currency
  pctOfWeek: number;  // 0..100
}

export interface RecapData {
  weekStart: string;
  weekEnd: string;
  totalExpense: number;
  totalIncome: number;
  topCategories: RecapTopCategory[];  // sorted desc, length <= 3
  deltaExpensePct: number | null;
  narrative: NarrativeKey;
  budgetPctUsed: number | null;
  primary: CurrencyCode;
}

export interface StreakData {
  logDays: number;
  txnCountThisWeek: number;
  hype: HypeKey;
}

export type ShareData =
  | { type: 'recap'; data: RecapData }
  | { type: 'streak'; data: StreakData };

export function pickNarrative(
  recap: RecapData,
  previousWeekTopCatId: string | null,
): NarrativeKey {
  const { budgetPctUsed, deltaExpensePct, topCategories } = recap;

  if (budgetPctUsed !== null && budgetPctUsed > 100) return 'blew_budget';
  if (deltaExpensePct !== null && deltaExpensePct > 30) return 'splurged';
  if (deltaExpensePct !== null && deltaExpensePct < -20) return 'locked_in';
  if (budgetPctUsed !== null && budgetPctUsed < 70) return 'under_budget_hero';

  const top = topCategories[0];
  if (top && top.pctOfWeek > 50) return 'single_cat_focus';
  if (top && previousWeekTopCatId !== null && previousWeekTopCatId !== top.id) return 'new_obsession';

  return 'another_log';
}

export function pickHype(logDays: number): HypeKey {
  if (logDays >= 30) return 'unstoppable';
  if (logDays >= 14) return 'on_a_roll';
  if (logDays >= 7) return 'locked_in_streak';
  if (logDays >= 3) return 'warming_up';
  return 'just_started';
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest src/lib/share-cards.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/share-cards.ts src/lib/share-cards.test.ts
git commit -m "feat(share): add share-card types + pickNarrative/pickHype

Priority-ordered narrative rule engine for recap cards (7 rules) and
threshold-based hype line for streak cards (5 tiers)."
```

---

## Task 4: `assembleRecapData` + `assembleStreakData`

**Files:**
- Modify: `src/lib/share-cards.ts` (add 2 assembly functions)
- Modify: `src/lib/share-cards.test.ts` (add assembly tests)

**Interfaces:**
- Consumes:
  - `Txn` from `src/lib/transactions.ts`
  - `CategoryLike` from `src/lib/comparison.ts`
  - `filterByWeek`, `weekStartOf`, `buildComparison` from `src/lib/comparison.ts`
  - `shiftDateKey` from `src/lib/format.ts`
  - `computeLogDaysStreak` from Task 2
  - `pickNarrative`, `pickHype` from Task 3
- Produces:
  - `export function assembleRecapData(txns, categoryRegistry, monthlyBudget, primary, today?): RecapData`
  - `export function assembleStreakData(txns, today?): StreakData`

- [ ] **Step 1: Add failing tests to `share-cards.test.ts`**

Append to `src/lib/share-cards.test.ts`:

```ts
import type { Txn } from './transactions';
import { assembleRecapData, assembleStreakData } from './share-cards';

const REG = [
  { id: 'food', label: 'Food', color: '#f00' },
  { id: 'fun', label: 'Fun', color: '#0f0' },
  { id: 'bills', label: 'Bills', color: '#00f' },
  { id: 'transport', label: 'Transport', color: '#ff0' },
];

function mkTxn(date: string, amount: number, category: string, id: number): Txn {
  return {
    id, uuid: `u${id}`, updatedAt: 0,
    date, time: '10:00', createdAt: 0,
    category: category as any, name: 't', note: null,
    amount, currency: 'VND',
    originalAmount: amount, originalCurrency: 'VND',
    isIncome: false, photoPath: null, subscriptionUuid: null,
  };
}

// Monday of a well-known week
const MONDAY = new Date('2026-08-03T12:00:00Z');
const WEDNESDAY = new Date('2026-08-05T12:00:00Z');

describe('assembleRecapData', () => {
  it('returns zeroed data for empty txns with narrative=another_log', () => {
    const r = assembleRecapData([], REG, 0, 'VND', WEDNESDAY);
    expect(r.totalExpense).toBe(0);
    expect(r.totalIncome).toBe(0);
    expect(r.topCategories).toEqual([]);
    expect(r.budgetPctUsed).toBeNull();
    expect(r.narrative).toBe('another_log');
  });

  it('sums this-week expense and picks top 3 categories', () => {
    const txns = [
      mkTxn('2026-08-04', 300, 'food', 1),
      mkTxn('2026-08-05', 200, 'fun', 2),
      mkTxn('2026-08-06', 100, 'bills', 3),
      mkTxn('2026-08-07', 50, 'transport', 4),
    ];
    const r = assembleRecapData(txns, REG, 0, 'VND', WEDNESDAY);
    expect(r.totalExpense).toBe(650);
    expect(r.topCategories).toHaveLength(3);
    expect(r.topCategories[0].id).toBe('food');
    expect(r.topCategories[0].value).toBe(300);
    expect(r.topCategories[0].pctOfWeek).toBeCloseTo(46.15, 1);
  });

  it('computes budgetPctUsed proportional to week when budget > 0', () => {
    // monthlyBudget = 3000, week share = 3000 * 7/30 = 700, spend = 350 → 50%
    const txns = [mkTxn('2026-08-04', 350, 'food', 1)];
    const r = assembleRecapData(txns, REG, 3000, 'VND', WEDNESDAY);
    expect(r.budgetPctUsed).toBeCloseTo(50, 0);
  });

  it('leaves budgetPctUsed null when monthlyBudget === 0', () => {
    const txns = [mkTxn('2026-08-04', 100, 'food', 1)];
    const r = assembleRecapData(txns, REG, 0, 'VND', WEDNESDAY);
    expect(r.budgetPctUsed).toBeNull();
  });

  it('picks new_obsession narrative when this-week top differs from prev-week top', () => {
    const txns = [
      // prev week: food dominant
      mkTxn('2026-07-28', 500, 'food', 1),
      // this week: fun dominant, deltas modest
      mkTxn('2026-08-04', 550, 'fun', 2),
    ];
    const r = assembleRecapData(txns, REG, 0, 'VND', WEDNESDAY);
    expect(r.topCategories[0].id).toBe('fun');
    expect(r.narrative).toBe('new_obsession');
  });
});

describe('assembleStreakData', () => {
  it('composes logDays + txnCountThisWeek + hype', () => {
    const txns = [
      mkTxn('2026-08-05', 100, 'food', 1),
      mkTxn('2026-08-04', 100, 'food', 2),
      mkTxn('2026-08-03', 100, 'food', 3),
    ];
    const s = assembleStreakData(txns, WEDNESDAY);
    expect(s.logDays).toBe(3);
    expect(s.txnCountThisWeek).toBe(3);
    expect(s.hype).toBe('warming_up');
  });

  it('returns zeroed streak with just_started hype when txns empty', () => {
    const s = assembleStreakData([], WEDNESDAY);
    expect(s.logDays).toBe(0);
    expect(s.txnCountThisWeek).toBe(0);
    expect(s.hype).toBe('just_started');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/lib/share-cards.test.ts
```

Expected: FAIL — assembly functions not exported.

- [ ] **Step 3: Add imports and assembly functions to `share-cards.ts`**

At the top of `src/lib/share-cards.ts`, add imports:

```ts
import { availableMonthsDesc, buildComparison, filterByWeek, weekStartOf, type CategoryLike } from './comparison';
import { shiftDateKey } from './format';
import { computeLogDaysStreak } from './streaks';
import type { Txn } from './transactions';
```

(Note: `CategoryLike` is already exported from `comparison.ts` — verify with grep.)

At the bottom of the file, add:

```ts
function computePreviousWeekTopCategoryId(prevWeekTxns: Txn[]): string | null {
  if (prevWeekTxns.length === 0) return null;
  const totals = new Map<string, number>();
  for (const t of prevWeekTxns) {
    if (t.isIncome) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  let topId: string | null = null;
  let topValue = 0;
  for (const [id, value] of totals) {
    if (value > topValue) { topId = id; topValue = value; }
  }
  return topId;
}

export function assembleRecapData(
  txns: Txn[],
  categoryRegistry: CategoryLike[],
  monthlyBudget: number,
  primary: import('./currency').CurrencyCode,
  today: Date = new Date(),
): RecapData {
  const todayKey = today.toISOString().slice(0, 10);
  const weekStart = weekStartOf(todayKey);
  const weekEnd = shiftDateKey(weekStart, 6);
  const prevWeekStart = shiftDateKey(weekStart, -7);

  const thisWeekTxns = filterByWeek(txns, weekStart);
  const prevWeekTxns = filterByWeek(txns, prevWeekStart);

  const comparison = buildComparison(
    thisWeekTxns, prevWeekTxns, 'week',
    categoryRegistry, weekStart, prevWeekStart,
  );

  const totalExpense = comparison.sumA.expense;
  const totalIncome = comparison.sumA.income;

  const topCategories: RecapTopCategory[] = comparison.categories
    .filter((c) => c.valueA > 0)
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      label: c.label,
      color: c.color,
      value: c.valueA,
      pctOfWeek: totalExpense > 0 ? (c.valueA / totalExpense) * 100 : 0,
    }));

  const budgetPctUsed = monthlyBudget > 0
    ? (totalExpense / (monthlyBudget * 7 / 30)) * 100
    : null;

  const previousTopCatId = computePreviousWeekTopCategoryId(prevWeekTxns);

  const draft: RecapData = {
    weekStart, weekEnd,
    totalExpense, totalIncome,
    topCategories,
    deltaExpensePct: comparison.deltaExpensePct,
    narrative: 'another_log', // temp; picked below
    budgetPctUsed,
    primary,
  };
  draft.narrative = pickNarrative(draft, previousTopCatId);
  return draft;
}

export function assembleStreakData(
  txns: Txn[],
  today: Date = new Date(),
): StreakData {
  const logDays = computeLogDaysStreak(txns, today);
  const todayKey = today.toISOString().slice(0, 10);
  const weekStart = weekStartOf(todayKey);
  const txnCountThisWeek = filterByWeek(txns, weekStart).length;
  return {
    logDays,
    txnCountThisWeek,
    hype: pickHype(logDays),
  };
}
```

**Watch out**: the `availableMonthsDesc` import above is unused for assembly — remove it if the linter flags it. Only import what you actually use.

- [ ] **Step 4: Verify `CategoryLike` is exported from `comparison.ts`**

```bash
grep -n "export interface CategoryLike\|export type CategoryLike" src/lib/comparison.ts
```

Expected: one hit. If it says `interface CategoryLike` (no `export`), add `export` prefix to that line in `comparison.ts` and commit that as a trivial extra edit.

- [ ] **Step 5: Run tests to verify pass**

```bash
npx jest src/lib/share-cards.test.ts
```

Expected: PASS (previous 15 + 6 new = 21).

- [ ] **Step 6: Commit**

```bash
git add src/lib/share-cards.ts src/lib/share-cards.test.ts
git commit -m "feat(share): add assembleRecapData + assembleStreakData

Composes RecapData/StreakData from existing txns + comparison lib.
Computes previous-week top category correctly (not via A-sorted
categories array). Handles empty txns and zero-budget cases."
```

---

## Task 5: Weekly recap notification schedule + cancel

**Files:**
- Modify: `src/lib/notifications.ts` (add `WEEKLY_RECAP_ID`, `scheduleWeeklyRecapReminder`, `cancelWeeklyRecapReminder`)
- Modify: `src/lib/notifications.test.ts` (add tests)

**Interfaces:**
- Consumes: existing `expo-notifications` mocks in `notifications.test.ts`; `i18n` from `src/lib/i18n`
- Produces:
  - `export const WEEKLY_RECAP_ID: string`
  - `export async function scheduleWeeklyRecapReminder(hh?: number, mm?: number): Promise<void>` (defaults: hh=20, mm=0 → Sunday 8pm local)
  - `export async function cancelWeeklyRecapReminder(): Promise<void>`

- [ ] **Step 1: Verify Expo v57 weekly trigger shape**

Before writing code, verify:
- The value of `Notifications.SchedulableTriggerInputTypes.WEEKLY` (likely `'weekly'` string).
- The exact `weekday` value that means Sunday (Expo uses 1=Sunday; verify at https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

Note the exact value here in your implementation — do NOT guess.

- [ ] **Step 2: Extend the jest mock in `notifications.test.ts`**

Modify the mock block near line 3:

```ts
jest.mock('expo-notifications', () => ({
  __esModule: true,
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly' },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));
```

- [ ] **Step 3: Add failing tests**

Append to `src/lib/notifications.test.ts` (after existing describe blocks):

```ts
import {
  cancelWeeklyRecapReminder,
  scheduleWeeklyRecapReminder,
  WEEKLY_RECAP_ID,
} from './notifications';

describe('scheduleWeeklyRecapReminder', () => {
  it('cancels the existing weekly reminder before scheduling', async () => {
    (mocked.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    await scheduleWeeklyRecapReminder(20, 0);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(WEEKLY_RECAP_ID);
  });

  it('schedules with weekly Sunday 20:00 trigger and route data', async () => {
    (mocked.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    await scheduleWeeklyRecapReminder(20, 0);
    const call = (mocked.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.identifier).toBe(WEEKLY_RECAP_ID);
    expect(call.trigger.type).toBe('weekly');
    expect(call.trigger.hour).toBe(20);
    expect(call.trigger.minute).toBe(0);
    expect(call.trigger.weekday).toBe(1); // Sunday per Expo convention — verify against v57 docs
    expect(call.content.data).toEqual({ route: '/share?type=recap' });
  });

  it('uses defaults 20:00 when args omitted', async () => {
    (mocked.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    await scheduleWeeklyRecapReminder();
    const call = (mocked.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.hour).toBe(20);
    expect(call.trigger.minute).toBe(0);
  });
});

describe('cancelWeeklyRecapReminder', () => {
  it('cancels by WEEKLY_RECAP_ID', async () => {
    await cancelWeeklyRecapReminder();
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(WEEKLY_RECAP_ID);
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
npx jest src/lib/notifications.test.ts
```

Expected: FAIL — new functions not exported.

- [ ] **Step 5: Implement in `notifications.ts`**

Append to `src/lib/notifications.ts`:

```ts
export const WEEKLY_RECAP_ID = 'spendlens-weekly-recap';

export async function scheduleWeeklyRecapReminder(hh = 20, mm = 0): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_RECAP_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_RECAP_ID,
    content: {
      title: i18n.t('share.weekly_notif_title'),
      body: i18n.t('share.weekly_notif_body'),
      data: { route: '/share?type=recap' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // Sunday per Expo convention — verify against v57 docs before shipping
      hour: hh,
      minute: mm,
    },
  });
}

export async function cancelWeeklyRecapReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_RECAP_ID);
}
```

- [ ] **Step 6: Run tests to verify pass**

```bash
npx jest src/lib/notifications.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts
git commit -m "feat(share): add weekly recap notification schedule

Sunday 8pm local trigger with route /share?type=recap payload.
Follows existing REMINDER_ID pattern (const id + cancel-before-schedule)."
```

---

## Task 6: Root-layout bootstrap — schedule weekly + extend deep-link listener

**Files:**
- Modify: `src/app/_layout.tsx` (add second effect for weekly schedule + extend listener switch)

**Interfaces:**
- Consumes: `scheduleWeeklyRecapReminder` from Task 5
- Produces: no new exports; wires the new schedule + deep-link route into app boot

- [ ] **Step 1: Extend the notification import in `_layout.tsx`**

At line 27, change:

```ts
import { scheduleDailyReminder } from '@/lib/notifications';
```

to:

```ts
import { scheduleDailyReminder, scheduleWeeklyRecapReminder } from '@/lib/notifications';
```

- [ ] **Step 2: Add weekly schedule effect inside `ThemedShell`**

Just after the existing `useEffect` at line 38-44 (the daily reminder effect), add:

```ts
  useEffect(() => {
    if (!settings.reminderEnabled) return;
    scheduleWeeklyRecapReminder().catch(() => {
      // silent — permission may have been revoked externally
    });
  }, [settings.reminderEnabled]);
```

Rationale: reuses `reminderEnabled` (spec decision #11 — no separate flag). If reminders are off, weekly recap notif is off.

- [ ] **Step 3: Extend the deep-link listener switch in `RootLayout`**

At lines 95-108 there are two blocks handling notification responses. Refactor both to handle the new `/share?type=recap` route.

Find the existing pattern (line 98-100 and 104-106):

```ts
      if (route === '/subscriptions') {
        router.push('/subscriptions');
      }
```

Extract into a helper function above `RootLayout`:

```ts
function handleNotifRoute(route: string | undefined) {
  if (!route) return;
  if (route === '/subscriptions') { router.push('/subscriptions'); return; }
  if (route.startsWith('/share')) { router.push(route as any); return; }
  // Unknown route → ignore silently
}
```

Then replace both existing switch blocks (line 97-100 and 103-107) to call the helper:

```ts
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const route = (response.notification.request.content.data as { route?: string })?.route;
      handleNotifRoute(route);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = (response.notification.request.content.data as { route?: string })?.route;
      handleNotifRoute(route);
    });
```

- [ ] **Step 4: Add `<Stack.Screen name="share" />` to the Stack**

Between the existing `<Stack.Screen name="compare" />` (line 64) and closing `</Stack>` (line 65), add:

```tsx
            <Stack.Screen name="share" />
```

This registers the future `/share` route with the navigation stack (Task 11 will create the file itself).

- [ ] **Step 5: Verify nothing broke**

```bash
npx tsc --noEmit 2>&1 | grep "src/app/_layout" | head -20
```

Expected: no output (no new errors — 'share' screen name doesn't require file existence to typecheck).

```bash
npx jest 2>&1 | tail -6
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat(share): bootstrap weekly recap schedule + deep-link route

Schedule Sunday 8pm recap notif when reminderEnabled. Extract
handleNotifRoute() helper and route /share?type=recap notifications
to the future preview screen."
```

---

## Task 7: Install `expo-media-library`

**Files:**
- Modify: `package.json` (added by expo install)
- Modify: `app.json` or `app.config.ts` (add plugin config for permission strings)

**Interfaces:**
- Consumes: nothing
- Produces: `expo-media-library` runtime dependency available for import

- [ ] **Step 1: Install via Expo's version-aware installer**

```bash
cd D:/SpendLens
npx expo install expo-media-library
```

Expected: adds `expo-media-library` at Expo v57-compatible version to `package.json`; runs autolinking; no code changes needed yet.

- [ ] **Step 2: Add config plugin for permission strings**

Check whether the project uses `app.json` or `app.config.ts`:

```bash
ls app.json app.config.ts app.config.js 2>/dev/null
```

Open the config file. Find the `expo.plugins` array (or add one if absent). Add:

```json
[
  "expo-media-library",
  {
    "photosPermission": "SpendLens saves shareable cards to your photo library so you can post them.",
    "savePhotosPermission": "SpendLens saves shareable cards to your photo library so you can post them.",
    "isAccessMediaLocationEnabled": false
  }
]
```

For `app.config.ts`, the equivalent object literal — match existing plugin syntax in the file.

- [ ] **Step 3: Verify no runtime breakage**

```bash
npx tsc --noEmit 2>&1 | grep "expo-media" | head -5
```

Expected: no output (import not used yet — verified in Task 11).

```bash
npx jest 2>&1 | tail -6
```

Expected: all tests pass (no new mock needed until Task 11 uses the module).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json app.config.ts 2>/dev/null
git commit -m "chore(share): install expo-media-library

Enables Save-to-gallery on the share preview screen. Adds photo library
permission strings for iOS via config plugin."
```

**Note**: on iOS, a fresh native build (`npx expo prebuild` + rebuild) is required for the permission plist to take effect. Mention this in the PR description; the developer running `npx expo run:ios` after this commit will trigger the rebuild automatically.

---

## Task 8: `RecapCard` component

**Files:**
- Create: `src/components/share/recap-card.tsx`
- Test: `src/components/share/recap-card.test.tsx`

**Interfaces:**
- Consumes: `RecapData` from `src/lib/share-cards.ts`, `AccentGradient`/`useColors` from `src/constants/tokens`, `GradientFill` from `src/components/sl/gradient.tsx`, `Text` from `src/components/sl/text.tsx`, `useT` from `src/lib/i18n`, `formatMoney` from `src/lib/format`
- Produces: `export function RecapCard({ data, hideAmounts }: RecapCardProps)`

- [ ] **Step 1: Write failing tests**

Create `src/components/share/recap-card.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { RecapCard } from './recap-card';
import type { RecapData } from '@/lib/share-cards';

function mkRecap(overrides: Partial<RecapData> = {}): RecapData {
  return {
    weekStart: '2026-08-04',
    weekEnd: '2026-08-10',
    totalExpense: 1247,
    totalIncome: 0,
    topCategories: [
      { id: 'food', label: 'Food', color: '#f00', value: 500, pctOfWeek: 42 },
      { id: 'fun', label: 'Fun', color: '#0f0', value: 400, pctOfWeek: 30 },
      { id: 'transport', label: 'Transport', color: '#00f', value: 200, pctOfWeek: 18 },
    ],
    deltaExpensePct: 30,
    narrative: 'splurged',
    budgetPctUsed: 87,
    primary: 'USD',
    ...overrides,
  };
}

describe('RecapCard', () => {
  it('renders total, narrative, and 3 category rows when hideAmounts=false', () => {
    const r = render(<RecapCard data={mkRecap()} hideAmounts={false} />);
    expect(r.queryByText(/1,247|1.247|1 247/)).toBeTruthy(); // any locale-aware format
    expect(r.queryByText(/Food/)).toBeTruthy();
    expect(r.queryByText(/Fun/)).toBeTruthy();
    expect(r.queryByText(/Transport/)).toBeTruthy();
  });

  it('does NOT render "$" or amount when hideAmounts=true and budget available', () => {
    const r = render(<RecapCard data={mkRecap({ budgetPctUsed: 87 })} hideAmounts={true} />);
    expect(r.queryByText(/1,247|1.247/)).toBeNull();
    expect(r.queryByText(/87.*budget|budget.*87/)).toBeTruthy();
  });

  it('hides hero line entirely when hideAmounts=true and budgetPctUsed=null', () => {
    const r = render(<RecapCard data={mkRecap({ budgetPctUsed: null })} hideAmounts={true} />);
    expect(r.queryByText(/1,247|1.247/)).toBeNull();
    expect(r.queryByText(/% of budget|% budget/)).toBeNull();
  });

  it('does not render delta pill when deltaExpensePct is null', () => {
    const r = render(<RecapCard data={mkRecap({ deltaExpensePct: null })} hideAmounts={false} />);
    expect(r.queryByText(/vs last week|so với tuần trước/i)).toBeNull();
  });

  it('renders defensively with fewer than 3 categories', () => {
    const single = mkRecap({
      topCategories: [{ id: 'food', label: 'Food', color: '#f00', value: 100, pctOfWeek: 100 }],
    });
    const r = render(<RecapCard data={single} hideAmounts={false} />);
    expect(r.queryByText(/Food/)).toBeTruthy();
    // No crash
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/components/share/recap-card.test.tsx
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `RecapCard`**

Create `src/components/share/recap-card.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';

import { GradientFill } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { AccentGradient, Money, W } from '@/constants/tokens';
import { formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { RecapData } from '@/lib/share-cards';

const CARD_W = 360;
const CARD_H = 640;

export interface RecapCardProps {
  data: RecapData;
  hideAmounts: boolean;
}

export function RecapCard({ data, hideAmounts }: RecapCardProps) {
  const { t } = useT();
  const {
    weekStart, weekEnd, totalExpense, topCategories,
    deltaExpensePct, narrative, budgetPctUsed, primary,
  } = data;

  const showHeroAmount = !hideAmounts;
  const showHeroPct = hideAmounts && budgetPctUsed !== null;
  const showHero = showHeroAmount || showHeroPct;

  const deltaText = deltaExpensePct === null
    ? null
    : `${deltaExpensePct >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(deltaExpensePct))}%`;
  const deltaColor = deltaExpensePct !== null && deltaExpensePct >= 0
    ? Money.expense
    : Money.income;

  const humanRange = `${weekStart.slice(5)} – ${weekEnd.slice(5)}`; // "08-04 – 08-10"

  return (
    <View style={styles.card}>
      <GradientFill colors={AccentGradient} />

      <Text style={styles.watermark}>{t('share.watermark')}</Text>

      <View style={styles.body}>
        <Text style={styles.header}>{t('share.recap_header')}</Text>
        <Text style={styles.dateRange}>{humanRange}</Text>

        {showHero ? (
          <>
            {showHeroAmount ? (
              <Text style={styles.hero}>{formatMoney(totalExpense, primary)}</Text>
            ) : null}
            {showHeroPct ? (
              <Text style={styles.hero}>{t('share.recap_pct_of_budget', { pct: Math.round(budgetPctUsed!) })}</Text>
            ) : null}
          </>
        ) : null}

        {deltaText ? (
          <Text style={[styles.delta, { color: deltaColor }]}>
            {deltaText} {t('share.recap_vs_last_week')}
          </Text>
        ) : null}

        <Text style={styles.narrative}>{t(`narrative.${narrative}`, { cat: topCategories[0]?.label ?? '' })}</Text>

        <View style={styles.categoriesBlock}>
          {topCategories.map((cat) => (
            <View key={cat.id} style={styles.categoryRow}>
              <View style={[styles.categoryBar, { width: `${cat.pctOfWeek}%`, backgroundColor: cat.color }]} />
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              <Text style={styles.categoryPct}>{Math.round(cat.pctOfWeek)}%</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    overflow: 'hidden',
    position: 'relative',
  },
  watermark: {
    position: 'absolute',
    top: 16,
    left: 20,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: W.semibold,
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    padding: 32,
    paddingTop: 56,
    justifyContent: 'center',
  },
  header: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: W.bold,
    letterSpacing: 2,
  },
  dateRange: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: W.medium,
    marginTop: 4,
    marginBottom: 32,
  },
  hero: {
    fontSize: 56,
    color: '#fff',
    fontWeight: W.extrabold,
    letterSpacing: -1,
  },
  delta: {
    fontSize: 15,
    fontWeight: W.bold,
    marginTop: 6,
    marginBottom: 24,
  },
  narrative: {
    fontSize: 20,
    color: '#fff',
    fontWeight: W.bold,
    marginBottom: 32,
  },
  categoriesBlock: {
    gap: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 24,
  },
  categoryBar: {
    height: 6,
    borderRadius: 3,
    minWidth: 4,
    maxWidth: '55%',
  },
  categoryLabel: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    fontWeight: W.semibold,
  },
  categoryPct: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: W.bold,
  },
});
```

**Note on `GradientFill`**: verify the component accepts a `colors` prop. If it doesn't, check the existing usage in `src/app/settings.tsx` or `subscription-sheet.tsx` for the correct API.

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest src/components/share/recap-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/share/recap-card.tsx src/components/share/recap-card.test.tsx
git commit -m "feat(share): add RecapCard component

360x640 dp presentation card for weekly recap. Renders total, delta,
narrative, and top-3 categories. Hides amounts (falls back to
budget % or hides hero entirely) when hideAmounts prop is true."
```

---

## Task 9: `StreakCard` component

**Files:**
- Create: `src/components/share/streak-card.tsx`
- Test: `src/components/share/streak-card.test.tsx`

**Interfaces:**
- Consumes: `StreakData` from `src/lib/share-cards.ts`, same UI primitives as RecapCard
- Produces: `export function StreakCard({ data }: StreakCardProps)`

- [ ] **Step 1: Write failing tests**

Create `src/components/share/streak-card.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { StreakCard } from './streak-card';

describe('StreakCard', () => {
  it('renders logDays prominently', () => {
    const r = render(<StreakCard data={{ logDays: 5, txnCountThisWeek: 12, hype: 'warming_up' }} />);
    expect(r.queryByText('5')).toBeTruthy();
  });

  it('renders defensively for logDays=0', () => {
    const r = render(<StreakCard data={{ logDays: 0, txnCountThisWeek: 0, hype: 'just_started' }} />);
    expect(r.queryByText('0')).toBeTruthy();
  });

  it('renders txnCountThisWeek in micro-stat', () => {
    const r = render(<StreakCard data={{ logDays: 3, txnCountThisWeek: 7, hype: 'warming_up' }} />);
    expect(r.queryByText(/7/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/components/share/streak-card.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `StreakCard`**

Create `src/components/share/streak-card.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';

import { GradientFill } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { AccentGradient, W } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import type { StreakData } from '@/lib/share-cards';

const CARD_W = 360;
const CARD_H = 640;

export interface StreakCardProps {
  data: StreakData;
}

export function StreakCard({ data }: StreakCardProps) {
  const { t } = useT();
  const { logDays, txnCountThisWeek, hype } = data;

  return (
    <View style={styles.card}>
      <GradientFill colors={AccentGradient} />

      <Text style={styles.watermark}>{t('share.watermark')}</Text>

      <View style={styles.body}>
        <Text style={styles.emoji}>🔥</Text>
        <Text style={styles.number}>{logDays}</Text>
        <Text style={styles.label}>{t('share.streak_days_label')}</Text>
        <Text style={styles.hype}>{t(`hype.${hype}`)}</Text>
        <Text style={styles.microStat}>{t('share.streak_micro_stat', { n: txnCountThisWeek })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    overflow: 'hidden',
    position: 'relative',
  },
  watermark: {
    position: 'absolute',
    top: 16,
    left: 20,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: W.semibold,
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emoji: {
    fontSize: 100,
    lineHeight: 108,
  },
  number: {
    fontSize: 96,
    color: '#fff',
    fontWeight: W.extrabold,
    letterSpacing: -2,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: W.semibold,
    textAlign: 'center',
    marginTop: 8,
  },
  hype: {
    fontSize: 20,
    color: '#fff',
    fontWeight: W.bold,
    marginTop: 40,
  },
  microStat: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: W.medium,
    marginTop: 40,
  },
});
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest src/components/share/streak-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/share/streak-card.tsx src/components/share/streak-card.test.tsx
git commit -m "feat(share): add StreakCard component

360x640 dp presentation card for log-days streak. Renders 🔥 emoji,
streak number, hype line (per-tier), and this-week txn count."
```

---

## Task 10: `CardPickerSheet` bottom sheet

**Files:**
- Create: `src/components/share/card-picker-sheet.tsx`
- Test: `src/components/share/card-picker-sheet.test.tsx`

**Interfaces:**
- Consumes: `@gorhom/bottom-sheet` (installed), i18n share.picker_* keys from Task 1
- Produces: `export const CardPickerSheet = forwardRef<CardPickerSheetHandle, Props>(...)` with `present()` and `dismiss()` methods, plus a `Props` interface with `onSelect(type: CardType): void`

- [ ] **Step 1: Study an existing bottom sheet for pattern parity**

Read `src/components/sl/anchor-day-picker-sheet.tsx` to see the exact forwardRef + BottomSheetModal pattern used in this codebase. Match that structure.

- [ ] **Step 2: Write failing tests**

Create `src/components/share/card-picker-sheet.test.tsx`:

```tsx
import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CardPickerSheet, type CardPickerSheetHandle } from './card-picker-sheet';

describe('CardPickerSheet', () => {
  it('fires onSelect("recap") when the recap row is tapped', async () => {
    const onSelect = jest.fn();
    const ref = createRef<CardPickerSheetHandle>();
    const r = render(<CardPickerSheet ref={ref} onSelect={onSelect} />);
    await act(async () => ref.current?.present());
    fireEvent.press(r.getByTestId('card-picker-recap'));
    expect(onSelect).toHaveBeenCalledWith('recap');
  });

  it('fires onSelect("streak") when the streak row is tapped', async () => {
    const onSelect = jest.fn();
    const ref = createRef<CardPickerSheetHandle>();
    const r = render(<CardPickerSheet ref={ref} onSelect={onSelect} />);
    await act(async () => ref.current?.present());
    fireEvent.press(r.getByTestId('card-picker-streak'));
    expect(onSelect).toHaveBeenCalledWith('streak');
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx jest src/components/share/card-picker-sheet.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement `CardPickerSheet`**

Create `src/components/share/card-picker-sheet.tsx`:

```tsx
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, W } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import type { CardType } from '@/lib/share-cards';

export interface CardPickerSheetHandle {
  present(): void;
  dismiss(): void;
}

interface Props {
  onSelect: (type: CardType) => void;
}

export const CardPickerSheet = forwardRef<CardPickerSheetHandle, Props>(function CardPickerSheet(
  { onSelect },
  ref,
) {
  const { t } = useT();
  const c = useColors();
  const sheet = useRef<BottomSheetModal>(null);

  useImperativeHandle(ref, () => ({
    present: () => sheet.current?.present(),
    dismiss: () => sheet.current?.dismiss(),
  }));

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
    [],
  );

  const handleSelect = (type: CardType) => {
    onSelect(type);
    sheet.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={['30%']}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.body}>
        <Text style={[styles.title, { color: c.text }]}>{t('share.picker_title')}</Text>
        <Pressable
          testID="card-picker-recap"
          onPress={() => handleSelect('recap')}
          style={({ pressed }) => [styles.row, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.rowLabel, { color: c.text }]}>{t('share.picker_recap')}</Text>
          <Text style={{ color: c.textSecondary }}>›</Text>
        </Pressable>
        <Pressable
          testID="card-picker-streak"
          onPress={() => handleSelect('streak')}
          style={({ pressed }) => [styles.row, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.rowLabel, { color: c.text }]}>{t('share.picker_streak')}</Text>
          <Text style={{ color: c.textSecondary }}>›</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  title: { fontSize: 16, fontWeight: W.bold, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: Radius.button,
  },
  rowLabel: { fontSize: 16, fontWeight: W.semibold },
});
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx jest src/components/share/card-picker-sheet.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/share/card-picker-sheet.tsx src/components/share/card-picker-sheet.test.tsx
git commit -m "feat(share): add CardPickerSheet bottom sheet

Two-row picker (Weekly recap, Streak) with imperative present/dismiss.
Fires onSelect(type) callback then auto-dismisses."
```

---

## Task 11: `use-share-card` hook + `share.tsx` preview route

**Files:**
- Create: `src/lib/use-share-card.ts`
- Create: `src/app/share.tsx`
- Create: `src/app/share.test.tsx`

**Interfaces:**
- Consumes:
  - `assembleRecapData`, `assembleStreakData` from Task 4
  - `RecapCard`, `StreakCard` from Tasks 8-9
  - `useTransactions` from `src/lib/transactions-context`
  - `useSettings` from `src/lib/settings-context`
  - `useT` from `src/lib/i18n`
  - `captureRef` from `react-native-view-shot` (already installed)
  - `Share` from `react-native-share` (already installed)
  - `MediaLibrary` from `expo-media-library` (Task 7)
- Produces:
  - `export function useShareCard(type: CardType, hideAmounts: boolean): { shareData: ShareData }` — assembles per type
  - Default export from `share.tsx` — the route component

- [ ] **Step 1: Implement `use-share-card` hook**

Create `src/lib/use-share-card.ts`:

```ts
import { useMemo } from 'react';

import { useSettings } from './settings-context';
import { assembleRecapData, assembleStreakData, type CardType, type ShareData } from './share-cards';
import { useTransactions } from './transactions-context';
import { toCategoryObj } from './user-categories';

export function useShareCard(type: CardType): { shareData: ShareData } {
  const { transactions, userCategories } = useTransactions();
  const { settings } = useSettings();

  const shareData = useMemo<ShareData>(() => {
    if (type === 'recap') {
      const registry = userCategories.map(toCategoryObj).map((cat) => ({
        id: cat.id, label: cat.label, color: cat.fg,
      }));
      return {
        type: 'recap',
        data: assembleRecapData(transactions, registry, settings.monthlyBudget, settings.primaryCurrency),
      };
    }
    return { type: 'streak', data: assembleStreakData(transactions) };
  }, [type, transactions, userCategories, settings.monthlyBudget, settings.primaryCurrency]);

  return { shareData };
}
```

- [ ] **Step 2: Write failing tests for `share.tsx`**

Create `src/app/share.test.tsx`:

```tsx
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue({ success: true }) },
}));

jest.mock('react-native-view-shot', () => ({
  __esModule: true,
  captureRef: jest.fn().mockResolvedValue('file:///tmp/card.png'),
  default: ({ children }: any) => children,
}));

jest.mock('expo-media-library', () => ({
  __esModule: true,
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ type: 'recap' }),
  Stack: { Screen: () => null },
}));

import { fireEvent, render } from '@testing-library/react-native';
import Share from 'react-native-share';
import ShareScreen from './share';
import { SettingsProvider } from '@/lib/settings-context';
import { TransactionsProvider } from '@/lib/transactions-context';

function renderWithProviders(ui: any) {
  return render(<SettingsProvider><TransactionsProvider>{ui}</TransactionsProvider></SettingsProvider>);
}

describe('ShareScreen', () => {
  it('renders the recap card when type=recap', async () => {
    const r = renderWithProviders(<ShareScreen />);
    // RecapCard renders header text from i18n
    expect(r.queryByText(/WEEKLY RECAP|RECAP TUẦN/i)).toBeTruthy();
  });

  it('calls Share.open with tmpfile URI on Share button tap', async () => {
    const r = renderWithProviders(<ShareScreen />);
    const btn = r.getByTestId('share-button');
    await fireEvent.press(btn);
    // Async settle
    await new Promise((res) => setTimeout(res, 0));
    expect(Share.open).toHaveBeenCalledWith(expect.objectContaining({ url: 'file:///tmp/card.png' }));
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx jest src/app/share.test.tsx
```

Expected: FAIL — module missing.

- [ ] **Step 4: Implement `share.tsx`**

Create `src/app/share.tsx`:

```tsx
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import Share from 'react-native-share';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientFill } from '@/components/sl/gradient';
import { RecapCard } from '@/components/share/recap-card';
import { StreakCard } from '@/components/share/streak-card';
import { Text } from '@/components/sl/text';
import { Icon } from '@/components/sl/icons';
import { Radius, useColors, W } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import type { CardType } from '@/lib/share-cards';
import { useShareCard } from '@/lib/use-share-card';

function normalizeType(raw: string | string[] | undefined): CardType {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s === 'streak' ? 'streak' : 'recap';
}

export default function ShareScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = normalizeType(params.type);
  const { settings, update } = useSettings();
  const { shareData } = useShareCard(type);

  const viewShotRef = useRef<ViewShot>(null);
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const hideAmounts = settings.shareHideAmounts;

  async function capturePng(): Promise<string> {
    return captureRef(viewShotRef, {
      format: 'png',
      quality: 1,
      width: 1080,
      height: 1920,
      result: 'tmpfile',
    });
  }

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    let uri: string | null = null;
    try {
      uri = await capturePng();
      await Share.open({ url: uri, type: 'image/png' });
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.includes('User did not share') || msg.includes('CANCELLED')) {
        // silent — user cancelled
      } else if (uri === null) {
        Alert.alert(t('share.capture_failed_title'), t('share.capture_failed_body'));
      } else {
        Alert.alert(t('share.share_failed_title'), t('share.share_failed_body'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveToGallery() {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('share.gallery_perm_title'), t('share.gallery_perm_body'));
        return;
      }
      const uri = await capturePng();
      await MediaLibrary.saveToLibraryAsync(uri);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
    } catch {
      Alert.alert(t('share.save_failed_title'), t('share.save_failed_body'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: c.text }]}>{t('share.preview_title')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} style={[styles.iconBtn, { backgroundColor: c.segment }]}>
          <Icon name="close" size={18} color={c.text} />
        </Pressable>
      </View>

      {/* Card preview */}
      <View style={styles.previewWrap}>
        <ViewShot ref={viewShotRef} style={styles.viewshot}>
          {shareData.type === 'recap'
            ? <RecapCard data={shareData.data} hideAmounts={hideAmounts} />
            : <StreakCard data={shareData.data} />}
        </ViewShot>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {shareData.type === 'recap' ? (
          <View style={styles.toggleRow}>
            <Text style={{ color: c.text, fontWeight: W.medium }}>{t('share.hide_amounts')}</Text>
            <Switch
              value={hideAmounts}
              onValueChange={(v) => update('shareHideAmounts', v)}
            />
          </View>
        ) : null}

        <Pressable
          testID="save-button"
          onPress={handleSaveToGallery}
          disabled={busy}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.segment, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={{ color: c.text, fontWeight: W.semibold }}>
            {savedTick ? `✓ ${t('share.saved_toast')}` : t('share.save_to_gallery')}
          </Text>
        </Pressable>

        <Pressable
          testID="share-button"
          onPress={handleShare}
          disabled={busy}
          style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <GradientFill />
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnLabel}>{t('share.share_button')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: W.extrabold },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previewWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  viewshot: {
    // wraps the card so ViewShot has stable ref target
  },
  controls: {
    padding: 20,
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: Radius.button,
    alignItems: 'center',
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: W.extrabold,
  },
});
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx jest src/app/share.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Also run full jest suite as a sanity check**

```bash
npx jest 2>&1 | tail -6
```

Expected: all tests still pass (previous count + new ones).

- [ ] **Step 7: Commit**

```bash
git add src/lib/use-share-card.ts src/app/share.tsx src/app/share.test.tsx
git commit -m "feat(share): add /share preview screen + useShareCard hook

WYSIWYG preview with Hide amounts toggle (recap only), Save-to-gallery
(with permission request), and Share (OS share sheet). Captures the
card as 1080x1920 PNG via view-shot. All async ops surface errors
via Alert; user-cancelled share is silent."
```

---

## Task 12: Home header — Share icon entry point

**Files:**
- Modify: `src/app/index.tsx` (add Share icon in header row, wire tap to CardPickerSheet)

**Interfaces:**
- Consumes: `CardPickerSheet` from Task 10, `computeLogDaysStreak` from Task 2
- Produces: no new exports; visible Share icon on Home header

- [ ] **Step 1: Find the header in `src/app/index.tsx`**

Locate the top-of-screen header row. In the current file there's a nearby `ShareSheet` import at line 17-18 (used for transaction sharing — a different feature). Do NOT touch that; add a new icon.

Look for the section that renders any close/settings icon at the top of the camera view. If none exists (Home is currently full-bleed camera), add a small floating icon at the top-right corner instead:

```tsx
<View style={styles.topRightIcons}>
  <Pressable
    testID="share-cards-icon"
    onPress={handleOpenShareCards}
    disabled={cannotShare}
    style={({ pressed }) => [
      styles.floatingIcon,
      { opacity: cannotShare ? 0.5 : (pressed ? 0.7 : 1) },
    ]}
  >
    <Icon name="share" size={20} color="#fff" />
  </Pressable>
</View>
```

Add matching styles:

```ts
topRightIcons: {
  position: 'absolute',
  top: insets.top + 12,
  right: 12,
  flexDirection: 'row',
  gap: 8,
  zIndex: 10,
},
floatingIcon: {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: 'rgba(0,0,0,0.4)',
  alignItems: 'center',
  justifyContent: 'center',
},
```

- [ ] **Step 2: Add state + handler**

Near the existing `useRef` declarations, add:

```ts
import { CardPickerSheet, type CardPickerSheetHandle } from '@/components/share/card-picker-sheet';
import { weekStartOf } from '@/lib/comparison';
import { computeLogDaysStreak } from '@/lib/streaks';
```

Inside the component:

```ts
const cardPickerRef = useRef<CardPickerSheetHandle>(null);

const cannotShare = useMemo(() => {
  const weekStart = weekStartOf(toDateKey(new Date()));
  const noTxnsThisWeek = transactions.filter((tx) => tx.date >= weekStart).length === 0;
  const noStreak = computeLogDaysStreak(transactions) === 0;
  return noTxnsThisWeek && noStreak;
}, [transactions]);

const handleOpenShareCards = () => {
  if (cannotShare) {
    Alert.alert(t('share.no_data_title'), t('share.no_data_body'));
    return;
  }
  cardPickerRef.current?.present();
};
```

- [ ] **Step 3: Mount `CardPickerSheet` at the root of the returned JSX**

Place `<CardPickerSheet ref={cardPickerRef} onSelect={(type) => router.push(`/share?type=${type}`)} />` alongside the existing `<ShareSheet ref={shareSheetRef} />` mount.

- [ ] **Step 4: Add `Alert` and `Icon` imports if missing**

Check the existing imports at the top of `src/app/index.tsx`. `Alert` may or may not be imported; add if needed. Same for `Icon`.

- [ ] **Step 5: Run existing home-related tests (if any) + typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "src/app/index" | head -20
```

Expected: no output.

```bash
npx jest 2>&1 | tail -6
```

Expected: all pass.

- [ ] **Step 6: Manual smoke test (dev server)**

```bash
npx expo start
```

Open on device/simulator:
- Verify Share icon appears at top-right of Home
- Tap → CardPickerSheet appears
- Tap "Weekly recap" → navigates to /share?type=recap → preview renders
- Tap Share → OS share sheet opens
- Tap Save to gallery → permission prompt (first time) → check ✓ toast
- Tap "Streak" from picker → preview renders StreakCard

- [ ] **Step 7: Commit**

```bash
git add src/app/index.tsx
git commit -m "feat(share): add Share icon to Home header

Top-right floating icon opens CardPickerSheet. Disabled with alert
when there is no data (no txns this week AND no log-days streak)."
```

---

## Post-implementation manual QA checklist

Not a task, but part of PR review before merge:

- [ ] Trigger Share on iOS + Android → PNG output is exactly 1080×1920, text sharp, no clipping
- [ ] Share to Instagram Story on iOS + Android — layout renders correctly in IG editor
- [ ] Share to TikTok / Zalo / Messenger — image previews correctly
- [ ] Weekly notification: temporarily change trigger to `{ seconds: 60 }` in dev, verify tap opens `/share?type=recap`; then revert to Sunday 8pm before commit
- [ ] Deep-link from notif on **cold-start** app (kill process first) — `getLastNotificationResponseAsync` path
- [ ] Deep-link from notif on **warm** app — `addNotificationResponseReceivedListener` path
- [ ] Switch app locale VI ↔ EN in Settings → both cards render in correct language
- [ ] Toggle `shareHideAmounts` OFF → recap shows `$` amounts; toggle ON → recap shows `% of budget` (with budget) or hero hidden (without budget)
- [ ] Home Share icon disabled state: fresh install with no txns → icon at 50% opacity, tap shows alert
- [ ] Save to gallery: first-time permission prompt → grant → verify PNG appears in device Photos app
- [ ] `expo-media-library` iOS: verify Info.plist has `NSPhotoLibraryUsageDescription` and `NSPhotoLibraryAddUsageDescription` strings after `npx expo prebuild`

---

## Not in this plan (deferred)

- **Feature #2 — Per-category envelope budgets** — separate spec + plan
- **Feature #3 — AI Money Coach chat** — separate spec + plan (requires Anthropic API key management)
- **Feature #4 — Momo/ZaloPay import** — separate spec + plan (requires platform feasibility validation first)
- **Savings goals subsystem** — needed for goal-progress card type C (deferred with card C)
- **No-spend day toggle** — needed for no-spend streak type (deferred)
- **Multi-slide Spotify Wrapped flow** — v2 enhancement
- **Additional card themes / user customization** — v2
- **Weekly notif granularity setting** — v2 (currently piggybacks on `reminderEnabled`)
