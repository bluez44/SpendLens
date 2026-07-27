# App lock — bug fixes design (biometric + destructive PIN actions)

## Context

The app lock feature (PIN + biometric) landed on branch `main` earlier this
week (commits `13cb85c` → `ceecf05`, spec at
`docs/superpowers/specs/2026-07-27-drive-sync-and-app-lock-design.md`, plan
at `docs/superpowers/plans/2026-07-27-app-lock.md`). Manual QA on-device has
surfaced two bugs that make the feature partially broken and materially less
safe than the original spec intended:

1. **Biometric never prompts.** User enables the "Dùng sinh trắc học" switch
   in Settings, but the next time the app locks (background → foreground)
   the biometric OS prompt never appears — the user falls straight into the
   PIN pad. There is no error, no toast, nothing.
2. **Disabling the lock skips PIN verification.** Toggling the "Khoá bằng
   PIN/sinh trắc học" switch off shows a confirmation Alert, and tapping
   "Xoá" clears the PIN immediately. Anyone who gets 3 seconds with the
   phone can disable the lock. "Đổi PIN" has the same weakness — it opens
   the setup sheet without asking for the current PIN.

Both bugs undermine the same threat model the app lock was designed for:
someone briefly holding an unlocked phone should not be able to bypass the
lock or see private financial data.

## Root cause

### Bug 1 — biometric silent no-op

`expo-local-authentication@~57.0.2` is declared in `package.json` and
present in `package-lock.json`, but is **not installed in `node_modules/`**
(verified: `ls node_modules/ | grep -i "expo-local"` returns only
`expo-localization`). The last dev-client build was presumably against a
node_modules that included the package; after a `node_modules` clean (or a
package.json edit without a re-install), the JS import
`import * as LocalAuthentication from 'expo-local-authentication'` resolves
to a phantom module whose methods either reject or are undefined.

`isBiometricAvailable()` (`src/lib/app-lock.ts:70-74`) therefore rejects
silently — and `runBiometric()` in `src/components/sl/lock-screen.tsx:42-49`
has no `.catch()`, so the rejection is swallowed and the biometric prompt
simply never appears.

Even if the module is re-installed, the current code has no defensive UX
around this failure mode: any future silent failure (revoked biometrics,
temporarily disabled hardware, native module crash) reproduces the same
"nothing happens" symptom.

### Bug 2 — destructive PIN actions without verification

`src/app/settings.tsx:139-160` — disabling the switch fires an
`Alert.alert` confirmation only; on "Xoá" it runs `clearPin()` and flips
`appLockEnabled` / `appLockBiometricEnabled` to `false`. The confirmation
proves intent, not identity.

`src/app/settings.tsx:165-170` — "Đổi PIN" opens `PinSetupSheet` directly,
letting anyone set a new PIN without proving they know the old one.

## Goals

- Biometric prompt actually appears on the LockScreen when the switch is on
  and the device supports it.
- Enabling the biometric switch in Settings gives immediate feedback — the
  user either successfully authenticates (switch persists on) or cancels/
  fails (switch stays off, with a clear message).
- Disabling app lock and changing the PIN both require the current PIN (or
  a successful biometric authentication if enabled).
- Silent failure modes in biometric code paths are eliminated: every
  `expo-local-authentication` call is wrapped so a runtime error resolves
  to `false` instead of rejecting.

## Non-goals

- No changes to the LockScreen lockout state machine (5-fail escalating
  timeout stays as-is; `VerifyPinSheet` has no lockout — see rationale
  under §Design).
- No changes to Google Drive sync (that half of the original spec is still
  un-implemented and out of scope here).
- No visual/design refresh — only text, flow, and defensive error handling.
- Not gating the biometric switch on repeated re-authentication after
  initial enable (approach C from brainstorming): once verified, subsequent
  biometric failures on the LockScreen just fall back to PIN — the normal
  behavior.

## Design

### 1. Re-install `expo-local-authentication` and rebuild the dev-client

Ops-only, no code change. Run `npm install`, then rebuild the dev-client
(`npx expo run:android` and/or `npx expo run:ios`) so the native module is
actually linked into the app binary. This is the load-bearing fix for
Bug 1; the code changes below are defensive layers around it.

### 2. Defensive wrappers in `src/lib/app-lock.ts`

Wrap both biometric helpers so a thrown/rejected native call resolves to
`false` instead of propagating. This turns any future silent failure into
"biometric not available, use PIN" — which is the correct fallback.

```ts
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    return await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

export async function authenticateBiometric(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage });
    return result.success;
  } catch {
    return false;
  }
}
```

