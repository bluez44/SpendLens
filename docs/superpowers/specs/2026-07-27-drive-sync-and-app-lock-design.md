# Drive sync (multi-device) + app lock — design

## Context

SpendLens is currently local-only: all data lives in one SQLite database on
one device (`src/lib/db.ts`), with no authentication and no backup beyond a
manual CSV export (`src/lib/export.ts`). The `users` table in `db.ts` was
scaffolded for Google sign-in but never wired up. This is the biggest
practical risk in the app today: losing the device loses all transaction
history and photos, and there is no lock screen protecting financial data
inside the app.

This spec covers two related features, chosen from a broader feature survey
as the highest-priority gap:

1. **Multi-device sync via Google Drive** — real two-way sync (not just
   backup/restore), so the same account's data stays consistent across
   phones/tablets.
2. **App lock** — PIN + biometric, opt-in, independent of sync.

## Goals

- Sign in with Google is **optional**. The app keeps working fully offline/
  local exactly as it does today if the user never signs in.
- When signed in, transactions, custom categories, and settings sync
  automatically across every device signed into the same Google account.
- Transaction photos sync too, with a user-configurable network policy
  (Wi-Fi only / always / off), defaulting to Wi-Fi only.
- Conflicting edits from two devices resolve automatically (last-write-wins
  per row) — no manual conflict-resolution UI.
- App lock (PIN + Face ID/fingerprint) is available, off by default, opt-in
  via Settings.

## Non-goals

- Real-time sync while both devices are online simultaneously (event-driven
  sync — on foreground, after edits, manual refresh — is sufficient for a
  personal expense diary).
- Background sync while the app is fully closed (Expo managed background
  tasks are unreliable; sync only runs while the app is in the foreground).
- Multi-user collaboration on one diary — this is still one person's data,
  just spread across their own devices.
- End-to-end encryption of the synced data beyond what Google account
  security and the private `drive.appdata` scope already provide.

## Data model changes

`transactions.id` (`INTEGER AUTOINCREMENT`) is safe for a single device but
two offline devices would mint colliding ids. A stable, device-independent
sync key is needed.

Migration (additive, run once on app start, independent of sign-in state):

```sql
ALTER TABLE transactions ADD COLUMN uuid TEXT;          -- sync key, generated once at creation
ALTER TABLE transactions ADD COLUMN updated_at INTEGER;  -- epoch ms, bumped on every edit
ALTER TABLE transactions ADD COLUMN deleted_at INTEGER;  -- soft-delete tombstone; NULL = alive
ALTER TABLE transactions ADD COLUMN photo_synced INTEGER NOT NULL DEFAULT 0;
```

Existing rows are backfilled: `uuid = uuid()`, `updated_at = created_at`.

- `deleteTransaction()` changes from `DELETE` to setting `deleted_at = now()`
  (a hard delete can't propagate to a device that hasn't synced yet).
  `listTransactions()` and friends add `WHERE deleted_at IS NULL`. Tombstones
  older than 90 days are pruned locally and on Drive.
- Custom categories (`categories` table, already a stable `TEXT` id like
  `custom_xxx`) get the same `updated_at`/`deleted_at` columns.
- `settings` is treated as one document with a single `updated_at` — it's a
  key/value blob, not a list of records, so whole-document last-write-wins is
  sufficient (concurrent settings edits on two devices are rare and low
  stakes).
- New local-only table `sync_meta` (never uploaded): `last_synced_at`,
  `drive_file_id`, `device_id` (a UUID generated once per install, used to
  namespace photo filenames and as a merge tie-breaker).

## Google sign-in

- Library: `@react-native-google-signin/google-signin` (native module,
  requires a dev-client rebuild — `expo-dev-client` is already a
  dependency). Preferred over `expo-auth-session` because it gives a
  reliable refresh token for background-less API calls.
- Scope: `https://www.googleapis.com/auth/drive.appdata` only — the hidden,
  per-app Drive folder. Never requests broad Drive access to the user's real
  files.
- Flow: Settings → "Đồng bộ & sao lưu" → "Đăng nhập Google" → native sign-in
  sheet → store `googleId`, `email`, `displayName`, `avatarUrl` in the
  existing (currently unused) `users` table — one row, since this is still a
  single-user app per device.
- Sign out: delete the `users` row and `sync_meta`. Local data
  (transactions/settings) is **not** deleted — the app just returns to
  local-only mode.
- First sign-in on a device that already has local data (e.g. the seeded
  sample data, or transactions entered before signing in) is treated exactly
  like two devices meeting for the first time — the merge algorithm below
  handles it with no special-cased dialog.

## Sync architecture

