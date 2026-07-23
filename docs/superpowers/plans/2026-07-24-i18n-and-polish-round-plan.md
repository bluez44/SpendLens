# i18n + Polish Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 8 coordinated polish improvements — VI/EN i18n, notification audit, `@gorhom/bottom-sheet` migration, camera permission gating, camera zoom continuity fix, slower camera scroll, entry-screen form validation with persistent custom categories and date/time picker, and removal of auto-init seed.

**Architecture:** Bottom-up sequential — remove seed first (foundational), build i18n scaffolding, refactor library modules, refactor screens, then run the remaining polish items which all inherit i18n. All work stays on `main` branch (small commits after each task) unless the user later requests a feature branch.

**Tech Stack:** React Native 0.86 / Expo SDK 57 / TypeScript strict. New deps: `i18next`, `react-i18next`, `expo-localization`, `@gorhom/bottom-sheet`. Existing: `react-native-gesture-handler` v2, `react-native-reanimated` 4, `expo-sqlite`, `expo-notifications`.

## Global Constraints

- Expo SDK 57 — verify any new expo dep at `https://docs.expo.dev/versions/v57.0.0/` before install.
- TypeScript strict — no `any` in new code.
- TDD — every new pure module ships with Jest tests; UI wiring gets at least one smoke test where feasible.
- Only VI and EN supported. `auto` mode resolves at load — VI is the fallback for null and non-EN locales (per `resolveLanguage` spec).
- All existing tests must remain green. `npm test` must pass at end of every task.
- No visible UI copy left hardcoded after Task 7. Test-only strings are exempt.
- Default language when `settings.language === 'auto'`: EN only if device locale starts with `en`, else VI.
- Notification title/body text lives in `i18n.t()` after Task 5 — no hardcoded VN strings in `notifications.ts`.
- Static category ids: `food | transport | shopping | bills | health | fun | other`. Custom category ids: template literal `custom_${string}`.
- Save button in Entry: `disabled` when `amount <= 0 || note.trim() === ''`. Required-field asterisk on `SỐ TIỀN` and `GHI CHÚ` only.
- Seed data (`seedIfEmpty`) MUST NOT run automatically after Task 1. The file `src/lib/seed.ts` stays as a dev-only utility.

## File map

Files created:
- `src/lib/i18n/index.ts` — i18next init, exports `i18n`, `useT`
- `src/lib/i18n/detect.ts` — `resolveLanguage(setting, deviceLocale)`
- `src/lib/i18n/detect.test.ts` — resolve tests
- `src/lib/i18n/index.test.ts` — translation smoke tests
- `src/lib/i18n/locales/vi.json` — Vietnamese translations
- `src/lib/i18n/locales/en.json` — English translations
- `src/lib/user-categories.ts` — SQLite CRUD for user-defined categories
- `src/lib/user-categories.test.ts`
- `src/components/sl/date-range-sheet.tsx` — replaces `date-range-modal.tsx`
- `src/components/sl/budget-sheet.tsx` — replaces inline `<Modal>` in settings
- `docs/testing/notifications-smoke-checklist.md`

Files modified:
- `src/lib/transactions-context.tsx` — drop `seedIfEmpty(db)` call
- `src/lib/seed.ts` — top comment updates
- `src/lib/settings.ts` — add `language` key
- `src/lib/settings-context.tsx` — apply `i18n.changeLanguage(...)` on load + update
- `src/lib/categories.ts` — introduce `labelKey`, `categoryLabel()`, `CategoryId` union
- `src/lib/format.ts` — `dayLabel` uses `i18n.t()`
- `src/lib/notifications.ts` — titles/bodies via `i18n.t()`
- `src/lib/export.ts` — `dialogTitle` via `i18n.t()`
- `src/lib/db.ts` — add `categories` table to schema
- `src/app/_layout.tsx` — import `i18n` before providers; wrap with `<BottomSheetModalProvider>`
- `src/app/settings.tsx` — i18n refactor + NGÔN NGỮ segmented + wire new sheets + reset also wipes user categories
- `src/app/index.tsx` — i18n refactor + permission-gated note zone + zoom continuity fix + slower deceleration
- `src/app/entry.tsx` — i18n refactor + form validation + custom category chips/input + date/time picker
- `src/app/home.tsx`, `src/app/history.tsx`, `src/app/transaction/[id].tsx` — i18n refactor
- `src/components/sl/date-range-modal.tsx` — deleted (replaced by sheet)
- Tests updated to lock i18n language to VI before assertions on Vietnamese strings

---

### Task 1: Remove auto-init seed

**Files:**
- Modify: `src/lib/transactions-context.tsx:35`
- Modify: `src/lib/seed.ts` (top-of-file comment)

**Interfaces:**
- Consumes: none
- Produces: `seedIfEmpty(db)` remains callable manually from dev tooling; no automatic execution.

- [ ] **Step 1: Read current call site**

Verify line 35 of `src/lib/transactions-context.tsx` reads `seedIfEmpty(db);` and it's the only call site of `seedIfEmpty` in `src/`.

Run: `grep -rn "seedIfEmpty" src/`

Expected output includes:
```
src/lib/seed.ts:56:export function seedIfEmpty
src/lib/transactions-context.tsx:4:import { seedIfEmpty } from './seed';
src/lib/transactions-context.tsx:35:    seedIfEmpty(db);
```

- [ ] **Step 2: Remove the call and the import**

Edit `src/lib/transactions-context.tsx`:

Change from:
```tsx
import { db } from './db';
import { seedIfEmpty } from './seed';
import type { NewTxn, Txn } from './transactions';
```
to:
```tsx
import { db } from './db';
import type { NewTxn, Txn } from './transactions';
```

Change from:
```tsx
  useEffect(() => {
    seedIfEmpty(db);
    refresh();
    setReady(true);
  }, [refresh]);
```
to:
```tsx
  useEffect(() => {
    refresh();
    setReady(true);
  }, [refresh]);
```

- [ ] **Step 3: Update `seed.ts` top comment**

Add above the `PHOTO` constant in `src/lib/seed.ts`:

```ts
/**
 * DEV-ONLY seed utility. Not called automatically anywhere in the app.
 * Call `seedIfEmpty(db)` manually from a dev script or React Native debugger
 * when you need sample data. Production users start with an empty database.
 */
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: all suites pass. If any test relied on seed data, either fix that test to insert its own fixtures or note the failure and stop.

- [ ] **Step 5: Commit**

```bash
git add src/lib/transactions-context.tsx src/lib/seed.ts
git commit -m "Remove auto-init seed; keep seed.ts as dev-only utility"
```

---

### Task 2: i18n scaffolding — install, init, detect, JSON, tests

**Files:**
- Create: `src/lib/i18n/index.ts`
- Create: `src/lib/i18n/detect.ts`
- Create: `src/lib/i18n/detect.test.ts`
- Create: `src/lib/i18n/index.test.ts`
- Create: `src/lib/i18n/locales/vi.json`
- Create: `src/lib/i18n/locales/en.json`
- Modify: `package.json` (via `npx expo install`)

**Interfaces:**
- Consumes: none
- Produces:
  - `i18n` (i18next singleton)
  - `useT()` — thin re-export of `useTranslation` from `react-i18next`
  - `resolveLanguage(setting: 'auto' | 'vi' | 'en', deviceLocale: string | null): 'vi' | 'en'`
  - Type `LanguageSetting = 'auto' | 'vi' | 'en'`
  - Type `ResolvedLanguage = 'vi' | 'en'`

- [ ] **Step 1: Install deps**

Run:
```bash
npx expo install expo-localization
npm install i18next react-i18next
```

Verify `package.json` gained `i18next`, `react-i18next`, `expo-localization`.

- [ ] **Step 2: Write `detect.ts` failing test**

Create `src/lib/i18n/detect.test.ts`:

```ts
import { resolveLanguage } from './detect';

describe('resolveLanguage', () => {
  it('returns explicit setting when not auto', () => {
    expect(resolveLanguage('vi', 'en-US')).toBe('vi');
    expect(resolveLanguage('en', 'vi-VN')).toBe('en');
  });

  it('auto + english device -> en', () => {
    expect(resolveLanguage('auto', 'en-US')).toBe('en');
    expect(resolveLanguage('auto', 'EN')).toBe('en');
  });

  it('auto + vietnamese device -> vi', () => {
    expect(resolveLanguage('auto', 'vi-VN')).toBe('vi');
    expect(resolveLanguage('auto', 'VI')).toBe('vi');
  });

  it('auto + other language -> vi (fallback)', () => {
    expect(resolveLanguage('auto', 'ja-JP')).toBe('vi');
    expect(resolveLanguage('auto', 'fr-FR')).toBe('vi');
  });

  it('auto + null device -> vi (fallback)', () => {
    expect(resolveLanguage('auto', null)).toBe('vi');
  });
});
```

- [ ] **Step 3: Run test — expect fail**

Run: `npm test -- detect.test`

Expected: FAIL — module not found.

- [ ] **Step 4: Write `detect.ts`**

Create `src/lib/i18n/detect.ts`:

```ts
export type LanguageSetting = 'auto' | 'vi' | 'en';
export type ResolvedLanguage = 'vi' | 'en';

