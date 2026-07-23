# Camera Polish v2 + Note-as-Name + Dark Mode Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close six second-round field-test issues: always-visible camera note bar, imprecise multi-item swipe paging, split note/name concepts, broken dark-mode override, and missing back-to-camera affordance on paged cards; also verify keyboard-avoidance on every input.

**Architecture:** Add a small `ThemeContext` so `useColors()` respects the user's `settings.themeMode` (currently ignores it). Refactor `src/app/index.tsx`: move the note `TextInput` from inside the fixed-aspect viewfinder to a screen-level absolute overlay that only renders when focused (with `autoFocus`); wire `disableIntervalMomentum` + `isSnapping` for strict 1-page-per-swipe FlatList paging; add a floating back-to-camera button when scrolled off page 0. Change Entry's save so the note becomes the transaction `name`; the DB `note` column stays but is written as `null`.

**Tech Stack:** Expo SDK 57, React Native `FlatList` + `KeyboardAvoidingView`, `expo-router`, React Context, TypeScript, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-07-23-camera-second-polish-design.md`

## Global Constraints

- Baseline branch: `main` at `bd66ffa` (spec commit). No schema changes to SQLite.
- The DB `note` column stays in the schema but writes always store `null` after this plan; UI reads `existing.name` for prefill.
- Vietnamese UI copy verbatim: `Thêm ghi chú...`, `Ăn uống` (etc from `categories.ts`), `Thu nhập`, `Lưu khoản chi`, `Cập nhật`.
- SQLite access remains synchronous (`execSync`/`getAllSync`/`runSync`).
- The `note` route param key stays as `?note=` — semantic drift is contained; downstream consumer (`entry.tsx`) treats that value as the future `name`.
- Verification bar per task: `npx jest --silent` all green; `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"` must not exceed **129** (pre-work baseline) beyond jest-globals-class errors added by new `.test.ts/.tsx` files (~10-25 per file, same TS2304/TS2708 pattern as existing test files).
- No new dependencies. Do NOT add `react-native-pager-view` or `react-native-gesture-handler` beyond what's already installed.
- Commit locally after each task; do not push. Camera screen (`src/app/index.tsx`) keeps its hardcoded `<StatusBar style="light" />` (camera surface is always dark).

---

## File Structure

**New**
- `src/lib/theme-context.tsx` — `ThemeProvider` + `useEffectiveScheme()`. Publishes the resolved `'light' | 'dark'`.
- `src/lib/theme-context.test.tsx` — provider round-trip + default-outside-provider.

**Modified**
- `src/constants/tokens.ts` — `useColors()` reads `useEffectiveScheme()` instead of `useColorScheme()`.
- `src/app/_layout.tsx` — wrap `ThemedShell` tree in `SLThemeProvider`; make `<StatusBar style>` follow the effective scheme.
- `src/components/sl/icons.tsx` — add `'camera'` to `IconName` union + render case.
- `src/app/index.tsx` — Issues 1, 2, 6 (note overlay refactor, strict paging, back-to-camera button).
- `src/app/entry.tsx` — Issues 3, 4 (note-as-name in save + prefill).
- `src/lib/seed.ts` — optional cleanup: move seed row `note` text into `name` field for consistency.

