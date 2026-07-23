# Camera UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five field-test UX issues on top of the SpendLens app — keyboard overlap on Entry and Settings budget modal, broken/unlabelled camera note input, camera shutter sound, missing swipe-up-to-see-history gesture, and Android status-bar bleed.

**Architecture:** The centerpiece is a refactor of `src/app/index.tsx` (camera screen) into a full-screen vertically-paged `FlatList` (Locket-style): page 0 is the camera, pages 1..N are one full-screen `TxnCard` per today's transaction (with an empty-state card when today is empty). A hidden `TextInput` inside the viewfinder is opened by tapping the viewfinder's bottom half; the typed note carries through the shutter route param to Entry. Two smaller changes wrap Entry and the Settings budget modal in `KeyboardAvoidingView`, and one `app.json` change turns off Android's translucent status bar to fix content bleed.

**Tech Stack:** Expo SDK 57, `expo-camera` (`takePictureAsync({ shutterSound: false })`), `expo-image`, `expo-linear-gradient` (new dep), React Native `FlatList` + `KeyboardAvoidingView`, `expo-router`, TypeScript, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-07-23-camera-ux-polish-design.md`

## Global Constraints

- Baseline branch: `feature/settings-notifications-export` at `43024e5`. Do not change existing behavior on `/home`, `/history`, `/gallery`, or `/transaction/[id]` beyond safe-area posture (which is fixed globally via `app.json`).
- Expo SDK 57. Camera prop `shutterSound?: boolean` (from `expo-camera/build/Camera.types.d.ts`) is the authoritative way to mute.
- SQLite access is SYNC (matches existing `src/lib/transactions.ts`). No schema changes.
- Transactions are typed `Txn`. `useTransactions()` returns `{ transactions: Txn[]; refresh; ... }`.
- Vietnamese UI copy: `Thêm ghi chú...`, `Hôm nay`, `Chưa có giao dịch nào hôm nay`, `Chụp bill đầu tiên nhé!`, `Chạm để xem chi tiết →`, `Cà phê` (only inside test fixtures).
- Verification bar per task: `npx jest --silent` all green; `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"` must not exceed **110** (post-fix-pass baseline), except that new test files may add jest-globals-class errors of the same class already present in every other .test.ts file — record the delta and confirm it's only that class.
- No pushing to remote; commit each task locally.
- No cloud, no new persistence, no non-visible feature additions.
- Do not add gesture-handler libraries; React Native core `FlatList` pagination and `Pressable` tap slop are sufficient per the spec's "FlatList gesture ownership vs note input" section.

---

## File Structure

**New**
- `src/components/sl/txn-card.tsx` — full-screen presentational card for a single `Txn` used by camera paging list.
- `src/components/sl/txn-card.test.tsx` — render tests for TxnCard.

**Modified**
- `package.json` / `package-lock.json` — add `expo-linear-gradient`.
- `app.json` — add `androidStatusBar` block.
- `src/app/index.tsx` — camera page refactor: FlatList paging, hidden note TextInput, shutter option, route hand-off with `note` param. Extracts a private `CameraPage` component and a private `EmptyTodayCard` component in the same file.
- `src/app/entry.tsx` — read `note` from search params on fresh entry (no `id`); wrap content in `KeyboardAvoidingView` + `keyboardShouldPersistTaps`.
- `src/app/settings.tsx` — wrap budget keypad Modal content in `KeyboardAvoidingView`.

---

### Task 1: Install expo-linear-gradient and set Android status bar config