export function resolveLanguage(
  setting: LanguageSetting,
  deviceLocale: string | null,
): ResolvedLanguage {
  if (setting === 'vi' || setting === 'en') return setting;
  if (deviceLocale?.toLowerCase().startsWith('en')) return 'en';
  return 'vi';
}
```

- [ ] **Step 5: Run test — expect pass**

Run: `npm test -- detect.test`

Expected: PASS (5 assertions).

- [ ] **Step 6: Create locale JSON files**

Create `src/lib/i18n/locales/vi.json` with the full key structure from the spec, section 1 "Translation key structure". Copy the exact JSON block as given in the spec.

Create `src/lib/i18n/locales/en.json` with the same key hierarchy and English translations. Use the following as the EN payload:

```json
{
  "app": { "name": "SpendLens" },
  "nav": { "today": "Today" },
  "day": { "today": "Today", "yesterday": "Yesterday" },
  "category": {
    "food": "Food",
    "transport": "Transport",
    "shopping": "Shopping",
    "bills": "Bills",
    "health": "Health",
    "fun": "Fun",
    "other": "Other",
    "income": "Income"
  },
  "camera": {
    "permission_needed": "Camera permission needed to snap an expense",
    "permission_loading": "Loading camera…",
    "permission_grant": "Allow camera",
    "note_placeholder": "e.g. Highlands coffee",
    "note_label": "Note"
  },
  "entry": {
    "amount_label": "AMOUNT",
    "note_label": "NOTE",
    "note_placeholder_expense": "Bun bo Hue · near the office",
    "note_placeholder_income": "Salary, bonus…",
    "date_label": "Date & time",
    "save_expense": "Save expense",
    "save_income": "Save income",
    "save_update": "Update",
    "custom_category_placeholder": "New category name",
    "custom_category_delete_title": "Delete category?",
    "custom_category_delete_body": "The category will be deleted permanently. Existing transactions remain.",
    "required_asterisk": "*"
  },
  "settings": {
    "title": "Settings",
    "section_budget": "BUDGET",
    "section_reminder": "REMINDER",
    "section_language": "LANGUAGE",
    "section_theme": "APPEARANCE",
    "section_data": "DATA",
    "section_info": "ABOUT",
    "budget_row": "Monthly budget",
    "budget_not_set": "Not set",
    "reminder_row": "Daily reminder to snap receipts",
    "reminder_time": "Reminder time",
    "reminder_not_set": "Not set",
    "budget_alerts_row": "Budget overspend alert",
    "budget_alerts_hint": "Set a budget first",
    "language_auto": "Auto",
    "language_vi": "Tiếng Việt",
    "language_en": "English",
    "theme_auto": "Auto",
    "theme_light": "Light",
    "theme_dark": "Dark",
    "export_row": "Export CSV",
    "reset_txns_row": "Delete transactions",
    "reset_txns_title": "Delete transactions",
    "reset_txns_body": "All transactions and photos will be deleted permanently.",
    "reset_all_row": "Reset to defaults",
    "reset_all_title": "Reset to defaults",
    "reset_all_body": "All transactions, photos and settings will be reset.",
    "version_row": "Version",
    "github_row": "GitHub",
    "bug_row": "Report bug",
    "license_row": "License",
    "cancel": "Cancel",
    "delete": "Delete",
    "reset": "Reset",
    "save": "Save",
    "permission_needed_title": "Notification permission needed",
    "permission_needed_body": "Enable notification permission in system settings."
  },
  "history": { "title": "History", "empty": "No transactions yet" },
  "notif": {
    "reminder_title": "SpendLens",
    "reminder_body": "Log today's expenses?",
    "budget_80_title": "Approaching budget limit",
    "budget_80_body": "You've spent over 80% of this month's budget.",
    "budget_100_title": "Over budget!",
    "budget_100_body": "You've exceeded 100% of this month's budget."
  },
  "export": { "share_dialog_title": "Export SpendLens" }
}
```

Create `src/lib/i18n/locales/vi.json` mirroring the exact key set but with Vietnamese strings taken from the current code:

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

- [ ] **Step 7: Write `i18n/index.ts` failing test**

Create `src/lib/i18n/index.test.ts`:

```ts
import { i18n } from './index';

describe('i18n', () => {
  it('initialises with vietnamese by default and returns known keys', () => {
    expect(i18n.language).toBe('vi');
    expect(i18n.t('app.name')).toBe('SpendLens');
    expect(i18n.t('day.today')).toBe('Hôm nay');
    expect(i18n.t('category.food')).toBe('Ăn uống');
  });

  it('swaps translations after changeLanguage', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('day.today')).toBe('Today');
    expect(i18n.t('category.food')).toBe('Food');
    await i18n.changeLanguage('vi');
    expect(i18n.t('day.today')).toBe('Hôm nay');
  });

  it('missing key returns the key itself (returnNull=false)', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
  });
});
```

- [ ] **Step 8: Run test — expect fail**

Run: `npm test -- src/lib/i18n/index.test`

Expected: FAIL — module `./index` not found.

- [ ] **Step 9: Write `i18n/index.ts`**

Create `src/lib/i18n/index.ts`:

```ts
import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import en from './locales/en.json';
import vi from './locales/vi.json';

i18next.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: { vi: { common: vi }, en: { common: en } },
  lng: 'vi',
  fallbackLng: 'vi',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const i18n = i18next;
export { useTranslation as useT };
```

- [ ] **Step 10: Run test — expect pass**

Run: `npm test -- src/lib/i18n`

Expected: PASS. All 8 assertions across detect + index green.

- [ ] **Step 11: Full suite**

Run: `npm test`

Expected: everything green.

- [ ] **Step 12: Commit**

```bash
git add src/lib/i18n package.json package-lock.json
git commit -m "Add i18n scaffolding: i18next + react-i18next + vi/en locales"
```

---

### Task 3: Add `language` setting + provider wiring

**Files:**
- Modify: `src/lib/settings.ts` — add `language` key, encode/decode, defaults
- Modify: `src/lib/settings.test.ts` — cover new key
- Modify: `src/lib/settings-context.tsx` — apply `i18n.changeLanguage` on load + update
- Modify: `src/app/_layout.tsx` — import `@/lib/i18n` at top so init runs before providers

**Interfaces:**
- Consumes: `i18n` and `resolveLanguage` from Task 2, `Settings.language` from this task
- Produces: `settings.language: 'auto' | 'vi' | 'en'`; language changes propagate automatically to any component using `useTranslation()`

- [ ] **Step 1: Failing test — language setting round-trip**

`src/lib/settings.test.ts` already exports a `freshDb()` helper at the top. Append this new describe block at the end of the file:

```ts
describe('language setting', () => {
  it('defaults to auto', () => {
    const s = loadSettings(freshDb());
    expect(s.language).toBe('auto');
  });

  it('round-trips vi / en / auto', () => {
    const d = freshDb();
    updateSetting('language', 'vi', d);
    expect(loadSettings(d).language).toBe('vi');
    updateSetting('language', 'en', d);
    expect(loadSettings(d).language).toBe('en');
    updateSetting('language', 'auto', d);
    expect(loadSettings(d).language).toBe('auto');
  });

  it('unknown value falls back to auto', () => {
    const d = freshDb();
    d.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'language', 'zh');
    expect(loadSettings(d).language).toBe('auto');
  });
});
```

Also update the existing `round-trips every key type` test (line 26-33) to include `language: 'auto'` in the expected object — otherwise the toEqual assertion fails after Step 3:

```ts
    expect(loadSettings(db)).toEqual({
      monthlyBudget: 3_000_000,
      reminderEnabled: true,
      reminderHHMM: '21:00',
      themeMode: 'dark',
      budgetAlertsEnabled: false,
      budgetNotifiedMonth: '2026-07:100',
      language: 'auto',
    });
```

- [ ] **Step 2: Run test — expect fail**

Run: `npm test -- settings.test`

Expected: FAIL — `Property 'language' does not exist on type 'Settings'`.

- [ ] **Step 3: Extend `Settings` interface and encode/decode**

Edit `src/lib/settings.ts`:

Add `language` to `Settings` interface:

```ts
export interface Settings {
  monthlyBudget: number;
  reminderEnabled: boolean;
  reminderHHMM: string | null;
  themeMode: 'auto' | 'light' | 'dark';
  budgetAlertsEnabled: boolean;
  budgetNotifiedMonth: string;
  language: 'auto' | 'vi' | 'en';
}
```

Add default:
```ts
export const DEFAULTS: Settings = {
  monthlyBudget: 0,
  reminderEnabled: false,
  reminderHHMM: null,
  themeMode: 'auto',
  budgetAlertsEnabled: true,
  budgetNotifiedMonth: '',
  language: 'auto',
};
```

Extend `encode` switch:
```ts
    case 'language':
      return value as string;
```

Extend `decode`:
```ts
  const lang = map.get('language');
  if (lang === 'auto' || lang === 'vi' || lang === 'en') result.language = lang;
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- settings.test`

Expected: PASS.

- [ ] **Step 5: Wire SettingsProvider to i18n.changeLanguage**

Edit `src/lib/settings-context.tsx`:

Add imports at top:
```tsx
import * as Localization from 'expo-localization';

import { i18n } from './i18n';
import { resolveLanguage } from './i18n/detect';
```

Modify the initial state block to resolve+apply language immediately:
```tsx
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const loaded = loadSettings();
      const device = Localization.getLocales()[0]?.languageCode ?? null;
      i18n.changeLanguage(resolveLanguage(loaded.language, device)).catch(() => {});
      return loaded;
    } catch {
      return DEFAULTS;
    }
  });
```

Modify `update` to re-resolve when `language` changes:
```tsx
  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    try {
      updateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
      if (key === 'language') {
        const device = Localization.getLocales()[0]?.languageCode ?? null;
        i18n.changeLanguage(resolveLanguage(value as Settings['language'], device)).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to persist setting', key, err);
    }
  }, []);
```

- [ ] **Step 6: Import i18n at layout top**

Edit `src/app/_layout.tsx`. At the top of the file (before any other imports that could use translations at module load), add:

```tsx
import '@/lib/i18n';
```

This ensures i18next initialises before any provider or screen mounts.

- [ ] **Step 7: Full suite**

Run: `npm test`

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts src/lib/settings-context.tsx src/app/_layout.tsx
git commit -m "Add language setting + wire i18n.changeLanguage from provider"
```

---

### Task 4: Refactor library modules to use i18n

