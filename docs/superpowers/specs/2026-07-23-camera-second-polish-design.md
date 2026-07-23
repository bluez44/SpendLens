# SpendLens — Camera polish v2 + Note-as-name + Dark mode fix

**Date:** 2026-07-23
**Status:** Approved (brainstorming)
**Baseline:** `main` at the head of the just-merged camera UX polish + logo work.

## Goal

Close the six remaining rough edges reported after the last field test: an always-visible note-input bar on camera, imprecise multi-item swipe paging, a semantically wrong split between "note" and "name", a broken manual dark-mode override, and the absence of a "back to camera" affordance on the Locket-style paged cards. Also verifies keyboard-avoidance on every screen with a `TextInput`.

## Scope

**In**
- Hide the camera note `TextInput` completely when unfocused; only show a chip preview when text exists.
- Move the camera note KAV+`TextInput` out of the fixed-aspect viewfinder to a screen-level overlay so the keyboard reliably clears it on both platforms.
- Strict 1-page-per-swipe paging on the camera `FlatList`, regardless of gesture velocity; block further swipes during snap animation.
- Camera-typed note becomes the transaction `name`. Entry's "GHI CHÚ" input also feeds `name`. DB column `note` is set to `null` on new writes.
- Fix dark/light mode: `useColors()` must honor `settings.themeMode`, not just the system scheme.
- Add a small circular "back to camera" button (camera icon) at bottom-center when the paged FlatList is off page 0.
- Manual QA checklist for keyboard-avoidance on all three screens with inputs.

**Out**
- SQLite schema change (the `note` column stays but is unused for new writes).
- Migration of existing data (`note` values in older rows are left in the DB but no longer read by the UI).
- Any change to Home, History, Gallery, Transaction detail beyond theme reactivity from the `useColors()` fix.
- Google Sign-In, cloud sync, iOS build config.

## Camera screen changes (`src/app/index.tsx`)

### Note input — conditional render + screen-level overlay

**Current problem:** `<TextInput>` is always mounted inside the viewfinder View. Its dark background is visible even when not focused, so the user sees a bar at the bottom of the viewfinder at all times. Additionally, the KAV around the input is trapped inside a fixed-aspect (`aspectRatio: 1/1.12`) viewfinder with `overflow: 'hidden'` — reliable behavior across screen sizes is not guaranteed.

**Fix:**
1. Conditional-render the `KeyboardAvoidingView + TextInput` block only when `noteFocused === true`. Use `autoFocus` on the TextInput so it opens the keyboard on mount.
2. Move the KAV overlay OUT of the viewfinder to `CameraPage`'s root level, positioned absolute at `bottom: 0`. Remove the `noteInputRef` (no longer needed — autoFocus handles it).
3. The `noteTapZone` Pressable stays inside the viewfinder (covers bottom half, tap → `setNoteFocused(true)`).
4. The chip preview (`{note && !noteFocused && ...}`) stays inside the viewfinder as the visual indicator that a note is pending.

Layout sketch:

```tsx
<View style={{ height: SCREEN_HEIGHT }}>
  <View style={styles.nav}>{/* home / pill / menu */}</View>

  <View style={styles.viewfinderWrap}>
    <View style={styles.viewfinder}>
      <CameraView ... />
      <Pressable style={styles.flashBtn} ... />

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
    </View>
  </View>

  <View style={styles.captureArea}>{/* shutter row + chevron */}</View>

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
</View>
```

Styles:

```ts
noteInputOverlay: {
  position: 'absolute',
  left: 0, right: 0, bottom: 0,
  padding: 12,
  zIndex: 30,
},
noteInput: {
  padding: 12, borderRadius: 16, fontSize: 15, fontWeight: '500',
  backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff',
},
```

Delete the old `noteInputWrap` style entry (superseded by `noteInputOverlay`).

The `capture` handler simplifies — no ref to blur, just `setNoteFocused(false)`:

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

### Strict 1-page-per-swipe paging

Add two pieces of state and wire FlatList:

```tsx
const [isSnapping, setIsSnapping] = useState(false);
const [currentIndex, setCurrentIndex] = useState(0);
const flatListRef = useRef<FlatList>(null);

<FlatList
  ref={flatListRef}
  data={pages}
  keyExtractor={keyExtractor}
  renderItem={renderItem}
  pagingEnabled
  snapToInterval={SCREEN_HEIGHT}
  snapToAlignment="start"
  decelerationRate="fast"
  disableIntervalMomentum={true}      // ← enforce at-most-one page per gesture
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

- `disableIntervalMomentum={true}` prevents skipping past the neighboring snap point even on a very fast fling.
- `scrollEnabled={!noteFocused && !isSnapping}` ensures the user cannot start a second swipe while an animation is in flight.
- `currentIndex` drives the visibility of the back-to-camera button (see below).

### Back-to-camera button

Add `'camera'` to the `IconName` union in `src/components/sl/icons.tsx` and the render switch:

```tsx
// icons.tsx: extend union
export type IconName =
  | 'home' | 'menu' | 'back' | 'grid' | 'close' | 'edit' | 'plus'
  | 'arrow-up' | 'flip' | 'flash' | 'flash-off' | 'settings' | 'share'
  | 'camera';    // ← new