**Files:**
- Modify: `package.json`, `package-lock.json`, `app.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `expo-linear-gradient` available for import; `insets.top === 0` on Android with a solid status-bar frame; iOS unchanged.

- [ ] **Step 1: Install expo-linear-gradient**

Run: `npx expo install expo-linear-gradient`

Expected: entry appears in `package.json` under `dependencies` at an SDK-57-compatible version (~57.x).

- [ ] **Step 2: Add androidStatusBar block to app.json**

Open `app.json`, find the `"expo"` object. Add (or merge into) a top-level key `androidStatusBar`:

```json
"androidStatusBar": {
  "translucent": false,
  "barStyle": "dark-content",
  "backgroundColor": "#00000000"
}
```

Place it as a sibling of other top-level `expo` keys like `android`, `ios`, `plugins`. Preserve the surrounding JSON strictly (trailing commas, indentation).

- [ ] **Step 3: Verify test suite unchanged**

Run: `npx jest --silent`

Expected: 33/33 passing, 9 suites.

- [ ] **Step 4: Verify tsc unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: `110` (baseline). If higher, revert and stop.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "Add expo-linear-gradient and disable Android translucent status bar"
```

---

### Task 2: TxnCard presentational component

**Files:**
- Create: `src/components/sl/txn-card.tsx`
- Create: `src/components/sl/txn-card.test.tsx`

**Interfaces:**
- Consumes: `Txn` from `@/lib/transactions`, `categoryOf` from `@/lib/categories`, `formatVND` from `@/lib/format`, `useColors` from `@/constants/tokens`, `Image` from `expo-image`, `LinearGradient` from `expo-linear-gradient`, `router` from `expo-router`.
- Produces: `<TxnCard txn={Txn} />` full-screen card. Tapping navigates to `/transaction/${txn.id}`.

- [ ] **Step 1: Write failing test**

Create `src/components/sl/txn-card.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';

import { TxnCard } from './txn-card';

const routerPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => routerPush(...args) },
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

beforeEach(() => routerPush.mockClear());

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

  it('shows the tap hint', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    expect(getByText('Chạm để xem chi tiết →')).toBeTruthy();
  });

  it('navigates to detail on press', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    fireEvent.press(getByText('Chạm để xem chi tiết →'));
    expect(routerPush).toHaveBeenCalledWith('/transaction/42');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/sl/txn-card.test.tsx`

Expected: FAIL with "Cannot find module './txn-card'".

- [ ] **Step 3: Implement `txn-card.tsx`**

Create `src/components/sl/txn-card.tsx`:

```tsx
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { categoryOf } from '@/lib/categories';
import { formatVND } from '@/lib/format';
import type { Txn } from '@/lib/transactions';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function TxnCard({ txn }: { txn: Txn }) {
  const colors = useColors();
  const cat = categoryOf(txn.category);
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

      <View style={styles.todayBadge}>
        <Text style={styles.todayBadgeText}>Hôm nay</Text>
      </View>

      <View style={styles.info}>
        <View style={[styles.categoryChip, { backgroundColor: cat.chip }]}>
          <Text style={[styles.categoryText, { color: cat.fg }]}>{cat.label}</Text>
        </View>
        <Text style={styles.amount}>{sign + formatVND(txn.amount)}</Text>
        {txn.note ? (
          <Text style={styles.note} numberOfLines={2}>{txn.note}</Text>
        ) : null}
        <Text style={styles.tapHint}>Chạm để xem chi tiết →</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { height: SCREEN_HEIGHT, backgroundColor: '#111' },
  bottomFade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%',
  },
  todayBadge: {
    position: 'absolute', top: 60, left: 20,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  todayBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
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

Expected: 6 tests pass.

- [ ] **Step 5: Verify full jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: all suites green (34 tests, 10 suites). Tsc delta acceptable if only from jest-globals in the new test file. Report the delta.

- [ ] **Step 6: Commit**

```bash
git add src/components/sl/txn-card.tsx src/components/sl/txn-card.test.tsx
git commit -m "Add TxnCard component for camera paging list"
```

---

### Task 3: Shutter sound off + note param plumbing

**Files:**
- Modify: `src/app/index.tsx` (shutter call site + capture arg)
- Modify: `src/app/entry.tsx` (read `note` from search params)

**Interfaces:**
- Consumes: existing `capture` function in `index.tsx`, `useLocalSearchParams` from `expo-router`.
- Produces: `capture()` calls `takePictureAsync({ quality: 0.7, shutterSound: false })` and pushes `{ pathname: '/entry', params: { photo, note } }`. Entry reads `params.note` and prefills the note field for fresh entries (when `id` is not set).

- [ ] **Step 1: Update `capture` in `src/app/index.tsx` to pass `shutterSound: false` and forward the current note**

The current `capture` handler at lines 30–37 hardcodes `takePictureAsync({ quality: 0.7 })` and does not forward a note. Note state doesn't exist yet — Task 4 introduces it. For this task, add a stub `note` binding at `''` so the plumbing lands first:

Add near the other state at the top of `CameraScreen`:

```tsx
const note = '';  // wired to state in Task 4
```

Replace the existing `capture` with:

```tsx
const capture = async () => {
  const currentNote = note;
  try {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
    router.push({
      pathname: '/entry',
      params: photo?.uri
        ? { photo: photo.uri, note: currentNote }
        : currentNote ? { note: currentNote } : {},
    });
  } catch {
    router.push({ pathname: '/entry', params: currentNote ? { note: currentNote } : {} });
  }
};
```

Note: `router.push` accepts `params: {}` — that's harmless. Do NOT pass `undefined`; expo-router types disallow it.

- [ ] **Step 2: Update `src/app/entry.tsx` to consume the `note` param**

Locate the `useLocalSearchParams` call (or equivalent params destructure) at the top of the entry component. Add `note` to the union type:

Existing pattern is likely:
```ts
const params = useLocalSearchParams<{ photo?: string; id?: string }>();
```

Replace with:
```ts
const params = useLocalSearchParams<{ photo?: string; note?: string; id?: string }>();
```

Locate the initial `note` state (initializer for the note TextInput). Add the search-param source, taking precedence for fresh captures (when there is no `id`):

Assuming the initializer currently reads something like:
```ts
const [note, setNote] = useState(existingTxn?.note ?? '');
```

Change to:
```ts
const [note, setNote] = useState(existingTxn?.note ?? params.note ?? '');
```

(Existing txn note wins when editing; camera route param wins for fresh capture; empty string when neither.)

- [ ] **Step 3: Verify jest**

Run: `npx jest --silent`

Expected: 33/33 (still — no new tests). Green.

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: ≤ post-Task-2 baseline. Real code must remain tsc-clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/index.tsx src/app/entry.tsx
git commit -m "Disable shutter sound and forward camera note param to Entry"
```

---

### Task 4: Camera note input UI (hidden TextInput + tap zone + chip preview)

**Files:**
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: existing `viewfinder` layout, `capture` handler from Task 3.
- Produces: `note: string` and `noteFocused: boolean` state on `CameraScreen`. Tapping the viewfinder's bottom half focuses a hidden `TextInput`; typing populates `note`; blur shows a chip preview; the capture handler already forwards `note`.

- [ ] **Step 1: Replace the stub `note` binding from Task 3 with real state and refs**

Add these imports at the top of `src/app/index.tsx` if not present:

```ts
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
```

(TextInput and KeyboardAvoidingView must be new to the file.)

Replace `const note = '';` (from Task 3) with:

```tsx
const [note, setNote] = useState('');
const [noteFocused, setNoteFocused] = useState(false);
const noteInputRef = useRef<TextInput>(null);
```

- [ ] **Step 2: Delete the static caption "Thêm ghi chú..." block**

In the current JSX, remove the block:

```tsx
<View style={styles.caption}>
  <Text style={{ fontSize: 14, fontWeight: W.medium, color: 'rgba(255,255,255,0.72)' }}>Thêm ghi chú…</Text>
</View>
```

Also remove the `caption` style from the `StyleSheet.create({...})` block at the bottom of the file.

