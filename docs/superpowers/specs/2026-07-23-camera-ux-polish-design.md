# SpendLens — Camera UX polish (Locket paging, note input, keyboard, safe area)

**Date:** 2026-07-23
**Status:** Approved (brainstorming)
**Baseline:** `feature/settings-notifications-export` at `5abe1ed` (post-Settings/Notifications/Export merge)

## Goal

Fix five UX rough edges reported after the first field test: keyboard overlapping input on entry / settings, a broken and unlabelled camera note input, camera shutter sound, absence of a working "swipe up to see history" gesture, and status-bar bleed on some Android screens. The largest change is a Locket-style vertical paging camera screen that reveals today's transactions as full-screen cards.

## Scope

**In**
- Camera screen overhaul: full-screen vertical paging (page 0 = camera, pages 1..N = today's transactions).
- Hidden note input on the camera page — bottom half of the viewfinder is a tap zone that focuses a hidden TextInput; typed text is carried through to Entry via route params.
- Shutter sound disabled.
- Keyboard-avoiding behavior on Entry, Settings budget modal, and the new camera note input.
- Global status-bar config so Android matches iOS (no more content bleed behind status bar).
- Empty state card for the camera paging list when no transactions today.

**Out**
- Any change to /home, /history, /gallery, /transaction/[id] beyond safe area posture.
- New transaction fields, new categories, or persistence changes.
- Google Sign-In, cloud sync, stats screen.
- Bottom sheet library additions — everything runs on core React Native primitives + expo-linear-gradient (already an Expo peer).

## Camera screen — Locket-style paging

### Structure

`src/app/index.tsx` becomes a `FlatList` with `pagingEnabled`. Each page fills the screen (`height: SCREEN_HEIGHT`). Data:

```ts
const pages =
  todayTxns.length === 0
    ? [{ type: 'camera' }, { type: 'empty' }]
    : [{ type: 'camera' }, ...todayTxns.map((t) => ({ type: 'txn', txn: t }))];
```

- `todayTxns = transactions.filter((t) => t.date === toDateKey(new Date()))` — newest first (relies on the context's existing ordering from `listTransactions`).
- No cap: today is typically 0–20 entries; if a user racks up more, the list still paginates fine.
- Only ONE list mounts. Recycling handled by `FlatList` virtualization.

FlatList config:
- `pagingEnabled`
- `snapToInterval={SCREEN_HEIGHT}`
- `decelerationRate="fast"`
- `showsVerticalScrollIndicator={false}`
- `scrollEnabled={!noteFocused}` — see gesture section

### CameraPage (page 0)

Extracted into an inner component of `index.tsx` (single file, keeps state colocated). Reuses today's top nav, viewfinder, and capture area verbatim, minus:
- The static "Thêm ghi chú..." caption text (deleted).
- The bottom "Vuốt lên xem lịch sử" Pressable (deleted — FlatList handles the gesture; a small `⌃` chevron below the shutter is enough as a subtle indicator).

Adds the note input primitives (see Note input section).

### TxnCard (page 1..N when non-empty)

New file `src/components/sl/txn-card.tsx`. Full-screen card:

```tsx
export function TxnCard({ txn }: { txn: Txn }) {
  const cat = categoryOf(txn.category);
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
        <Text style={styles.amount}>
          {(txn.isIncome ? '+' : '−') + formatVND(txn.amount)}
        </Text>
        {txn.note ? <Text style={styles.note} numberOfLines={2}>{txn.note}</Text> : null}
        <Text style={styles.tapHint}>Chạm để xem chi tiết →</Text>
      </View>
    </Pressable>
  );
}
```

- Uses `expo-image`'s `Image` with `contentFit="cover"` — already installed.
- Uses `expo-linear-gradient` for the bottom fade — install if missing (`npx expo install expo-linear-gradient`).
- Tap the card → `router.push('/transaction/${id}')`. Detail screen already exists; no changes required there.
- Card `height: SCREEN_HEIGHT` so pagination snaps cleanly.

### EmptyTodayCard (page 1 when no txns)

Inline component in `index.tsx` (single-use):

```tsx
function EmptyTodayCard() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }]}>
      <View style={styles.todayBadge}>
        <Text style={styles.todayBadgeText}>Hôm nay</Text>
      </View>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>✨</Text>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>
        Chưa có giao dịch nào hôm nay
      </Text>
      <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 6 }}>
        Chụp bill đầu tiên nhé!
      </Text>
    </View>
  );
}
```

No history button (per decision). `height: SCREEN_HEIGHT`.

## Camera note input

### State

```tsx
const [note, setNote] = useState('');
const [noteFocused, setNoteFocused] = useState(false);
const noteInputRef = useRef<TextInput>(null);
```

### Layout (inside `viewfinder` View, no structural change to surrounding layout)

```tsx
{/* Tap zone — bottom half of viewfinder, invisible */}
<Pressable
  style={styles.noteTapZone}
  onPress={() => noteInputRef.current?.focus()}
  pointerEvents={noteFocused ? 'none' : 'auto'}
/>

{/* Chip preview — visible when note has text and not focused */}
{note && !noteFocused && (
  <Pressable style={styles.notePreview} onPress={() => noteInputRef.current?.focus()}>
    <Icon name="edit" size={12} color="rgba(255,255,255,0.85)" />
    <Text numberOfLines={1} style={styles.notePreviewText}>{note}</Text>
  </Pressable>
)}

{/* Input — hidden until focused, KeyboardAvoidingView so keyboard pushes it up */}
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

### Styles (relevant additions)

```ts
noteTapZone: {
  position: 'absolute', left: 0, right: 0, bottom: 0,
  height: '50%',    // bottom half of viewfinder
  zIndex: 5,
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

### Route hand-off

Shutter handler carries the note into the entry route:

```tsx
const capture = async () => {
  const currentNote = note;
  noteInputRef.current?.blur();
  try {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
    router.push({
      pathname: '/entry',
      params: photo?.uri
        ? { photo: photo.uri, note: currentNote }
        : currentNote ? { note: currentNote } : undefined,
    });
  } catch {
    router.push({ pathname: '/entry', params: currentNote ? { note: currentNote } : undefined });
  }
};
```

Entry updates to consume `note` param:

```tsx
const params = useLocalSearchParams<{ photo?: string; note?: string; id?: string }>();
// ... existing existingTxn lookup
const initialNote = params.note ?? existingTxn?.note ?? '';
const [note, setNote] = useState(initialNote);
```

Route param wins when there is no `id` (fresh capture). When editing (`id` present), the existing txn's note takes precedence — camera route param is irrelevant to edit flow.

### Lifecycle

- Note state lives on the camera page. Resets naturally when the camera screen remounts after navigation returns.
- No persistence across launches — matches "quick note before capture" intent.

## Shutter sound

Passed as an option to `takePictureAsync`:

```ts
await cameraRef.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
```

`shutterSound?: boolean` is defined in `expo-camera`'s `Camera.types` (SDK 57). No permission, no additional config.

## Keyboard-avoiding inputs

Three screens with `TextInput` need explicit keyboard behavior:

**`src/app/entry.tsx`** — Wrap the scrollable content in a `KeyboardAvoidingView`:

```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={insets.top}
  style={{ flex: 1 }}>
  <ScrollView
    contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled">
    {/* existing content */}
  </ScrollView>
</KeyboardAvoidingView>
```

`keyboardShouldPersistTaps="handled"` so tapping the Save button while the keyboard is up dismisses the keyboard AND fires the tap in one gesture.

**`src/app/settings.tsx` budget keypad Modal** — Wrap the sheet in a KeyboardAvoidingView. Modal itself does NOT provide automatic keyboard handling on Android for `presentationStyle: undefined` transparent modals.

```tsx
<Modal visible={budgetOpen} transparent animationType="slide" onRequestClose={() => setBudgetOpen(false)}>
  <View style={styles.backdrop}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        {/* existing budget content */}
      </View>
    </KeyboardAvoidingView>
  </View>
</Modal>
```

**`src/app/index.tsx` camera note input** — already covered in the Note input section (its `KeyboardAvoidingView` is inline).

**Dismiss-on-tap-outside** — Entry and Settings budget modal both wrap content in `TouchableWithoutFeedback` calling `Keyboard.dismiss()`. Do NOT wrap the tap zones themselves (would fight with buttons).

**Untouched**: home / history / gallery / transaction detail have no TextInput.

## Safe area / status bar

Root cause: `app.json` has no `androidStatusBar` block, so Expo defaults to `translucent: true` on Android — content extends behind the status bar. Every screen that respects `insets.top` mitigates but does not fix the color/gap issues.

**Fix** — add to `app.json` under `expo`:

```json
"androidStatusBar": {
  "translucent": false,
  "barStyle": "dark-content",
  "backgroundColor": "#00000000"
}
```

- `translucent: false` → Android status bar has its own dedicated height, content no longer bleeds.
- `barStyle: "dark-content"` — matches the light-mode default. Individual screens still override via `<StatusBar style="light" />` (camera does this).
- `backgroundColor: "#00000000"` → transparent so the header's own color shows through.

After this change, `insets.top` on Android returns 0 (no overlap to compensate for). All existing `paddingTop: insets.top` code stays correct — value is just 0 when unnecessary.

No component code changes required for safe area. Settings screen relies on Stack's own header — that stays correct on both platforms with `translucent: false`.

## FlatList gesture ownership vs note input

Two conflicting gestures on the camera page's bottom half:
1. Tap → focus note input.
2. Vertical drag up → paging to next page.

Resolution:
- `FlatList` scrollEnabled toggles on `noteFocused`:
```tsx
<FlatList ... scrollEnabled={!noteFocused} />
```
- When user taps briefly on the note zone (< tap slop), `Pressable.onPress` fires → focus TextInput → keyboard opens → `noteFocused = true` → FlatList locked → user can gesture freely inside the input.
- When user drags vertically (movement > tap slop), native ScrollView takes the gesture → FlatList pages → tap zone's `onPress` never fires.

Tap slop is React Native default (~5px). No custom gesture library required.

## Testing

Unit (Jest, mock native):
- `txn-card.test.tsx` — renders photo when `photoPath` present; renders category fg background when absent; renders "+ formatVND" for income and "− formatVND" for expense; renders note when present, no note element when null; tap invokes router.push with the right path.
- `format.test.ts` — no changes; still covers formatVND.
- No new tests for gesture behavior — jest doesn't drive gestures reliably; validated manually.

Manual smoke:
- Camera page loads full-screen; small `⌃` chevron under shutter is visible.
- Tap bottom half of viewfinder → keyboard opens with note input focused; type "Cà phê" → close keyboard → chip "📝 Cà phê" is visible in bottom of viewfinder.
- Tap chip → keyboard re-opens with "Cà phê" preserved.
- Vuốt lên from bottom half (even with note present) → paging animates to txn card 1.
- Card shows photo full-bleed, "Hôm nay" badge, category chip, amount, note, "Chạm để xem chi tiết →".
- Tap card → detail screen opens with correct txn.
- Vuốt xuống → back to camera page.
- Empty today → single empty card visible, no history button.
- Shutter tap → NO click sound; photo captured; routed to /entry with note prefilled.
- Entry screen with keyboard open → note input visible above keyboard.
- Settings → budget row → keypad modal → keyboard opens → number field visible above keyboard.
- Android device: status bar has solid background; no content bleeds behind it on any screen.

## Dependencies

Add:
- `expo-linear-gradient` (used by TxnCard bottom fade). Install with `npx expo install expo-linear-gradient`.

No removals.