**Files:**
- Modify: `src/lib/categories.ts` — add `labelKey`, unified `Category`, `categoryLabel()`, `CategoryId` union
- Modify: `src/lib/categories.test.ts` — assertions on `categoryLabel()` under both languages
- Modify: `src/lib/format.ts` — `dayLabel` uses `i18n.t()`
- Modify: `src/lib/format.test.ts` — lock language to VI before assertions
- Modify: `src/lib/notifications.ts` — titles/bodies via `i18n.t()`
- Modify: `src/lib/notifications.test.ts` — lock language to VI
- Modify: `src/lib/export.ts` — `dialogTitle` via `i18n.t()`
- Modify: `src/lib/export.test.ts` — lock language to VI
- Modify: all consumers of `CATEGORIES[i].label` and `categoryOf(id).label` → `categoryLabel(cat)`

**Interfaces:**
- Consumes: `i18n` from Task 2
- Produces:
  - `type StaticCategoryId = 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'fun' | 'other'`
  - `type CustomCategoryId = \`custom_${string}\``
  - `type CategoryId = StaticCategoryId | CustomCategoryId`
  - `interface Category { id: CategoryId; labelKey: string | null; label: string; chip: string; fg: string }`
  - `STATIC_CATEGORIES: Category[]` (renamed from `CATEGORIES` — update all imports)
  - `categoryLabel(c: Category): string`
  - `categoryOf(id: string, extras?: Category[]): Category`

- [ ] **Step 1: Rewrite `categories.ts` with the new interface**

Replace the whole file content of `src/lib/categories.ts`:

```ts
import { i18n } from './i18n';

export type StaticCategoryId = 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'fun' | 'other';
export type CustomCategoryId = `custom_${string}`;
export type CategoryId = StaticCategoryId | CustomCategoryId;

export interface Category {
  id: CategoryId;
  labelKey: string | null;   // 'category.food' etc.; null for user-defined
  label: string;             // used when labelKey is null (user categories)
  chip: string;
  fg: string;
}

export const STATIC_CATEGORIES: Category[] = [
  { id: 'food', labelKey: 'category.food', label: '', chip: '#FFEDD5', fg: '#EA580C' },
  { id: 'transport', labelKey: 'category.transport', label: '', chip: '#DBEAFE', fg: '#2563EB' },
  { id: 'shopping', labelKey: 'category.shopping', label: '', chip: '#EDE9FE', fg: '#7C3AED' },
  { id: 'bills', labelKey: 'category.bills', label: '', chip: '#FEF3C7', fg: '#D97706' },
  { id: 'health', labelKey: 'category.health', label: '', chip: '#CCFBF1', fg: '#0D9488' },
  { id: 'fun', labelKey: 'category.fun', label: '', chip: '#FCE7F3', fg: '#DB2777' },
  { id: 'other', labelKey: 'category.other', label: '', chip: '#F3F4F6', fg: '#6B7280' },
];

/** Key for the income "category" label (used at the display layer). */
export const INCOME_LABEL_KEY = 'category.income';

export function categoryLabel(c: Category): string {
  return c.labelKey ? i18n.t(c.labelKey) : c.label;
}

/**
 * Look up a category by id. Falls back to 'other' if not found.
 * Pass user categories via `extras` when they are relevant to the caller.
 */
export function categoryOf(id: string, extras: Category[] = []): Category {
  const all = [...STATIC_CATEGORIES, ...extras];
  return all.find((c) => c.id === id) ?? STATIC_CATEGORIES[STATIC_CATEGORIES.length - 1];
}
```

- [ ] **Step 2: Update `categories.test.ts`**

Replace the file with tests aligned to the new API:

```ts
import { i18n } from './i18n';
import { categoryLabel, categoryOf, STATIC_CATEGORIES } from './categories';

describe('STATIC_CATEGORIES', () => {
  it('exposes 7 static entries with unique ids', () => {
    expect(STATIC_CATEGORIES).toHaveLength(7);
    const ids = STATIC_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(7);
  });
});

describe('categoryLabel', () => {
  beforeEach(async () => { await i18n.changeLanguage('vi'); });

  it('returns Vietnamese label for static categories', () => {
    const food = STATIC_CATEGORIES.find((c) => c.id === 'food')!;
    expect(categoryLabel(food)).toBe('Ăn uống');
  });

  it('returns user label for custom categories', () => {
    const custom = { id: 'custom_1' as const, labelKey: null, label: 'Gym', chip: '#F3F4F6', fg: '#6B7280' };
    expect(categoryLabel(custom)).toBe('Gym');
  });

  it('switches to English on language change', async () => {
    await i18n.changeLanguage('en');
    const food = STATIC_CATEGORIES.find((c) => c.id === 'food')!;
    expect(categoryLabel(food)).toBe('Food');
    await i18n.changeLanguage('vi');
  });
});

describe('categoryOf', () => {
  it('finds static by id', () => {
    expect(categoryOf('bills').id).toBe('bills');
  });

  it('falls back to other when unknown', () => {
    expect(categoryOf('does-not-exist').id).toBe('other');
  });

  it('finds custom via extras', () => {
    const extras = [
      { id: 'custom_9' as const, labelKey: null, label: 'X', chip: '#F3F4F6', fg: '#6B7280' },
    ];
    expect(categoryOf('custom_9', extras).id).toBe('custom_9');
  });
});
```

- [ ] **Step 3: Update `format.ts` `dayLabel`**

Edit `src/lib/format.ts`. Add import at the top:
```ts
import { i18n } from './i18n';
```

Replace `dayLabel`:
```ts
export function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return i18n.t('day.today');
  if (dateKey === shiftDateKey(todayKey, -1)) return i18n.t('day.yesterday');
  const [, m, d] = dateKey.split('-').map(Number);
  return `${d} Th${m}`;
}
```

Note: the "N ThM" fallback stays as-is; it's a numeric pattern independent of language for now.

- [ ] **Step 4: Update `format.test.ts`**

Add a `beforeEach` in the `dayLabel` describe block (or file-wide):
```ts
import { i18n } from './i18n';

beforeEach(async () => { await i18n.changeLanguage('vi'); });
```

Existing assertions expecting `'Hôm nay'` and `'Hôm qua'` remain valid because we lock to VI.

- [ ] **Step 5: Update `notifications.ts`**

Edit `src/lib/notifications.ts`. Add import:
```ts
import { i18n } from './i18n';
```

Replace `scheduleDailyReminder` body's `content`:
```ts
    content: {
      title: i18n.t('notif.reminder_title'),
      body: i18n.t('notif.reminder_body'),
    },
```

Replace `fireBudgetAlert` body's `content`:
```ts
  await Notifications.scheduleNotificationAsync({
    content: {
      title: level === 100 ? i18n.t('notif.budget_100_title') : i18n.t('notif.budget_80_title'),
      body: level === 100 ? i18n.t('notif.budget_100_body') : i18n.t('notif.budget_80_body'),
    },
    trigger: null,
  });
```

- [ ] **Step 6: Update `notifications.test.ts`**

Add before the first `describe`:
```ts
import { i18n } from './i18n';

beforeAll(async () => { await i18n.changeLanguage('vi'); });
```

The existing assertions (`'Vượt ngân sách!'`, etc.) remain because we lock VI. Verify the mock in `notifications.test.ts` still works — no changes needed to the mock.

- [ ] **Step 7: Update `export.ts`**

Edit `src/lib/export.ts`. Add import:
```ts
import { i18n } from './i18n';
```

Replace the hardcoded `'Xuất SpendLens'`:
```ts
    dialogTitle: i18n.t('export.share_dialog_title'),
```

- [ ] **Step 8: Update `export.test.ts`**

Add before the first `describe`:
```ts
import { i18n } from './i18n';

beforeAll(async () => { await i18n.changeLanguage('vi'); });
```

Existing assertions on 'Ăn uống' at line 20 remain valid — but note that column values from `t.category` still resolve through the header naming which uses static English labels ('Date','Time','Category', etc.). The CSV rows use category **labels** which after this refactor come from `categoryLabel(categoryOf(t.category))`. Update `export.ts` accordingly:

In `src/lib/export.ts`, wherever it maps a row's category to a display string, replace with:
```ts
import { categoryOf, categoryLabel } from './categories';
// ...
const catLabel = categoryLabel(categoryOf(t.category));
```

Verify the test on line 20 (`'2026-07-17,8:00 AM,Ăn uống,"Coffee, Large",6.50,Expense'`) still passes — with VI locked at test time, `categoryLabel` returns `'Ăn uống'` for `'food'`.

- [ ] **Step 9: Update all consumers of `CATEGORIES` and `cat.label`**

Run:
```bash
grep -rn "\bCATEGORIES\b\|categoryOf" src/app src/components
```

For each match, replace:
- `import { CATEGORIES, categoryOf }` → `import { STATIC_CATEGORIES, categoryOf, categoryLabel }`
- `CATEGORIES.map(...)` → `STATIC_CATEGORIES.map(...)`
- `cat.label` in JSX → `categoryLabel(cat)`
- `categoryOf(id).label` → `categoryLabel(categoryOf(id))`

Common files to fix:
- `src/app/entry.tsx`
- `src/app/history.tsx`
- `src/app/home.tsx`
- `src/app/transaction/[id].tsx`
- `src/components/sl/category-chip.tsx`
- `src/components/sl/txn-card.tsx`

- [ ] **Step 10: Run full test suite**

Run: `npm test`

Expected: all suites green. Fix any assertion that broke due to the rename.

- [ ] **Step 11: Type check**

Run: `npx tsc --noEmit`

Expected: no NEW errors introduced by this task. Pre-existing errors from jest-globals baseline may remain.

- [ ] **Step 12: Commit**

```bash
git add src/lib/categories.ts src/lib/categories.test.ts src/lib/format.ts src/lib/format.test.ts src/lib/notifications.ts src/lib/notifications.test.ts src/lib/export.ts src/lib/export.test.ts src/app src/components
git commit -m "Refactor library modules and consumers to use i18n"
```

---

### Task 5: Refactor screens to i18n + add Language segmented row