- [ ] **Step 3: Insert the note input primitives inside the `viewfinder` View**

Just before the closing tag of `<View style={styles.viewfinder}>`, append:

```tsx
<Pressable
  style={styles.noteTapZone}
  onPress={() => noteInputRef.current?.focus()}
  pointerEvents={noteFocused ? 'none' : 'auto'}
/>

{note && !noteFocused ? (
  <Pressable style={styles.notePreview} onPress={() => noteInputRef.current?.focus()}>
    <Icon name="edit" size={12} color="rgba(255,255,255,0.85)" />
    <Text numberOfLines={1} style={styles.notePreviewText}>{note}</Text>
  </Pressable>
) : null}

<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  style={styles.noteInputWrap}
  pointerEvents={noteFocused ? 'auto' : 'none'}
>
  <TextInput
    ref={noteInputRef}
    value={note}
    onChangeText={setNote}
    onFocus={() => setNoteFocused(true)}
    onBlur={() => setNoteFocused(false)}
    placeholder="Thêm ghi chú..."
    placeholderTextColor="rgba(255,255,255,0.5)"
    returnKeyType="done"
    onSubmitEditing={() => noteInputRef.current?.blur()}
    maxLength={140}
    style={styles.noteInput}
  />
</KeyboardAvoidingView>
```

- [ ] **Step 4: Add the styles to the `StyleSheet.create(...)` object**

Add these entries:

```ts
noteTapZone: {
  position: 'absolute', left: 0, right: 0, bottom: 0,
  height: '50%', zIndex: 5,
},
notePreview: {
  position: 'absolute', bottom: 14, alignSelf: 'center',
  flexDirection: 'row', alignItems: 'center', gap: 6,
  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
  backgroundColor: 'rgba(18,18,18,0.55)',
  maxWidth: '80%', zIndex: 6,
},
notePreviewText: { fontSize: 13, fontWeight: '600', color: '#fff' },
noteInputWrap: {
  position: 'absolute', left: 12, right: 12, bottom: 12,
  zIndex: 10,
},
noteInput: {
  padding: 12, borderRadius: 16, fontSize: 15, fontWeight: '500',
  backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff',
},
```

- [ ] **Step 5: Update capture to blur note before capturing (optional polish, but keeps UI clean)**

At the top of the existing `capture` handler:

```tsx
noteInputRef.current?.blur();
```

Place immediately after `const currentNote = note;`.

- [ ] **Step 6: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: 33/33 green, tsc unchanged (real code additions must be tsc-clean).

- [ ] **Step 7: Commit**

```bash
git add src/app/index.tsx
git commit -m "Add hidden note input on camera with tap-to-focus and chip preview"
```

---

### Task 5: Camera FlatList paging (Locket-style)

**Files:**
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: `TxnCard` (Task 2), `useTransactions().transactions` (existing), `toDateKey` from `@/lib/format`, `useColors`, `useSettings` (not required here), Task-4's `noteFocused` state.
- Produces: The camera screen is a `FlatList` with `pagingEnabled`, page 0 = camera, pages 1..N = today's txn cards (or a single empty card). FlatList's `scrollEnabled` toggles on `noteFocused` to defer to the note input's tap.

- [ ] **Step 1: Add imports**

Top of `src/app/index.tsx`:

```ts
import { Dimensions, FlatList } from 'react-native';

import { TxnCard } from '@/components/sl/txn-card';
import { toDateKey } from '@/lib/format';
import type { Txn } from '@/lib/transactions';
```

Also add near `useColors`:

```ts
const SCREEN_HEIGHT = Dimensions.get('window').height;
```

- [ ] **Step 2: Compute today's transactions in the component**

Inside `CameraScreen()`, after the existing `todayExpense` memo, add:

```tsx
const todayKey = toDateKey(new Date());
const todayTxns = useMemo(
  () => transactions.filter((t) => t.date === todayKey),
  [transactions, todayKey]
);
```