No changes to `lock-screen.tsx` — since both helpers now always resolve,
the existing `.then` chain in `runBiometric` is already safe. If biometric
is unavailable, LockScreen falls through to the PIN pad, which is the
intended fallback behavior.

### 3. Immediate biometric verification when enabling the switch

In `src/app/settings.tsx`, replace the current biometric switch handler:

```ts
onValueChange={async (v) => {
  if (!v) {
    update('appLockBiometricEnabled', false);
    return;
  }
  const available = await isBiometricAvailable();
  if (!available) {
    Alert.alert(
      t('settings.applock_biometric_unavailable_title'),
      t('settings.applock_biometric_unavailable_body'),
    );
    return;
  }
  const ok = await authenticateBiometric(t('settings.applock_biometric_verify_title'));
  if (!ok) {
    Alert.alert(
      t('settings.applock_biometric_verify_failed_title'),
      t('settings.applock_biometric_verify_failed_body'),
    );
    return;
  }
  update('appLockBiometricEnabled', true);
}}
```

If the user cancels or authentication fails, the switch stays off. This
gives the user immediate feedback that biometric works on their device
before they rely on it to unlock the app.

### 4. New component `src/components/sl/verify-pin-sheet.tsx`

Purpose: prove the user knows the current PIN (or has biometric) before
running a destructive PIN action (disable lock, change PIN).

```ts
export interface VerifyPinSheetHandle {
  present(): void;
  dismiss(): void;
}

interface Props {
  title: string;
  biometricEnabled: boolean;
  onVerified: () => void;
}
```

Implementation, modeled on `PinSetupSheet`:

- `BottomSheetModal` with `enableDynamicSizing`, `enablePanDownToClose`,
  standard backdrop.
- Single step: `<PinPad>` at length 6. On 6th digit → `await verifyPin(pin)`:
  - `true` → call `onVerified()`, dismiss sheet.
  - `false` → set `error = true`, clear draft. No lockout counter (see
    below).
- If `biometricEnabled`, pass `onBiometricPress={runBiometric}` to the pad.
  `runBiometric` calls `authenticateBiometric(title)` and on success calls
  `onVerified()` + dismisses.
- Error text: red `t('lock.verify_wrong_pin')` under the pad when
  `error === true`.
- Reset all internal state (`draft`, `error`) inside `present()`.

**No lockout in VerifyPinSheet.** The threat model here is different from
the LockScreen: the app is already unlocked, the attacker is someone
briefly holding the phone. A lockout after 5 tries would just annoy the
legitimate user who mistyped. If we want a further-defense-in-depth pass
later, we can add attempt tracking, but it is out of scope for these two
bug fixes.

### 5. Wire `VerifyPinSheet` into Settings

**Disable app lock** — replace the current `Alert.alert` + `clearPin` in
`src/app/settings.tsx:139-160` with:

```ts
onValueChange={(v) => {
  if (v) {
    pinSetupSheetRef.current?.present();
    return;
  }
  verifyPinSheetRef.current?.present();
  // onVerified handler set on the sheet element itself, see below
}}
```

Sheet element:

```tsx
<VerifyPinSheet
  ref={verifyPinSheetRef}
  title={verifyMode === 'disable'
    ? t('settings.applock_verify_disable_title')
    : t('settings.applock_verify_change_title')}
  biometricEnabled={settings.appLockBiometricEnabled}
  onVerified={async () => {
    if (verifyMode === 'disable') {
      try { await clearPin(); } catch (err) { console.warn('clearPin failed', err); }
      update('appLockEnabled', false);
      update('appLockBiometricEnabled', false);
    } else {
      pinSetupSheetRef.current?.present();
    }
  }}
/>
```

A small `verifyMode` state (`'disable' | 'change'`) is set right before
each `present()` call so `onVerified` knows what to do next. No `Alert` is
shown — the sheet itself is the confirmation.

**Change PIN** — replace `settings.tsx:165-170` `pinSetupSheetRef.present()`
with `setVerifyMode('change'); verifyPinSheetRef.current?.present()`.

**Reset all data** (settings.tsx:229-247) is left as-is: it is already
gated behind an `Alert.alert` with a destructive style, it clears
everything (transactions, categories, PIN together), and requiring a PIN
just to clear the PIN is odd UX. The threat model for "wipe everything" is
different from "silently disable the lock".

### 6. i18n keys

Add to both `vi` and `en` bundles in `src/lib/i18n`:

| key | vi | en |
|---|---|---|
| `settings.applock_biometric_verify_title` | Xác thực để bật sinh trắc học | Authenticate to enable biometrics |
| `settings.applock_biometric_verify_failed_title` | Xác thực thất bại | Authentication failed |
| `settings.applock_biometric_verify_failed_body` | Chưa bật sinh trắc học. Bạn có thể thử lại bất kỳ lúc nào. | Biometrics not enabled. You can try again anytime. |
| `settings.applock_verify_disable_title` | Nhập PIN để tắt bảo mật | Enter PIN to disable lock |
| `settings.applock_verify_change_title` | Nhập PIN hiện tại | Enter current PIN |
| `lock.verify_wrong_pin` | Sai PIN | Wrong PIN |

## Error handling & edge cases

- **User has no PIN set but somehow reaches the biometric switch**: the
  Settings section is already gated behind `settings.appLockEnabled` — that
  flag only flips true after `PinSetupSheet.onComplete` runs (which is only
  called after two matching PIN entries and `setPin()` succeeds). No extra
  guard needed.
- **`clearPin` fails mid-disable**: the existing `try/catch` in
  `settings.tsx` already logs and continues. `appLockEnabled` still flips
  to false so the user isn't stranded with an unresponsive switch. This
  behavior is preserved.
- **Biometric hardware becomes unavailable between enabling and locking**
  (e.g. user disables Face ID in iOS Settings): LockScreen sees
  `isBiometricAvailable() = false`, the auto-biometric effect is a no-op,
  user gets the PIN pad. Manual PIN entry always works. No user-facing
  error needed — this is the correct fallback.
- **`verifyPin` throws** (SecureStore access denied, corrupted hash): the
  new `VerifyPinSheet` should treat it as a wrong-PIN error (show red
  text). Not adding a separate error state for I/O failure — the user's
  next action is the same either way (try again or dismiss).
- **User dismisses `VerifyPinSheet` mid-verification** (pan-down or
  backdrop tap): sheet unmounts, `onVerified` never fires, no state
  changes. The switch (or "Đổi PIN" row) stays in its pre-tap state —
  which is exactly what we want.

## Testing strategy

**Unit tests** (Jest, `src/lib/app-lock.test.ts`):

- `isBiometricAvailable()` returns `false` when
  `LocalAuthentication.hasHardwareAsync` mock throws.
- `isBiometricAvailable()` returns `false` when
  `LocalAuthentication.isEnrolledAsync` mock throws.
- `authenticateBiometric()` returns `false` when
  `LocalAuthentication.authenticateAsync` mock throws.
- Existing tests for pure PIN/lockout logic stay green (no changes to
  those helpers).

**Component tests** (RTL, `src/components/sl/verify-pin-sheet.test.tsx`):

- Rendering with correct title.
- Entering the correct PIN calls `onVerified` once and hides the sheet.
- Entering the wrong PIN shows the error text and does not call
  `onVerified`.
- With `biometricEnabled=true`, pressing the biometric button and mock
  auth resolving to `true` calls `onVerified`.
- With `biometricEnabled=false`, the biometric button is not rendered
  (existing `PinPad` behavior — `onBiometricPress={undefined}`).

**Manual QA checklist** (to append to
`docs/superpowers/plans/2026-07-27-app-lock.md` when the plan is written):

- [ ] After `npm install` + `expo run:android`, enable app lock, enable
      biometric, background → foreground: OS biometric prompt appears; on
      success app unlocks; on cancel PIN pad remains usable.
- [ ] Enable biometric switch in Settings: OS prompt appears immediately;
      cancelling leaves switch off; succeeding flips switch on.
- [ ] Disable app lock switch: `VerifyPinSheet` presents; wrong PIN shows
      error and does not disable; correct PIN clears PIN + flips both
      switches off.
- [ ] With biometric enabled, disable app lock via biometric on the verify
      sheet: same effect as correct PIN.
- [ ] "Đổi PIN": `VerifyPinSheet` presents first; on success
      `PinSetupSheet` opens for new PIN entry.
- [ ] Dismiss `VerifyPinSheet` via swipe-down mid-verify: nothing changes.
- [ ] "Reset all data" alert flow unchanged — still gated by Alert only,
      still wipes PIN as part of the reset.

## Files touched

- `package.json` / `package-lock.json` — no edits, just re-install.
- `src/lib/app-lock.ts` — defensive try/catch in two helpers.
- `src/app/settings.tsx` — new biometric enable flow, new disable + change
  PIN flows via `VerifyPinSheet`.
- `src/components/sl/verify-pin-sheet.tsx` — new component.
- `src/components/sl/verify-pin-sheet.test.tsx` — new component tests.
- `src/lib/app-lock.test.ts` — extended with defensive-wrapper tests.
- `src/lib/i18n/*` — 6 new keys per language (structure depends on how
  i18n bundles are organized; the writing-plans step should confirm).