**Files:**
- Modify: `src/app/settings.tsx` — replace hardcoded strings with `t(...)`; add "NGÔN NGỮ" section with Segmented `[Auto, Tiếng Việt, English]`; wire to `update('language', ...)`
- Modify: `src/app/index.tsx` — camera permission text, note placeholder
- Modify: `src/app/entry.tsx` — labels and placeholders (but NOT yet asterisks or custom cat UI — those come later)
- Modify: `src/app/home.tsx`, `src/app/history.tsx`, `src/app/transaction/[id].tsx` — all Vietnamese literals → `t()`
- Modify: `src/components/sl/date-range-modal.tsx` — labels → `t()` (this component gets replaced by a sheet later; still refactor here for completeness)

**Interfaces:**
- Consumes: `useT` (=`useTranslation`) from `@/lib/i18n`
- Produces: no external API changes

- [ ] **Step 1: Convert `settings.tsx`**

Edit `src/app/settings.tsx`. Add:
```tsx
import { useT } from '@/lib/i18n';
```

Inside the component:
```tsx
const { t } = useT();
```

Replace every hardcoded Vietnamese literal with the corresponding `t('settings.*')` key from the JSON. Examples of replacements:
- `<Stack.Screen options={{ title: 'Cài đặt', ... }}>` → `title: t('settings.title')`
- Section headers `'NGÂN SÁCH'` → `t('settings.section_budget')`, etc.
- Row labels `'Ngân sách tháng'` → `t('settings.budget_row')`
- `'Chưa đặt'` → `t('settings.budget_not_set')`
- Reset alerts:
```tsx
Alert.alert(t('settings.reset_txns_title'), t('settings.reset_txns_body'), [
  { text: t('settings.cancel'), style: 'cancel' },
  { text: t('settings.delete'), style: 'destructive', onPress: () => { ... } },
]);
```
- `THEME_LABELS = ['Auto', 'Sáng', 'Tối']` → derive dynamically: `const themeLabels = [t('settings.theme_auto'), t('settings.theme_light'), t('settings.theme_dark')]`
- Reminder permission alert: `Alert.alert(t('settings.permission_needed_title'), t('settings.permission_needed_body'))`

**Add NGÔN NGỮ section** just above the GIAO DIỆN section:

```tsx
{/* NGÔN NGỮ */}
<Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
  {t('settings.section_language')}
</Text>
<Segmented
  options={[t('settings.language_auto'), t('settings.language_vi'), t('settings.language_en')]}
  value={settings.language === 'auto' ? 0 : settings.language === 'vi' ? 1 : 2}
  onChange={(i) => update('language', (['auto', 'vi', 'en'] as const)[i])}
/>
```

- [ ] **Step 2: Convert `index.tsx` (camera)**

Add `import { useT } from '@/lib/i18n';` and `const { t } = useT();` at the top of `CameraScreen` and inside `CameraPage`.

Replace:
- `'Cần quyền camera để chụp khoản chi'` → `t('camera.permission_needed')`
- `'Đang tải camera…'` → `t('camera.permission_loading')`
- `'Cho phép camera'` → `t('camera.permission_grant')`
- `'VD: Cà phê Highlands'` → `t('camera.note_placeholder')`
- `'Ghi chú'` (noteCardLabel) → `t('camera.note_label')`
- `'Về camera'` (accessibilityLabel) → English-agnostic; leave as-is OR add key `camera.back_a11y`. **Decision: add key `nav.back_to_camera` in both JSON files** — VI: 'Về camera', EN: 'Back to camera'. Update JSON.
- Any `'Hôm nay'` in totalPill text is derived from `t('nav.today')`

**Update JSON files (both vi and en)** to add:
```json
"nav": { "today": "Hôm nay", "back_to_camera": "Về camera" }
```
and EN counterpart.

- [ ] **Step 3: Convert `entry.tsx` labels only (leave form validation for Task 12)**

Add `const { t } = useT();`.

Replace labels and placeholders:
- `'SỐ TIỀN'` → `t('entry.amount_label')`
- `'GHI CHÚ'` → `t('entry.note_label')`
- `'Ngày giờ'` → `t('entry.date_label')`
- `'Cập nhật'` → `t('entry.save_update')`
- `'Lưu khoản chi'` → `t('entry.save_expense')`
- `'Lưu khoản thu'` → `t('entry.save_income')`
- placeholder `'Lương, thưởng…'` → `t('entry.note_placeholder_income')`
- placeholder `'Bún bò Huế · gần công ty'` → `t('entry.note_placeholder_expense')`
- The fallback `'Thu nhập'` inside `payload.name` → `t('category.income')`
- `nowLabel()` returns `Hôm nay · HH:MM` — replace with `\`${t('day.today')} · ${nowTime()}\``. Move `nowLabel` inside the component (so it can call `t`) OR pass `t` as an arg. Simpler: inline the expression at the call site.

- [ ] **Step 4: Convert `home.tsx`, `history.tsx`, `transaction/[id].tsx`**

Run `grep -rn "['\"][A-ZĐ][a-zàáâã]" src/app/home.tsx src/app/history.tsx "src/app/transaction/[id].tsx"` to enumerate Vietnamese strings.

For every hit, add a key to both JSON files under a sensible group (`home.*`, `history.*`, `transaction.*`) and replace with `t(key)`. Reuse existing keys where possible (e.g., `settings.export_row` → 'Xuất CSV' can be reused if history has an "Export" button label).

**Keys to add** to both `vi.json` and `en.json`:
- `history.title` (VI: 'Lịch sử', EN: 'History')
- `history.empty` (VI: 'Chưa có giao dịch', EN: 'No transactions yet')
- Anything else you encounter — commit them all in this step.

- [ ] **Step 5: Convert `date-range-modal.tsx`**

Replace:
- `'Xuất CSV theo khoảng thời gian'` → `t('history.export_range_title')`
- `'Từ'` → `t('history.from')`
- `'Đến'` → `t('history.to')`
- Chip labels `'Tháng này', 'Tháng trước', '3 tháng', 'Toàn bộ'` → `t('history.range_this_month')`, etc.
- `'Huỷ'` → `t('settings.cancel')` (reuse), `'Xuất'` → `t('history.export_button')`

Add all new keys to both JSON files. English translations:
- `history.export_range_title`: "Export CSV by date range"
- `history.from`: "From"
- `history.to`: "To"
- `history.range_this_month`: "This month"
- `history.range_last_month`: "Last month"
- `history.range_three_months`: "3 months"
- `history.range_all`: "All time"
- `history.export_button`: "Export"

- [ ] **Step 6: Grep verify no Vietnamese literals remain**

Run:
```bash
grep -rn "['\"][A-ZĐ][a-zàáâãèéêìíòóôõùúýăĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]" src/app src/components 2>/dev/null | grep -v test | grep -v i18n/locales
```

Expected: **zero output** (except maybe comments — inspect any hit; comments are fine, code literals must be converted).

- [ ] **Step 7: Run full suite**