- [ ] **Step 3: Build the pages array**

Immediately below:

```tsx
type PageItem =
  | { type: 'camera' }
  | { type: 'empty' }
  | { type: 'txn'; txn: Txn };

const pages: PageItem[] =
  todayTxns.length === 0
    ? [{ type: 'camera' }, { type: 'empty' }]
    : [{ type: 'camera' }, ...todayTxns.map((t) => ({ type: 'txn' as const, txn: t }))];
```

- [ ] **Step 4: Extract the current camera JSX into a `CameraPage` inner function**

At the bottom of the file (below `RoundButton`), add:

```tsx
function CameraPage({
  insets, permission, requestPermission, granted,
  facing, setFacing, flash, setFlash,
  cameraRef, capture,
  note, noteFocused, setNote, setNoteFocused, noteInputRef,
  todayExpense,
}: {
  insets: { top: number; bottom: number };
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
  granted: boolean;
  facing: 'back' | 'front';
  setFacing: React.Dispatch<React.SetStateAction<'back' | 'front'>>;
  flash: 'off' | 'on';
  setFlash: React.Dispatch<React.SetStateAction<'off' | 'on'>>;
  cameraRef: React.RefObject<CameraView | null>;
  capture: () => Promise<void>;
  note: string;
  noteFocused: boolean;
  setNote: (v: string) => void;
  setNoteFocused: (v: boolean) => void;
  noteInputRef: React.RefObject<TextInput | null>;
  todayExpense: number;
}) {
  return (
    <View style={{ height: SCREEN_HEIGHT, backgroundColor: '#111111' }}>
      {/* Top nav */}
      <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
        <RoundButton onPress={() => router.push('/home')}><Icon name="home" /></RoundButton>
        <View style={styles.totalPill}>
          <Text style={{ fontSize: 12, fontWeight: W.semibold, color: 'rgba(255,255,255,0.65)' }}>Hôm nay</Text>
          <Text style={{ fontSize: 15, fontWeight: W.extrabold, color: Money.expenseOnDark }}>
            −{formatVND(todayExpense)}
          </Text>
        </View>
        <RoundButton onPress={() => router.push('/history')}><Icon name="menu" /></RoundButton>
      </View>

      {/* Viewfinder — this whole block moves verbatim from the previous return */}
      <View style={styles.viewfinderWrap}>
        <View style={styles.viewfinder}>
          {granted ? (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />
              <Pressable style={styles.flashBtn} onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}>
                <Icon name={flash === 'on' ? 'flash' : 'flash-off'} size={19} color="#fff" />
              </Pressable>
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.permission]}>
              <Text style={styles.permissionText}>
                {permission ? 'Cần quyền camera để chụp khoản chi' : 'Đang tải camera…'}
              </Text>
              {permission && !granted ? (
                <GradientButton label="Cho phép camera" onPress={requestPermission} style={{ marginTop: 16 }} />
              ) : null}
            </View>
          )}

          {/* Note primitives from Task 4 — move here verbatim */}
          <Pressable
            style={styles.noteTapZone}
            onPress={() => noteInputRef.current?.focus()}
            pointerEvents={noteFocused ? 'none' : 'auto'}
          />

          {note && !noteFocused ? (
            <Pressable style={styles.notePreview} onPress={() => noteInputRef.current?.focus()}>
              <Icon name="edit" size={12} color="rgba(255,255,255,0.85)" />
              <Text numberOfLines={1} style={styles.notePreviewText}>{note}</Text>
            </Pressable>
          ) : null}

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.noteInputWrap}
            pointerEvents={noteFocused ? 'auto' : 'none'}
          >
            <TextInput
              ref={noteInputRef}
              value={note}
              onChangeText={setNote}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              placeholder="Thêm ghi chú..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              returnKeyType="done"
              onSubmitEditing={() => noteInputRef.current?.blur()}
              maxLength={140}
              style={styles.noteInput}
            />
          </KeyboardAvoidingView>
        </View>
      </View>

      {/* Capture area — same as before, minus the "vuốt lên" hint */}
      <View style={[styles.captureArea, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.captureRow}>
          <View style={styles.sideSlot} />
          <Shutter onPress={capture} />
          <Pressable
            style={[styles.sideSlot, styles.circleBtn]}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
            <Icon name="flip" size={22} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.chevron}>
          <Icon name="arrow-up" size={14} color="rgba(255,255,255,0.42)" />
        </View>
      </View>
    </View>
  );
}
```

