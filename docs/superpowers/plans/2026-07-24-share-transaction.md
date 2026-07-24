# Share Transaction to Social Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users share a transaction's photo (plus optional date/time, amount, category, name baked into the image) to Instagram/Facebook Story or any other app, via a share button on `TxnCard` (camera screen swipe-up feed) and on the transaction detail screen.

**Architecture:** A new pure module (`src/lib/share-transaction.ts`) builds the toggle-able overlay text and wraps the OS share hand-off. A new `ShareSheet` component (`src/components/sl/share-sheet.tsx`, following the existing `BudgetSheet`/`DateRangeSheet` forwardRef-handle pattern) renders a `BottomSheetModal` with a live 9:16 preview wrapped in `ViewShot`, captures it to a PNG on demand, and hands it to `react-native-share`'s generic `Share.open()`. Two call sites (`TxnCard`, transaction detail screen) each get a share button that calls `shareSheetRef.current.present(txn)`.

**Tech Stack:** React Native 0.86 / Expo SDK 57, `react-native-share` (OS share sheet), `react-native-view-shot` (View → PNG capture), `@gorhom/bottom-sheet` (already used for sheets), `expo-image` / `expo-linear-gradient` (already used for photo overlays), `jest-expo` + `@testing-library/react-native` for tests.

## Global Constraints

- Expo SDK is pinned to `~57.0.x` project-wide (see `package.json`) — check https://docs.expo.dev/versions/v57.0.0/ before writing any code that touches Expo APIs (per `AGENTS.md`).
- Every user-facing string goes through `i18n` — add matching keys to **both** `src/lib/i18n/locales/vi.json` and `en.json` in the same task.
- New sheet components follow the existing `forwardRef<Handle, Props>` pattern (`present`/`dismiss` imperative handle) used by `BudgetSheet` and `DateRangeSheet` — do not introduce a different sheet API style.
- Colors come from `useColors()` (`@/constants/tokens`) except inside the dark camera/photo-overlay surfaces, which already use raw `rgba(...)` literals matching `TxnCard`/`index.tsx` — follow whichever convention the surrounding code already uses in that file.
- `react-native-share` and `react-native-view-shot` are native modules; this project builds a custom dev client (`expo-dev-client` already a dependency), so no Expo config plugin is needed for either — a dev client rebuild picks them up via autolinking.
- TDD: write the failing test before the implementation for every task that has automated tests (Tasks 2, 3, 5). Tasks 4, 6, 7 are UI-wiring tasks with no automated test — see the note in Task 4 for why, and the manual verification steps required instead.

---

## File Map

| File | Change |
|---|---|
| `package.json` | add `react-native-share`, `react-native-view-shot` |
| `src/lib/i18n/locales/vi.json`, `en.json` | add `share.*` keys |
| `src/lib/i18n/index.test.ts` | assert two `share.*` keys resolve in both languages |
| `src/lib/share-transaction.ts` | **new** — pure overlay builder + `shareTransactionImage()` |
| `src/lib/share-transaction.test.ts` | **new** |
| `src/components/sl/share-sheet.tsx` | **new** — `ShareSheet` component |
| `src/components/sl/txn-card.tsx` | add share button |
| `src/components/sl/txn-card.test.tsx` | add share-button cases |
| `src/app/index.tsx` | mount `ShareSheet`, wire `onShare` into `TxnCard` |
| `src/app/transaction/[id].tsx` | add share button, mount `ShareSheet` |

---

### Task 1: Add `react-native-share` and `react-native-view-shot` dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `react-native-share` (default export `Share`, `Share.open(options): Promise<unknown>`) and `react-native-view-shot` (default export `ViewShot` component with ref method `capture(): Promise<string>`) importable from any later task.

- [ ] **Step 1: Add the two dependencies to `package.json`**

In `package.json`, inside `"dependencies"`, add (keeping alphabetical order among the `react-native-*` entries):

```json
    "react-native-share": "^12.3.1",
    "react-native-view-shot": "^5.1.1",
```

Insert `"react-native-share"` alphabetically right before `"react-native-svg"`, and `"react-native-view-shot"` right after `"react-native-svg"` (i.e. before `"react-native-web"`), so the final relevant slice of `dependencies` reads:

```json
    "react-native-reanimated": "4.5.0",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-screens": "4.25.2",
    "react-native-share": "^12.3.1",
    "react-native-svg": "15.15.4",
    "react-native-view-shot": "^5.1.1",
    "react-native-web": "~0.21.0",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: exits 0, `node_modules/react-native-share` and `node_modules/react-native-view-shot` now exist, `package-lock.json` is updated.

- [ ] **Step 3: Verify the packages import cleanly under the project's jest config**

Create a throwaway file `src/lib/__probe__.test.ts`:

```ts
import Share from 'react-native-share';
import ViewShot from 'react-native-view-shot';

it('both native modules import without throwing', () => {
  expect(typeof Share.open).toBe('function');
  expect(ViewShot).toBeTruthy();
});
```

Run: `npx jest src/lib/__probe__.test.ts`
Expected: PASS, 1 test passed.

Delete `src/lib/__probe__.test.ts` immediately after — it's a one-off smoke check, not part of the suite.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add react-native-share and react-native-view-shot dependencies"
```

---

### Task 2: Add `share` i18n namespace

**Files:**
- Modify: `src/lib/i18n/locales/vi.json`
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/index.test.ts`

**Interfaces:**
- Produces: translation keys `share.sheet_title`, `share.toggle_date`, `share.toggle_amount`, `share.toggle_category`, `share.toggle_name`, `share.share_btn`, `share.error_title`, `share.error_body`, `share.a11y_share`, consumed by `t('share.<key>')` in Tasks 4, 5, 7.

- [ ] **Step 1: Write the failing test**

In `src/lib/i18n/index.test.ts`, add a new `it` inside the existing `describe('i18n', ...)` block (after the last existing `it`):

```ts
  it('resolves the share namespace in both languages', () => {
    expect(i18n.t('share.sheet_title')).toBe('Chia sẻ giao dịch');
    expect(i18n.t('share.share_btn')).toBe('Chia sẻ');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/i18n/index.test.ts -t "resolves the share namespace"`
Expected: FAIL — `i18n.t('share.sheet_title')` returns the key itself (`"share.sheet_title"`) since the key doesn't exist yet (`returnNull: false` in the i18n config makes missing keys echo back).

- [ ] **Step 3: Add the `share` namespace to `vi.json`**

In `src/lib/i18n/locales/vi.json`, add a new top-level `"share"` key. Insert it right after the `"txn"` key (before `"budget"`), so the tail of the file reads:

```json
  "txn": { "tap_hint": "Chạm để xem chi tiết →" },
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
  },
  "budget": {
```

- [ ] **Step 4: Add the matching namespace to `en.json`**

In `src/lib/i18n/locales/en.json`, same insertion point (after `"txn"`, before `"budget"`):

```json
  "txn": { "tap_hint": "Tap to view details →" },
  "share": {
    "sheet_title": "Share transaction",
    "toggle_date": "Date & time",
    "toggle_amount": "Amount",
    "toggle_category": "Category",
    "toggle_name": "Name",
    "share_btn": "Share",
    "error_title": "Couldn't share",
    "error_body": "Something went wrong creating the image. Please try again.",
    "a11y_share": "Share transaction"
  },
  "budget": {
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/lib/i18n/index.test.ts`
Expected: PASS, all tests in the file pass (including the new one).

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/locales/vi.json src/lib/i18n/locales/en.json src/lib/i18n/index.test.ts
git commit -m "Add share i18n namespace"
```

---

### Task 3: `src/lib/share-transaction.ts` — overlay builder and share action

**Files:**
- Create: `src/lib/share-transaction.ts`
- Test: `src/lib/share-transaction.test.ts`

**Interfaces:**
- Consumes: `Txn` (`src/lib/transactions.ts`: `{ id, date, time, category, name, note, amount, isIncome, photoPath }`), `Category` + `categoryLabel(c: Category): string` (`src/lib/categories.ts`), `dayLabel(dateKey, todayKey): string` + `signedVND(amount, isIncome): string` (`src/lib/format.ts`), `Share.open` (`react-native-share`, default export).
- Produces:
  - `interface ShareToggles { showDate: boolean; showAmount: boolean; showCategory: boolean; showName: boolean; }`
  - `const DEFAULT_SHARE_TOGGLES: ShareToggles` (all `true`)
  - `interface ShareOverlay { categoryText: string | null; amountText: string | null; nameText: string | null; dateText: string | null; }`
  - `function buildShareOverlay(txn: Txn, toggles: ShareToggles, category: Category, todayKey: string): ShareOverlay`
  - `function shareTransactionImage(fileUri: string): Promise<void>` — consumed by Task 4's `ShareSheet`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/share-transaction.test.ts`:

```ts
import { categoryOf } from './categories';
import { i18n } from './i18n';
import { buildShareOverlay, DEFAULT_SHARE_TOGGLES, shareTransactionImage } from './share-transaction';
import type { ShareToggles } from './share-transaction';
import type { Txn } from './transactions';

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue(undefined) },
}));

import Share from 'react-native-share';

beforeAll(async () => { await i18n.changeLanguage('vi'); });

const baseTxn: Txn = {
  id: 1, date: '2026-07-24', time: '14:30', createdAt: 1,
  category: 'food', name: 'Cà phê', note: 'Latte size L',
  amount: 45000, isIncome: false, photoPath: '/tmp/photo.jpg',
};

const foodCategory = categoryOf('food');

describe('buildShareOverlay', () => {
  it('includes all four fields when every toggle is on', () => {
    const overlay = buildShareOverlay(baseTxn, DEFAULT_SHARE_TOGGLES, foodCategory, '2026-07-24');
    expect(overlay).toEqual({
      categoryText: 'Ăn uống',
      amountText: '−45.000₫',
      nameText: 'Latte size L',
      dateText: 'Hôm nay · 14:30',
    });
  });

  it('nulls out amountText when showAmount is off', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES, showAmount: false };
    const overlay = buildShareOverlay(baseTxn, toggles, foodCategory, '2026-07-24');
    expect(overlay.amountText).toBeNull();
    expect(overlay.categoryText).toBe('Ăn uống');
  });

  it('nulls out categoryText when showCategory is off', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES, showCategory: false };
    const overlay = buildShareOverlay(baseTxn, toggles, foodCategory, '2026-07-24');
    expect(overlay.categoryText).toBeNull();
  });

  it('nulls out dateText when showDate is off', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES, showDate: false };
    const overlay = buildShareOverlay(baseTxn, toggles, foodCategory, '2026-07-24');
    expect(overlay.dateText).toBeNull();
  });

  it('falls back to txn.name for nameText when note is null', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES };
    const overlay = buildShareOverlay({ ...baseTxn, note: null }, toggles, foodCategory, '2026-07-24');
    expect(overlay.nameText).toBe('Cà phê');
  });

  it('nulls out nameText when showName is off', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES, showName: false };
    const overlay = buildShareOverlay(baseTxn, toggles, foodCategory, '2026-07-24');
    expect(overlay.nameText).toBeNull();
  });

  it('prefixes income with a plus sign', () => {
    const overlay = buildShareOverlay({ ...baseTxn, isIncome: true }, DEFAULT_SHARE_TOGGLES, foodCategory, '2026-07-24');
    expect(overlay.amountText).toBe('+45.000₫');
  });
});

describe('shareTransactionImage', () => {
  beforeEach(() => (Share.open as jest.Mock).mockClear());

  it('opens the OS share sheet with a file:// URL, image/png type, and failOnCancel: false', async () => {
    await shareTransactionImage('/tmp/cache/story.png');
    expect(Share.open).toHaveBeenCalledWith({
      url: 'file:///tmp/cache/story.png',
      type: 'image/png',
      failOnCancel: false,
      useInternalStorage: true,
    });
  });

  it('does not double-prefix a URI that already starts with file://', async () => {
    await shareTransactionImage('file:///tmp/cache/story.png');
    expect(Share.open).toHaveBeenCalledWith(expect.objectContaining({
      url: 'file:///tmp/cache/story.png',
    }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/share-transaction.test.ts`
Expected: FAIL with "Cannot find module './share-transaction'" (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/share-transaction.ts`:

```ts
import Share from 'react-native-share';

import type { Category } from './categories';
import { categoryLabel } from './categories';
import { dayLabel, signedVND } from './format';
import type { Txn } from './transactions';

export interface ShareToggles {
  showDate: boolean;
  showAmount: boolean;
  showCategory: boolean;
  showName: boolean;
}

export const DEFAULT_SHARE_TOGGLES: ShareToggles = {
  showDate: true,
  showAmount: true,
  showCategory: true,
  showName: true,
};

export interface ShareOverlay {
  categoryText: string | null;
  amountText: string | null;
  nameText: string | null;
  dateText: string | null;
}

/** Builds the optional-info overlay for the share preview, respecting each toggle. */
export function buildShareOverlay(
  txn: Txn,
  toggles: ShareToggles,
  category: Category,
  todayKey: string,
): ShareOverlay {
  return {
    categoryText: toggles.showCategory ? categoryLabel(category) : null,
    amountText: toggles.showAmount ? signedVND(txn.amount, txn.isIncome) : null,
    nameText: toggles.showName ? (txn.note ?? txn.name) : null,
    dateText: toggles.showDate ? `${dayLabel(txn.date, todayKey)} · ${txn.time}` : null,
  };
}

/** Opens the OS share sheet for a locally-captured PNG. */
export async function shareTransactionImage(fileUri: string): Promise<void> {
  const url = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
  await Share.open({
    url,
    type: 'image/png',
    failOnCancel: false,
    // Required on Android API 30+ to share a file from the app's temp/cache dir.
    useInternalStorage: true,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/share-transaction.test.ts`
Expected: PASS, 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/share-transaction.ts src/lib/share-transaction.test.ts
git commit -m "Add share-transaction overlay builder and share action"
```

---

### Task 4: `ShareSheet` component

**Files:**
- Create: `src/components/sl/share-sheet.tsx`

**Interfaces:**
- Consumes: `buildShareOverlay`, `DEFAULT_SHARE_TOGGLES`, `shareTransactionImage`, `ShareToggles` (Task 3); `GradientButton` (`@/components/sl/gradient`); `categoryOf` (`@/lib/categories`); `toDateKey` (`@/lib/format`); `useT` (`@/lib/i18n`); `Txn` (`@/lib/transactions`); `Category` (`@/lib/categories`).
- Produces:
  ```ts
  export interface ShareSheetHandle {
    present: (txn: Txn) => void;
    dismiss: () => void;
  }
  ```
  consumed by Tasks 6 and 7 as `useRef<ShareSheetHandle>(null)` + `<ShareSheet ref={shareSheetRef} extras={categoryExtras} />`.

**Why no automated test for this file:** `ShareSheet` wraps `@gorhom/bottom-sheet`'s `BottomSheetModal`, whose imperative ref (`sheetRef.current.present()`/`.dismiss()`) is not fully functional in this project's jest environment — the underlying native ref exposes no `present` method under test (`react-test-renderer` doesn't run the real gesture/reanimated measurement code `BottomSheetModal` needs). This was verified directly: `DateRangeSheet` (an existing sheet in this codebase) throws `TypeError: sheetRef.current?.present is not a function` when its own `present()` handle is invoked in a test, which is exactly why `date-range-sheet.test.ts` only tests the pure exported helpers (`activeQuick`, `firstOfMonth`) and never renders/opens the sheet, and why `BudgetSheet` has no test file at all. `ShareSheet` follows that same established convention: all of its real logic (the overlay toggling, the share hand-off) already lives in the tested `share-transaction.ts` module from Task 3; this task is thin UI wiring over it, verified manually in Task 6/7's manual verification steps instead.

- [ ] **Step 1: Write the component**

Create `src/components/sl/share-sheet.tsx`:

```tsx
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Alert, Dimensions, StyleSheet, Switch, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

import { GradientButton } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';
import { categoryOf } from '@/lib/categories';
import type { Category } from '@/lib/categories';
import { toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import {
  buildShareOverlay,
  DEFAULT_SHARE_TOGGLES,
  shareTransactionImage,
} from '@/lib/share-transaction';
import type { ShareToggles } from '@/lib/share-transaction';
import type { Txn } from '@/lib/transactions';

export interface ShareSheetHandle {
  present: (txn: Txn) => void;
  dismiss: () => void;
}

interface Props {
  extras?: Category[];
}

const PREVIEW_WIDTH = Math.min(Dimensions.get('window').width - 48, 300);
const PREVIEW_HEIGHT = PREVIEW_WIDTH * (16 / 9);

export const ShareSheet = forwardRef<ShareSheetHandle, Props>(
  function ShareSheet({ extras = [] }, ref) {
    const { t } = useT();
    const colors = useColors();
    const sheetRef = useRef<BottomSheetModal>(null);
    const viewShotRef = useRef<ViewShot>(null);
    const [txn, setTxn] = useState<Txn | null>(null);
    const [toggles, setToggles] = useState<ShareToggles>(DEFAULT_SHARE_TOGGLES);

    useImperativeHandle(ref, () => ({
      present: (nextTxn) => {
        setTxn(nextTxn);
        setToggles(DEFAULT_SHARE_TOGGLES);
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

    const onShare = async () => {
      try {
        const uri = await viewShotRef.current?.capture();
        if (!uri) throw new Error('capture failed');
        sheetRef.current?.dismiss();
        await shareTransactionImage(uri);
      } catch {
        Alert.alert(t('share.error_title'), t('share.error_body'));
      }
    };

    const cat = txn ? categoryOf(txn.category, extras) : null;
    const overlay = txn && cat ? buildShareOverlay(txn, toggles, cat, toDateKey(new Date())) : null;

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.bg }}>
        <BottomSheetView style={[styles.body, { backgroundColor: colors.bg }]}>
          {txn && txn.photoPath && cat && overlay ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: W.bold, color: colors.text }}>
                {t('share.sheet_title')}
              </Text>

              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                style={[styles.preview, { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }]}>
                <Image source={{ uri: txn.photoPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bottomFade} />
                <View style={styles.overlayInfo}>
                  {overlay.categoryText ? (
                    <View style={[styles.categoryChip, { backgroundColor: cat.chip }]}>
                      <Text style={{ fontSize: 12, fontWeight: W.bold, color: cat.fg }}>
                        {overlay.categoryText}
                      </Text>
                    </View>
                  ) : null}
                  {overlay.amountText ? <Text style={styles.amountText}>{overlay.amountText}</Text> : null}
                  {overlay.nameText ? (
                    <Text style={styles.nameText} numberOfLines={2}>{overlay.nameText}</Text>
                  ) : null}
                  {overlay.dateText ? <Text style={styles.dateText}>{overlay.dateText}</Text> : null}
                </View>
              </ViewShot>

              <View style={styles.toggles}>
                <ToggleRow
                  label={t('share.toggle_date')}
                  value={toggles.showDate}
                  onValueChange={(v) => setToggles((s) => ({ ...s, showDate: v }))}
                />
                <ToggleRow
                  label={t('share.toggle_amount')}
                  value={toggles.showAmount}
                  onValueChange={(v) => setToggles((s) => ({ ...s, showAmount: v }))}
                />
                <ToggleRow
                  label={t('share.toggle_category')}
                  value={toggles.showCategory}
                  onValueChange={(v) => setToggles((s) => ({ ...s, showCategory: v }))}
                />
                <ToggleRow
                  label={t('share.toggle_name')}
                  value={toggles.showName}
                  onValueChange={(v) => setToggles((s) => ({ ...s, showName: v }))}
                />
              </View>

              <GradientButton label={t('share.share_btn')} onPress={onShare} />
            </>
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.toggleRow, { borderColor: colors.hairline }]}>
      <Text style={{ color: colors.text, fontWeight: W.medium }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, alignItems: 'center' },
  preview: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#111' },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  overlayInfo: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 6 },
  categoryChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  amountText: { color: '#fff', fontSize: 26, fontWeight: W.extrabold },
  nameText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: W.medium },
  dateText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: W.medium },
  toggles: { alignSelf: 'stretch', gap: 10 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `share-sheet.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/sl/share-sheet.tsx
git commit -m "Add ShareSheet component"
```

---

### Task 5: Share button on `TxnCard`

**Files:**
- Modify: `src/components/sl/txn-card.tsx`
- Test: `src/components/sl/txn-card.test.tsx`

**Interfaces:**
- Consumes: `Icon` (`@/components/sl/icons`, `name="share"` already exists).
- Produces: `TxnCard` gains an optional prop `onShare?: (txn: Txn) => void`, consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

In `src/components/sl/txn-card.test.tsx`, add a txn variant with a photo and new test cases. Replace the full file with:

```tsx
import { fireEvent, render } from '@testing-library/react-native';

import { TxnCard } from './txn-card';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: RN.View };
});
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: RN.View };
});

const baseTxn = {
  id: 42, date: '2026-07-23', time: '10:00', createdAt: 1,
  category: 'food' as const, name: 'Cà phê', note: null,
  amount: 45000, isIncome: false, photoPath: null,
};

const txnWithPhoto = { ...baseTxn, photoPath: '/tmp/photo.jpg' };

beforeEach(() => mockRouterPush.mockClear());

describe('TxnCard', () => {
  it('renders "Hôm nay" badge and category label', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    expect(getByText('Hôm nay')).toBeTruthy();
    expect(getByText('Ăn uống')).toBeTruthy();
  });

  it('prefixes expense with U+2212 minus', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    expect(getByText('−45.000₫')).toBeTruthy();
  });

  it('prefixes income with plus', async () => {
    const { getByText } = await render(<TxnCard txn={{ ...baseTxn, isIncome: true }} />);
    expect(getByText('+45.000₫')).toBeTruthy();
  });

  it('renders the note when present', async () => {
    const { getByText } = await render(<TxnCard txn={{ ...baseTxn, note: 'Latte size L' }} />);
    expect(getByText('Latte size L')).toBeTruthy();
  });

  it('renders name when note is null', async () => {
    const { getByText } = await render(<TxnCard txn={{ ...baseTxn, note: null }} />);
    expect(getByText('Cà phê')).toBeTruthy();
  });

  it('shows the tap hint', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    expect(getByText('Chạm để xem chi tiết →')).toBeTruthy();
  });

  it('navigates to detail on press', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    fireEvent.press(getByText('Chạm để xem chi tiết →'));
    expect(mockRouterPush).toHaveBeenCalledWith('/transaction/42');
  });

  it('does not render a share button when photoPath is null', async () => {
    const { queryByLabelText } = await render(<TxnCard txn={baseTxn} />);
    expect(queryByLabelText('Chia sẻ giao dịch')).toBeNull();
  });

  it('renders a share button and calls onShare with the txn when photoPath is set', async () => {
    const onShare = jest.fn();
    const { getByLabelText } = await render(<TxnCard txn={txnWithPhoto} onShare={onShare} />);
    fireEvent.press(getByLabelText('Chia sẻ giao dịch'));
    expect(onShare).toHaveBeenCalledWith(txnWithPhoto);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the new share-button test fails**

Run: `npx jest src/components/sl/txn-card.test.tsx`
Expected: 8 tests PASS (the 7 original tests, plus `does not render a share button when photoPath is null` — which is vacuously true already, since `TxnCard` renders no share button of any kind yet) and 1 test FAILS: `renders a share button and calls onShare with the txn when photoPath is set` fails with "Unable to find an element with accessibilityLabel: Chia sẻ giao dịch", since the button doesn't exist yet.

- [ ] **Step 3: Add the share button to `TxnCard`**

Replace `src/components/sl/txn-card.tsx` with:

```tsx
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/sl/icons';
import { Text } from '@/components/sl/text';
import { TodayBadge } from '@/components/sl/today-badge';
import { categoryOf, categoryLabel } from '@/lib/categories';
import type { Category } from '@/lib/categories';
import { formatVND } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { Txn } from '@/lib/transactions';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function TxnCard({
  txn,
  extras = [],
  onShare,
}: {
  txn: Txn;
  extras?: Category[];
  onShare?: (txn: Txn) => void;
}) {
  const { t } = useT();
  const cat = categoryOf(txn.category, extras);
  const sign = txn.isIncome ? '+' : '−';

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/transaction/${txn.id}`)}>
      {txn.photoPath ? (
        <Image source={{ uri: txn.photoPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: cat.fg }]} />
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.bottomFade}
      />

      <TodayBadge />

      {txn.photoPath ? (
        <Pressable
          style={styles.shareBtn}
          hitSlop={8}
          accessibilityLabel={t('share.a11y_share')}
          onPress={() => onShare?.(txn)}>
          <Icon name="share" size={18} color="#fff" />
        </Pressable>
      ) : null}

      <View style={styles.info}>
        <View style={[styles.categoryChip, { backgroundColor: cat.chip }]}>
          <Text style={[styles.categoryText, { color: cat.fg }]}>{categoryLabel(cat)}</Text>
        </View>
        <Text style={styles.amount}>{sign + formatVND(txn.amount)}</Text>
        <Text style={styles.note} numberOfLines={2}>{txn.note ?? txn.name}</Text>
        <Text style={styles.tapHint}>{t('txn.tap_hint')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { height: SCREEN_HEIGHT, backgroundColor: '#111' },
  bottomFade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%',
  },
  shareBtn: {
    position: 'absolute', top: 60, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  info: {
    position: 'absolute', left: 20, right: 20, bottom: 60, gap: 8,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  categoryText: { fontSize: 12, fontWeight: '700' },
  amount: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  note: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '500' },
  tapHint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500', marginTop: 6 },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/sl/txn-card.test.tsx`
Expected: PASS, 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sl/txn-card.tsx src/components/sl/txn-card.test.tsx
git commit -m "Add share button to TxnCard"
```

---

### Task 6: Wire `ShareSheet` into the camera screen

**Files:**
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: `ShareSheet`, `ShareSheetHandle` (Task 4); `TxnCard`'s new `onShare` prop (Task 5).

- [ ] **Step 1: Import `ShareSheet` and mount it with a ref**

In `src/app/index.tsx`, add to the imports (alongside the existing `@/components/sl/*` imports):

```tsx
import { ShareSheet } from '@/components/sl/share-sheet';
import type { ShareSheetHandle } from '@/components/sl/share-sheet';
```

Inside `CameraScreen`, alongside the existing `flatListRef`:

```tsx
  const flatListRef = useRef<FlatList>(null);
  const shareSheetRef = useRef<ShareSheetHandle>(null);
```

- [ ] **Step 2: Pass `onShare` into `TxnCard` and add `categoryExtras`/`shareSheetRef` to the memo deps**

Find this line in `renderItem`:

```tsx
    if (item.type === 'empty') return <EmptyTodayCard />;
    return <TxnCard txn={item.txn} extras={categoryExtras} />;
  }, [insets, permission, requestPermission, granted, facing, flash, note, noteFocused, todayExpense, capture, categoryExtras]);
```

Replace with:

```tsx
    if (item.type === 'empty') return <EmptyTodayCard />;
    return (
      <TxnCard
        txn={item.txn}
        extras={categoryExtras}
        onShare={(t) => shareSheetRef.current?.present(t)}
      />
    );
  }, [insets, permission, requestPermission, granted, facing, flash, note, noteFocused, todayExpense, capture, categoryExtras]);
```

(`shareSheetRef` is a ref — stable identity across renders — so it does not need to be added to the dependency array.)

- [ ] **Step 3: Render `<ShareSheet>` in the screen's JSX**

Find the closing of the root `<View style={styles.root}>` block:

```tsx
      {currentIndex > 0 && (
        <Pressable
          style={[styles.backToCamera, { bottom: insets.bottom + 24 }]}
          onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
          accessibilityLabel={t('nav.back_to_camera')}>
          <Icon name="camera" size={22} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}
```

Replace with:

```tsx
      {currentIndex > 0 && (
        <Pressable
          style={[styles.backToCamera, { bottom: insets.bottom + 24 }]}
          onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
          accessibilityLabel={t('nav.back_to_camera')}>
          <Icon name="camera" size={22} color="#fff" />
        </Pressable>
      )}
      <ShareSheet ref={shareSheetRef} extras={categoryExtras} />
    </View>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/app/index.tsx`.

- [ ] **Step 5: Manual verification (dev client build required — `react-native-share`/`react-native-view-shot` are native modules, not available in Expo Go)**

Run: `npx expo run:android` (or `run:ios`)

In the running app:
1. Take at least one photo today (or use an existing today transaction with a photo).
2. On the camera screen, swipe up to the transaction card.
3. Confirm a round share button appears top-right (below the top nav, not overlapping it).
4. Tap it — confirm the `ShareSheet` opens with a 9:16 preview showing the photo, category chip, amount, name, and date/time, and all four toggle switches on.
5. Flip each toggle off one at a time — confirm the corresponding field disappears from the preview immediately.
6. Tap "Chia sẻ" — confirm the OS share sheet opens (with the composed image as the shared content) and the bottom sheet closes.
7. Pick "Cancel"/back out of the OS share sheet — confirm no crash and no error alert (cancel is not an error).

- [ ] **Step 6: Commit**

```bash
git add src/app/index.tsx
git commit -m "Wire ShareSheet into the camera screen"
```

---

### Task 7: Share button on the transaction detail screen

**Files:**
- Modify: `src/app/transaction/[id].tsx`

**Interfaces:**
- Consumes: `ShareSheet`, `ShareSheetHandle` (Task 4).

- [ ] **Step 1: Import `ShareSheet` and mount it with a ref**

`src/app/transaction/[id].tsx` currently has no `import ... from 'react'` line at all (it only uses JSX, no hooks). Add these as new lines at the very top of the file, before the existing `import { router, useLocalSearchParams } from 'expo-router';` line:

```tsx
import { useRef } from 'react';
```

Then add, alongside the other `@/components/sl/*` imports:

```tsx
import { ShareSheet } from '@/components/sl/share-sheet';
import type { ShareSheetHandle } from '@/components/sl/share-sheet';
```

Inside `TransactionDetailScreen`, alongside the other hooks:

```tsx
  const shareSheetRef = useRef<ShareSheetHandle>(null);
```

- [ ] **Step 2: Add the share button next to Edit, and mount `ShareSheet`**

Find:

```tsx
        <View style={[StyleSheet.absoluteFill, styles.headerControls, { paddingTop: insets.top + 6 }]}>
          <Pressable style={styles.headerBtn} onPress={goBack}>
            <Icon name="back" size={20} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.headerBtn}
            onPress={() => router.push({ pathname: '/entry', params: { id: String(txn.id) } })}>
            <Icon name="edit" size={19} color="#fff" />
          </Pressable>
        </View>
```

Replace with:

```tsx
        <View style={[StyleSheet.absoluteFill, styles.headerControls, { paddingTop: insets.top + 6 }]}>
          <Pressable style={styles.headerBtn} onPress={goBack}>
            <Icon name="back" size={20} color="#fff" />
          </Pressable>
          <View style={styles.headerRightGroup}>
            {txn.photoPath ? (
              <Pressable
                style={styles.headerBtn}
                accessibilityLabel={t('share.a11y_share')}
                onPress={() => shareSheetRef.current?.present(txn)}>
                <Icon name="share" size={19} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable
              style={styles.headerBtn}
              onPress={() => router.push({ pathname: '/entry', params: { id: String(txn.id) } })}>
              <Icon name="edit" size={19} color="#fff" />
            </Pressable>
          </View>
        </View>
```

Then find the screen's closing tags:

```tsx
        <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
          <Text style={{ fontSize: 14, fontWeight: W.bold, color: Money.expense }}>{t('transaction.delete_btn')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

Replace with:

```tsx
        <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
          <Text style={{ fontSize: 14, fontWeight: W.bold, color: Money.expense }}>{t('transaction.delete_btn')}</Text>
        </Pressable>
      </View>
      <ShareSheet ref={shareSheetRef} extras={categoryExtras} />
    </View>
  );
}
```

- [ ] **Step 3: Add the `headerRightGroup` style**

Find the `headerControls` style:

```ts
  headerControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
  },
```

Add a new style right after it:

```ts
  headerRightGroup: {
    flexDirection: 'row',
    gap: 10,
  },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/app/transaction/[id].tsx`.

- [ ] **Step 5: Manual verification (dev client build)**

In the running app (same dev client build as Task 6):
1. Open a transaction that has a photo (tap it from the camera swipe-up feed or the gallery).
2. Confirm three header buttons: back (left), share and edit grouped on the right, share appearing before edit.
3. Tap share — confirm the same `ShareSheet` preview/toggle/share flow from Task 6 works here too, pre-filled with this transaction's data.
4. Open a transaction with no photo (if any exist, e.g. a manually-entered income row) — confirm only back and edit are shown, no share button.

- [ ] **Step 6: Commit**

```bash
git add src/app/transaction/[id].tsx
git commit -m "Add share button to transaction detail screen"
```

---

## Self-Review

**Spec coverage:**
- Share button on `TxnCard`, top-right, hidden without photo → Task 5. ✅
- Share button on transaction detail next to Edit, hidden without photo → Task 7. ✅
- OS share sheet via `react-native-share` (not direct-to-story) → Task 3 (`shareTransactionImage`). ✅
- Photo required, baked-in optional info (date/time, amount, category, name), user picks before sharing → Task 3 (`buildShareOverlay`) + Task 4 (toggle UI). ✅
- Live 9:16 preview reusing `TxnCard`'s visual language → Task 4. ✅
- All toggles default on → Task 3 (`DEFAULT_SHARE_TOGGLES`) + Task 4 (reset on `present`). ✅
- `share.*` i18n keys in both languages → Task 2. ✅

**Placeholder scan:** no `TBD`/`TODO`/"add appropriate error handling"-style steps; every step has literal code or an exact command with expected output.

**Type consistency:** `ShareSheetHandle.present(txn: Txn)` (Task 4) matches every call site — `shareSheetRef.current?.present(t)` (Task 6) and `shareSheetRef.current?.present(txn)` (Task 7). `ShareToggles`/`DEFAULT_SHARE_TOGGLES`/`ShareOverlay`/`buildShareOverlay`/`shareTransactionImage` (Task 3) are imported into Task 4 with matching names and signatures. `TxnCard`'s `onShare?: (txn: Txn) => void` (Task 5) matches its call site in Task 6. `t('share.a11y_share')` (Tasks 5, 7) matches the key added in Task 2, and its Vietnamese value `'Chia sẻ giao dịch'` matches the literal string asserted in Task 5's test.

**One deviation from the approved spec, made during planning and documented above:** the spec's Testing section proposed rendering `<ShareSheet>` and exercising its toggles/share button directly in a test. Empirically verifying this against the existing `DateRangeSheet` component (same `BottomSheetModal` pattern) showed `sheetRef.current?.present()` throws under this project's jest setup, which is why no existing sheet component (`BudgetSheet`, `DateRangeSheet`) has a render test — only their pure exported helpers do. Task 4 follows that precedent: all real logic is pushed into the tested `share-transaction.ts` module (Task 3), and the sheet itself is verified manually (Tasks 6–7, Step 5).