**Optional new**
- `src/app/entry.test.tsx` — save/prefill contract tests (skip if provider mock chain is too tangled — same reason as earlier plan's M7 skip).

---

### Task 1: Add ThemeContext and rewire useColors

**Files:**
- Create: `src/lib/theme-context.tsx`
- Create: `src/lib/theme-context.test.tsx`
- Modify: `src/constants/tokens.ts`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `useSettings()` from `@/lib/settings-context` (existing) — reads `settings.themeMode`. `useColorScheme()` from `react-native` (existing).
- Produces:
  - `<ThemeProvider value={'light' | 'dark'}>` component.
  - `useEffectiveScheme(): 'light' | 'dark'`.
  - `useColors()` from `@/constants/tokens` now returns the palette for the resolved theme (auto | light | dark). Every screen that already imports `useColors()` reacts to theme changes without further edits.

- [ ] **Step 1: Write failing test**

Create `src/lib/theme-context.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider, useEffectiveScheme } from './theme-context';

function ProbeScheme() {
  const s = useEffectiveScheme();
  return <Text testID="probe">{s}</Text>;
}

describe('theme-context', () => {
  it('returns "light" outside a provider (default)', async () => {
    const { getByTestId } = await render(<ProbeScheme />);
    expect(getByTestId('probe').props.children).toBe('light');
  });

  it('returns the provider value when wrapped', async () => {
    const { getByTestId } = await render(
      <ThemeProvider value="dark">
        <ProbeScheme />
      </ThemeProvider>,
    );
    expect(getByTestId('probe').props.children).toBe('dark');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/theme-context.test.tsx`

Expected: FAIL with "Cannot find module './theme-context'".

- [ ] **Step 3: Implement `theme-context.tsx`**

Create `src/lib/theme-context.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';

type EffectiveScheme = 'light' | 'dark';

const ThemeContext = createContext<EffectiveScheme>('light');

export function ThemeProvider({
  value,
  children,
}: {
  value: EffectiveScheme;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useEffectiveScheme(): EffectiveScheme {
  return useContext(ThemeContext);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/theme-context.test.tsx`

Expected: 2 tests pass.

- [ ] **Step 5: Update `useColors` in `src/constants/tokens.ts`**

Replace the current `useColors()` (lines 98-102):

```tsx
import { useEffectiveScheme } from '@/lib/theme-context';

// ... keep getColors(scheme) as-is above.

/** Hook: current SpendLens palette. Honors settings.themeMode via ThemeContext. */
export function useColors(): SLColors {
  const scheme = useEffectiveScheme();
  return getColors(scheme);
}
```

Delete the now-unused `import { useColorScheme } from 'react-native';` line at the top of the file — the hook no longer needs it.

- [ ] **Step 6: Wire `SLThemeProvider` into `src/app/_layout.tsx`**

The current file has a `ThemedShell({ scheme })` that computes `effective` inline. Import our provider (alias to avoid name clash with expo-router's `ThemeProvider`) and wrap the children of ThemedShell:

At the top of `src/app/_layout.tsx`, add:

```ts
import { ThemeProvider as SLThemeProvider } from '@/lib/theme-context';
```

In `ThemedShell`, after computing `effective` and `colors`, wrap the return value like this:

```tsx
return (
  <SLThemeProvider value={effective}>
    <ThemeProvider value={effective === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={effective === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        {/* preserve every existing Stack.Screen entry verbatim */}
      </Stack>
    </ThemeProvider>
  </SLThemeProvider>
);
```

Note: the `<StatusBar style>` changes from `"auto"` to `effective === 'dark' ? 'light' : 'dark'` so the status bar chrome follows the manual override.

`effective` must be narrowed to `'light' | 'dark'` before passing to SLThemeProvider — the existing computation `settings.themeMode === 'auto' ? scheme : settings.themeMode` returns `string | null | undefined`. Coerce with:

```tsx
const rawEffective = settings.themeMode === 'auto' ? scheme : settings.themeMode;
const effective: 'light' | 'dark' = rawEffective === 'dark' ? 'dark' : 'light';
const colors = getColors(effective);
```

Replace the existing `effective`/`colors` computation with this.

- [ ] **Step 7: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: all green (41 tests, 11 suites); tsc growth from new test file's jest-globals is acceptable (record delta).

- [ ] **Step 8: Commit**

```bash
git add src/lib/theme-context.tsx src/lib/theme-context.test.tsx src/constants/tokens.ts src/app/_layout.tsx
git commit -m "Route useColors through a ThemeContext so themeMode override actually applies"
```

---

### Task 2: Add `camera` icon

**Files:**
- Modify: `src/components/sl/icons.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `<Icon name="camera" size={22} color="#fff" />` renders a camera glyph. Available for Task 5.

- [ ] **Step 1: Extend the `IconName` union**

At the top of `src/components/sl/icons.tsx`, find the current union (`'home' | 'menu' | ... | 'share'`) and append `| 'camera'`:

```ts
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
  | 'camera';
```

- [ ] **Step 2: Add the render case**

Inside the `Icon` component's returned JSX (the block of `{name === '...' && ...}` conditionals), add:

```tsx
{name === 'camera' && (
  <>
    <Path d="M4 8h3l2-2h6l2 2h3v10H4z" {...p} strokeWidth={2} />
    <Circle cx={12} cy={13} r={3.2} {...p} strokeWidth={2} />
  </>
)}
```

`Path` and `Circle` are already imported at the top of the file.

- [ ] **Step 3: Verify tsc + jest**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green; tsc unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/icons.tsx
git commit -m "Add camera icon to sl/icons"
```

---

### Task 3: Entry — note becomes name

**Files:**
- Modify: `src/app/entry.tsx`

**Interfaces:**
- Consumes: existing `note`, `setNote` state (from previous plan's rewire); `existing?.name` (from txn record); `params.note` (from camera route).
- Produces: On save, `name = note.trim() || (isIncome ? 'Thu nhập' : categoryOf(category).label)` and `note = null`. On edit, `note` state initializes from `existing?.name` (not `existing?.note`).

- [ ] **Step 1: Change the state initializer**

Locate:

```tsx
const [note, setNote] = useState(existing?.note ?? params.note ?? '');
```

Replace with:

```tsx
const [note, setNote] = useState(existing?.name ?? params.note ?? '');
```

- [ ] **Step 2: Change the save payload**

Locate the payload construction in `save`:

```tsx
const payload: NewTxn = {
  date: editing && existing ? existing.date : toDateKey(new Date()),
  time: editing && existing ? existing.time : nowTime(),
  category: isIncome ? 'other' : category,
  name: name.trim() || (isIncome ? 'Thu nhập' : categoryOf(category).label),
  note: note.trim() || null,
  amount,
  isIncome,
  photoPath: photoUri ?? null,
};
```

Replace the `name:` and `note:` lines with:

```tsx
  name: note.trim() || (isIncome ? 'Thu nhập' : categoryOf(category).label),
  note: null,
```

(The `note` state variable is repurposed to hold the user-typed text that becomes the name.)

- [ ] **Step 3: Verify no `name` state remains**

The current file has a `name`/`setName` state from before the previous plan. Search for it:

Run: `grep -n "name\|setName" src/app/entry.tsx | head -20`

If a `const [name, setName]` state binding still exists, delete it. If the "GHI CHÚ" TextInput still binds `value={name} onChangeText={setName}`, change it to `value={note} onChangeText={setNote}`. (This wiring was already done in the previous plan's I1 fix; verify with the grep before making changes.)

- [ ] **Step 4: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: 39/39 green; tsc unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/entry.tsx
git commit -m "Save note text as transaction name; DB note column now always null on writes"
```

---

### Task 4: Camera note overlay refactor (Issue 1)

**Files:**
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: existing `note`, `noteFocused`, `setNote`, `setNoteFocused` state on `CameraScreen`; existing `capture` handler.
- Produces:
  - The `TextInput` no longer mounts when `noteFocused === false` (nothing renders at the bottom of the viewfinder).
  - The `KeyboardAvoidingView + TextInput` overlay lives at the `CameraPage` root level (not inside the viewfinder), so keyboard-avoidance works on both platforms.
  - `noteInputRef` is deleted (autoFocus replaces manual focus).

- [ ] **Step 1: Remove `noteInputRef` state and prop plumbing**

In `CameraScreen`, delete:

```tsx
const noteInputRef = useRef<TextInput>(null);
```

Also delete `noteInputRef` from the `CameraPage` props type union and from the props passed to `<CameraPage ... />`.

Delete the corresponding `noteInputRef` line in the `CameraPage` component signature. Anywhere `noteInputRef.current?.focus()` or `.blur()` is called, replace with `setNoteFocused(true)` / `setNoteFocused(false)` (see next steps).

- [ ] **Step 2: Update the tap zone and chip preview `onPress` handlers**

In `CameraPage`, change:

```tsx
<Pressable
  style={styles.noteTapZone}
  onPress={() => noteInputRef.current?.focus()}
  pointerEvents={noteFocused ? 'none' : 'auto'}
/>
```

to:

```tsx
<Pressable
  style={styles.noteTapZone}
  onPress={() => setNoteFocused(true)}
  pointerEvents={noteFocused ? 'none' : 'auto'}
/>
```

Change the chip preview similarly:

```tsx
{note && !noteFocused ? (
  <Pressable style={styles.notePreview} onPress={() => setNoteFocused(true)}>
    <Icon name="edit" size={12} color="rgba(255,255,255,0.85)" />
    <Text numberOfLines={1} style={styles.notePreviewText}>{note}</Text>
  </Pressable>
) : null}
```

- [ ] **Step 3: Move the `KeyboardAvoidingView + TextInput` OUT of the viewfinder to screen level**

Delete the existing block inside `<View style={styles.viewfinder}>`:

```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  style={styles.noteInputWrap}
  pointerEvents={noteFocused ? 'auto' : 'none'}
>
  <TextInput ref={noteInputRef} ... />
</KeyboardAvoidingView>
```

At the end of `CameraPage`'s top-level View (as a sibling of `viewfinderWrap` and `captureArea`, before the closing `</View>`), add:

```tsx
{noteFocused && (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={styles.noteInputOverlay}
  >
    <TextInput
      autoFocus
      value={note}
      onChangeText={setNote}
      onBlur={() => setNoteFocused(false)}
      placeholder="Thêm ghi chú..."
      placeholderTextColor="rgba(255,255,255,0.5)"
      returnKeyType="done"
      onSubmitEditing={() => setNoteFocused(false)}
      maxLength={140}
      style={styles.noteInput}
    />
  </KeyboardAvoidingView>
)}
```

- [ ] **Step 4: Rename and adjust styles**

In the `StyleSheet.create(...)` block:
- Delete the `noteInputWrap` entry.
- Add `noteInputOverlay`:

```ts
noteInputOverlay: {
  position: 'absolute',
  left: 0, right: 0, bottom: 0,
  padding: 12,
  zIndex: 30,
},
```

- Update `noteInput` to bump opacity for readability against screen bg:

```ts
noteInput: {
  padding: 12, borderRadius: 16, fontSize: 15, fontWeight: '500',
  backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff',
},
```

- [ ] **Step 5: Simplify the `capture` handler**

Locate `capture` in `CameraScreen`. The current version has `noteInputRef.current?.blur();`. Replace it with `setNoteFocused(false);`:

```tsx
const capture = async () => {
  const currentNote = note;
  setNoteFocused(false);
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

Delete any remaining reference to `noteInputRef` in the file (e.g., an import of `useRef` should stay only if `useRef` is used elsewhere — `cameraRef` still needs it, so keep the `useRef` import).

- [ ] **Step 6: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green; tsc unchanged (all changes are structural, no new test file).

- [ ] **Step 7: Commit**

```bash
git add src/app/index.tsx
git commit -m "Hide camera note input until focused; move overlay out of viewfinder to screen level"
```

---

### Task 5: Camera strict paging + back-to-camera button (Issues 2, 6)

**Files:**
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: `TxnCard` (existing), `Icon` from `@/components/sl/icons` (Task 2 adds `'camera'`), `useTransactions().transactions`, `flatListRef`.
- Produces: FlatList paging is strict 1-page-per-swipe; a floating camera icon at bottom-center appears when the user has scrolled off page 0, tapping it snaps back to page 0.

- [ ] **Step 1: Add new state and ref**

Inside `CameraScreen`, near the other state:

```tsx
const [isSnapping, setIsSnapping] = useState(false);
const [currentIndex, setCurrentIndex] = useState(0);
const flatListRef = useRef<FlatList>(null);
```

Ensure `FlatList` is imported from `react-native` (it already is per the current file).

- [ ] **Step 2: Update FlatList props**

Locate the existing `<FlatList ... />` inside `CameraScreen`'s return. Replace the prop list with:

```tsx
<FlatList
  ref={flatListRef}
  data={pages}
  keyExtractor={keyExtractor}
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
          todayExpense={todayExpense}
        />
      );
    if (item.type === 'empty') return <EmptyTodayCard />;
    return <TxnCard txn={item.txn} />;
  }}
  pagingEnabled
  snapToInterval={SCREEN_HEIGHT}
  snapToAlignment="start"
  decelerationRate="fast"
  disableIntervalMomentum
  showsVerticalScrollIndicator={false}
  scrollEnabled={!noteFocused && !isSnapping}
  onMomentumScrollBegin={() => setIsSnapping(true)}
  onMomentumScrollEnd={(e) => {
    setIsSnapping(false);
    setCurrentIndex(Math.round(e.nativeEvent.contentOffset.y / SCREEN_HEIGHT));
  }}
  scrollEventThrottle={16}
/>
```

Note: `noteInputRef` is no longer passed to `CameraPage` (removed in Task 4). `keyExtractor` was already extracted to a `useCallback` in the previous plan; keep that.

- [ ] **Step 3: Add the back-to-camera Pressable**

Just BEFORE the closing `</View>` of the root `<View style={styles.root}>`, after the `<FlatList>`, add:

```tsx
{currentIndex > 0 && (
  <Pressable
    style={[styles.backToCamera, { bottom: insets.bottom + 24 }]}
    onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
    accessibilityLabel="Về camera">
    <Icon name="camera" size={22} color="#fff" />
  </Pressable>
)}
```

- [ ] **Step 4: Add the button style**

In `StyleSheet.create(...)` at the bottom of the file, add:

```ts
backToCamera: {
  position: 'absolute',
  alignSelf: 'center',
  width: 48, height: 48, borderRadius: 24,
  backgroundColor: 'rgba(0,0,0,0.55)',
  alignItems: 'center', justifyContent: 'center',
  zIndex: 20,
},
```

- [ ] **Step 5: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green; tsc unchanged (all changes are structural).

- [ ] **Step 6: Commit**

```bash
git add src/app/index.tsx
git commit -m "Strict 1-page-per-swipe paging + back-to-camera button on camera"
```

---

### Task 6: Optional — migrate seed data (`note` → `name`)

**Files:**
- Modify: `src/lib/seed.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: fresh installs seed transactions where user-facing text lives in `name` (not `note`), matching the post-fix semantics.

- [ ] **Step 1: Inspect the current seed**

Run: `grep -n "note\|name" src/lib/seed.ts | head -20`

If every seed row already has an empty/null `note` and a proper `name`, skip this task entirely — no change needed. Commit the ledger entry noting it was a no-op and move on.

If seed rows have a populated `note` with user-facing text (e.g., `"Cà phê sáng"`) and a generic `name` (e.g., `"food"` or the category label), continue.

- [ ] **Step 2: For each seed row, move `note` value into `name`**

For every insert whose `note` is meaningful, set `name` to that value and set `note` to `null` (or omit if the `NewTxn` type allows optional `note`).

Example transformation:

```ts
// BEFORE
{ date: '2026-07-15', time: '08:00', category: 'food', name: '', note: 'Cà phê sáng', amount: 45000, isIncome: false, photoPath: 'https://...' }

// AFTER
{ date: '2026-07-15', time: '08:00', category: 'food', name: 'Cà phê sáng', note: null, amount: 45000, isIncome: false, photoPath: 'https://...' }
```

If a seed row has both a `name` AND a `note`, prefer the more descriptive one for `name` (usually the `note`) and drop the other.

- [ ] **Step 3: Verify jest + tsc**

Run: `npx jest --silent && npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: green (seed changes don't affect existing tests unless a test asserts a specific row's `note`, which none currently do).

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add src/lib/seed.ts
git commit -m "Migrate seed row user-facing text from note to name field"
```

Skip the commit if Step 1 determined no changes were needed.

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run all tests**

Run: `npx jest --silent`

Expected: 41/41 tests (baseline 39 + 2 new from theme-context.test) across 11 suites.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"`

Expected: baseline 129 + jest-globals from new `theme-context.test.tsx` (~4-10 additional errors of the same TS2304/TS2708 class present in every other test file). Verify no new NON-jest-globals errors:

```bash
npx tsc --noEmit 2>&1 | grep -vE "Cannot find name|Cannot use namespace|Do you need to install|Try \`npm|^\s|^$"
```

Expected output: only pre-existing errors (`@/global.css` side-effect import, `Namespace 'global.jest'` items). No new categories.

- [ ] **Step 3: Manual smoke test on device / simulator**

Run: `npx expo start`. Verify each issue explicitly on both a small iPhone (iPhone SE, 320pt width) AND a mid-range Android (Pixel 4a, 411dp width) if available.

**Issue 1 — hidden camera note input:**
- Cold-boot the app → camera page loads. NO dark input bar is visible at the bottom of the viewfinder.
- Tap the lower half of the viewfinder → keyboard opens, a dark input appears above the keyboard, focused.
- Type "Cà phê" → tap outside or press Done → keyboard dismisses → a chip "📝 Cà phê" is visible near the bottom of the viewfinder.
- Tap the chip → keyboard re-opens with "Cà phê" preserved.
- Clear the text and blur → NOTHING is visible at the bottom of the viewfinder (no chip, no input bar).

**Issue 2 — strict paging:**
- Swipe up hard from the bottom half → FlatList advances exactly one page.
- Immediately swipe again before the snap animation ends → the swipe is ignored (scroll disabled during snap).
- Wait for snap → swipe again → advances one more page.
- Repeat with a slow swipe → same behavior.

**Issue 3 — camera note as name:**
- On camera, type "Cà phê" → tap shutter → land on Entry. The GHI CHÚ input shows "Cà phê" prefilled.
- Tap Lưu → return to History (or Home) → the newest transaction row displays the name "Cà phê" (not "Ăn uống").

**Issue 4 — entry note as name:**
- From History, tap `+` (or route to `/entry` fresh) → GHI CHÚ input is empty.
- Type "Bún bò" → tap Lưu → History shows a row with name "Bún bò".
- Do NOT type anything → tap Lưu → name falls back to category label ("Ăn uống" for food expense) or "Thu nhập" for income.

**Issue 5 — dark/light mode:**
- Open Settings → theme is Auto (default).
- Tap "Tối" → every screen (Home, History, Gallery, Settings, Camera nav, budget bar text, category chips) flips to the dark palette instantly. No screen remains in light mode.
- Tap "Sáng" → everything flips back to light.
- Tap "Auto" → theme matches system (change device theme in the OS to verify).
- Camera screen (`/`) remains dark regardless — it has a hardcoded dark bg and `StatusBar style="light"`.

**Issue 6 — back-to-camera button:**
- Cold-boot camera → no back-to-camera button visible (currentIndex = 0).
- Swipe up once → back-to-camera camera icon appears at bottom-center of screen.
- Swipe up again → button remains visible.
- Tap the button → FlatList snaps back to page 0 → button disappears.

**Keyboard-avoidance (cross-cutting):**
- Camera (Issue 1 test above) — input fully clears keyboard.
- Entry → focus amount → amount visible above keyboard. Focus GHI CHÚ → input scrolls into view above keyboard. Save button reachable.
- Settings → tap "Ngân sách tháng" → keypad modal opens → keyboard opens → number input, live-formatted preview, and Huỷ/Lưu buttons all remain visible above the keyboard.

- [ ] **Step 4: If any manual failure, fix and commit as a follow-up commit — do not amend a task that has already shipped**

- [ ] **Step 5: Report done**
