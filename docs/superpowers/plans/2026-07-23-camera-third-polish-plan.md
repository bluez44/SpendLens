# Camera Polish v3 + Notifications + Entry Keyboard Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close six third-round issues on top of the just-shipped v2 work — centered floating card for camera note input, foreground notification handler + budget-threshold alerts (80% / 100%) with a Settings toggle, slower FlatList snap, pinch-to-zoom + double-tap-reset with a zoom badge, and a three-layer keyboard fix for the Entry amount input that gets hidden on small screens.

**Architecture:** Extend `Settings` with two new keys (`budgetAlertsEnabled`, `budgetNotifiedMonth`); extend `notifications.ts` with a top-level foreground handler and a new `fireBudgetAlert(level)`. Wrap the app root in `<GestureHandlerRootView>` so `react-native-gesture-handler` v2's `Gesture.Pinch` / `Gesture.Tap` work in the camera. Refactor the camera note input to a centered floating card, drop FlatList `decelerationRate` from `"fast"` to `"normal"`, add pinch + double-tap gestures on `<CameraView>` with a zoom badge. Fire budget alerts from Entry's save flow after `add()`. Fix Entry keyboard covering the amount input via `automaticallyAdjustKeyboardInsets` + `onFocus` scrollTo + `keyboardVerticalOffset={0}`.

**Tech Stack:** Expo SDK 57, React Native `KeyboardAvoidingView`, `expo-camera` (`zoom` prop), `expo-notifications` (`scheduleNotificationAsync`, `setNotificationHandler`), `react-native-gesture-handler` v2 (already installed), `react-native-reanimated` (`runOnJS`), TypeScript, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-07-23-camera-third-polish-design.md`

## Global Constraints

- Baseline: `main` at `f826706` (spec commit). Do not change existing behavior on Home, History, Gallery, or Transaction detail.
- The DB `settings` schema is key/value string — no schema change; new keys inherit that.
- No new dependencies. `react-native-gesture-handler` and `react-native-reanimated` are already installed (verified in `package.json`).
- Vietnamese UI copy verbatim: `Ghi chú`, `VD: Cà phê Highlands`, `Nhấn Done hoặc bên ngoài để đóng`, `Cảnh báo vượt ngân sách`, `Đặt ngân sách trước`, `Sắp vượt ngân sách`, `Vượt ngân sách!`, `Bạn đã chi hơn 80% ngân sách tháng này.`, `Bạn đã chi vượt 100% ngân sách tháng này.`.
- Budget alert semantics: idempotent per month; crossing 100% supersedes 80%; only fires on new expense saves (not edits, not income). Reset flag by month rollover.
- Zoom badge formula: `1 + zoom * 4` displayed as `<n>.<n>x`. Formula is a display approximation.
- Do NOT touch the outer entry View's `paddingTop: insets.top` when fixing keyboard offset.
- Verification bar per task: `npx jest --silent` all green; `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"` must not exceed **136** (pre-work baseline) beyond jest-globals additions from new test cases (~2-8 per new file, same TS2304/TS2708 pattern).
- Currency selector (Issue 4) explicitly deferred to a future spec.
- Commit locally after each task.

---

## File Structure

**Modified**
- `src/lib/settings.ts` — add 2 keys.
- `src/lib/settings.test.ts` — round-trip tests.
- `src/lib/notifications.ts` — top-level `setNotificationHandler` + `fireBudgetAlert`.
- `src/lib/notifications.test.ts` — new tests.
- `src/app/_layout.tsx` — wrap root in `<GestureHandlerRootView>`.
- `src/app/index.tsx` — note center card, `decelerationRate="normal"`, zoom state + gestures + badge.
- `src/app/entry.tsx` — budget alert trigger in save(), keyboard fix (3 layers).
- `src/app/settings.tsx` — budget-alerts toggle row.

**No new files.**

---