// icons.tsx: render case
{name === 'camera' && (
  <>
    <Path d="M4 8h3l2-2h6l2 2h3v10H4z" {...p} strokeWidth={2} />
    <Circle cx={12} cy={13} r={3.2} {...p} strokeWidth={2} />
  </>
)}
```

Overlay in `CameraScreen` (outside the FlatList so the button stays fixed):

```tsx
<View style={styles.root}>
  <StatusBar style="light" />
  <FlatList ... />
  {currentIndex > 0 && (
    <Pressable
      style={[styles.backToCamera, { bottom: insets.bottom + 24 }]}
      onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
    >
      <Icon name="camera" size={22} color="#fff" />
    </Pressable>
  )}
</View>
```

Styles:

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

## Note becomes Name (`src/app/entry.tsx`)

### Save logic

Currently the payload writes `name: isIncome ? 'Thu nhập' : categoryOf(category).label` and `note: note.trim() || null`. Reverse the responsibility:

```tsx
const payload: NewTxn = {
  date: ...,
  time: ...,
  category: isIncome ? 'other' : category,
  name: note.trim() || (isIncome ? 'Thu nhập' : categoryOf(category).label),
  note: null,
  amount,
  isIncome,
  photoPath: photoUri ?? null,
};
```

### Prefill

Change the state initializer to read from `existing.name` first:

```tsx
const [note, setNote] = useState(existing?.name ?? params.note ?? '');
```

Rationale: after this change, `existing.name` is the source of user text. Reading `existing.note` would show empty on edit (post-fix rows have `note: null`).

### Existing data

- Pre-fix rows with `name = category label` and `note = null`: edit shows empty input; save recomputes `name` from category if still empty. Net-neutral.
- Pre-fix rows with `note` populated (e.g. seed data): edit does NOT re-display that note; save writes `note: null` and derives `name`. Old `note` value stays in the DB but is unreachable via UI. Acceptable for a dev app. Optional cleanup: update `src/lib/seed.ts` so seed rows store user-facing text as `name`, keeping `note: null`.

### Camera route param

`?note=<text>` search param stays. Camera passes it, Entry prefills the `note` state (which is now the user-text-that-becomes-name). Semantic drift is contained to a single param key name; no downstream consumer breaks.

## Dark / Light mode fix

### Root cause

`src/constants/tokens.ts:99-102`:

```tsx
export function useColors(): SLColors {
  const scheme = useColorScheme();   // system scheme, ignores user override
  return getColors(scheme);
}
```

Every screen calling `useColors()` gets the palette for the OS scheme, no matter what `settings.themeMode` says. Only the React Navigation header (via expo-router's `<ThemeProvider>`) sees the resolved value.

### Fix

Add a small `ThemeContext` under `src/lib/theme-context.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';

type EffectiveScheme = 'light' | 'dark';

const ThemeContext = createContext<EffectiveScheme>('light');

