# Cloud sync (single-active-device) — design

## Context

SpendLens is currently local-only: all data lives in one SQLite database on
one device (`src/lib/db.ts`), with no authentication and no backup beyond a
manual CSV export (`src/lib/export.ts`). The `users` table in `db.ts` was
scaffolded for Google sign-in but never wired up. Losing the device loses
all transaction history and photos.

This spec covers **cloud sync** — a personal backup that follows the user
across their devices. App Lock (PIN + biometric) was designed in an earlier
iteration of this spec and has already shipped (`VerifyPinSheet`,
`PinSetupSheet`, `LockScreen`, `AppLockContext`), so it is out of scope
here.

## Model: cloud backup + single active device

Unlike the earlier draft, this design is **not** two-way per-row sync. It is
a personal backup with a single-writer guarantee:

- Cloud holds **one latest snapshot** per Google account.
- **Only one device is "active" at a time.** Signing in on a new device
  claims the session; the previous device detects this on its next sync
  attempt and is signed out.
- **No automatic merging** during ongoing sync (single-writer → no conflicts).
- **A one-time merge dialog** appears only in the first-login case where the
  new device already has local data *and* the cloud has data — the user
  chooses local / cloud / combine, previews the result, then confirms.

Google Drive is the initial cloud target. The design deliberately hides
Drive behind an interface so that a future server-backed provider (REST/gRPC
against an owned backend) can drop in without touching sync logic, state,
or UI. See **Code organization** below.

## Goals

- Sign in with Google is **optional**. The app keeps working fully offline/
  local exactly as it does today if the user never signs in.
- When signed in, transactions, custom categories, settings, and photos are
  backed up automatically after each mutation and periodically while the app
  is open.
- Only one device at a time is "active" per account; the previous device is
  cleanly signed out when a new one takes over.
- On first sign-in where local data and cloud data both exist, the user
  chooses between local / cloud / combine, sees a preview, and confirms.
- Sync logic is decoupled from the storage backend — swapping Drive for a
  backend API later requires implementing one interface, not rewriting the
  engine.

## Non-goals

- **Two-way per-row sync between simultaneously active devices.** Only one
  device is active; the other is kicked.
- **Realtime push to kick the old device instantly.** The old device
  discovers the kick on its next foreground/sync trigger. Acceptable for a
  personal expense diary.
- **Background sync while the app is fully closed.** Expo managed background
  tasks are unreliable; sync only runs while the app is foregrounded.
- **Multi-user collaboration on one diary.**
- **End-to-end encryption** beyond what Google account security and the
  private `drive.appdata` scope already provide.

## Code organization (backend-agnostic)

All sync logic lives under `src/lib/sync/` and talks to cloud storage only
through a single interface. Nothing outside `src/lib/sync/providers/` is
allowed to import Google Drive types or the Google Sign-In SDK — the rest
of the codebase must be swappable to any other backend.

```
src/lib/sync/
  types.ts              # Snapshot, SessionInfo, UserInfo, plain-JSON DTOs
  provider.ts           # interface CloudSyncProvider (the contract)
  providers/
    index.ts            # factory — the ONLY place a concrete provider is picked
    drive-provider.ts   # Google Drive implementation (appDataFolder)
    mock-provider.ts    # in-memory, used by tests
  snapshot.ts           # buildSnapshot(db) / applySnapshot(db, snap) — pure
  merge.ts              # mergeSnapshots(local, remote, strategy) — pure
  session.ts            # createSession, isKicked
  sync-engine.ts        # orchestrator: takes a CloudSyncProvider, runs triggers
  sync-context.tsx      # React context: state (idle/syncing/error/kicked) + API
  auth.ts               # signIn/signOut — thin wrapper over provider auth
```

**The interface (`provider.ts`):**

