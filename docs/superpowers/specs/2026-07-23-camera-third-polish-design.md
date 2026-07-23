# SpendLens — Camera polish v3, notifications completeness, and entry keyboard fix

**Date:** 2026-07-23
**Status:** Approved (brainstorming)
**Baseline:** `main` at the head of the just-shipped camera polish v2 + fix pass.

## Goal

Close six third-round rough edges: (1) camera note input still not visually obvious enough — replace the bottom overlay with a centered floating card, (2a) verify + complete `expo-notifications` foreground handler so daily reminders actually show in-app, (2b) fire a one-shot notification per month when spending crosses 80% and again at 100% of monthly budget, (3) reduce the FlatList paging snap from `"fast"` to `"normal"` so cards don't blur past, (5) add pinch-to-zoom + double-tap-to-reset on the camera, and (6) fix the amount TextInput on Entry that gets partially hidden by the keyboard on small screens.

Issue 4 (currency selector) is explicitly deferred to a follow-up spec — it is a cross-cutting rename of every `formatVND` call site plus DB persistence plus context, which deserves its own plan.

## Scope

**In**
- Note input redesign on camera: centered card overlay (title + input + hint + backdrop-to-dismiss) instead of bottom bar.
- Foreground notification handler (`setNotificationHandler`) so notifications display when the app is in foreground.
- New notification: `fireBudgetAlert(80 | 100)` fired from Entry save when the running month's expense sum crosses the threshold. Idempotent per month via a `budgetNotifiedMonth: 'YYYY-MM:80'|'YYYY-MM:100'|''` settings key. Reset semantics: crossing 100% supersedes 80%.
- New settings key: `budgetAlertsEnabled: boolean` (default true) with a toggle row in the NHẮC NHỞ section, greyed out when `monthlyBudget === 0`.
- `decelerationRate="normal"` on the camera FlatList.
- Pinch-to-zoom + double-tap-to-reset gesture on `<CameraView>` using `react-native-gesture-handler` v2's `Gesture.Pinch` / `Gesture.Tap`. Optional zoom badge (e.g. `1.5x`) top-left of viewfinder when zoom > 0.
- Wrap `_layout.tsx` root in `<GestureHandlerRootView style={{ flex: 1 }}>` (verified missing).
- Entry amount input visibility fix: three layers — `automaticallyAdjustKeyboardInsets` on ScrollView (iOS), manual `scrollTo` on `onFocus` (Android + iOS <15 fallback), `keyboardVerticalOffset={0}` (was `insets.top`, over-compensating).

**Out**
- Issue 4 (currency selector) — separate future spec.
- Custom notification icon PNG — plugin config stays `["expo-notifications", {}]`; monochrome app icon default suffices for v1.
- Remote push notifications (APNs / FCM) — not needed for local scheduled notifications.
- Optical / native zoom limit discovery — approximation `1x + zoom * 4x` for badge label is intentional.

## Issue 1 — Camera note UI: centered floating card

Current state (from `src/app/index.tsx` post-v2): `<KeyboardAvoidingView>` at `position: 'absolute', bottom: 0` renders a `<TextInput>` when `noteFocused === true`. The dark bar-style input is visually indistinct on some devices and can still be partially hidden by the keyboard on Android.

**Replace** with a centered floating card. The KAV becomes a full-screen absolute overlay with `justifyContent: 'center'`; the keyboard shrinks the KAV, and the centered card stays vertically centered in the remaining space (guaranteed above keyboard on both platforms).

Structure:

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

