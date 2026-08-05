# Subscription bugfixes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs in the subscription add/edit flow — photo picks not persisted on Android, and child bottom sheets (currency picker, anchor-day picker) hiding the parent subscription sheet.

**Architecture:** (1) Add `stackBehavior="push"` to the two picker `BottomSheetModal`s so they mount on top of the parent instead of switching. (2) In the picker callback, copy the returned URI into `Paths.document` via `expo-file-system` so the app owns a stable `file://` path. (3) Clean up local photo files on subscription delete and photo replace to avoid leaking storage.

**Tech Stack:** Expo SDK 57, `@gorhom/bottom-sheet` ^5.2.14, `expo-image-picker` ~57.0.7, `expo-file-system` ~57.0.1 (new `File`/`Paths` API), `expo-crypto`, jest + `jest-expo`, `@testing-library/react-native`.

## Global Constraints

- Expo SDK is pinned to `~57.0.7`; consult https://docs.expo.dev/versions/v57.0.0/ for any picker/file-system API question (per `AGENTS.md`).
- Use the new `expo-file-system` API (`File`, `Paths`) — do NOT import from `expo-file-system/legacy`. Existing code in `src/lib/transactions.ts` already uses the new API; match that style.
- The `MediaTypeOptions` enum in `expo-image-picker` is deprecated; use `mediaTypes: ['images']`.
- Preserve the ref-mirroring pattern in `subscription-sheet.tsx` (state setters ending in `Synced` write to both `useRef` and `useState`) — the tests rely on it.
- Bug-fix scope only: no new features, no refactoring beyond what these fixes require, no permission-request changes.
- Every task ends with a green `npm test` (jest) and a commit.

## File Structure

- **Modify** `src/components/sl/currency-picker-sheet.tsx` — add `stackBehavior="push"` prop.
- **Modify** `src/components/sl/anchor-day-picker-sheet.tsx` — add `stackBehavior="push"` prop.
- **Modify** `src/lib/subscriptions.ts` — `deleteSubscription` and `updateSubscription` clean up local `file://` photo files.
- **Modify** `src/lib/subscriptions.test.ts` — add `expo-file-system` mock and tests for the cleanup behavior.
- **Modify** `src/components/sl/subscription-sheet.tsx` — replace `handlePickPhoto` to use new `mediaTypes` API and copy to `Paths.document`; add `testID` to the photo pressable so the new test can drive it; add `expo-file-system` and `expo-crypto` imports.
- **Modify** `src/components/sl/subscription-sheet.test.tsx` — replace/extend the `expo-image-picker` mock, add `expo-file-system` + `expo-crypto` mocks, add a photo-persistence test.

No new files.

---

### Task 1: Stack bottom-sheet pickers on top of parent

**Files:**
- Modify: `src/components/sl/currency-picker-sheet.tsx:44-50`
- Modify: `src/components/sl/anchor-day-picker-sheet.tsx:38-44`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: no code interface change — behavior change only (child sheets no longer minimize their parent).

**Testing note:** `stackBehavior` is a native/runtime behavior of `@gorhom/bottom-sheet` and cannot be asserted from jest with the current mocks. Verification is via the manual checklist at the end of the spec. The jest suite must still pass unchanged.

- [ ] **Step 1: Add `stackBehavior="push"` to the currency picker modal**

Edit `src/components/sl/currency-picker-sheet.tsx`. Locate the `BottomSheetModal` opening tag (currently lines 45-50) and add the prop. After the change it should read:

```tsx
      <BottomSheetModal
        ref={sheet}
        snapPoints={['40%']}
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
```

- [ ] **Step 2: Add `stackBehavior="push"` to the anchor-day picker modal**

Edit `src/components/sl/anchor-day-picker-sheet.tsx`. Locate the `BottomSheetModal` opening tag (currently lines 39-44) and add the prop. After the change it should read:

```tsx
      <BottomSheetModal
        ref={sheet}
        snapPoints={['65%']}
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
```

- [ ] **Step 3: Run the full jest suite to confirm nothing regressed**

Run: `npm test -- --runInBand`
Expected: all previously-passing tests still pass. No test is expected to reference `stackBehavior` directly.

- [ ] **Step 4: Commit**

```bash
git add src/components/sl/currency-picker-sheet.tsx src/components/sl/anchor-day-picker-sheet.tsx
git commit -m "fix(sub): stack currency/anchor-day picker sheets over subscription sheet"
```

---

### Task 2: Clean up local photo file on `deleteSubscription`

**Files:**
- Modify: `src/lib/subscriptions.ts:120-122` (`deleteSubscription`)
- Modify: `src/lib/subscriptions.test.ts` (add mock + tests)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `deleteSubscription(id, db?)` — same signature. New side effect: best-effort deletes the underlying file when `photo_path` starts with `file://`.

- [ ] **Step 1: Add `expo-file-system` mock and instrumentation at the top of the test file**

Edit `src/lib/subscriptions.test.ts`. Above the existing `jest.mock('expo-crypto', …)` block (currently starts on line 2), add:

```ts
const mockFileDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  __esModule: true,
  File: jest.fn().mockImplementation((p: string) => ({
    uri: typeof p === 'string' ? p : p?.uri,
    delete: () => mockFileDelete(typeof p === 'string' ? p : p?.uri),
  })),
}));
```

Also add a `beforeEach(() => { mockFileDelete.mockClear(); });` inside a new `describe('deleteSubscription', …)` block (see step 2).

- [ ] **Step 2: Write the failing tests for delete cleanup**

Append this describe block to `src/lib/subscriptions.test.ts` (below the existing describe blocks):

```ts
describe('deleteSubscription photo cleanup', () => {
  beforeEach(() => {
    mockSubUuidCounter = 0;
    mockFileDelete.mockClear();
  });

  it('deletes the local file when photo_path is a file:// uri', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-abcd.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    deleteSubscription(id, db);
    expect(mockFileDelete).toHaveBeenCalledWith('file:///doc/sub-abcd.jpg');
  });

  it('does not touch the filesystem for null photo_path', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    deleteSubscription(id, db);
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('does not touch the filesystem for http(s) photo_path (seed data)', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'https://example.com/receipt.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    deleteSubscription(id, db);
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('swallows delete errors so the row is still removed', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-missing.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    mockFileDelete.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    expect(() => deleteSubscription(id, db)).not.toThrow();
    expect(db.getFirstSync('SELECT id FROM subscriptions WHERE id = ?', id)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npm test -- src/lib/subscriptions.test.ts -t "deleteSubscription photo cleanup"`
Expected: the first and fourth tests fail (delete is not being called; row is deleted but mock not invoked). The two negative tests (`null` and `https`) pass by accident because nothing calls the mock yet.

- [ ] **Step 4: Implement the cleanup in `deleteSubscription`**

Edit `src/lib/subscriptions.ts`. Add this import at the top (after the `expo-crypto` import, currently line 2):

```ts
import { File } from 'expo-file-system';
```

Replace the current `deleteSubscription` (lines 120-122) with:

```ts
export function deleteSubscription(id: number, db: SQLiteDatabase = defaultDb): void {
  const row = db.getFirstSync<{ photo_path: string | null }>(
    'SELECT photo_path FROM subscriptions WHERE id = ?', id,
  );
  db.runSync('DELETE FROM subscriptions WHERE id = ?', id);
  const p = row?.photo_path;
  if (!p || !p.startsWith('file://')) return;
  try {
    new File(p).delete();
  } catch {
    // best-effort; ignore missing/renamed files
  }
}
```

- [ ] **Step 5: Run the new tests and verify they pass**

Run: `npm test -- src/lib/subscriptions.test.ts -t "deleteSubscription photo cleanup"`
Expected: all four tests PASS.