### Task 1: Settings data — add budget-alerts keys

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/settings.test.ts`

**Interfaces:**
- Consumes: existing `Settings`, `DEFAULTS`, encode/decode functions.
- Produces:
  - `Settings.budgetAlertsEnabled: boolean` (default `true`)
  - `Settings.budgetNotifiedMonth: string` (default `''`, format `'YYYY-MM:80'` or `'YYYY-MM:100'`)
  - Encoding: `budgetAlertsEnabled` → `'0'`/`'1'`; `budgetNotifiedMonth` → raw string.

- [ ] **Step 1: Write failing tests**

Open `src/lib/settings.test.ts`. Locate the existing `describe('loadSettings', ...)` block. INSIDE it, ADD three new test cases (do NOT delete or rename existing tests):

```ts
  it('round-trips budgetAlertsEnabled (default true)', () => {
    const db = freshDb();
    expect(loadSettings(db).budgetAlertsEnabled).toBe(true);
    updateSetting('budgetAlertsEnabled', false, db);
    expect(loadSettings(db).budgetAlertsEnabled).toBe(false);
    updateSetting('budgetAlertsEnabled', true, db);
    expect(loadSettings(db).budgetAlertsEnabled).toBe(true);
  });

  it('encodes budgetAlertsEnabled as "0"/"1"', () => {
    const db = freshDb();
    updateSetting('budgetAlertsEnabled', false, db);
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['budgetAlertsEnabled']);
    expect(row?.value).toBe('0');
  });

  it('round-trips budgetNotifiedMonth (default "")', () => {
    const db = freshDb();
    expect(loadSettings(db).budgetNotifiedMonth).toBe('');
    updateSetting('budgetNotifiedMonth', '2026-07:80', db);
    expect(loadSettings(db).budgetNotifiedMonth).toBe('2026-07:80');
    updateSetting('budgetNotifiedMonth', '2026-07:100', db);
    expect(loadSettings(db).budgetNotifiedMonth).toBe('2026-07:100');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/settings.test.ts`

Expected: 3 new tests FAIL with type errors on `'budgetAlertsEnabled'` / `'budgetNotifiedMonth'` not being valid keys.

- [ ] **Step 3: Extend `Settings` + `DEFAULTS`**

In `src/lib/settings.ts`, update the interface + DEFAULTS:

```ts
export interface Settings {
  monthlyBudget: number;
  reminderEnabled: boolean;
  reminderHHMM: string | null;
  themeMode: 'auto' | 'light' | 'dark';
  budgetAlertsEnabled: boolean;
  budgetNotifiedMonth: string;
}

export const DEFAULTS: Settings = {
  monthlyBudget: 0,
  reminderEnabled: false,
  reminderHHMM: null,
  themeMode: 'auto',
  budgetAlertsEnabled: true,
  budgetNotifiedMonth: '',
};
```

- [ ] **Step 4: Extend `encode`**

In the same file, `encode<K>(key, value)` switch — add two cases before the exhaustive `default`:

```ts
    case 'budgetAlertsEnabled':
      return (value as boolean) ? '1' : '0';
    case 'budgetNotifiedMonth':
      return value as string;
```

- [ ] **Step 5: Extend `decode`**

In the same file, `decode(map)` — add after the existing decode logic for `themeMode`, BEFORE `return result`:

```ts
  const alerts = map.get('budgetAlertsEnabled');
  if (alerts !== undefined) result.budgetAlertsEnabled = alerts === '1';
  const notifiedMonth = map.get('budgetNotifiedMonth');
  if (notifiedMonth !== undefined) result.budgetNotifiedMonth = notifiedMonth;
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `npx jest src/lib/settings.test.ts`

Expected: all previous settings tests + 3 new ones pass.

- [ ] **Step 7: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: 45/45 green (42 + 3 new); tsc growth ≤ ~6 jest-globals from the 3 new `it`/`expect` calls, so ≤ 142.

- [ ] **Step 8: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "Add budgetAlertsEnabled and budgetNotifiedMonth settings keys"
```

---

### Task 2: Notifications — foreground handler + fireBudgetAlert

**Files:**
- Modify: `src/lib/notifications.ts`
- Modify: `src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `expo-notifications` API (`scheduleNotificationAsync`, `setNotificationHandler`).
- Produces:
  - Top-level `Notifications.setNotificationHandler({...})` call (module side-effect on import).
  - `async function fireBudgetAlert(level: 80 | 100): Promise<void>` — schedules immediate notification with Vietnamese title/body.

- [ ] **Step 1: Write failing tests**

Open `src/lib/notifications.test.ts`. Extend the existing `jest.mock('expo-notifications', ...)` block to include `setNotificationHandler: jest.fn()`.

Locate the mock. Currently it has:
```ts
jest.mock('expo-notifications', () => ({
  __esModule: true,
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));
```

Change to include `setNotificationHandler`:
```ts
jest.mock('expo-notifications', () => ({
  __esModule: true,
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));
```

Also extend the imports at the top of the test file:
```ts
import {
  cancelDailyReminder,
  fireBudgetAlert,
  REMINDER_ID,
  requestPermission,
  scheduleDailyReminder,
} from './notifications';
```

APPEND (do not remove existing describes) two new `describe` blocks at the bottom of the file:

```ts
describe('setNotificationHandler', () => {
  it('is invoked once at module load with shouldShowAlert true', () => {
    expect(mocked.setNotificationHandler).toHaveBeenCalledTimes(1);
    const arg = (mocked.setNotificationHandler as jest.Mock).mock.calls[0][0];
    return expect(arg.handleNotification()).resolves.toEqual({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});

describe('fireBudgetAlert', () => {
  it('at level 80 sends the pre-warning title and body immediately', async () => {
    await fireBudgetAlert(80);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'Sắp vượt ngân sách',
          body: 'Bạn đã chi hơn 80% ngân sách tháng này.',
        }),
        trigger: null,
      }),
    );
  });

  it('at level 100 sends the over-budget title and body immediately', async () => {
    await fireBudgetAlert(100);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'Vượt ngân sách!',
          body: 'Bạn đã chi vượt 100% ngân sách tháng này.',
        }),
        trigger: null,
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/notifications.test.ts`

Expected: FAIL with `fireBudgetAlert is not exported` and `setNotificationHandler not called`.

- [ ] **Step 3: Add `setNotificationHandler` at top of `notifications.ts`**

In `src/lib/notifications.ts`, right AFTER the `import * as Notifications from 'expo-notifications';` line (and BEFORE the `REMINDER_ID` const), add:

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

- [ ] **Step 4: Add `fireBudgetAlert`**

APPEND at the end of `src/lib/notifications.ts`:

```ts
export async function fireBudgetAlert(level: 80 | 100): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: level === 100 ? 'Vượt ngân sách!' : 'Sắp vượt ngân sách',
      body: level === 100
        ? 'Bạn đã chi vượt 100% ngân sách tháng này.'
        : 'Bạn đã chi hơn 80% ngân sách tháng này.',
    },
    trigger: null,
  });
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npx jest src/lib/notifications.test.ts`

Expected: existing tests + 3 new ones all pass.

- [ ] **Step 6: Verify full jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: 48/48 green (45 + 3 new); tsc growth ≤ ~8 jest-globals from the 3 new test cases.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts
git commit -m "Add foreground notification handler and fireBudgetAlert(80|100)"
```

---

### Task 3: Wrap root in GestureHandlerRootView

**Files:**
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `GestureHandlerRootView` from `react-native-gesture-handler` (already installed).
- Produces: prerequisite for Task 6 — Gesture handlers in child components will now activate.

- [ ] **Step 1: Add the import**

Near the top of `src/app/_layout.tsx`, add:

```ts
import { GestureHandlerRootView } from 'react-native-gesture-handler';
```

- [ ] **Step 2: Wrap `SafeAreaProvider`**

Locate `RootLayout`'s return (the block starting `return ( <SafeAreaProvider>`). Wrap the existing tree in a `<GestureHandlerRootView style={{ flex: 1 }}>`:

```tsx
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <SettingsProvider>
        <TransactionsProvider>
          <ThemedShell scheme={scheme} />
        </TransactionsProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);
```

`SafeAreaProvider` and its children are preserved verbatim. Only the outer wrapper is added.

- [ ] **Step 3: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: 48/48 green; tsc unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "Wrap app root in GestureHandlerRootView for camera zoom gestures"
```

---

### Task 4: Camera note UI — centered floating card

**Files:**
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: existing `note`, `noteFocused`, `setNote`, `setNoteFocused` state on `CameraScreen`, passed down to `CameraPage`.
- Produces: the note input is a centered floating card (title + input + hint + backdrop-to-dismiss) that appears above the keyboard, replacing the previous bottom-anchored overlay.

- [ ] **Step 1: Delete the current bottom overlay JSX**

In `src/app/index.tsx`, inside `CameraPage`, find the current note overlay block:

```tsx
{noteFocused && (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'position' : 'height'}
    style={styles.noteInputOverlay}
  >
    <TextInput autoFocus ... style={styles.noteInput} />
  </KeyboardAvoidingView>
)}
```

Replace it with the centered card:

```tsx
{noteFocused && (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={styles.noteInputOverlay}
  >
    <Pressable style={styles.noteBackdrop} onPress={() => setNoteFocused(false)} />
    <View style={styles.noteCard}>
      <Text style={styles.noteCardLabel}>Ghi chú</Text>
      <TextInput
        autoFocus
        value={note}
        onChangeText={setNote}
        onBlur={() => setNoteFocused(false)}
        placeholder="VD: Cà phê Highlands"
        placeholderTextColor="rgba(255,255,255,0.4)"
        returnKeyType="done"
        onSubmitEditing={() => setNoteFocused(false)}
        maxLength={140}
        style={styles.noteCardInput}
      />
      <Text style={styles.noteCardHint}>Nhấn Done hoặc bên ngoài để đóng</Text>
    </View>
  </KeyboardAvoidingView>
)}
```

- [ ] **Step 2: Update styles**

In the `StyleSheet.create({...})` block, DELETE the old `noteInputOverlay` and `noteInput` entries (they positioned the input at `bottom: 0`).

ADD these six new entries:

```ts
noteInputOverlay: {
  position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  justifyContent: 'center', alignItems: 'center',
  zIndex: 30,
},
noteBackdrop: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(0,0,0,0.55)',
},
noteCard: {
  width: '85%',
  padding: 20, borderRadius: 20,
  backgroundColor: '#1D1D1D',
  gap: 8,
},
noteCardLabel: {
  color: 'rgba(255,255,255,0.6)',
  fontSize: 12, fontWeight: '700', letterSpacing: 0.5,
},
noteCardInput: {
  fontSize: 18, fontWeight: '600', color: '#fff',
  padding: 12, borderRadius: 12,
  backgroundColor: 'rgba(255,255,255,0.08)',
  minHeight: 48,
},
noteCardHint: {
  color: 'rgba(255,255,255,0.4)',
  fontSize: 11, fontWeight: '500',
},
```

- [ ] **Step 3: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green; tsc unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/app/index.tsx
git commit -m "Replace camera note bottom overlay with centered floating card"
```

---

### Task 5: FlatList decelerationRate = "normal"

**Files:**
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: existing FlatList.
- Produces: camera paging snap animation is ~30-50% longer, easier to see cards.

- [ ] **Step 1: Change the prop**

In `src/app/index.tsx`, locate the `<FlatList>` element. Change:

```tsx
decelerationRate="fast"
```

to:

```tsx
decelerationRate="normal"
```

Do not touch any other FlatList prop.

- [ ] **Step 2: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green; tsc unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/app/index.tsx
git commit -m "Slow camera FlatList snap animation to normal deceleration"
```

---

### Task 6: Camera pinch zoom + double-tap reset

**Files:**
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: `GestureHandlerRootView` at root (Task 3), `zoom` prop on `<CameraView>`, `Gesture.Pinch` / `Gesture.Tap` / `GestureDetector` from `react-native-gesture-handler`, `runOnJS` from `react-native-reanimated`.
- Produces: pinch to zoom (mapped 0..1 to `zoom` prop), double-tap resets zoom to 0, badge `<n>.<n>x` shows top-left of viewfinder when `zoom > 0`.

- [ ] **Step 1: Add imports**

At the top of `src/app/index.tsx`, add:

```ts
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
```

- [ ] **Step 2: Add zoom state in `CameraScreen`**

Inside `CameraScreen`, near the other state:

```tsx
const [zoom, setZoom] = useState(0);
```

- [ ] **Step 3: Pass zoom + setZoom to `CameraPage` props**

In the JSX where `<CameraPage ... />` is instantiated (inside `renderItem`), add:

```tsx
zoom={zoom}
setZoom={setZoom}
```

In `CameraPage`'s props type union (and destructure), add:

```ts
zoom: number;
setZoom: (v: number) => void;
```

- [ ] **Step 4: Wire gestures inside `CameraPage`**

Near the top of `CameraPage` (after the initial destructure of props):

```tsx
const initialZoomRef = useRef(0);
const pinch = Gesture.Pinch()
  .onStart(() => { initialZoomRef.current = zoom; })
  .onUpdate((e) => {
    const next = Math.max(0, Math.min(1, initialZoomRef.current + (e.scale - 1) * 0.5));
    runOnJS(setZoom)(next);
  });

const doubleTap = Gesture.Tap()
  .numberOfTaps(2)
  .onEnd(() => { runOnJS(setZoom)(0); });

const cameraGesture = Gesture.Simultaneous(pinch, doubleTap);
```

- [ ] **Step 5: Wrap `<CameraView>` in `<GestureDetector>` and pass `zoom` prop**

Locate the current `<CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />` line. Replace with:

```tsx
<GestureDetector gesture={cameraGesture}>
  <CameraView
    ref={cameraRef}
    style={StyleSheet.absoluteFill}
    facing={facing}
    flash={flash}
    zoom={zoom}
  />
</GestureDetector>
```

- [ ] **Step 6: Add zoom badge overlay inside viewfinder**

Immediately AFTER the `<GestureDetector>` block, but BEFORE the `flashBtn` `<Pressable>`, add:

```tsx
{zoom > 0 && (
  <View style={styles.zoomBadge}>
    <Text style={styles.zoomBadgeText}>{(1 + zoom * 4).toFixed(1)}x</Text>
  </View>
)}
```

- [ ] **Step 7: Add styles**

In `StyleSheet.create({...})`, add:

```ts
zoomBadge: {
  position: 'absolute', top: 12, left: 12,
  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  backgroundColor: 'rgba(0,0,0,0.55)',
  zIndex: 5,
},
zoomBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
```

- [ ] **Step 8: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green; tsc unchanged (real code additions must be tsc-clean).

- [ ] **Step 9: Commit**

```bash
git add src/app/index.tsx
git commit -m "Add pinch-to-zoom + double-tap-reset with zoom badge on camera"
```

---

### Task 7: Settings — budget alerts toggle

**Files:**
- Modify: `src/app/settings.tsx`

**Interfaces:**
- Consumes: `settings.budgetAlertsEnabled` and `settings.monthlyBudget` (Task 1), `update('budgetAlertsEnabled', ...)`.
- Produces: a row in the NHẮC NHỞ section with the toggle bound to `budgetAlertsEnabled`, disabled + subtitle "Đặt ngân sách trước" when `monthlyBudget === 0`.

- [ ] **Step 1: Add the toggle row in the NHẮC NHỞ section**

In `src/app/settings.tsx`, locate the NHẮC NHỞ section. Find the "Giờ nhắc" row (the one shown when `settings.reminderEnabled`). AFTER that row (still inside the NHẮC NHỞ section), add:

```tsx
<View style={[styles.row, { borderColor: colors.hairline, opacity: settings.monthlyBudget > 0 ? 1 : 0.5 }]}>
  <View style={{ flex: 1 }}>
    <Text style={{ color: colors.text, fontWeight: '500' }}>Cảnh báo vượt ngân sách</Text>
    {settings.monthlyBudget === 0 ? (
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Đặt ngân sách trước</Text>
    ) : null}
  </View>
  <Switch
    value={settings.budgetAlertsEnabled}
    disabled={settings.monthlyBudget === 0}
    onValueChange={(v) => update('budgetAlertsEnabled', v)}
  />
</View>
```

Preserve all other rows and sections verbatim.

- [ ] **Step 2: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green; tsc unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings.tsx
git commit -m "Add Cảnh báo vượt ngân sách toggle in Settings"
```

---

### Task 8: Entry — budget alert trigger + keyboard fix

**Files:**
- Modify: `src/app/entry.tsx`

**Interfaces:**
- Consumes: `settings` (from `useSettings`, includes `budgetAlertsEnabled`, `budgetNotifiedMonth`, `monthlyBudget`), `update` (from `useSettings`), `transactions` (from `useTransactions`), `fireBudgetAlert` (Task 2), `toDateKey` from `@/lib/format`.
- Produces: after saving a new expense, if crossing 80% or 100% of budget and not yet notified this month, fires the alert and updates `budgetNotifiedMonth`. Amount + note inputs stay visible above the keyboard on small screens.

- [ ] **Step 1: Add imports**

At the top of `src/app/entry.tsx`, add:

```ts
import { fireBudgetAlert } from '@/lib/notifications';
import { useSettings } from '@/lib/settings-context';
```

Also update the react-native import to include `ScrollView`:

```ts
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
```

(This import likely already includes ScrollView — verify with a grep before editing to avoid duplicating it.)

- [ ] **Step 2: Extend destructures inside `EntryScreen`**

Near the top of `EntryScreen`, ADD:

```tsx
const { settings, update: updateSettings } = useSettings();
```

Rename to `updateSettings` because the existing `useTransactions().update` uses the name `update` — verify current code first via grep. If `useTransactions().update` is called `update` inside the component, adjust accordingly; otherwise keep `update`.

Grep first: `grep -n "update" src/app/entry.tsx` — if `update` from useTransactions is used, rename the settings one as suggested above (`updateSettings`). If not, keep as `update`.

- [ ] **Step 3: Add budget-alert trigger logic in `save()`**

Locate the current `save` function. AFTER `add(payload)` and BEFORE `router.replace('/history')`, add:

```tsx
if (!editing && !isIncome) {
  const budget = settings.monthlyBudget;
  if (budget > 0 && settings.budgetAlertsEnabled) {
    const currentMonth = toDateKey(new Date()).slice(0, 7);
    const spent = transactions
      .filter((t) => !t.isIncome && t.date.slice(0, 7) === currentMonth)
      .reduce((s, t) => s + t.amount, 0) + amount;
    const pct = (spent / budget) * 100;
    const [lastMonth, lastLevel] = settings.budgetNotifiedMonth.split(':');
    const lastLevelNum = Number(lastLevel) || 0;
    const sameMonth = lastMonth === currentMonth;

    let fireLevel: 80 | 100 | null = null;
    if (pct >= 100 && !(sameMonth && lastLevelNum >= 100)) fireLevel = 100;
    else if (pct >= 80 && !(sameMonth && lastLevelNum >= 80)) fireLevel = 80;

    if (fireLevel) {
      await fireBudgetAlert(fireLevel);
      updateSettings('budgetNotifiedMonth', `${currentMonth}:${fireLevel}`);
    }
  }
}
```

Note: this makes `save` implicitly async — wrap the whole body in `async` if not already. The current handler is `const save = () => { ... }`; change to `const save = async () => { ... }`.

If Step 2 kept `update` (not `updateSettings`), replace `updateSettings(...)` with `update(...)` here — but that will conflict with `useTransactions().update`. Prefer `updateSettings` alias for clarity.

- [ ] **Step 4: Fix keyboard layer 3 — `keyboardVerticalOffset`**

Locate the `<KeyboardAvoidingView>` in the return. Change:

```tsx
keyboardVerticalOffset={insets.top}
```

to:

```tsx
keyboardVerticalOffset={0}
```

(The outer `<View>` already has `paddingTop: insets.top`; the KAV inside doesn't need to re-compensate.)

- [ ] **Step 5: Fix keyboard layer 1 — `automaticallyAdjustKeyboardInsets`**

Locate the `<ScrollView>` inside the KAV. Add the prop:

```tsx
<ScrollView
  ref={scrollRef}
  contentContainerStyle={styles.content}
  keyboardShouldPersistTaps="handled"
  automaticallyAdjustKeyboardInsets
>
```

- [ ] **Step 6: Fix keyboard layer 2 — manual scroll on focus**

Add refs at the top of `EntryScreen`:

```tsx
const scrollRef = useRef<ScrollView>(null);
const amountOffsetRef = useRef(0);
const noteOffsetRef = useRef(0);
```

Add the import if `useRef` is not already imported:

```ts
import { useMemo, useRef, useState } from 'react';
```

(Merge with the existing `useMemo, useState` import — don't add a second `react` import.)

Add a scroll helper function inside `EntryScreen` (before the return):

```tsx
function scrollToOffset(y: number) {
  setTimeout(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
  }, 100);
}
```

Wrap the amount block's parent `<View>` with an `onLayout` capture:

```tsx
<View
  style={styles.amountBlock}
  onLayout={(e) => { amountOffsetRef.current = e.nativeEvent.layout.y; }}
>
  ...
</View>
```

On the amount `<TextInput>`, add `onFocus`:

```tsx
<TextInput
  value={amount ? formatVND(amount).slice(0, -1) : ''}
  onChangeText={(t) => setAmount(Number(t.replace(/\D/g, '')) || 0)}
  keyboardType="number-pad"
  placeholder="0"
  placeholderTextColor={c.textSecondary}
  onFocus={() => scrollToOffset(amountOffsetRef.current)}
  style={[styles.amountInput, { color: c.text }]}
/>
```

Same pattern for the note field. Wrap its parent `<View>`:

```tsx
<View
  style={[styles.field, { backgroundColor: c.card, borderColor: c.cardBorder }]}
  onLayout={(e) => { noteOffsetRef.current = e.nativeEvent.layout.y; }}
>
  ...
</View>
```

On the note `<TextInput>`:

```tsx
<TextInput
  value={note}
  onChangeText={setNote}
  placeholder={isIncome ? 'Lương, thưởng…' : 'Bún bò Huế · gần công ty'}
  placeholderTextColor={c.textSecondary}
  onFocus={() => scrollToOffset(noteOffsetRef.current)}
  style={{ fontSize: 14.5, fontWeight: W.semibold, color: c.text, padding: 0 }}
/>
```

- [ ] **Step 7: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green; tsc unchanged (all changes are additive to existing state/refs; no new test files).

- [ ] **Step 8: Commit**

```bash
git add src/app/entry.tsx
git commit -m "Fire budget alerts on save and fix amount input keyboard visibility"
```

---

### Task 9: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run full jest**

Run: `npx jest --silent`

Expected: **48/48 tests / 11 suites all green** (42 base + 3 settings + 3 notifications).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: baseline 136 + jest-globals from ~6 new test cases (~12-15 additional TS2304/TS2708). Verify no NEW non-jest-globals errors:

```bash
npx tsc --noEmit 2>&1 | grep -vE "Cannot find name|Cannot use namespace|Do you need to install|Try \`npm|^\s|^$"
```

Expected: only pre-existing (`@/global.css` side-effect; `Namespace 'global.jest'` items).

- [ ] **Step 3: Manual smoke test on device or simulator**

Run: `npx expo start`.

**Issue 1 — Note center card:**
- Camera → tap lower half → centered card overlay with "Ghi chú" label, input, hint text.
- Tap backdrop or press Done → dismiss.
- Chip preview still shows inside viewfinder after blur if text present.

**Issue 2a — Foreground notifications:**
- Settings → toggle reminder ON → set time = current + 1 minute → wait.
- App in foreground: notification appears as an in-app alert.
- App in background: notification appears in the OS tray.

**Issue 2b — Budget alerts:**
- Settings → set budget = 100,000₫; verify "Cảnh báo vượt ngân sách" toggle is enabled and ON by default.
- Camera capture → Entry → save 60,000₫ expense → no alert (60%).
- Save 30,000₫ more → alert "Sắp vượt ngân sách" (90%).
- Save 15,000₫ more → alert "Vượt ngân sách!" (105%).
- Save more → no more alerts this month (100% flag latched).
- Settings → toggle OFF → save more expenses → no alerts.
- Settings → clear budget (set 0) → toggle disabled + hint "Đặt ngân sách trước".

**Issue 3 — Slower snap:**
- Camera → vuốt lên → snap animation is visibly gentler than before.

**Issue 5 — Zoom:**
- Camera → pinch out → zoom badge appears top-left showing `1.5x` / `2.3x` etc.
- Double-tap → zoom resets to 0, badge disappears.

**Issue 6 — Entry keyboard fix (small screens):**
- On iPhone SE OR Pixel 4a, tap amount input → whole amount including `₫` symbol is visible above keyboard.
- Tap GHI CHÚ input → scroll auto-brings it above keyboard.
- Save button reachable via scroll.

- [ ] **Step 4: If any manual failure, fix as a follow-up commit — do not amend a shipped task**

- [ ] **Step 5: Report done**