```ts
export interface CloudSyncProvider {
  // Auth
  signIn(): Promise<UserInfo>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<UserInfo | null>;

  // Session (single-active-device enforcement)
  readSession(): Promise<SessionInfo | null>;
  writeSession(session: SessionInfo): Promise<void>;

  // Data snapshot (one JSON file for the whole account)
  downloadSnapshot(): Promise<Snapshot | null>;
  uploadSnapshot(snap: Snapshot): Promise<void>;

  // Photos (one file per UUID)
  uploadPhoto(uuid: string, localPath: string): Promise<void>;
  downloadPhoto(uuid: string): Promise<string /* local path */>;
  listPhotos(): Promise<string[] /* uuids */>;
  deletePhoto(uuid: string): Promise<void>;
}
```

**Rules to keep the abstraction honest:**

- `sync-engine.ts`, `sync-context.tsx`, and every UI file may import only
  from `src/lib/sync/` — never from `providers/drive-provider.ts` directly.
- `providers/index.ts` is the single factory that picks the concrete
  provider. Swapping Drive for a REST backend later means writing
  `providers/api-provider.ts` and changing this file.
- DTOs (`Snapshot`, `SessionInfo`, `UserInfo`, `PhotoRef`) are plain JSON.
  No Google SDK type ever leaks out of `providers/drive-provider.ts`.

## Data model changes

`transactions.id` (`INTEGER AUTOINCREMENT`) is safe for a single device but
snapshots need a stable, device-independent key so restores and previews
survive across restore/wipe cycles.

Migration (additive, run once on app start, independent of sign-in state):

```sql
ALTER TABLE transactions ADD COLUMN uuid TEXT;
ALTER TABLE transactions ADD COLUMN updated_at INTEGER;
ALTER TABLE categories   ADD COLUMN updated_at INTEGER;

CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- known keys: device_id, last_synced_at, dirty
```

Backfill existing rows: `uuid = generateUuid()`, `updated_at = created_at`.

**Deliberately omitted (vs. the earlier draft):**

- No `deleted_at` / tombstones. Single-writer semantics mean hard deletes
  are safe — the cloud snapshot is rewritten on every sync, so removed rows
  disappear naturally on restore.
- No `photo_synced` column. The `photoManifest` field inside each uploaded
  snapshot is the source of truth for which photos exist in the cloud.
- No changes to `settings` schema. One internal key `__updated_at` inside
  the `settings` table tracks the settings-block timestamp for merge.

**Photo storage convention:** local photos are stored as
`documentDirectory/photos/${uuid}.jpg`. `transactions.photo_path` remains a
local file path (unchanged column), and `photo_uuid` is derived as
`basename(photo_path).replace('.jpg', '')`. On migration, existing photos
are renamed into the UUID convention and their `photo_path` updated.

`sync_meta` is local-only and never uploaded:

- `device_id` — UUID generated once per install (also cached in
  `expo-secure-store` for stability across DB resets).
- `last_synced_at` — epoch ms of the last successful upload.
- `dirty` — `'1'` if there are un-uploaded local changes, `'0'` otherwise.

## Snapshot format

Three kinds of file live on the cloud (`appDataFolder` for Drive; the
equivalent scoped namespace for any future backend):

- `spendlens-snapshot.json` — the whole account state.
- `session.json` — `{ deviceId, deviceName, loggedInAt }` for single-active-
  device enforcement. `deviceName` comes from `expo-constants`
  (`Constants.deviceName` if available, else the platform-default fallback
  string) and is purely informational — the enforcement key is `deviceId`.
- `photos/{uuid}.jpg` — one file per photo.

```json
{
  "version": 1,
  "generatedAt": 1721000000000,
  "deviceId": "abc-123",
  "transactions": [
    {
      "uuid": "…",
      "date": "2026-07-15",
      "time": "12:30",
      "createdAt": 1721000000000,
      "updatedAt": 1721000000000,
      "category": "food",
      "name": "Bún bò",
      "note": null,
      "amount": 85000,
      "isIncome": 0,
      "photoUuid": "abc"
    }
  ],
  "categories": [
    { "id": "custom_x", "label": "Cà phê", "createdAt": 0, "updatedAt": 0 }
  ],
  "settings": {
    "updatedAt": 1721000000000,
    "values": { "budget": "3000000", "language": "vi" }
  },
  "photoManifest": ["uuid1", "uuid2"]
}
```