- [ ] **Step 6: Run the full jest suite**

Run: `npm test -- --runInBand`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/subscriptions.ts src/lib/subscriptions.test.ts
git commit -m "fix(sub): delete local photo file when subscription is removed"
```

---

### Task 3: Clean up old photo file on `updateSubscription` when path changes

**Files:**
- Modify: `src/lib/subscriptions.ts:95-118` (`updateSubscription`)
- Modify: `src/lib/subscriptions.test.ts` (add tests)

**Interfaces:**
- Consumes: `File` import already added by Task 2. `mockFileDelete` already added by Task 2.
- Produces: `updateSubscription(id, input, db?, now?)` — same signature. New side effect: deletes the previous `photo_path` when it was a `file://` URI and the new value differs.

- [ ] **Step 1: Write the failing tests for update cleanup**

Append this describe block to `src/lib/subscriptions.test.ts`:

```ts
describe('updateSubscription photo cleanup', () => {
  beforeEach(() => {
    mockSubUuidCounter = 0;
    mockFileDelete.mockClear();
  });

  it('deletes the previous local file when photo_path changes', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-old.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    updateSubscription(
      id,
      { ...SAMPLE, photoPath: 'file:///doc/sub-new.jpg' },
      db,
      new Date('2026-08-02T10:00:00Z'),
    );
    expect(mockFileDelete).toHaveBeenCalledWith('file:///doc/sub-old.jpg');
    expect(mockFileDelete).not.toHaveBeenCalledWith('file:///doc/sub-new.jpg');
  });

  it('does not delete when photo_path is unchanged', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-same.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    updateSubscription(
      id,
      { ...SAMPLE, name: 'renamed', photoPath: 'file:///doc/sub-same.jpg' },
      db,
      new Date('2026-08-02T10:00:00Z'),
    );
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('deletes the previous local file when new photo_path is null (removed)', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-removed.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    updateSubscription(
      id,
      { ...SAMPLE, photoPath: null },
      db,
      new Date('2026-08-02T10:00:00Z'),
    );
    expect(mockFileDelete).toHaveBeenCalledWith('file:///doc/sub-removed.jpg');
  });

  it('does not delete when previous photo_path is http(s)', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'https://example.com/x.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    updateSubscription(
      id,
      { ...SAMPLE, photoPath: 'file:///doc/sub-new.jpg' },
      db,
      new Date('2026-08-02T10:00:00Z'),
    );
    expect(mockFileDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- src/lib/subscriptions.test.ts -t "updateSubscription photo cleanup"`
Expected: the three positive tests fail; the unchanged-path test passes vacuously.

- [ ] **Step 3: Implement the cleanup in `updateSubscription`**

Edit `src/lib/subscriptions.ts`. Replace the current `updateSubscription` (lines 95-118) with:

```ts
export function updateSubscription(
  id: number, input: NewSubscription,
  db: SQLiteDatabase = defaultDb,
  now: Date = new Date(),
): void {
  const existing = db.getFirstSync<{ anchor_day: number; next_due_date: string; photo_path: string | null }>(
    'SELECT anchor_day, next_due_date, photo_path FROM subscriptions WHERE id = ?', id,
  );
  if (!existing) return;
  const nextDue = existing.anchor_day === input.anchorDay
    ? existing.next_due_date
    : toDateKey(nextDueFromAnchor(input.anchorDay, now));
  db.runSync(
    `UPDATE subscriptions
     SET name = ?, category = ?, original_amount = ?, original_currency = ?,
         anchor_day = ?, next_due_date = ?, photo_path = ?,
         notify_7 = ?, notify_3 = ?, notify_1 = ?, updated_at = ?
     WHERE id = ?`,
    input.name, input.category, input.originalAmount, input.originalCurrency,
    input.anchorDay, nextDue, input.photoPath,
    input.notify7 ? 1 : 0, input.notify3 ? 1 : 0, input.notify1 ? 1 : 0,
    now.getTime(), id,
  );
  const oldPath = existing.photo_path;
  if (!oldPath || !oldPath.startsWith('file://')) return;
  if (oldPath === input.photoPath) return;
  try {
    new File(oldPath).delete();
  } catch {
    // best-effort; ignore missing/renamed files
  }
}
```