Run: `npm test`

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/app src/components src/lib/i18n/locales
git commit -m "Refactor screens to i18n + add Language segmented row in Settings"
```

---

### Task 6: Notifications audit + smoke-test checklist

**Files:**
- Read (audit only): `src/lib/notifications.ts`, `src/app/settings.tsx`, `src/app/entry.tsx`, `src/lib/settings.ts`, `src/app/_layout.tsx`
- Fix inline any bug found (produce a small commit per bug, or one combined commit)
- Create: `docs/testing/notifications-smoke-checklist.md`

**Interfaces:**
- Consumes: current notification flow
- Produces: (potentially) small fixes + written smoke checklist doc

- [ ] **Step 1: Audit reads**

Read the five listed files. Look for:
- Missing `await` on async permission or schedule calls
- Race between `budgetNotifiedMonth` write and `fireBudgetAlert` (should already write BEFORE fire per prior fix)
- Whether the schedule survives module reloads and app restarts (SDK 57 default behavior)
- Whether `setNotificationHandler` runs exactly once (it does — module-scoped at import in `notifications.ts`)

- [ ] **Step 2: If bugs found, fix them with unit tests**

If a bug is found:
1. Add a failing unit test in the appropriate `*.test.ts`
2. Fix the code
3. Confirm test passes
4. Commit with message `Fix: <bug summary>`

If no bugs found, note this in the report and proceed to checklist.

- [ ] **Step 3: Write the smoke-test checklist doc**

Create `docs/testing/notifications-smoke-checklist.md` with this content (verbatim):

````markdown
# Notifications Smoke Checklist

Manual verification, on a physical Android or iOS device running the dev build.

## Setup

- Build with `npx expo run:android` (or `run:ios`) after ensuring the dev client is installed.
- Grant notification permission when first prompted.

## Tests

### Test 1 — Daily reminder in foreground
1. Open Settings → NHẮC NHỞ → enable "Nhắc chụp bill cuối ngày"
2. Pick a time 1 minute ahead of the current clock
3. Lock the phone; wait
4. **Expected:** banner appears with title "SpendLens" and body "Ghi lại chi tiêu hôm nay?" (VI) or English equivalents if EN is active

Result: ☐ pass ☐ fail — notes: ___________

### Test 2 — Daily reminder survives kill
1. Repeat Test 1 setup
2. Kill the app process from recent apps
3. Wait for the scheduled time
4. **Expected:** banner appears

Result: ☐ pass ☐ fail — notes: ___________

### Test 3 — Reminder off cancels
1. Enable + pick a time 1 minute ahead
2. Immediately disable the reminder toggle
3. Wait past the scheduled time
4. **Expected:** no notification

Result: ☐ pass ☐ fail — notes: ___________

### Test 4 — Budget alert 80%
1. Settings → Ngân sách tháng → set to 100000
2. Ensure "Cảnh báo vượt ngân sách" is on
3. Create a transaction with amount 80000 (expense)
4. **Expected:** banner "Sắp vượt ngân sách" / "Bạn đã chi hơn 80% ngân sách tháng này."

Result: ☐ pass ☐ fail — notes: ___________

### Test 5 — Budget alert 100%
1. Continuing from Test 4, add another 20000 expense (total 100000)
2. **Expected:** banner "Vượt ngân sách!" / "Bạn đã chi vượt 100% ngân sách tháng này."

Result: ☐ pass ☐ fail — notes: ___________

### Test 6 — Dedup within month
1. Continuing from Test 5, add another 10000 expense
2. **Expected:** no banner (already alerted at 100 this month)

Result: ☐ pass ☐ fail — notes: ___________

### Test 7 — Cross-month reset
1. Change device date to the 1st of next month
2. Add a 90000 expense
3. **Expected:** banner "Sắp vượt ngân sách" (80% reached in a new month, alert flag reset)

Result: ☐ pass ☐ fail — notes: ___________

### Test 8 — Alerts disabled
1. Reset device date. Toggle "Cảnh báo vượt ngân sách" off
2. Add another over-budget expense
3. **Expected:** no banner

Result: ☐ pass ☐ fail — notes: ___________

### Test 9 — Permission denied path
1. Fresh install (or revoke notification permission in system settings)
2. Open Settings → toggle reminder on
3. **Expected:** alert "Cần quyền thông báo" — toggle stays off, no crash

Result: ☐ pass ☐ fail — notes: ___________

## Sign-off

Tester: ______________  Date: ______________
````

- [ ] **Step 4: Commit**

```bash
git add docs/testing/notifications-smoke-checklist.md
# plus any code fixes made in step 2
git commit -m "Add notifications smoke-test checklist (and audit fixes)"
```

---

### Task 7: Camera scroll deceleration slower

**Files:**
- Modify: `src/app/index.tsx` — `FlatList` `decelerationRate`

**Interfaces:**
- Consumes: existing FlatList structure from previous work
- Produces: slower snap physics

- [ ] **Step 1: Change decelerationRate to numeric 0.5**

Edit `src/app/index.tsx`. Find:
```tsx
decelerationRate="normal"
```
Change to:
```tsx
decelerationRate={0.5}
```

- [ ] **Step 2: Manual test**

Run the app on a device or simulator (`npx expo start`), scroll between the camera page and transaction pages. Confirm the deceleration feels perceptibly slower.

If it feels TOO slow (below 250ms per snap), try 0.6 or 0.7 and record the chosen value.

- [ ] **Step 3: Run test suite**

Run: `npm test`

Expected: green (no unit test change).

- [ ] **Step 4: Commit**

```bash
git add src/app/index.tsx
git commit -m "Slow camera FlatList deceleration to 0.5 (numeric)"
```

---

### Task 8: Camera zoom continuity fix

**Files:**
- Modify: `src/app/index.tsx` — move `zoom` state INTO `CameraPage`, memoize `renderItem`, add `.onEnd()` clamp

**Interfaces:**
- Consumes: none new
- Produces: zoom persists between consecutive pinches; only double-tap on the viewfinder resets

- [ ] **Step 1: Move zoom state into CameraPage**

In `src/app/index.tsx`:

Remove `zoom` and `setZoom` state from `CameraScreen`:
```tsx
// DELETE:
// const [zoom, setZoom] = useState(0);
```

Remove `zoom` and `setZoom` from the `CameraPage` prop destructure and from the `CameraPage` component invocation in `renderItem`.

At the top of `CameraPage`, add:
```tsx
const [zoom, setZoom] = useState(0);
```

- [ ] **Step 2: Memoize renderItem in CameraScreen**

Wrap the `renderItem` inline function in `useCallback`:
```tsx
const renderItem = useCallback(({ item }: { item: PageItem }) => {
  if (item.type === 'camera')
    return (
      <CameraPage
        insets={insets}
        permission={permission}
        requestPermission={requestPermission}
        granted={granted}
        facing={facing}
        setFacing={setFacing}
        flash={flash}
        setFlash={setFlash}
        cameraRef={cameraRef}
        capture={capture}
        note={note}
        noteFocused={noteFocused}
        setNote={setNote}
        setNoteFocused={setNoteFocused}
        todayExpense={todayExpense}
      />
    );
  if (item.type === 'empty') return <EmptyTodayCard />;
  return <TxnCard txn={item.txn} />;
}, [insets, permission, requestPermission, granted, facing, flash, note, noteFocused, todayExpense, capture]);
```

Update the FlatList JSX:
```tsx
<FlatList
  ref={flatListRef}
  data={pages}
  keyExtractor={keyExtractor}
  renderItem={renderItem}
  // ...
/>
```

- [ ] **Step 3: Add onEnd clamp to pinch**

Inside `CameraPage`, update the `useMemo` for `cameraGesture`:
```tsx
const cameraGesture = useMemo(() => {
  const pinch = Gesture.Pinch()
    .onStart(() => { initialZoomRef.current = zoomRef.current; })
    .onUpdate((e) => {
      const next = Math.max(0, Math.min(1, initialZoomRef.current + (e.scale - 1) * 0.5));
      runOnJS(setZoom)(next);
    })
    .onEnd(() => {
      // commit final baseline so the next pinch starts from the correct value
      initialZoomRef.current = zoomRef.current;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => { runOnJS(setZoom)(0); });
  return Gesture.Simultaneous(pinch, doubleTap);
}, []);
```

- [ ] **Step 4: Run test suite**

Run: `npm test`

Expected: green.

- [ ] **Step 5: Manual on-device test**

- Pinch to ~0.5 (visible via badge)
- Release fingers
- Pinch again — must start from 0.5, not 0
- Double-tap the viewfinder — resets to 0 (badge disappears)
- Double-tap the CAPTURE area — must NOT reset (gesture is only bound on the CameraView)

If any check fails, investigate and stop. Do not commit a broken fix.

- [ ] **Step 6: Commit**

```bash
git add src/app/index.tsx
git commit -m "Fix camera zoom continuity — local state + memoized renderItem + onEnd clamp"
```

---

### Task 9: Camera note tap zone permission gate

**Files:**
- Modify: `src/app/index.tsx` — gate `noteTapZone`, `notePreview`, note overlay, `Shutter`, `flip` behind `granted`

**Interfaces:**
- Consumes: `granted` prop already threaded through `CameraPage`
- Produces: cleaner permission-denied UX

- [ ] **Step 1: Gate note UI on granted**

In `CameraPage`, wrap the note tap zone + preview + focused-input overlay in `{granted && (...)}`:

Change:
```tsx
<Pressable
  style={styles.noteTapZone}
  onPress={() => setNoteFocused(true)}
  pointerEvents={noteFocused ? 'none' : 'auto'}
/>

{note && !noteFocused ? (
  <Pressable style={styles.notePreview} onPress={() => setNoteFocused(true)}>
    <Icon name="edit" size={12} color="rgba(255,255,255,0.85)" />
    <Text numberOfLines={1} style={styles.notePreviewText}>{note}</Text>
  </Pressable>
) : null}
```

Wrap:
```tsx
{granted && (
  <>
    <Pressable
      style={styles.noteTapZone}
      onPress={() => setNoteFocused(true)}
      pointerEvents={noteFocused ? 'none' : 'auto'}
    />

    {note && !noteFocused ? (
      <Pressable style={styles.notePreview} onPress={() => setNoteFocused(true)}>
        <Icon name="edit" size={12} color="rgba(255,255,255,0.85)" />
        <Text numberOfLines={1} style={styles.notePreviewText}>{note}</Text>
      </Pressable>
    ) : null}
  </>
)}
```

Same gate for the `noteFocused && (<KeyboardAvoidingView ...>)` overlay at the bottom of the component — wrap in `granted && noteFocused && (...)`.

- [ ] **Step 2: Gate shutter and flip when not granted**

Change the capture row so `Shutter` and the flip button don't render:

```tsx
{granted ? (
  <View style={styles.captureRow}>
    <View style={styles.sideSlot} />
    <Shutter onPress={capture} />
    <Pressable
      style={[styles.sideSlot, styles.circleBtn]}
      onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
      <Icon name="flip" size={22} color="#fff" />
    </Pressable>
  </View>
) : (
  <View style={styles.captureRow} />
)}
```

Chevron below can remain (harmless hint).

- [ ] **Step 3: Run test suite**

Run: `npm test`

Expected: green.

- [ ] **Step 4: Manual on-device test**

- Fresh install → deny permission → tapping the viewfinder area does NOT open the keyboard
- Shutter is not visible; flip button is not visible
- Grant permission → all three (tap zone, shutter, flip) reappear

- [ ] **Step 5: Commit**

```bash
git add src/app/index.tsx
git commit -m "Gate camera note tap zone and controls behind permission grant"
```

---

### Task 10: Install `@gorhom/bottom-sheet` + root wiring

**Files:**
- Modify: `package.json` (via install)
- Modify: `src/app/_layout.tsx` — wrap providers with `<BottomSheetModalProvider>`

**Interfaces:**
- Consumes: existing `GestureHandlerRootView` + reanimated setup
- Produces: `BottomSheetModal` usable anywhere in the component tree

- [ ] **Step 1: Install**

Run:
```bash
npm install @gorhom/bottom-sheet
```

Verify version resolves to `^5.x` (compatible with reanimated 4).

- [ ] **Step 2: Wrap providers**

Edit `src/app/_layout.tsx`. Import:
```tsx
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
```

Change the root wrapper:
```tsx
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <BottomSheetModalProvider>
        <SettingsProvider>
          <TransactionsProvider>
            <ThemedShell scheme={scheme} />
          </TransactionsProvider>
        </SettingsProvider>
      </BottomSheetModalProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);