**Storage on Drive (`appDataFolder`, hidden from the user's visible Drive):**

- One JSON snapshot file, `spendlens-sync.json`, containing the full
  `transactions`, `categories`, and `settings` state. A full-snapshot
  approach (not an append-only change log) keeps merging simple: download,
  merge locally, re-upload.
- Photos are separate files, `${uuid}.jpg`, in the same folder — different
  size/change characteristics than the JSON blob.

**Merge algorithm (last-write-wins per row, keyed by `uuid`):**

1. Download `spendlens-sync.json` (treat as empty if it doesn't exist yet —
   first sync).
2. For each transaction by `uuid`: local-only → keep (will be uploaded);
   remote-only → insert locally; present on both → the row with the newer
   `updated_at` wins **in full** (not a field-by-field merge — avoids
   confusing half-and-half results when two devices edited different
   fields).
3. Deletes are just a row with `deleted_at` set, so the same rule naturally
   handles propagation: a delete newer than a remote edit wins; an edit
   newer than a remote delete "resurrects" the transaction. This is the
   correct, unsurprising behavior for a personal finance log.
4. Write the merged set back into local SQLite, then re-upload the merged
   snapshot to Drive.
5. Before the final upload, re-check the remote file's `modifiedTime`; if it
   changed since step 1 (another device just synced), re-download and
   re-merge once. One retry is enough — two devices syncing in the exact
   same instant is rare for a personal app.

**Photo sync:** lazy. If a merged transaction references a photo `uuid` not
present locally, queue a download (respecting the Wi-Fi/always/off policy).
New locally-captured photos are queued for upload under the same policy.
Transactions render fine with a placeholder while a photo is pending.

**Sync triggers** (always background, never blocking; every write goes to
local SQLite first/optimistically):

- App entering foreground (including cold start), if signed in and online.
- After any local mutation (transaction/category/settings write), debounced
  ~4s to coalesce rapid edits.
- Manual "Đồng bộ ngay" button and pull-to-refresh on the History screen.
- Status surfaced in Settings only: last-synced timestamp, a spinner while
  syncing, and an inline error line on failure.

## Settings UI

New "Đồng bộ & sao lưu" section (above the existing DỮ LIỆU section):

- Signed out: one row, "Đăng nhập Google để đồng bộ", with a one-line
  description.
- Signed in: avatar + email; a "Đồng bộ ảnh" segmented control (Wi-Fi only /
  Luôn luôn / Tắt, default Wi-Fi only); a status row ("Đã đồng bộ lúc
  HH:mm") with a "Đồng bộ ngay" button; a "Đăng xuất" row.
- Sync errors (offline, expired token, Drive quota) show as a small red line
  under the status row — never a blocking popup.

## App lock

- New dependency: `expo-local-authentication` (Face ID/Touch ID/fingerprint).
  PIN fallback is stored as a **hash**, never plaintext, via
  `expo-secure-store` (already a dependency).
- New Settings section "Bảo mật" (below NGÔN NGỮ): a switch "Khoá bằng PIN/
  sinh trắc học", off by default. Enabling it prompts for a 6-digit PIN
  (entered twice), then offers to also enable biometrics if the device
  supports it. Once enabled: "Đổi PIN" row, and an independent "Dùng sinh
  trắc học" switch (PIN is always the required fallback).
- Behavior: listens to `AppState`. Transitioning from
  background/inactive → active shows a full-screen lock overlay if app lock
  is enabled (the overlay is applied immediately on entering background too,
  so photos/amounts don't leak into the OS app switcher). The lock screen
  tries biometrics first (if enabled), falling back to the PIN keypad on
  failure/cancel. 5 consecutive wrong PINs trigger an increasing lockout
  timer (starting at 30s) — no data wipe, since this is a screen-privacy
  measure, not enterprise-grade security.
- App lock is fully independent from Google sign-in/sync — each toggles
  separately.

## Error handling & edge cases

- **Offline during sync**: silently skipped, retried on the next trigger; no
  toast, just the Settings status line.
- **Expired token, refresh fails**: inline banner in Settings prompting
  re-sign-in; local data keeps working normally in the meantime.
- **Drive quota/write errors**: sync pauses and surfaces an error; local
  SQLite is never overwritten or cleared — it remains the device's source of
  truth until sync succeeds again.
- **Malformed remote JSON** (future bug, manual tampering): validated on
  parse; if invalid, the merge is skipped entirely (never merged against
  bad data), an error is shown, and local data is left untouched.
- **Overlapping sync triggers**: an in-memory `isSyncing` flag skips a
  trigger that fires mid-sync; the next trigger picks it up.
- **Photo transfer failures**: retried with backoff; never blocks
  transaction/settings sync, which is the primary data.
- **Switching Google accounts**: treated as meeting a brand-new remote (which
  may be empty or hold different data) — same merge algorithm applies, with
  a short warning that current on-device data will be merged into the new
  account.
- **Upgrading users with existing local data**: the schema migration
  (`uuid`/`updated_at`/`deleted_at`) runs automatically on app start
  regardless of sign-in state, so local-only users are unaffected
  functionally.

## Testing strategy

- **Merge algorithm**: the highest-value target — implement as a pure
  function `mergeTransactions(local[], remote[]) → merged[]` and unit test:
  local-only, remote-only, both-present with local newer, both-present with
  remote newer, tombstone wins, edit-after-delete resurrects, and
  `updated_at` ties broken by `device_id`.
  - Assertions read straight off the transaction fields (`uuid`,
    `updated_at`, `deleted_at`) rather than snapshotting whole objects, so
    the test intent stays legible.
- **Migration**: run the `ALTER TABLE` + backfill against a seeded database
  and confirm it's idempotent (running twice doesn't error or double-migrate).
- **Google sign-in / Drive API**: fully mocked in tests — no real network
  calls in CI.
- **App lock**: unit test PIN hash comparison and the wrong-PIN lockout
  counter/backoff. `AppState` transition timing isn't reliably testable
  automatically, so it's a manual QA item.
- **Manual QA checklist**: two devices/simulators signed into the same test
  Google account — create/edit/delete on each side and confirm the merge;
  toggle airplane mode mid-sync; revoke Drive access from the Google Account
  settings page and confirm the app degrades gracefully (no crash, no data
  loss).