`version: 1` reserves the ability to migrate the schema later (also usable
verbatim as a REST request body when the backend provider ships).

`updatedAt` is used **only** by the first-login merge dialog when the user
picks "combine". Regular sync is single-writer and does not consult it.

## Google sign-in

- Library: `@react-native-google-signin/google-signin` (native module,
  requires `expo-dev-client` — already a dependency). Preferred over
  `expo-auth-session` for reliable refresh-token handling.
- Scope: `https://www.googleapis.com/auth/drive.appdata` only — the hidden
  per-app Drive folder. Never requests broad Drive access.
- On sign-in success, the app stores `googleId`, `email`, `displayName`,
  `avatarUrl` in the existing `users` table (one row).
- Sign-out deletes the `users` row and resets `sync_meta.last_synced_at`
  and `sync_meta.dirty` (avoids the next sign-in — potentially into a
  different Google account — inheriting a stale `dirty=1` and uploading
  the wrong data). Local data is **not** deleted unless the user opts into
  "Sign out and wipe" (see Settings UI).

## Session & kick detection

**On sign-in (any device):**

1. Read/generate `deviceId` locally (SecureStore-backed).
2. Complete Google sign-in.
3. **Overwrite** `session.json` on the cloud with this device's id and a
   fresh `loggedInAt`.
4. Run the first-login flow (below).

**Before any snapshot upload:**

1. Read `session.json` from the cloud.
2. If `remote.deviceId !== local.deviceId` → the device has been **kicked**.
   Abort the upload and trigger the `KickedDeviceSheet` (below).
3. Otherwise, upload the snapshot.

**Race conditions** (two devices signing in near-simultaneously) are not
specifically handled. Whichever device wrote `session.json` last wins; the
other detects the kick on its next sync. Acceptable for a personal app.

## First-login flow

Right after sign-in, the app downloads the cloud snapshot and checks local
state:

| Local has data | Cloud has data | Action |
|:---:|:---:|:---|
| ✅ | ✅ | Open `ChooseDataSourceSheet` (see below) |
| ✅ | ❌ | Auto-push local → cloud, no dialog |
| ❌ | ✅ | Auto-apply cloud → local, no dialog |
| ❌ | ❌ | Nothing |

**`ChooseDataSourceSheet`** — a bottom sheet (via `@gorhom/bottom-sheet`,
matching `budget-sheet.tsx` and `pin-setup-sheet.tsx`) with three options:

- **Use data on this device** — cloud will be overwritten. Shows
  `{txns} transactions · {cats} categories` from local.
- **Use data from cloud** — local will be replaced. Shows counts from the
  downloaded snapshot plus `Last backup: {when}` from `snapshot.generatedAt`.
- **Combine both** — union by UUID; on collision the row with the newer
  `updatedAt` wins (ties broken deterministically by `deviceId` alphabetical
  order). Same rule for categories and for the settings block (whole-block
  last-write-wins on `settings.updatedAt`).

No "Cancel" button — the user must choose. A "Sign out" affordance in the
sheet header lets them back out entirely.