- [ ] **Step 4: Run the new tests and verify they pass**

Run: `npm test -- src/lib/subscriptions.test.ts -t "updateSubscription photo cleanup"`
Expected: all four tests PASS.

- [ ] **Step 5: Run the full jest suite**

Run: `npm test -- --runInBand`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/subscriptions.ts src/lib/subscriptions.test.ts
git commit -m "fix(sub): delete previous local photo when subscription photo changes"
```

---

### Task 4: Persist picked photo to app document directory

**Files:**
- Modify: `src/components/sl/subscription-sheet.tsx` — imports (top of file), photo `Pressable` (lines 325-339 area, add `testID`), `handlePickPhoto` (lines 178-186).
- Modify: `src/components/sl/subscription-sheet.test.tsx` — mocks (lines 1-6) and a new test.

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: no exported interface change. Internal contract: `handlePickPhoto` now sets `photoPath` to a `file://` URI inside `Paths.document`, of the form `file:///…/sub-<uuid>.<ext>`.

- [ ] **Step 1: Replace mocks at the top of `subscription-sheet.test.tsx`**

Replace lines 1-6 of `src/components/sl/subscription-sheet.test.tsx` with:

```ts
jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

const mockCopySync = jest.fn();
jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn().mockImplementation((first: any, second?: string) => {
    const base = typeof first === 'string' ? first : first?.uri ?? '';
    const uri = second ? `${base}${second}` : base;
    return {
      uri,
      copySync: (dest: { uri: string }) => mockCopySync(uri, dest.uri),
      delete: jest.fn(),
    };
  }),
}));

jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => 'test-uuid'),
}));
```

Note: the deprecated `MediaTypeOptions` mock key is removed on purpose — production code will no longer reference it.

- [ ] **Step 2: Write the failing test for photo persistence**

Append this test to the existing `describe('SubscriptionSheet', …)` block in `src/components/sl/subscription-sheet.test.tsx`:

```ts
  it('copies a picked photo into Paths.document and forwards the file:// uri on save', async () => {
    const ImagePicker = require('expo-image-picker');
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'content://media/external/images/media/42' }],
    });

    const onSave = jest.fn();
    const ref = createRef<SubscriptionSheetHandle>();
    const r = await renderWithProviders(
      <SubscriptionSheet ref={ref} onSave={onSave} onDelete={() => {}} onPauseResume={() => {}} />
    );
    await act(() => ref.current?.presentAdd());
    await act(async () => {
      fireEvent.press(r.getByTestId('sub-photo-pressable'));
    });
    fireEvent.changeText(r.getByTestId('sub-name-input'), 'Netflix');
    fireEvent.changeText(r.getByTestId('sub-amount-input'), '20000');
    fireEvent.press(r.getByTestId('sub-save-button'));

    expect(onSave).toHaveBeenCalled();
    const [payload] = onSave.mock.calls[0];
    expect(payload.photoPath).toBe('file:///doc/sub-test-uuid.jpg');
    expect(mockCopySync).toHaveBeenCalledWith(
      'content://media/external/images/media/42',
      'file:///doc/sub-test-uuid.jpg',
    );
  });
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm test -- src/components/sl/subscription-sheet.test.tsx -t "copies a picked photo"`
Expected: FAIL — either `sub-photo-pressable` testID is missing, or `mockCopySync` is not called (production code still uses deprecated API and does not copy).

- [ ] **Step 4: Add the missing imports to `subscription-sheet.tsx`**

Edit `src/components/sl/subscription-sheet.tsx`. Add these imports (place them alongside the existing library imports near the top of the file):

