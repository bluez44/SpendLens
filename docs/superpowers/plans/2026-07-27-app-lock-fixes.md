# App lock bug fixes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two on-device app-lock bugs — biometric never prompts, and disabling the lock / changing the PIN both skip current-PIN verification.

**Architecture:** Re-install `expo-local-authentication` (missing from `node_modules`) and wrap its calls in defensive try/catch so silent native failures degrade gracefully to PIN. Add a new `VerifyPinSheet` component and route both destructive PIN actions (disable + change) through it. Prompt biometrics immediately when the user enables the switch in Settings so failure is visible.

**Tech Stack:** Expo 57, React Native 0.86, `expo-local-authentication@~57.0.2`, `expo-secure-store`, `@gorhom/bottom-sheet`, Jest + `@testing-library/react-native`, i18n via JSON bundles in `src/lib/i18n/locales/`.

## Global Constraints

- Expo has changed in v57 — before touching any Expo API, verify against https://docs.expo.dev/versions/v57.0.0/ (per `AGENTS.md`).
- All user-facing strings go through i18n (`useT()` / `t('key')`) — never hard-code visible text.
- Every new i18n key MUST be added to both `src/lib/i18n/locales/vi.json` AND `src/lib/i18n/locales/en.json`.
- Follow the existing test patterns in `src/components/sl/pin-setup-sheet.test.tsx` (uses `act`, `fireEvent`, module-level `jest.mock` for `@/lib/app-lock`).
- Design spec: `docs/superpowers/specs/2026-07-27-app-lock-fixes-design.md` — read for full context.

---

### Task 1: Install missing native module + defensive biometric wrappers

**Files:**
- Install: `expo-local-authentication@~57.0.2` (already in `package.json` / `package-lock.json`, absent from `node_modules`)
- Modify: `src/lib/app-lock.ts` (lines 70-79 — both biometric helpers)
- Test: `src/lib/app-lock.test.ts` (extend `isBiometricAvailable` and `authenticateBiometric` describe blocks)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isBiometricAvailable(): Promise<boolean>` — resolves `true` only when hardware exists AND is enrolled AND both native calls succeed; resolves `false` on any thrown/rejected native call.
  - `authenticateBiometric(promptMessage: string): Promise<boolean>` — resolves `true` on native `success: true`; resolves `false` on `success: false` OR any thrown/rejected native call.

- [ ] **Step 1: Verify the module is missing**

```bash
ls node_modules/ | grep -i "expo-local-auth"
```

Expected output: **no lines** (only `expo-localization` should exist elsewhere). This confirms the root cause of Bug 1.

- [ ] **Step 2: Install the missing package**

```bash
npm install
```

Expected: `expo-local-authentication` is fetched into `node_modules/expo-local-authentication/`.

Verify:

```bash
ls node_modules/expo-local-authentication/package.json
```

Expected: file exists.

- [ ] **Step 3: Write the failing tests for defensive wrappers**

Add to `src/lib/app-lock.test.ts` inside the existing `describe('isBiometricAvailable', ...)` block:

```ts
  it('resolves false when hasHardwareAsync throws', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockRejectedValue(new Error('native boom'));
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('resolves false when isEnrolledAsync throws', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockRejectedValue(new Error('native boom'));
    expect(await isBiometricAvailable()).toBe(false);
  });
```

Add to `describe('authenticateBiometric', ...)`:

```ts
  it('resolves false when authenticateAsync throws', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockRejectedValue(new Error('native boom'));
    expect(await authenticateBiometric('Unlock SpendLens')).toBe(false);
  });
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx jest src/lib/app-lock.test.ts
```

Expected: three new tests FAIL with unhandled promise rejections (helpers currently propagate).

- [ ] **Step 5: Add defensive try/catch to `src/lib/app-lock.ts`**

Replace lines 70-79 of `src/lib/app-lock.ts`:

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

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest src/lib/app-lock.test.ts
```