Add `chevron: { flexDirection: 'row', alignItems: 'center' }` to the styles.

Also delete the old bottom Pressable:
```tsx
<Pressable style={styles.hint} onPress={() => router.push('/history')}>...</Pressable>
```
(and the `hint` style block).

- [ ] **Step 5: Add `EmptyTodayCard` inner component**

Below `CameraPage`:

```tsx
function EmptyTodayCard() {
  const colors = useColors();
  return (
    <View
      style={{
        height: SCREEN_HEIGHT,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}>
      <View style={{ position: 'absolute', top: 60, left: 20, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Hôm nay</Text>
      </View>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>✨</Text>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center' }}>
        Chưa có giao dịch nào hôm nay
      </Text>
      <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 6, textAlign: 'center' }}>
        Chụp bill đầu tiên nhé!
      </Text>
    </View>
  );
}
```

Note: `useColors` requires being inside a component; hence the inner function.

- [ ] **Step 6: Replace the top-level return of `CameraScreen` with a FlatList**

Where the previous JSX started (`return (<View style={styles.root}>...</View>)`), replace with:

```tsx
return (
  <View style={styles.root}>
    <StatusBar style="light" />
    <FlatList
      data={pages}
      keyExtractor={(item, i) =>
        item.type === 'txn' ? `txn-${item.txn.id}` : `${item.type}-${i}`
      }
      renderItem={({ item }) => {
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
              noteInputRef={noteInputRef}
              todayExpense={todayExpense}
            />
          );
        if (item.type === 'empty') return <EmptyTodayCard />;
        return <TxnCard txn={item.txn} />;
      }}
      pagingEnabled
      snapToInterval={SCREEN_HEIGHT}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      scrollEnabled={!noteFocused}
    />
  </View>
);
```

- [ ] **Step 7: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: all green, tsc unchanged for real code (test file baseline may have shifted from Task 2).

- [ ] **Step 8: Commit**

```bash
git add src/app/index.tsx
git commit -m "Refactor camera into Locket-style paging with today's transaction cards"
```

---

### Task 6: Entry screen KeyboardAvoidingView

**Files:**
- Modify: `src/app/entry.tsx`

**Interfaces:**
- Consumes: existing entry layout, `insets.top` (already computed).
- Produces: keyboard no longer covers the note field on Entry; tapping the save button while the keyboard is up dismisses AND fires the tap.

- [ ] **Step 1: Add imports**

At the top of `src/app/entry.tsx`, ensure these RN imports are present (merge into an existing import if there):

```ts
import { KeyboardAvoidingView, Platform } from 'react-native';
```

- [ ] **Step 2: Wrap the scrollable content**

Locate the top-level structure. It looks like:

```tsx
<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
  <ScrollView contentContainerStyle={styles.content}>
    {/* ... existing content ... */}
  </ScrollView>
</View>
```

Replace with:

```tsx
<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={insets.top}
    style={{ flex: 1 }}>
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {/* ... existing content unchanged ... */}
    </ScrollView>
  </KeyboardAvoidingView>
</View>
```

Preserve every child of the ScrollView verbatim. Only the surrounding wrapper changed.