```

- [ ] **Step 3: Run test suite**

Run: `npm test`

Expected: green. If tests fail because `@gorhom/bottom-sheet` isn't mocked in jest-expo, add a lightweight jest mock in `jest.setup.js` (or create one if it doesn't exist):

```js
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Passthrough = ({ children }) => React.createElement(View, null, children);
  return {
    BottomSheetModal: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ present: () => {}, dismiss: () => {} }));
      return React.createElement(View, null, props.children);
    }),
    BottomSheetView: Passthrough,
    BottomSheetModalProvider: Passthrough,
    BottomSheetTextInput: (props) => React.createElement(require('react-native').TextInput, props),
    BottomSheetBackdrop: () => null,
  };
});
```

Wire this in `jest-expo` preset via `package.json > jest.setupFilesAfterEach` if not already; otherwise place the mock at the top of any test file that imports a sheet.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app/_layout.tsx jest.setup.js
git commit -m "Install @gorhom/bottom-sheet + wrap root with BottomSheetModalProvider"
```

---

### Task 11: Migrate DateRangeModal → DateRangeSheet

**Files:**
- Create: `src/components/sl/date-range-sheet.tsx`
- Delete: `src/components/sl/date-range-modal.tsx`
- Modify: `src/app/settings.tsx` — swap import + call site to ref-based `present()`
- Modify: `src/app/history.tsx` — same swap

**Interfaces:**
- Consumes: `BottomSheetModal` from `@gorhom/bottom-sheet`
- Produces:
  - `DateRangeSheetHandle { present(): void; dismiss(): void }`
  - `<DateRangeSheet ref initialFrom initialTo onExport />`

- [ ] **Step 1: Create the sheet component**

Create `src/components/sl/date-range-sheet.tsx`:

```tsx
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { shiftDateKey, toDateKey } from '@/lib/format';

export interface DateRangeSheetHandle {
  present: () => void;
  dismiss: () => void;
}

interface Props {
  initialFrom: string;
  initialTo: string;
  onExport: (from: string, to: string) => void;
}

type Quick = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all';

function firstOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, 1));
}

export const DateRangeSheet = forwardRef<DateRangeSheetHandle, Props>(
  function DateRangeSheet({ initialFrom, initialTo, onExport }, ref) {
    const { t } = useT();
    const colors = useColors();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(initialTo);
    const [picker, setPicker] = useState<'from' | 'to' | null>(null);

    useImperativeHandle(ref, () => ({
      present: () => {
        setFrom(initialFrom);
        setTo(initialTo);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const snapPoints = useMemo(() => ['60%'], []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const applyQuick = (q: Quick) => {
      const today = toDateKey(new Date());
      if (q === 'thisMonth') { setFrom(firstOfMonth(today)); setTo(today); }
      else if (q === 'lastMonth') {
        const [y, m] = today.split('-').map(Number);
        setFrom(toDateKey(new Date(y, m - 2, 1)));
        setTo(toDateKey(new Date(y, m - 1, 0)));
      }
      else if (q === 'threeMonths') { setFrom(shiftDateKey(today, -90)); setTo(today); }
      else { setFrom('2000-01-01'); setTo(today); }
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.bg }}
      >
        <BottomSheetView style={[styles.body, { backgroundColor: colors.bg }]}>
          <Text style={{ fontWeight: '700', color: colors.text, fontSize: 18 }}>
            {t('history.export_range_title')}
          </Text>

          <View style={styles.row}>
            <Pressable style={[styles.field, { borderColor: colors.hairline }]} onPress={() => setPicker('from')}>
              <Text style={{ fontWeight: '500', color: colors.textSecondary }}>{t('history.from')}</Text>
              <Text style={{ fontWeight: '600', color: colors.text }}>{from}</Text>
            </Pressable>
            <Pressable style={[styles.field, { borderColor: colors.hairline }]} onPress={() => setPicker('to')}>
              <Text style={{ fontWeight: '500', color: colors.textSecondary }}>{t('history.to')}</Text>
              <Text style={{ fontWeight: '600', color: colors.text }}>{to}</Text>
            </Pressable>
          </View>

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

          {picker !== null && (
            <DateTimePicker
              value={new Date(picker === 'from' ? from : to)}
              mode="date"
              onChange={(_, d) => {
                const current = picker;
                setPicker(null);
                if (!d) return;
                const k = toDateKey(d);
                if (current === 'from') setFrom(k); else setTo(k);
              }}
            />
          )}

          <View style={styles.actions}>
            <Pressable onPress={() => sheetRef.current?.dismiss()} style={styles.cancel}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{t('settings.cancel')}</Text>
            </Pressable>
            <GradientButton label={t('history.export_button')} onPress={() => { onExport(from, to); sheetRef.current?.dismiss(); }} />
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, padding: 12, borderWidth: 1, borderRadius: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  cancel: { padding: 12 },
});
```

- [ ] **Step 2: Swap consumers**

Edit `src/app/settings.tsx`:

Replace:
```tsx
import { DateRangeModal } from '@/components/sl/date-range-modal';
// ...
const [exportOpen, setExportOpen] = useState(false);
```
with:
```tsx
import { DateRangeSheet, type DateRangeSheetHandle } from '@/components/sl/date-range-sheet';
// ...
const exportSheetRef = useRef<DateRangeSheetHandle>(null);
```

Replace the `Pressable` that opens export:
```tsx
onPress={() => exportSheetRef.current?.present()}
```

Replace `<DateRangeModal visible={exportOpen} ... />` with:
```tsx
<DateRangeSheet
  ref={exportSheetRef}
  initialFrom={toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
  initialTo={toDateKey(new Date())}
  onExport={async (from, to) => {
    const filtered = transactions.filter((t) => t.date >= from && t.date <= to);
    await exportAndShareCsv(filtered);
  }}
/>
```

Repeat the equivalent swap in `src/app/history.tsx`.

- [ ] **Step 3: Delete old modal**

```bash
rm src/components/sl/date-range-modal.tsx
```

- [ ] **Step 4: Run test suite**

Run: `npm test`

Expected: green. Fix any test that imported `DateRangeModal`.

- [ ] **Step 5: Manual sanity check**

Boot the app, open Settings → Xuất CSV → verify sheet slides up, backdrop dims background, drag-down closes it, tapping "Xuất" exports and closes.

- [ ] **Step 6: Commit**

```bash
git add src/components/sl/date-range-sheet.tsx src/app/settings.tsx src/app/history.tsx
git rm src/components/sl/date-range-modal.tsx
git commit -m "Migrate DateRangeModal to DateRangeSheet using @gorhom/bottom-sheet"
```

---

### Task 12: Migrate Budget keypad Modal → BudgetSheet

**Files:**
- Create: `src/components/sl/budget-sheet.tsx`
- Modify: `src/app/settings.tsx` — replace inline `<Modal>` with `<BudgetSheet ref />`

**Interfaces:**
- Consumes: `BottomSheetModal`, `BottomSheetTextInput`
- Produces:
  - `BudgetSheetHandle { present(initial: number): void; dismiss(): void }`
  - `<BudgetSheet ref onSave={(n: number) => void} />`

- [ ] **Step 1: Create the sheet component**

Create `src/components/sl/budget-sheet.tsx`:

```tsx
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { formatVND } from '@/lib/format';
import { useT } from '@/lib/i18n';

export interface BudgetSheetHandle {
  present: (initial: number) => void;
  dismiss: () => void;
}

interface Props {
  onSave: (amount: number) => void;
}

export const BudgetSheet = forwardRef<BudgetSheetHandle, Props>(
  function BudgetSheet({ onSave }, ref) {
    const { t } = useT();
    const colors = useColors();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [draft, setDraft] = useState('');

    useImperativeHandle(ref, () => ({
      present: (initial) => {
        setDraft(initial > 0 ? String(initial) : '');
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const save = () => {
      const n = Number(draft.replace(/\D/g, '')) || 0;
      onSave(n);
      sheetRef.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
      >
        <BottomSheetView style={styles.body}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{t('settings.budget_row')}</Text>
          <BottomSheetTextInput
            value={draft}
            onChangeText={(t) => setDraft(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.hairline }]}
          />
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
            {formatVND(Number(draft) || 0)}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => sheetRef.current?.dismiss()} style={{ padding: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{t('settings.cancel')}</Text>
            </Pressable>
            <GradientButton label={t('settings.save')} onPress={save} />
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 32 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
});
```

- [ ] **Step 2: Wire from settings.tsx**

Edit `src/app/settings.tsx`. Add:
```tsx
import { BudgetSheet, type BudgetSheetHandle } from '@/components/sl/budget-sheet';
// ...
const budgetSheetRef = useRef<BudgetSheetHandle>(null);
```

Remove `budgetOpen`, `budgetDraft`, `openBudget`, `saveBudget` state.

Replace the budget row `onPress`:
```tsx
onPress={() => budgetSheetRef.current?.present(settings.monthlyBudget)}
```

Remove the entire inline `<Modal>` block for the budget keypad. Add near the other sheet mount:
```tsx
<BudgetSheet
  ref={budgetSheetRef}
  onSave={(n) => update('monthlyBudget', n)}
/>
```

- [ ] **Step 3: Run test suite**

Run: `npm test`

Expected: green.

- [ ] **Step 4: Manual sanity check**

Open Settings → tap "Ngân sách tháng" → sheet slides up, keyboard opens without covering the input, tapping "Lưu" saves and dismisses.

- [ ] **Step 5: Commit**

```bash
git add src/components/sl/budget-sheet.tsx src/app/settings.tsx
git commit -m "Migrate Budget keypad Modal to BudgetSheet using @gorhom/bottom-sheet"
```

---

### Task 13: user-categories module + SQLite table

**Files:**
- Modify: `src/lib/db.ts` — add `categories` table to `SCHEMA`
- Create: `src/lib/user-categories.ts`
- Create: `src/lib/user-categories.test.ts`

**Interfaces:**
- Consumes: `SQLiteDatabase` from `expo-sqlite`, `db` from `./db`
- Produces:
  - `interface UserCategory { id: CustomCategoryId; label: string; createdAt: number }`
  - `listUserCategories(db?: SQLiteDatabase): UserCategory[]`
  - `insertUserCategory(label: string, db?: SQLiteDatabase): UserCategory`
  - `deleteUserCategory(id: string, db?: SQLiteDatabase): void`
  - `resetUserCategories(db?: SQLiteDatabase): void`
  - `toCategoryObj(uc: UserCategory): Category` — converts a `UserCategory` to the unified `Category` shape (chip/fg = same as static 'other')