Expected: all tests PASS (including the 5 existing biometric tests + 3 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/lib/app-lock.ts src/lib/app-lock.test.ts
git commit -m "Fix: defensive wrappers around expo-local-authentication calls

Silent native failures (missing module, revoked hardware, native crash)
now degrade to \"biometric unavailable\" instead of rejecting a promise
that no one catches. This is Bug 1's belt-and-suspenders layer — the
load-bearing fix is running \"npm install\" to actually pull the module
into node_modules and rebuilding the dev-client so the native side is
linked."
```

- [ ] **Step 8: Rebuild the dev-client (ops, no commit)**

`expo-local-authentication` is a native module, so the dev-client APK/IPA must be rebuilt for the native side to link. Note in the task output which platform(s) you rebuilt:

```bash
# Android
npx expo run:android

# iOS (if applicable)
npx expo run:ios
```

Do not run these blindly if you're not on the target machine — flag this as a manual step for the reviewer to run before Task 4's on-device QA.

---

### Task 2: Add i18n keys for verify flows

**Files:**
- Modify: `src/lib/i18n/locales/vi.json` (extend `settings` and `lock` objects)
- Modify: `src/lib/i18n/locales/en.json` (mirror)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 3 and 4):
  - `settings.applock_biometric_verify_title`
  - `settings.applock_biometric_verify_failed_title`
  - `settings.applock_biometric_verify_failed_body`
  - `settings.applock_verify_disable_title`
  - `settings.applock_verify_change_title`
  - `lock.verify_wrong_pin`

- [ ] **Step 1: Add keys to `src/lib/i18n/locales/vi.json`**

Inside the existing `"settings"` object (before its closing `}`), add:

```json
    "applock_biometric_verify_title": "Xác thực để bật sinh trắc học",
    "applock_biometric_verify_failed_title": "Xác thực thất bại",
    "applock_biometric_verify_failed_body": "Chưa bật sinh trắc học. Bạn có thể thử lại bất kỳ lúc nào.",
    "applock_verify_disable_title": "Nhập PIN để tắt bảo mật",
    "applock_verify_change_title": "Nhập PIN hiện tại"
```

Inside the existing `"lock"` object (before its closing `}`), add:

```json
    "verify_wrong_pin": "Sai PIN"
```

Preserve JSON validity — the previous last key in each object needs its trailing comma added.

- [ ] **Step 2: Add matching keys to `src/lib/i18n/locales/en.json`**

Inside `"settings"`:

```json
    "applock_biometric_verify_title": "Authenticate to enable biometrics",
    "applock_biometric_verify_failed_title": "Authentication failed",
    "applock_biometric_verify_failed_body": "Biometrics not enabled. You can try again anytime.",
    "applock_verify_disable_title": "Enter PIN to disable lock",
    "applock_verify_change_title": "Enter current PIN"
```

Inside `"lock"`:

```json
    "verify_wrong_pin": "Wrong PIN"
```

- [ ] **Step 3: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/vi.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/en.json','utf8'))"
```

Expected: no output (both parse cleanly). Any syntax error → fix and re-run.

- [ ] **Step 4: Run the i18n tests**

```bash
npx jest src/lib/i18n
```