```tsx
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
```

- [ ] **Step 5: Add `testID` to the photo pressable**

In `src/components/sl/subscription-sheet.tsx`, find the `Pressable` that wraps the photo tile (currently starting around line 325). Add `testID="sub-photo-pressable"`:

```tsx
            <Pressable
              testID="sub-photo-pressable"
              onPress={handlePickPhoto}
              style={[styles.photoWrap, { borderColor: c.cardBorder }]}
            >
```

- [ ] **Step 6: Rewrite `handlePickPhoto`**

Replace the current `handlePickPhoto` (lines 178-186) with:

```tsx
    const handlePickPhoto = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const source = result.assets[0].uri;
      try {
        const extMatch = source.match(/\.([a-zA-Z0-9]{1,5})(?:$|\?)/);
        const ext = (extMatch?.[1] ?? 'jpg').toLowerCase();
        const dest = new File(Paths.document, `sub-${Crypto.randomUUID()}.${ext}`);
        new File(source).copySync(dest);
        setPhotoPathSynced(dest.uri);
      } catch (err) {
        console.warn('Failed to copy picked photo, using source uri', err);
        setPhotoPathSynced(source);
      }
    };
```

Extension parsing: the regex matches a `.ext` at the end of the URI (or before a query string). For `content://…/media/42` (no dot), no match → fallback `jpg`. For `file:///…/photo.HEIC` → `heic`. Query strings like `https://…/x.jpeg?token=abc` → `jpeg`.

- [ ] **Step 7: Run the new test and verify it passes**

Run: `npm test -- src/components/sl/subscription-sheet.test.tsx -t "copies a picked photo"`
Expected: PASS.

- [ ] **Step 8: Run the full jest suite**

Run: `npm test -- --runInBand`
Expected: all tests pass, including the existing SubscriptionSheet tests (they still exercise `canceled: true` path via the default mock and are unaffected).

- [ ] **Step 9: Commit**

```bash
git add src/components/sl/subscription-sheet.tsx src/components/sl/subscription-sheet.test.tsx
git commit -m "fix(sub): copy picked photo to document dir so it persists on Android"
```

---

## Post-implementation manual verification

Perform on an Android real device (per user report):

- [ ] Open **Subscriptions → +**. Tap the photo tile. In the gallery picker, use the built-in camera to take a fresh photo → return. The captured image appears in the sheet's photo tile. Fill required fields, save. Reopen the subscription — photo tile still shows the image after force-stopping and relaunching the app.
- [ ] Same flow but pick an existing photo from the gallery.
- [ ] Open the subscription sheet. Tap the currency chip. The currency picker mounts **on top of** the subscription sheet (parent visible and not minimized). Pick a currency. The picker dismisses; the subscription sheet stays open with the new currency shown.
- [ ] Same with the anchor-day picker (day-of-month row).
- [ ] Delete a subscription that has a local photo. Confirm the file is gone: `adb shell run-as <package> ls files/`.
- [ ] Edit a subscription and replace its photo. Confirm the old file is gone from the same directory and the new file is present.

---

## Self-review notes

- **Spec coverage:** Fix 1 → Task 1. Fix 2 → Task 4. Fix 3 (delete cleanup) → Task 2. Fix 3 (update cleanup) → Task 3. Fix 4 (test updates) → embedded in Tasks 2, 3, 4. Manual verification checklist reproduced at the bottom of this plan.
- **No placeholders:** every step contains the actual code the engineer must type; no "similar to earlier" back-references.
- **Type/name consistency:** `mockFileDelete` and `mockCopySync` are defined in the same file where they're used; the `File` constructor mock signature `(first, second?)` matches both usage patterns (single-string for `delete`, `Directory + filename` for `copySync`); `deleteSubscription` and `updateSubscription` retain their existing signatures; `sub-photo-pressable` testID matches between the test and the JSX addition.