- [ ] **Step 1: Extend SCHEMA**

Edit `src/lib/db.ts`. Extend the SCHEMA template — the existing schema stays intact, add the `categories` block at the end:

```ts
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    note TEXT,
    amount REAL NOT NULL,
    is_income INTEGER NOT NULL DEFAULT 0,
    photo_path TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
`;
```

- [ ] **Step 2: Failing test — insert + list + delete**

Create `src/lib/user-categories.test.ts`:

```ts
import { createDb } from './db';
import {
  deleteUserCategory,
  insertUserCategory,
  listUserCategories,
  resetUserCategories,
} from './user-categories';

function freshDb() {
  return createDb(`:memory:-${Math.random()}`);
}

describe('user-categories', () => {
  it('list is empty on fresh db', () => {
    expect(listUserCategories(freshDb())).toEqual([]);
  });

  it('insert then list returns one row with generated id', () => {
    const d = freshDb();
    const uc = insertUserCategory('Gym', d);
    expect(uc.label).toBe('Gym');
    expect(uc.id).toMatch(/^custom_/);
    expect(listUserCategories(d)).toEqual([uc]);
  });

  it('rejects empty or whitespace-only label', () => {
    const d = freshDb();
    expect(() => insertUserCategory('   ', d)).toThrow();
    expect(() => insertUserCategory('', d)).toThrow();
  });

  it('trims whitespace around label', () => {
    const d = freshDb();
    const uc = insertUserCategory('  Coffee  ', d);
    expect(uc.label).toBe('Coffee');
  });

  it('unique constraint: inserting duplicate label throws', () => {
    const d = freshDb();
    insertUserCategory('Gym', d);
    expect(() => insertUserCategory('Gym', d)).toThrow();
  });

  it('delete removes by id', () => {
    const d = freshDb();
    const uc = insertUserCategory('Gym', d);
    deleteUserCategory(uc.id, d);
    expect(listUserCategories(d)).toEqual([]);
  });

  it('resetUserCategories wipes the table', () => {
    const d = freshDb();
    insertUserCategory('A', d);
    insertUserCategory('B', d);
    resetUserCategories(d);
    expect(listUserCategories(d)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test — expect fail**

Run: `npm test -- user-categories.test`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `user-categories.ts`**

Create `src/lib/user-categories.ts`:

```ts
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Category, CustomCategoryId } from './categories';
import { db as defaultDb } from './db';

export interface UserCategory {
  id: CustomCategoryId;
  label: string;
  createdAt: number;
}

type Row = { id: string; label: string; created_at: number };

export function listUserCategories(database: SQLiteDatabase = defaultDb): UserCategory[] {
  const rows = database.getAllSync<Row>(
    'SELECT id, label, created_at FROM categories ORDER BY created_at ASC',
  );
  return rows.map((r) => ({
    id: r.id as CustomCategoryId,
    label: r.label,
    createdAt: r.created_at,
  }));
}

export function insertUserCategory(
  label: string,
  database: SQLiteDatabase = defaultDb,
): UserCategory {
  const trimmed = label.trim();
  if (!trimmed) throw new Error('label required');
  const id: CustomCategoryId = `custom_${Date.now()}`;
  const createdAt = Date.now();
  database.runSync(
    'INSERT INTO categories (id, label, created_at) VALUES (?, ?, ?)',
    id,
    trimmed,
    createdAt,
  );
  return { id, label: trimmed, createdAt };
}

export function deleteUserCategory(id: string, database: SQLiteDatabase = defaultDb): void {
  database.runSync('DELETE FROM categories WHERE id = ?', id);
}

export function resetUserCategories(database: SQLiteDatabase = defaultDb): void {
  database.runSync('DELETE FROM categories');
}

/** Convert a UserCategory to the unified Category shape used by chips. */
export function toCategoryObj(uc: UserCategory): Category {
  return {
    id: uc.id,
    labelKey: null,
    label: uc.label,
    chip: '#F3F4F6',
    fg: '#6B7280',
  };
}
```

- [ ] **Step 5: Run test — expect pass**

Run: `npm test -- user-categories.test`

Expected: PASS (7 assertions).

- [ ] **Step 6: Full suite**

Run: `npm test`

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/user-categories.ts src/lib/user-categories.test.ts
git commit -m "Add user-categories SQLite module (CRUD + reset + toCategoryObj)"
```

---

### Task 14: Entry form validation (asterisks + disabled Save)

**Files:**
- Modify: `src/app/entry.tsx` — add asterisk suffix on labels, compute `canSave`, wire to `GradientButton disabled`

**Interfaces:**
- Consumes: existing `useT`, existing `note`/`amount` state
- Produces: no external API changes

- [ ] **Step 1: Add asterisk to labels**

Edit `src/app/entry.tsx`. Locate the amount label:

```tsx
<Text style={{ fontSize: 12, fontWeight: W.semibold, color: c.textSecondary, letterSpacing: 0.3 }}>
  {t('entry.amount_label')}
</Text>
```

Replace with:
```tsx
<Text style={{ fontSize: 12, fontWeight: W.semibold, color: c.textSecondary, letterSpacing: 0.3 }}>
  {t('entry.amount_label')} <Text style={{ color: '#FB5B4D' }}>*</Text>
</Text>
```

Locate the note label:
```tsx
<Text style={{ fontSize: 11, fontWeight: W.bold, color: c.textSecondary, marginBottom: 3 }}>
  {t('entry.note_label')}
</Text>
```

Replace with:
```tsx
<Text style={{ fontSize: 11, fontWeight: W.bold, color: c.textSecondary, marginBottom: 3 }}>
  {t('entry.note_label')} <Text style={{ color: '#FB5B4D' }}>*</Text>
</Text>
```

- [ ] **Step 2: Compute canSave and disable button**

Just above the `return`:

```tsx
const canSave = amount > 0 && note.trim() !== '';
```

Update the save guard at the top of `save` from `if (amount <= 0) return;` to:
```tsx
if (!canSave) return;
```

Update the `GradientButton`:
```tsx
<GradientButton
  label={editing ? t('entry.save_update') : isIncome ? t('entry.save_income') : t('entry.save_expense')}
  onPress={save}
  disabled={!canSave}
  colors={isIncome ? (['#34C79A', '#1FA07A'] as const) : undefined}
  style={{ marginTop: 20, marginBottom: insets.bottom + 12 }}
/>
```

- [ ] **Step 3: Update `payload.name` to use trimmed note (no fallback)**

Since note is now required, the fallback expression `note.trim() || (isIncome ? 'Thu nhập' : categoryOf(category).label)` is no longer reachable. Simplify:

```tsx
const payload: NewTxn = {
  // ...
  name: note.trim(),
  // ...
};
```

- [ ] **Step 4: Run test suite**

Run: `npm test`

Expected: green.

- [ ] **Step 5: Manual smoke test**

- Open entry with 0 amount + empty note → Save button gray, disabled
- Type an amount → still gray (note empty)
- Type a note → button colored, enabled
- Clear note → button gray again
- Save works when both filled

- [ ] **Step 6: Commit**

```bash
git add src/app/entry.tsx
git commit -m "Entry form validation: asterisks + disabled Save until amount and note valid"
```

---

### Task 15: Entry custom category chips + inline input + long-press delete + Reset wipe

**Files:**
- Modify: `src/app/entry.tsx` — load user categories, render chips, inline input on "Khác" select, long-press delete, auto-create on save when needed
- Modify: `src/app/settings.tsx` — reset handler wipes user categories

**Interfaces:**
- Consumes: `listUserCategories`, `insertUserCategory`, `deleteUserCategory`, `resetUserCategories`, `toCategoryObj` from Task 13
- Produces: no external API changes

- [ ] **Step 1: Load user categories on entry mount**

In `src/app/entry.tsx`, add:

```tsx
import { deleteUserCategory, insertUserCategory, listUserCategories, toCategoryObj } from '@/lib/user-categories';
import type { UserCategory } from '@/lib/user-categories';
```

Inside `EntryScreen`:
```tsx
const [userCategories, setUserCategories] = useState<UserCategory[]>(() => listUserCategories());
const [customInput, setCustomInput] = useState('');

function refreshUserCategories() {
  setUserCategories(listUserCategories());
}
```

- [ ] **Step 2: Render user category chips**

Replace the chips block:
```tsx
{!isIncome ? (
  <View style={styles.chips}>
    {STATIC_CATEGORIES.map((cat) => (
      <CategoryChip key={cat.id} category={cat} selected={category === cat.id} onPress={() => setCategory(cat.id)} />
    ))}
  </View>
) : null}
```

With:
```tsx
{!isIncome ? (
  <>
    <View style={styles.chips}>
      {STATIC_CATEGORIES.map((cat) => (
        <CategoryChip
          key={cat.id}
          category={cat}
          selected={category === cat.id}
          onPress={() => setCategory(cat.id)}
        />
      ))}
      {userCategories.map((uc) => {
        const cat = toCategoryObj(uc);
        return (
          <Pressable
            key={cat.id}
            onLongPress={() => confirmDeleteUserCategory(uc)}
            delayLongPress={500}
          >
            <CategoryChip
              category={cat}
              selected={category === cat.id}
              onPress={() => setCategory(cat.id)}
            />
          </Pressable>
        );
      })}
    </View>

    {category === 'other' && (
      <View style={[styles.field, { backgroundColor: c.card, borderColor: c.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <TextInput
          value={customInput}
          onChangeText={setCustomInput}
          placeholder={t('entry.custom_category_placeholder')}
          placeholderTextColor={c.textSecondary}
          style={{ flex: 1, fontSize: 14, color: c.text, padding: 0 }}
        />
        <Pressable onPress={tryAddCustomCategory} disabled={customInput.trim() === ''}>
          <Icon name="check" size={20} color={customInput.trim() === '' ? c.textSecondary : c.text} />
        </Pressable>
      </View>
    )}
  </>
) : null}
```

Add helper functions inside the component:
```tsx
function tryAddCustomCategory() {
  const name = customInput.trim();
  if (!name) return;
  try {
    const uc = insertUserCategory(name);
    setUserCategories((prev) => [...prev, uc]);
    setCategory(uc.id);
    setCustomInput('');
  } catch (err) {
    console.warn('Failed to add category', err);
  }
}

function confirmDeleteUserCategory(uc: UserCategory) {
  Alert.alert(
    t('entry.custom_category_delete_title'),
    t('entry.custom_category_delete_body'),
    [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: () => {
          deleteUserCategory(uc.id);
          setUserCategories((prev) => prev.filter((c) => c.id !== uc.id));
          if (category === uc.id) setCategory('food');
        },
      },
    ],
  );
}
```

Import `Alert` from `react-native` if not already; `Icon` from `@/components/sl/icons`.

**Add `check` icon** to `src/components/sl/icons.tsx`. The current union at line 3-17 does NOT include `'check'`. Add it:

Extend the union:
```tsx
export type IconName =
  | 'home'
  | 'menu'
  | 'back'
  | 'grid'
  | 'close'
  | 'edit'
  | 'plus'
  | 'arrow-up'
  | 'flip'
  | 'flash'
  | 'flash-off'
  | 'settings'
  | 'share'
  | 'camera'
  | 'check';
```

Add a rendering case inside the `<Svg>` block (place near the other simple paths):
```tsx
{name === 'check' && <Path d="M5 12l4 4 10-10" {...p} strokeWidth={2.2} />}
```

- [ ] **Step 3: Auto-create category on Save when custom input has text**

Update the `save` function so that if `category === 'other'` and `customInput.trim() !== ''`, it creates the category first and uses the new id:

```tsx
const save = async () => {
  if (!canSave) return;
  let effectiveCategory: CategoryId = isIncome ? 'other' : category;
  if (!isIncome && category === 'other' && customInput.trim() !== '') {
    try {
      const uc = insertUserCategory(customInput.trim());
      setUserCategories((prev) => [...prev, uc]);
      effectiveCategory = uc.id;
    } catch (err) {
      // duplicate label: find existing and use its id
      const existing = listUserCategories().find((c) => c.label === customInput.trim());
      if (existing) effectiveCategory = existing.id;
      else console.warn('Failed to auto-create category', err);
    }
  }

  const payload: NewTxn = {
    date: editing && existing ? existing.date : toDateKey(new Date()),
    time: editing && existing ? existing.time : nowTime(),
    category: effectiveCategory,
    name: note.trim(),
    note: null,
    amount,
    isIncome,
    photoPath: photoUri ?? null,
  };
  // ... rest of save unchanged
};
```

Note: `existing` (from user-categories) shadows the `existing` (from useMemo of `getById`). Rename the shadowing local variable to `existingUC`:
```tsx
const existingUC = listUserCategories().find((c) => c.label === customInput.trim());
if (existingUC) effectiveCategory = existingUC.id;
```

- [ ] **Step 4: Wire settings reset to also clear user categories**

Edit `src/app/settings.tsx`. Import:
```tsx
import { resetUserCategories } from '@/lib/user-categories';
```

Inside the "Reset về mặc định" alert's `onPress`, add the wipe call:
```tsx
onPress: async () => {
  resetTransactions();
  resetUserCategories();
  reset();
  await cancelDailyReminder();
  refresh();
},
```

- [ ] **Step 5: Run test suite**

Run: `npm test`

Expected: green.

- [ ] **Step 6: Manual smoke test**

- Open Entry, tap "Khác" chip → custom input appears
- Type "Gym" → tap check → new chip "Gym" appears at end of chips row, `Gym` is selected, custom input clears
- Reopen Entry → "Gym" chip persists
- Long-press "Gym" chip → confirm delete → chip disappears, selection resets
- Type "Yoga" in custom input → tap "Lưu khoản chi" without tapping check → transaction saves and "Yoga" chip appears on reopen (auto-create)
- Settings → "Reset về mặc định" → all custom categories gone

- [ ] **Step 7: Commit**

```bash
git add src/app/entry.tsx src/app/settings.tsx src/components/sl/icons.tsx
git commit -m "Entry custom categories: chips + inline input + long-press delete + reset wipe"
```

---

### Task 16: Entry date/time picker

**Files:**
- Modify: `src/app/entry.tsx` — replace static date row with tappable picker; support iOS `datetime` mode and Android sequential mode

**Interfaces:**
- Consumes: `@react-native-community/datetimepicker`
- Produces: entry writes `date`, `time`, `createdAt` from user-picked `selectedDate`

- [ ] **Step 1: Add state and helpers**

In `src/app/entry.tsx`:

```tsx
const initialSelected = editing && existing
  ? new Date(existing.createdAt)
  : new Date();
const [selectedDate, setSelectedDate] = useState<Date>(initialSelected);
const [pickerStep, setPickerStep] = useState<'idle' | 'date' | 'time' | 'datetime'>('idle');
```

Helper for HH:MM formatting:
```tsx
function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Replace static date row with tappable + picker**

Locate:
```tsx
<View style={[styles.dateRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
  <Text style={{ fontSize: 13, fontWeight: W.semibold, color: c.textSecondary }}>Ngày giờ</Text>
  <Text style={{ fontSize: 14, fontWeight: W.bold, color: c.text }}>
    {editing && existing ? `${dayLabel(existing.date, toDateKey(new Date()))} · ${existing.time}` : nowLabel()}
  </Text>
</View>
```

Replace with:
```tsx
<Pressable
  style={[styles.dateRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}
  onPress={() => setPickerStep(Platform.OS === 'ios' ? 'datetime' : 'date')}
>
  <Text style={{ fontSize: 13, fontWeight: W.semibold, color: c.textSecondary }}>{t('entry.date_label')}</Text>
  <Text style={{ fontSize: 14, fontWeight: W.bold, color: c.text }}>
    {`${dayLabel(toDateKey(selectedDate), toDateKey(new Date()))} · ${formatHHMM(selectedDate)}`}
  </Text>
</Pressable>

{pickerStep === 'datetime' && (
  <DateTimePicker
    value={selectedDate}
    mode="datetime"
    onChange={(_, d) => {
      setPickerStep('idle');
      if (d) setSelectedDate(d);
    }}
  />
)}
{pickerStep === 'date' && (
  <DateTimePicker
    value={selectedDate}
    mode="date"
    onChange={(_, d) => {
      if (!d) { setPickerStep('idle'); return; }
      const merged = new Date(d);
      merged.setHours(selectedDate.getHours(), selectedDate.getMinutes());
      setSelectedDate(merged);
      setPickerStep('time');
    }}
  />
)}
{pickerStep === 'time' && (
  <DateTimePicker
    value={selectedDate}
    mode="time"
    is24Hour
    onChange={(_, d) => {
      setPickerStep('idle');
      if (!d) return;
      const merged = new Date(selectedDate);
      merged.setHours(d.getHours(), d.getMinutes());
      setSelectedDate(merged);
    }}
  />
)}
```

Add import at top:
```tsx
import DateTimePicker from '@react-native-community/datetimepicker';
```

- [ ] **Step 3: Use selectedDate in save payload**

Update the `payload` construction in `save`:
```tsx
const payload: NewTxn = {
  date: editing && existing ? existing.date : toDateKey(selectedDate),
  time: editing && existing ? existing.time : formatHHMM(selectedDate),
  createdAt: editing && existing ? existing.createdAt : selectedDate.getTime(),
  category: effectiveCategory,
  name: note.trim(),
  note: null,
  amount,
  isIncome,
  photoPath: photoUri ?? null,
};
```

**Note:** `NewTxn.createdAt?: number` already exists in `src/lib/transactions.ts:32`, and `insertTransaction` already uses `input.createdAt ?? Date.now()` at line 80. No changes to the transactions module are needed for this task.

- [ ] **Step 4: Remove the old `nowLabel` helper**

If `nowLabel` is no longer referenced, delete it. Same for `nowTime` if `formatHHMM(selectedDate)` fully replaces it.

- [ ] **Step 5: Run test suite**

Run: `npm test`

Expected: green.

- [ ] **Step 6: Manual smoke test — iOS**

Tap "Ngày giờ" row → single `datetime` picker → pick a past date + time → row updates → Save creates a transaction dated on the picked date/time (verify in Lịch sử).

- [ ] **Step 7: Manual smoke test — Android**

Tap "Ngày giờ" row → date picker → pick → time picker → pick → row updates → Save creates a transaction dated correctly.

- [ ] **Step 8: Commit**

```bash
git add src/app/entry.tsx
git commit -m "Entry date/time picker: iOS datetime + Android sequential"
```

---

## Post-tasks checklist

Once all 16 tasks are complete:

- [ ] `npm test` — all green
- [ ] `npx tsc --noEmit` — no new errors (pre-existing @types/jest baseline OK)
- [ ] Grep verify no Vietnamese literals outside `src/lib/i18n/locales`:
  ```bash
  grep -rn "['\"][A-ZĐ][a-zàáâãèéêìíòóôõùúýăĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]" src/app src/components src/lib | grep -v test | grep -v i18n/locales
  ```
  Expected: 0 hits.
- [ ] Fresh install shows empty state (no seed)
- [ ] Language toggle: VI → EN swaps every visible string without app restart
- [ ] `docs/testing/notifications-smoke-checklist.md` exists and is ready for manual QA
- [ ] Camera: zoom persists, permission gates the note zone, scroll feels slower
- [ ] Entry: asterisks visible, Save disabled until valid, custom categories persist, date/time picker works iOS + Android
- [ ] Bottom sheets: both open/close smoothly with keyboard support