Expected: all pass (no i18n test currently asserts on the new keys; this just proves we didn't break existing snapshots or key expectations).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/locales/vi.json src/lib/i18n/locales/en.json
git commit -m "i18n: add keys for PIN verify + biometric enable flows

Adds strings used by the upcoming VerifyPinSheet and the new
biometric-verify-on-enable behavior in Settings."
```

---

### Task 3: Create `VerifyPinSheet` component + tests

**Files:**
- Create: `src/components/sl/verify-pin-sheet.tsx`
- Test: `src/components/sl/verify-pin-sheet.test.tsx`

**Interfaces:**
- Consumes (from Task 1): `verifyPin(pin: string): Promise<boolean>`, `authenticateBiometric(promptMessage: string): Promise<boolean>` from `@/lib/app-lock`.
- Consumes (from Task 2): i18n keys `lock.verify_wrong_pin`.
- Produces:
  - `VerifyPinSheet` — forwardRef component
  - `VerifyPinSheetHandle` — `{ present(): void; dismiss(): void }`
  - Props:
    ```ts
    interface Props {
      title: string;              // caller-supplied, already localized
      biometricEnabled: boolean;
      onVerified: () => void;
    }
    ```

- [ ] **Step 1: Write the failing test**

Create `src/components/sl/verify-pin-sheet.test.tsx`:

```ts
jest.mock('@/lib/app-lock', () => ({
  verifyPin: jest.fn(),
  authenticateBiometric: jest.fn(),
}));

import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import * as AppLock from '@/lib/app-lock';

import { VerifyPinSheet, type VerifyPinSheetHandle } from './verify-pin-sheet';

const mocked = AppLock as jest.Mocked<typeof AppLock>;

async function enterPin(getByTestId: (id: string) => { props: { onPress?: () => void } }, pin: string) {
  for (const digit of pin) {
    await fireEvent.press(getByTestId(`pin-digit-${digit}`));
  }
}

beforeEach(() => jest.clearAllMocks());

describe('VerifyPinSheet', () => {
  it('calls onVerified when the correct PIN is entered', async () => {
    mocked.verifyPin.mockResolvedValue(true);
    const onVerified = jest.fn();
    const ref = createRef<VerifyPinSheetHandle>();
    const { getByTestId, getByText } = await render(
      <VerifyPinSheet ref={ref} title="Nhập PIN hiện tại" biometricEnabled={false} onVerified={onVerified} />,
    );
    await act(() => ref.current?.present());
    expect(getByText('Nhập PIN hiện tại')).toBeTruthy();
    await enterPin(getByTestId, '123456');
    expect(mocked.verifyPin).toHaveBeenCalledWith('123456');
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('shows the wrong-PIN error and does not call onVerified on an incorrect PIN', async () => {
    mocked.verifyPin.mockResolvedValue(false);
    const onVerified = jest.fn();
    const ref = createRef<VerifyPinSheetHandle>();
    const { getByTestId, getByText } = await render(
      <VerifyPinSheet ref={ref} title="Nhập PIN hiện tại" biometricEnabled={false} onVerified={onVerified} />,
    );
    await act(() => ref.current?.present());
    await enterPin(getByTestId, '000000');
    expect(getByText('Sai PIN')).toBeTruthy();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('calls onVerified when biometric authentication succeeds', async () => {
    mocked.authenticateBiometric.mockResolvedValue(true);
    const onVerified = jest.fn();
    const ref = createRef<VerifyPinSheetHandle>();
    const { getByTestId } = await render(
      <VerifyPinSheet ref={ref} title="Nhập PIN hiện tại" biometricEnabled={true} onVerified={onVerified} />,
    );
    await act(() => ref.current?.present());
    await fireEvent.press(getByTestId('pin-biometric'));
    expect(mocked.authenticateBiometric).toHaveBeenCalledWith('Nhập PIN hiện tại');
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('does not render a biometric button when biometricEnabled is false', async () => {
    const onVerified = jest.fn();
    const ref = createRef<VerifyPinSheetHandle>();
    const { queryByTestId } = await render(
      <VerifyPinSheet ref={ref} title="Nhập PIN hiện tại" biometricEnabled={false} onVerified={onVerified} />,
    );
    await act(() => ref.current?.present());
    expect(queryByTestId('pin-biometric')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/components/sl/verify-pin-sheet.test.tsx
```

Expected: FAIL — "Cannot find module './verify-pin-sheet'".

- [ ] **Step 3: Implement `src/components/sl/verify-pin-sheet.tsx`**

Modeled on `pin-setup-sheet.tsx`:

```tsx
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { PinPad } from '@/components/sl/pin-pad';
import { Text } from '@/components/sl/text';
import { Money, useColors, W } from '@/constants/tokens';
import { authenticateBiometric, verifyPin } from '@/lib/app-lock';
import { useT } from '@/lib/i18n';

const PIN_LENGTH = 6;

export interface VerifyPinSheetHandle {
  present: () => void;
  dismiss: () => void;
}

interface Props {
  title: string;
  biometricEnabled: boolean;
  onVerified: () => void;
}

export const VerifyPinSheet = forwardRef<VerifyPinSheetHandle, Props>(function VerifyPinSheet(
  { title, biometricEnabled, onVerified },
  ref,
) {
  const { t } = useT();
  const colors = useColors();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);

  useImperativeHandle(ref, () => ({
    present: () => {
      setDraft('');
      setError(false);
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
    [],
  );

  const onDigit = async (d: string) => {
    if (error) setError(false);
    const next = draft + d;
    setDraft(next);
    if (next.length !== PIN_LENGTH) return;
    const ok = await verifyPin(next);
    if (ok) {
      onVerified();
      sheetRef.current?.dismiss();
      return;
    }
    setError(true);
    setDraft('');
  };

  const onDelete = () => setDraft((prev) => prev.slice(0, -1));

  const onBiometricPress = async () => {
    const ok = await authenticateBiometric(title);
    if (!ok) return;
    onVerified();
    sheetRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.card }}>
      <BottomSheetView style={styles.body}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: W.bold }}>{title}</Text>
        <PinPad
          value={draft}
          length={PIN_LENGTH}
          onDigit={onDigit}
          onDelete={onDelete}
          onBiometricPress={biometricEnabled ? onBiometricPress : undefined}
          error={error}
        />
        {error ? (
          <Text style={{ color: Money.expense, fontWeight: W.semibold }}>{t('lock.verify_wrong_pin')}</Text>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 32, alignItems: 'center' },
});
```

- [ ] **Step 4: Run tests to verify all four pass**

```bash
npx jest src/components/sl/verify-pin-sheet.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sl/verify-pin-sheet.tsx src/components/sl/verify-pin-sheet.test.tsx
git commit -m "Add VerifyPinSheet component

Bottom-sheet that gates a destructive PIN action (disable app lock,
change PIN) behind proof the user knows the current PIN — or has
biometric access, if enabled. Modeled on PinSetupSheet. No lockout
counter: the app is already unlocked here, so the LockScreen's
escalating-timeout defense doesn't apply."
```

---

### Task 4: Wire verify flows and biometric-verify-on-enable into Settings

**Files:**
- Modify: `src/app/settings.tsx` (imports, biometric switch handler at ~lines 172-192, app lock disable handler at ~lines 137-162, change PIN handler at ~lines 165-170, add `VerifyPinSheet` element near existing sheets)

**Interfaces:**
- Consumes (from Task 1): `authenticateBiometric`, `isBiometricAvailable`, `clearPin` from `@/lib/app-lock`.
- Consumes (from Task 2): `settings.applock_biometric_verify_title`, `settings.applock_biometric_verify_failed_title`, `settings.applock_biometric_verify_failed_body`, `settings.applock_verify_disable_title`, `settings.applock_verify_change_title`.
- Consumes (from Task 3): `VerifyPinSheet`, `VerifyPinSheetHandle`.
- Produces: user-facing behavior — no exported API changes.

- [ ] **Step 1: Add `VerifyPinSheet` import to `settings.tsx`**

Near the top of `src/app/settings.tsx`, next to the existing `PinSetupSheet` import (line 9):

```ts
import { VerifyPinSheet, type VerifyPinSheetHandle } from '@/components/sl/verify-pin-sheet';
```

Also import `authenticateBiometric` alongside the existing `clearPin, isBiometricAvailable` (line 13):

```ts
import { authenticateBiometric, clearPin, isBiometricAvailable } from '@/lib/app-lock';
```

- [ ] **Step 2: Add refs + verify-mode state**

Inside `SettingsScreen()` next to the existing refs (around line 35):

```ts
const verifyPinSheetRef = useRef<VerifyPinSheetHandle>(null);
const [verifyMode, setVerifyMode] = useState<'disable' | 'change'>('disable');
```

- [ ] **Step 3: Replace the app-lock disable branch**

Locate the `onValueChange` on the app-lock Switch (`settings.tsx:139-160`). Replace the entire `Alert.alert(...)` inside the `else` branch with a call to present the verify sheet:

```tsx
<Switch
  value={settings.appLockEnabled}
  onValueChange={(v) => {
    if (v) {
      pinSetupSheetRef.current?.present();
      return;
    }
    setVerifyMode('disable');
    verifyPinSheetRef.current?.present();
  }}
/>
```

- [ ] **Step 4: Replace the "Đổi PIN" onPress**

Locate the change-PIN Pressable (`settings.tsx:165-170`). Replace its `onPress`:

```tsx
<Pressable
  style={[styles.row, { borderColor: colors.hairline }]}
  onPress={() => {
    setVerifyMode('change');
    verifyPinSheetRef.current?.present();
  }}>
```

- [ ] **Step 5: Replace the biometric switch handler with verify-on-enable**

Locate the biometric Switch (`settings.tsx:172-192`). Replace its `onValueChange`:

```tsx
<Switch
  value={settings.appLockBiometricEnabled}
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
/>
```

- [ ] **Step 6: Mount `VerifyPinSheet` alongside the other sheets**

At the bottom of the returned JSX (next to the existing `<PinSetupSheet .../>` at ~line 298), add:

```tsx
<VerifyPinSheet
  ref={verifyPinSheetRef}
  title={
    verifyMode === 'disable'
      ? t('settings.applock_verify_disable_title')
      : t('settings.applock_verify_change_title')
  }
  biometricEnabled={settings.appLockBiometricEnabled}
  onVerified={async () => {
    if (verifyMode === 'disable') {
      try {
        await clearPin();
      } catch (err) {
        console.warn('Failed to clear PIN', err);
      }
      update('appLockEnabled', false);
      update('appLockBiometricEnabled', false);
      return;
    }
    pinSetupSheetRef.current?.present();
  }}
/>
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any TypeScript issues before proceeding — most likely a missing `useState` import if it wasn't already used (settings.tsx already imports `useState`, so this should be fine).

- [ ] **Step 8: Run the full test suite**

```bash
npx jest
```

Expected: all tests PASS. If any settings-adjacent tests fail (none exist today for `settings.tsx`, but if lock-screen.test.tsx / app-lock.test.ts / pin-setup-sheet.test.tsx / verify-pin-sheet.test.tsx are all green, we're good).

- [ ] **Step 9: Commit**

```bash
git add src/app/settings.tsx
git commit -m "Fix: gate destructive PIN actions behind PIN verification

Disabling app lock and changing the PIN both now require the current
PIN (or biometric, if enabled) via a new VerifyPinSheet — not just an
Alert confirmation. Also verifies biometric works at the moment the
user enables the switch, instead of silently persisting a preference
that only fails when they next re-open the app."
```

- [ ] **Step 10: Manual QA on-device**

Requires the dev-client rebuilt in Task 1 Step 8. Run each item and mark ✅/❌ in the task completion notes:

1. Enable app lock (set PIN), background → foreground: LockScreen appears with PIN pad only. ✅
2. Enable biometric switch: OS biometric prompt appears **immediately**. Cancel → switch stays off + "Xác thực thất bại" alert. ✅
3. Enable biometric switch, succeed: switch persists on. ✅
4. With biometric on, background → foreground: OS biometric prompt appears; success unlocks the app. ✅
5. Disable app lock switch: `VerifyPinSheet` appears, wrong PIN shows "Sai PIN" and stays open, correct PIN clears + turns both switches off. ✅
6. With biometric on, disable via biometric button on VerifyPinSheet: works, same outcome as correct PIN. ✅
7. "Đổi PIN" row: VerifyPinSheet appears first; on success `PinSetupSheet` opens for the new PIN. ✅
8. Swipe-down dismiss VerifyPinSheet mid-verify: nothing changes (switch/row remain in original state). ✅
9. "Reset all data" alert flow: unchanged, still wipes PIN as part of the reset. ✅

If any item fails, do not close the task — file the finding and iterate.

---

## Self-review notes

- **Spec coverage:** All 5 design sections in the spec map to a task above (§1 package install → T1 Step 2 + Step 8; §2 defensive wrappers → T1; §3 biometric verify-on-enable → T4 Step 5; §4 VerifyPinSheet component → T3; §5 wire VerifyPinSheet into Settings → T4 Steps 3, 4, 6; §6 i18n → T2). Manual QA checklist from spec §Testing → T4 Step 10.
- **Placeholders:** none — every step has the concrete file, code, or command.
- **Type consistency:** `VerifyPinSheetHandle`, `verifyMode` values (`'disable' | 'change'`), and imports match across tasks. `authenticateBiometric` signature (single `string` arg → `Promise<boolean>`) matches the wrapper produced in Task 1.
- **Not covered on purpose:** LockScreen changes (spec §2 explicitly says none needed once helpers are safe); "Reset all data" flow (spec §5 leaves it unchanged); Drive sync (out of scope).