export function ThemeProvider({ value, children }: { value: EffectiveScheme; children: ReactNode }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useEffectiveScheme(): EffectiveScheme {
  return useContext(ThemeContext);
}
```

Modify `src/constants/tokens.ts`:

```tsx
import { useEffectiveScheme } from '@/lib/theme-context';

export function useColors(): SLColors {
  const scheme = useEffectiveScheme();
  return getColors(scheme);
}
```

Default context value `'light'` prevents crashes in test environments and isolated component previews.

Wire in `src/app/_layout.tsx` — import our provider as `SLThemeProvider` to avoid name clash with expo-router's `ThemeProvider`:

```tsx
import { ThemeProvider as SLThemeProvider } from '@/lib/theme-context';
// ...
function ThemedShell({ scheme }: { scheme: string | null | undefined }) {
  const { settings } = useSettings();
  const rawEffective = settings.themeMode === 'auto' ? scheme : settings.themeMode;
  const effective: 'light' | 'dark' = rawEffective === 'dark' ? 'dark' : 'light';
  const colors = getColors(effective);
  return (
    <SLThemeProvider value={effective}>
      <NavThemeProvider value={effective === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style={effective === 'dark' ? 'light' : 'dark'} />
        <Stack ...>...</Stack>
      </NavThemeProvider>
    </SLThemeProvider>
  );
}
```

`StatusBar style` also switches with the resolved theme (previously `"auto"` which followed system regardless).

Camera screen (`src/app/index.tsx`) keeps its hardcoded `<StatusBar style="light" />` — camera surface is always dark regardless of theme.

## Keyboard-avoidance verification

Three screens have `TextInput`. Verify each on both a small iPhone (iPhone SE, 320pt width) and a mid-range Android (Pixel 4a, 411dp width) before shipping:

1. **Camera (`src/app/index.tsx`)** — tap the lower half of the viewfinder → keyboard opens → the note `TextInput` is fully visible directly above the keyboard. The shutter button and other viewfinder chrome may be covered by the keyboard; acceptable since focus is on typing.
2. **Entry (`src/app/entry.tsx`)** — open Entry with amount focused → amount field visible. Tap the "GHI CHÚ" input → it scrolls into view. The save button ("Lưu khoản chi" / "Cập nhật") remains reachable via a small scroll if the ScrollView content is tall.
3. **Settings budget modal (`src/app/settings.tsx`)** — Settings → tap "Ngân sách tháng" → keypad modal → keyboard opens → the number field, live formatted preview, "Huỷ" / "Lưu" buttons all remain visible above the keyboard.

Any failure is treated as a regression and fixed inline.

## Files touched

- `src/app/index.tsx` — Issues 1, 2, 6 (note overlay, paging, back-to-camera button).
- `src/app/entry.tsx` — Issues 3, 4 (note-as-name).
- `src/components/sl/icons.tsx` — Issue 6 (`'camera'` icon).
- `src/constants/tokens.ts` — Issue 5 (`useColors` consults `ThemeContext`).
- `src/lib/theme-context.tsx` — Issue 5 (new file).
- `src/app/_layout.tsx` — Issue 5 (wrap in `SLThemeProvider`; StatusBar style).
- `src/lib/seed.ts` — optional cleanup: move seed row `note` text into `name` (only if the seed uses `note`).

## Testing

**Unit tests to add:**
- `src/lib/theme-context.test.tsx` — `useEffectiveScheme()` returns provider value; returns `'light'` default outside a provider.
- `src/app/entry.test.tsx` — save writes `name = note.trim()` when input non-empty; falls back to category label when empty; falls back to `'Thu nhập'` when income + empty. Edit prefills from `existing.name`. If provider mocking makes this test flaky, skip and document (same reason as previous plan's M7 skip).

**Unit tests unchanged:**
- `txn-card.test.tsx`, `budget-bar.test.tsx`, `notifications.test.ts`, `settings.test.ts`, `export.test.ts`, `format.test.ts`, `categories.test.ts`, `transactions.test.ts`, `db.test.ts`, `sanity.test.ts`.

**Verification bar per task:**
- `npx jest --silent` all green.
- `npx tsc --noEmit 2>&1 | grep -cE "error TS[0-9]+"` — must not exceed the pre-work baseline of **129** by more than the new test files' jest-globals contribution (same class as pre-existing errors).

**Manual smoke test** (see Camera / Entry / Settings sections above) + explicit checks per issue:
- **Issue 1:** camera opens with NO dark input bar visible; tap → input appears; blur with text → chip; blur empty → nothing.
- **Issue 2:** rapid triple-swipe up → advances exactly 3 pages, each snap completes before the next fires. Slow swipe → same behavior.
- **Issue 3:** camera type "Cà phê" → shutter → Entry shows "Cà phê" prefilled in GHI CHÚ; save → History row shows name "Cà phê".
- **Issue 4:** open Entry from History `+` → type "Bún bò" in GHI CHÚ → save → row shows name "Bún bò".
- **Issue 5:** Settings → Tối → all screens flip dark. Sáng → light. Auto → follows system change.
- **Issue 6:** swipe up on camera → camera icon 📷 appears at bottom-center. Tap → snaps back to page 0. On page 0 → button is hidden.

## Not in scope / rejected alternatives

- **Dropping the `note` column from schema.** Would require SQLite migration and risks breaking any external export tooling. Keeping the column as unused is cheaper.
- **Replacing FlatList with `react-native-pager-view`.** `disableIntervalMomentum` on FlatList achieves the same 1-per-swipe behavior without adding a dependency.
- **A global `KeyboardAvoidingView` in `_layout.tsx`.** Wraps everything but interferes with screens without inputs (e.g., camera page 0's shutter row). Per-screen KAV is more predictable.