- [ ] **Step 3: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: all green, tsc unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/app/entry.tsx
git commit -m "Wrap Entry in KeyboardAvoidingView so note field stays visible"
```

---

### Task 7: Settings budget modal KeyboardAvoidingView

**Files:**
- Modify: `src/app/settings.tsx`

**Interfaces:**
- Consumes: existing budget Modal at the bottom of the file.
- Produces: keyboard no longer covers the budget number field; sheet slides up above the keyboard on both platforms.

- [ ] **Step 1: Add `Platform` and `KeyboardAvoidingView` to the existing `react-native` import**

Locate the line:

```ts
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
```

Add `KeyboardAvoidingView, Platform`:

```ts
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
```

- [ ] **Step 2: Wrap the sheet inside the budget Modal**

Locate the budget Modal at the bottom of the file. It looks like:

```tsx
<Modal visible={budgetOpen} transparent animationType="slide" onRequestClose={() => setBudgetOpen(false)}>
  <View style={styles.backdrop}>
    <View style={[styles.sheet, { backgroundColor: colors.card }]}>
      {/* budget content */}
    </View>
  </View>
</Modal>
```

Insert a `KeyboardAvoidingView` between the backdrop and the sheet:

```tsx
<Modal visible={budgetOpen} transparent animationType="slide" onRequestClose={() => setBudgetOpen(false)}>
  <View style={styles.backdrop}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ width: '100%' }}>
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        {/* budget content unchanged */}
      </View>
    </KeyboardAvoidingView>
  </View>
</Modal>
```

- [ ] **Step 3: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: all green, tsc unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings.tsx
git commit -m "Wrap Settings budget modal in KeyboardAvoidingView"
```

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run all tests**

Run: `npx jest --silent`

Expected: 39/39 tests passing (baseline 33 + 6 new from TxnCard) across 10 suites.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: baseline 110 + jest-globals growth from `txn-card.test.tsx` (~10-15 additional TS2304/TS2708 errors of the same class already present in every other test file). Verify no new NON-jest-globals errors:

```bash
npx tsc --noEmit 2>&1 | grep -vE "Cannot find name|Cannot use namespace|Do you need to install|Try \`npm|^\s|^$"
```

Expected output: only pre-existing errors (`@/global.css` side-effect import, `Namespace 'global.jest'` items). No new categories.

- [ ] **Step 3: Manual smoke test on device / simulator**

Run: `npx expo start`. Verify each item:

- Cold-boot the app → camera page loads full-screen with the top nav ("Hôm nay" total pill, home, menu buttons) and shutter row visible.
- Tap the bottom half of the viewfinder → keyboard opens with a note input focused above it. Type "Cà phê" → press "Done" on keyboard → keyboard dismisses → a chip "📝 Cà phê" is visible near the bottom of the viewfinder.
- Tap the chip → keyboard re-opens with "Cà phê" preserved.
- Vuốt lên from the bottom half (with or without note) → FlatList snaps to page 1. If today has txns, the newest card is visible: photo full-bleed, "Hôm nay" badge top-left, category chip, amount, note, "Chạm để xem chi tiết →". Tap it → transaction detail screen opens.
- Continue vuốt lên → next card, etc.
- Vuốt xuống from any card → snap back toward camera.
- If today has NO transactions → single empty card with "Chưa có giao dịch nào hôm nay ✨". No history button.
- Press the shutter → NO click sound; capture completes; app routes to `/entry` with note prefilled if you had typed one and photo prefilled if capture succeeded.
- On Entry: open the note field → keyboard slides up but the note field remains visible above it. Save button still tappable in one tap.
- Open Settings → tap "Ngân sách tháng" row → keypad modal opens → keyboard opens → number input remains visible above keyboard.
- Android device only: status bar is opaque with a dark-content style (or system default when transparent). Content does not bleed behind status bar on Home, History, Gallery, Settings, or Camera top nav.

- [ ] **Step 4: If any manual failure, fix and commit as a follow-up commit — do not amend a task that has already shipped**

- [ ] **Step 5: Report done**