**`PreviewChangesSheet`** — opens on top of the choice sheet after selection.
Full-height snap point (~90%). Shows the resulting transaction list, grouped
by month like the existing History screen. Each row reuses the existing
`TransactionRow` component from `src/components/sl/transaction-row.tsx`
wrapped in a small View that overlays a source badge at the trailing edge
(the wrapper approach avoids extending `TransactionRow`'s API — the badge is
preview-screen-specific and shouldn't leak into other consumers):

- `📱` — from this device
- `☁️` — from cloud
- `🔀` — merged (present in both; newer version kept)

Bottom of the sheet has two buttons: `Change choice` (returns to
`ChooseDataSourceSheet`) and `Confirm & save` (applies to SQLite in a
transaction, uploads the final snapshot, dismisses the sheet, shows a toast).

## Sync triggers

All triggers are non-blocking; every write commits to local SQLite first,
then queues an upload.

| Trigger | Action |
|---|---|
| App cold start, signed in | Check `session.json` (detect kick); if OK and `dirty=1` → upload |
| Foreground (background → active) | Same as cold start |
| Any local mutation (txn/cat/settings write) | Set `dirty=1`; debounce 4s → upload |
| Periodic while foregrounded | Every 15 min, if `dirty=1` → upload |
| Manual "Sync now" (Settings) | Force upload regardless of `dirty` |
| After confirming the first-login dialog | Force upload |

On successful upload: `dirty=0`, `last_synced_at=now`.

An in-memory `isSyncing` flag prevents overlapping runs — triggers that fire
mid-sync are dropped; the next one picks up the work.

## Photo sync

Segmented control "Photo sync" (Wi-Fi only / Always / Off), default Wi-Fi
only.

- The snapshot JSON itself is **always** synced (small, primary data).
- Photos are synced only when the current policy allows.
- **Upload**: after each successful snapshot upload, take the set of
  `photoUuid`s referenced by the just-uploaded snapshot's transactions,
  subtract the UUIDs already present in the cloud (from the provider's
  `listPhotos()`), and upload each remaining local file.
- **Download**: when applying a snapshot (first-login, "use cloud" choice,
  or after wipe/restore), take the set of `photoUuid`s in the applied
  snapshot, subtract local files under `documentDirectory/photos/`, and
  download the rest lazily in the background.
- Transactions render a placeholder tile while a photo is pending.

## Settings UI

New "Đồng bộ & sao lưu" ("Sync & backup") section, positioned above the
existing DỮ LIỆU section on the Settings screen.

**Signed out:**

- One row: "Đăng nhập Google để đồng bộ" with a one-line description.

**Signed in:**

- Avatar + display name + email.
- "Đồng bộ ảnh" segmented control (Wi-Fi only / Always / Off), default
  Wi-Fi only.
- Status row + "Đồng bộ ngay" button:
  - Idle: `✓ Đã đồng bộ lúc HH:mm`
  - Syncing: `⟳ Đang đồng bộ…`
  - Error: `⚠ Lỗi: <msg>` in red (never a blocking popup)
  - Never synced: `Chưa sao lưu lần nào`
  - Token expired: `⚠ Cần đăng nhập lại` + "Sign in again" button
- "Đăng xuất" row. Tapping it opens a confirm dialog with three actions:
  Cancel · Sign out (keep local data) · Sign out and wipe.

Kicked state is **not** shown here — it takes over the screen via
`KickedDeviceSheet` regardless of which screen the user is on.

## KickedDeviceSheet

Non-dismissable bottom sheet (matches other sheets in the codebase):

- Title: "Tài khoản đăng nhập ở máy khác"
- Body: "Bạn đã đăng nhập SpendLens trên một thiết bị khác. Máy này đã bị
  đăng xuất."
- Two options:
  - **Giữ dữ liệu offline** — sign out, clear cached auth tokens, leave
    SQLite intact. User can sign in again later (which will re-open the
    first-login merge dialog if both sides now have data).
  - **Xoá dữ liệu trên máy này** — a second confirm ("Xoá toàn bộ giao dịch,
    ảnh và cài đặt? Không thể hoàn tác."), then wipes `transactions`,
    `categories`, `settings`, `users`, `sync_meta`, and all files under
    `documentDirectory/photos/`.

## i18n

All new strings live under the `sync.*` namespace in
`src/lib/i18n/locales/en.ts` and `src/lib/i18n/locales/vi.ts`. Key inventory
(the implementation plan will fill in exact copy):

| Key | English | Vietnamese |
|---|---|---|
| `sync.section_title` | SYNC & BACKUP | ĐỒNG BỘ & SAO LƯU |
| `sync.signin_cta` | Sign in with Google to sync | Đăng nhập Google để đồng bộ |
| `sync.signin_desc` | Back up and restore your data automatically via your Google account. | Sao lưu và khôi phục dữ liệu tự động qua tài khoản Google của bạn. |
| `sync.photo_policy_label` | Photo sync | Đồng bộ ảnh |
| `sync.photo_policy_wifi` | Wi-Fi | Wi-Fi |
| `sync.photo_policy_always` | Always | Luôn luôn |
| `sync.photo_policy_off` | Off | Tắt |
| `sync.status_synced` | Synced at {time} | Đã đồng bộ lúc {time} |
| `sync.status_syncing` | Syncing… | Đang đồng bộ… |
| `sync.status_never` | Not backed up yet | Chưa sao lưu lần nào |
| `sync.status_error` | Error: {msg} | Lỗi: {msg} |
| `sync.status_token_expired` | Sign in again | Cần đăng nhập lại |
| `sync.sync_now` | Sync now | Đồng bộ ngay |
| `sync.signout` | Sign out | Đăng xuất |
| `sync.signout_keep` | Sign out (keep local data) | Đăng xuất (giữ dữ liệu trên máy) |
| `sync.signout_and_wipe` | Sign out and wipe local data | Đăng xuất và xoá dữ liệu trên máy |
| `sync.first_login.title` | Sync data | Đồng bộ dữ liệu |
| `sync.first_login.subtitle` | Both this device and cloud have data. Choose how to handle it. | Máy này và cloud đều đang có dữ liệu. Hãy chọn cách xử lý. |
| `sync.first_login.use_local` | Use data on this device | Dùng dữ liệu trên máy này |
| `sync.first_login.use_local_desc` | Cloud will be overwritten | Cloud sẽ bị ghi đè |
| `sync.first_login.use_cloud` | Use data from cloud | Dùng dữ liệu trên cloud |
| `sync.first_login.use_cloud_desc` | Data on this device will be deleted | Dữ liệu trên máy này sẽ bị xoá |
| `sync.first_login.combine` | Combine both | Kết hợp cả hai |
| `sync.first_login.combine_desc` | Merge all; newer version wins on conflict | Gộp toàn bộ; nếu trùng lấy bản mới hơn |
| `sync.first_login.count_summary` | {txns} transactions · {cats} categories | {txns} giao dịch · {cats} danh mục |
| `sync.first_login.last_backup` | Last backup: {when} | Sao lưu gần nhất: {when} |
| `sync.preview.title` | Preview | Xem trước |
| `sync.preview.count` | {n} transactions will be saved | {n} giao dịch sẽ được lưu |
| `sync.preview.back` | Change choice | Chọn lại |
| `sync.preview.confirm` | Confirm & save | Xác nhận & lưu |
| `sync.kicked.title` | Signed in on another device | Tài khoản đăng nhập ở máy khác |
| `sync.kicked.body` | You signed in to SpendLens on another device. This device has been signed out. | Bạn đã đăng nhập SpendLens trên một thiết bị khác. Máy này đã bị đăng xuất. |
| `sync.kicked.keep` | Keep offline data | Giữ dữ liệu offline |
| `sync.kicked.wipe` | Wipe data on this device | Xoá dữ liệu trên máy này |
| `sync.kicked.wipe_confirm` | Wipe all transactions, photos and settings? Cannot be undone. | Xoá toàn bộ giao dịch, ảnh và cài đặt? Không thể hoàn tác. |

## Dark/light mode

All new sheets and screens use `useColors()` from `src/constants/tokens.ts`
for every color value. No hardcoded colors, no `#fff`/`#000` literals.
Manual QA covers switching theme mid-flow.

## Error handling & edge cases

| Situation | Handling |
|---|---|
| Offline during sync | Silent skip; retried on the next trigger |
| Token expired, refresh fails | Settings banner "Sign in again"; local data unaffected |
| Drive quota / write error | Settings banner; auto-sync paused; `dirty` preserved for retry |
| Malformed remote snapshot | Show error; do not apply; local data untouched |
| Overlapping sync triggers | `isSyncing` in-memory flag; the fired-later trigger is dropped |
| Photo transfer failures | Backoff retry; does not block snapshot upload |
| Switching Google accounts | Full sign-out → sign-in → first-login merge dialog runs against the new account's cloud state |
| Migration on existing installs | `ALTER TABLE` + backfill runs at app start regardless of sign-in state; local-only users are functionally unaffected |
| Race: two devices signing in near-simultaneously | Not specifically handled; last write to `session.json` wins; the other device discovers the kick on its next sync |

## Testing strategy

**Unit tests** (no real network):

- `snapshot.ts`
  - `buildSnapshot(db)` — seeded DB → correct shape, version, fields.
  - `applySnapshot(db, snap)` — empty DB → correct rows.
  - `applySnapshot` idempotency — applying twice yields the same result.
- `merge.ts`
  - `mergeSnapshots(local, remote, 'local')` → returns local verbatim.
  - `mergeSnapshots(local, remote, 'cloud')` → returns remote verbatim.
  - `mergeSnapshots(local, remote, 'combine')`:
    - local-only UUID present; remote-only UUID present.
    - collision with local `updatedAt` newer → local wins.
    - collision with remote `updatedAt` newer → remote wins.
    - `updatedAt` tie → deterministic tie-break by `deviceId`.
    - same rules for categories and settings block.
  - Assertions read fields directly (not whole-object snapshots) to keep
    test intent legible.
- `session.ts`
  - `isKicked(remoteSession, localDeviceId)` — `true` when different,
    `false` when same or when remote is `null`.
  - `createSession(deviceId)` — correct shape.
- `sync-engine.ts` with `MockProvider`:
  - Upload trigger → provider receives the expected snapshot.
  - Kick mid-flow → upload aborted; engine emits "kicked".
  - Overlap → only one sync runs.
  - Post-success → `dirty=0`, `last_synced_at` bumped.
  - Provider error → state → "error"; `dirty` preserved.
- Migration
  - `ALTER TABLE` + backfill against a seeded DB; idempotent on second run;
    every row ends up with a unique UUID and `updated_at = created_at`.

**Not unit-tested** (manual QA):

- Real Google sign-in flow (mocked in CI; real on dev-client).
- Drive API network (mock provider in tests; real in dev-client).
- `AppState` transition timing for foreground/background sync.
- Bottom-sheet gestures, dark/light rendering, i18n switching.

**Manual QA checklist:**

1. Sign in for the first time: empty device + empty cloud → no dialog,
   status shows "Synced at HH:mm".
2. Sign in: device has 24 txns + empty cloud → no dialog; cloud now mirrors
   local.
3. Sign in: empty device + cloud has data → no dialog; local now mirrors
   cloud.
4. Sign in: both have data → `ChooseDataSourceSheet` appears; try each of
   the three options; preview counts are correct; confirm applies correctly.
5. Device A signed in → sign in on device B → open device A →
   `KickedDeviceSheet` appears; try both "keep" and "wipe".
6. Spam "Sync now" — no double sync (respects `isSyncing`).
7. Toggle airplane mode mid-sync — status shows "error"; data intact.
8. Toggle photo policy Wi-Fi ↔ Always ↔ Off — photo transfer respects it;
   snapshot still syncs.
9. Switch language VN ↔ EN and theme light ↔ dark — all new sheets look
   correct in every combination.
10. Sign out (keep local) → local data intact; sign in again → merge dialog
    appears.
11. Sign out and wipe → local data gone; sign in again → auto-pulls cloud.