Styles:

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
noteCardLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
noteCardInput: {
  fontSize: 18, fontWeight: '600', color: '#fff',
  padding: 12, borderRadius: 12,
  backgroundColor: 'rgba(255,255,255,0.08)',
  minHeight: 48,
},
noteCardHint: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '500' },
```

Delete the old `noteInputOverlay`+`noteInput` styles that positioned the input at `bottom: 0`.

Chip preview inside viewfinder (`{note && !noteFocused && ...}`) stays unchanged.

## Issue 2a — Foreground notification handler

Add to `src/lib/notifications.ts` at module top-level (outside any function):

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

This makes scheduled notifications actually appear as an in-app alert bar when the app is in foreground. Without it, notifications fire silently on foreground and only show in the OS tray.

Local notifications on both platforms require zero additional setup (no FCM, no APNs) — Expo uses OS-level scheduling. EAS builds work out of the box for scheduled local notifications.

## Issue 2b — Budget threshold alerts

### Settings additions

Update `src/lib/settings.ts`:

```ts
export interface Settings {
  monthlyBudget: number;
  reminderEnabled: boolean;
  reminderHHMM: string | null;
  themeMode: 'auto' | 'light' | 'dark';
  budgetAlertsEnabled: boolean;      // new; default true
  budgetNotifiedMonth: string;       // new; default ''; format 'YYYY-MM:80' or 'YYYY-MM:100'
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

Extend `encode`/`decode`:
- `budgetAlertsEnabled`: boolean → `"0"` / `"1"`
- `budgetNotifiedMonth`: string → stored raw; empty string decoded as `''`

### Notifications API

Add to `src/lib/notifications.ts`:

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

`trigger: null` fires immediately.

### Entry trigger logic

In `src/app/entry.tsx`'s `save()`, AFTER `add(payload)` succeeds and before `router.replace('/history')`:

```tsx
if (!editing && !isIncome) {   // only new expense records
  const budget = settings.monthlyBudget;
  if (budget > 0 && settings.budgetAlertsEnabled) {
    const currentMonth = toDateKey(new Date()).slice(0, 7);   // 'YYYY-MM'
    // Compute this-month expense sum INCLUDING the just-added transaction:
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
      update('budgetNotifiedMonth', `${currentMonth}:${fireLevel}`);
    }
  }
}
```

Notes:
- `transactions` is read BEFORE `add()` is committed to the context (context refreshes after add). We compute spent including the new `amount` explicitly. Slight inaccuracy is acceptable — worst case: 1 alert delayed by one save when the exact boundary is crossed.
- Fires immediately, not delayed.
- Editing an existing txn or income entries do NOT re-trigger — only new expenses.

### Settings UI

In `src/app/settings.tsx`, add to the NHẮC NHỞ section (below the reminder time row):

```tsx
<View style={[styles.row, { borderColor: colors.hairline, opacity: settings.monthlyBudget > 0 ? 1 : 0.5 }]}>
  <View style={{ flex: 1 }}>
    <Text style={{ color: colors.text, fontWeight: '500' }}>Cảnh báo vượt ngân sách</Text>
    {settings.monthlyBudget === 0 ? (
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Đặt ngân sách trước</Text>
    ) : null}
  </View>
  <Switch
    value={settings.budgetAlertsEnabled}
    disabled={settings.monthlyBudget === 0}
    onValueChange={(v) => update('budgetAlertsEnabled', v)}
  />
</View>
```

## Issue 3 — Slower snap animation

`src/app/index.tsx` FlatList prop change (one line):

```tsx
decelerationRate="normal"    // was "fast"
```

All other paging props (`pagingEnabled`, `disableIntervalMomentum`, `snapToInterval`, `snapToAlignment`, `scrollEnabled` guard, `onMomentum*`, `onScroll`, `scrollEventThrottle`) unchanged.

## Issue 5 — Pinch zoom + double-tap reset

### Root layout — wrap in GestureHandlerRootView

`react-native-gesture-handler` v2 requires the root of the app to be `<GestureHandlerRootView>`. Current `src/app/_layout.tsx` does NOT have this wrapper (verified via grep).

Wrap `SafeAreaProvider` inside a `GestureHandlerRootView`:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// ...
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

### Camera zoom state + gestures

In `src/app/index.tsx` `CameraScreen`:

```tsx
const [zoom, setZoom] = useState(0);   // expo-camera accepts 0..1
```

Pass `zoom` and `setZoom` down to `CameraPage` as props.

In `CameraPage`, use `react-native-gesture-handler`:

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
// ...
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

Wrap `<CameraView>`:

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

Zoom badge overlay (optional but recommended for UX feedback):

```tsx
{zoom > 0 && (
  <View style={styles.zoomBadge}>
    <Text style={styles.zoomBadgeText}>{(1 + zoom * 4).toFixed(1)}x</Text>
  </View>
)}
```

Styles:

```ts
zoomBadge: {
  position: 'absolute', top: 12, left: 12,
  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  backgroundColor: 'rgba(0,0,0,0.55)',
  zIndex: 5,
},
zoomBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
```

Formula `1 + zoom * 4` is a display approximation — actual optical range depends on the device's zoom capabilities, which expo-camera abstracts over 0..1.

## Issue 6 — Entry amount input visibility

Root cause: on small screens (iPhone SE, Pixel 4a) the amount input at `y ≈ 250-290` straddles the keyboard boundary; RN's ScrollView does not auto-scroll to bring the focused input into view.

Three-layer fix in `src/app/entry.tsx`:

### Layer 1 — `automaticallyAdjustKeyboardInsets` (iOS, RN 0.73+)

Add to the ScrollView:

```tsx
<ScrollView
  ref={scrollRef}
  contentContainerStyle={styles.content}
  keyboardShouldPersistTaps="handled"
  automaticallyAdjustKeyboardInsets
>
```

### Layer 2 — Manual `scrollTo` on focus (cross-platform fallback)

Add a ScrollView ref + capture layout offset of both inputs' parent views:

```tsx
const scrollRef = useRef<ScrollView>(null);
const amountOffsetRef = useRef(0);
const noteOffsetRef = useRef(0);

function scrollToOffset(y: number) {
  setTimeout(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
  }, 100);
}
```

On the amount block wrapper View, capture y:

```tsx
<View
  style={styles.amountBlock}
  onLayout={(e) => { amountOffsetRef.current = e.nativeEvent.layout.y; }}>
  ...
  <TextInput
    ...
    onFocus={() => scrollToOffset(amountOffsetRef.current)}
  />
</View>
```

Same pattern for the GHI CHÚ note field (`noteOffsetRef`).

`setTimeout(100)` gives the keyboard time to start opening + the ScrollView to shrink before we scroll.

### Layer 3 — `keyboardVerticalOffset={0}`

Change:

```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={0}   // was insets.top; over-compensates because outer View already has paddingTop: insets.top
  style={{ flex: 1 }}>
```

Do NOT touch the outer View's `paddingTop: insets.top`.

## Files touched summary

| File | Change |
|---|---|
| `src/app/index.tsx` | Issue 1 note center card, Issue 3 decelerationRate, Issue 5 zoom state + gestures + badge |
| `src/app/_layout.tsx` | Wrap in `<GestureHandlerRootView>` |
| `src/app/entry.tsx` | Issue 2b trigger logic in save(), Issue 6 three-layer keyboard fix |
| `src/app/settings.tsx` | Cảnh báo vượt ngân sách toggle row |
| `src/lib/notifications.ts` | Top-level `setNotificationHandler`, new `fireBudgetAlert(80|100)` |
| `src/lib/notifications.test.ts` | Extend with `fireBudgetAlert` tests |
| `src/lib/settings.ts` | Add `budgetAlertsEnabled` + `budgetNotifiedMonth` to Settings interface + DEFAULTS + encode/decode |
| `src/lib/settings.test.ts` | Extend round-trip for 2 new keys |

## Testing

### Unit tests to add

- `notifications.test.ts`:
  - `fireBudgetAlert(80)` → `scheduleNotificationAsync` called with title `'Sắp vượt ngân sách'`, body includes `'80%'`, `trigger: null`.
  - `fireBudgetAlert(100)` → title `'Vượt ngân sách!'`, body includes `'100%'`.
  - `setNotificationHandler` is invoked at module import time (verify handler shape: `shouldShowAlert: true`).
- `settings.test.ts`:
  - Round-trip `budgetAlertsEnabled` (`true` → `'1'`, `false` → `'0'`, `undefined` → `DEFAULTS.budgetAlertsEnabled`).
  - Round-trip `budgetNotifiedMonth` string (empty and populated cases).

### Manual smoke test

- Issue 1: camera → tap lower half → **centered card** with title/input/hint + backdrop. Backdrop dismiss + Done dismiss both work.
- Issue 2a: reminder ON → set to now+1min → wait → notification shows (foreground: alert bar in-app; background: OS tray).
- Issue 2b:
  - Set budget 100,000₫; save 3 expenses of 30k, 40k, 30k → third save (60%→90% crossing 80%) → alert "Sắp vượt ngân sách".
  - Save 15k more (105%) → alert "Vượt ngân sách!".
  - Save more → NO alert (already fired 100% this month).
  - Settings toggle OFF → save vượt → no alert.
  - Settings toggle disabled + hint "Đặt ngân sách trước" when `monthlyBudget === 0`.
- Issue 3: swipe up → snap animation is noticeably gentler (compare against previous "fast" for reference).
- Issue 5: pinch out → zoom badge `1.5x`, `2.3x` etc appears; double-tap → zoom = 0, badge disappears.
- Issue 6: on iPhone SE or Pixel 4a, tap amount → whole input (including `₫`) visible above keyboard; tap GHI CHÚ → scroll auto brings it above keyboard.

### Verification bar

- `npx jest --silent` all green — 42/42 base + ~4-5 new tests → ~46-47/47.
- `npx tsc --noEmit` count within jest-globals delta of baseline (136).

## Not in scope

- Currency selector (Issue 4) — separate spec after this ships.
- Custom notification icon (Android/iOS) — dev/EAS builds use app icon monochrome default.
- Automated gesture tests — Jest cannot reliably drive `react-native-gesture-handler` state machine.
- Migration of legacy `budgetNotifiedMonth` values — no legacy exists; new key defaults to empty string.
