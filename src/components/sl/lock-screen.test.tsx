jest.mock('@/lib/app-lock', () => ({
  verifyPin: jest.fn(),
  hasPinSet: jest.fn(),
  isBiometricAvailable: jest.fn(),
  authenticateBiometric: jest.fn(),
  INITIAL_LOCKOUT_STATE: { failedAttempts: 0, lockedUntil: null },
  recordFailedAttempt: jest.requireActual('@/lib/app-lock').recordFailedAttempt,
  recordSuccess: jest.requireActual('@/lib/app-lock').recordSuccess,
  isLockedOut: jest.requireActual('@/lib/app-lock').isLockedOut,
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import * as AppLock from '@/lib/app-lock';

import { LockScreen } from './lock-screen';

const mocked = AppLock as jest.Mocked<typeof AppLock>;

// Each `fireEvent.press` is itself async (it wraps React's `act()`, same as
// `render()`), so — exactly like the `render()`/`act()` gotcha from Task 5 —
// firing several in a row without awaiting each one lets them overlap and
// permanently breaks passive-effect flushing for every later `render()` in
// this file. Awaiting each press keeps them from ever overlapping.
async function enterPin(getByTestId: (id: string) => { props: { onPress?: () => void } }, pin: string) {
  for (const digit of pin) {
    await fireEvent.press(getByTestId(`pin-digit-${digit}`));
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.hasPinSet.mockResolvedValue(true);
  mocked.isBiometricAvailable.mockResolvedValue(false);
});

describe('LockScreen', () => {
  it('calls onUnlock when the correct PIN is entered', async () => {
    mocked.verifyPin.mockResolvedValue(true);
    const onUnlock = jest.fn();
    const { getByTestId } = await render(<LockScreen biometricEnabled={false} onUnlock={onUnlock} />);
    await waitFor(() => expect(mocked.hasPinSet).toHaveBeenCalled());
    await enterPin(getByTestId, '123456');
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });

  it('shows a wrong-PIN message and does not unlock on an incorrect PIN', async () => {
    mocked.verifyPin.mockResolvedValue(false);
    const onUnlock = jest.fn();
    const { getByTestId, getByText } = await render(<LockScreen biometricEnabled={false} onUnlock={onUnlock} />);
    await waitFor(() => expect(mocked.hasPinSet).toHaveBeenCalled());
    await enterPin(getByTestId, '000000');
    await waitFor(() => expect(getByText(/Sai mã PIN/)).toBeTruthy());
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('locks the keypad and shows a countdown after 5 wrong attempts', async () => {
    mocked.verifyPin.mockResolvedValue(false);
    const { getByTestId, getByText } = await render(<LockScreen biometricEnabled={false} onUnlock={jest.fn()} />);
    await waitFor(() => expect(mocked.hasPinSet).toHaveBeenCalled());
    for (let i = 0; i < 5; i++) {
      await enterPin(getByTestId, '000000');
      await waitFor(() => expect(mocked.verifyPin).toHaveBeenCalledTimes(i + 1));
    }
    await waitFor(() => expect(getByText(/Thử lại sau/)).toBeTruthy());
  });

  it('auto-unlocks if no PIN is set (defensive fallback for corrupted state)', async () => {
    mocked.hasPinSet.mockResolvedValue(false);
    const onUnlock = jest.fn();
    await render(<LockScreen biometricEnabled={false} onUnlock={onUnlock} />);
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });

  it('tries biometrics automatically on mount when biometricEnabled is true', async () => {
    mocked.isBiometricAvailable.mockResolvedValue(true);
    mocked.authenticateBiometric.mockResolvedValue(true);
    const onUnlock = jest.fn();
    await render(<LockScreen biometricEnabled onUnlock={onUnlock} />);
    await waitFor(() => expect(mocked.authenticateBiometric).toHaveBeenCalled());
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });

  it('falls back to the PIN pad when biometrics fail', async () => {
    mocked.isBiometricAvailable.mockResolvedValue(true);
    mocked.authenticateBiometric.mockResolvedValue(false);
    mocked.verifyPin.mockResolvedValue(true);
    const onUnlock = jest.fn();
    const { getByTestId } = await render(<LockScreen biometricEnabled onUnlock={onUnlock} />);
    await waitFor(() => expect(mocked.authenticateBiometric).toHaveBeenCalled());
    await enterPin(getByTestId, '123456');
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });

  it('retries biometrics when the PinPad biometric key is pressed', async () => {
    mocked.isBiometricAvailable.mockResolvedValue(true);
    mocked.authenticateBiometric.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onUnlock = jest.fn();
    const { getByTestId } = await render(<LockScreen biometricEnabled onUnlock={onUnlock} />);
    await waitFor(() => expect(mocked.authenticateBiometric).toHaveBeenCalledTimes(1));
    expect(onUnlock).not.toHaveBeenCalled();
    await fireEvent.press(getByTestId('pin-biometric'));
    await waitFor(() => expect(mocked.authenticateBiometric).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });

  it('does not render the biometric key when biometricEnabled is false', async () => {
    const { queryByTestId } = await render(<LockScreen biometricEnabled={false} onUnlock={jest.fn()} />);
    expect(queryByTestId('pin-biometric')).toBeNull();
  });

  it('stops ticking the countdown once the lockout window elapses (no interval leak)', async () => {
    jest.useFakeTimers();
    try {
      mocked.verifyPin.mockResolvedValue(false);
      // Under fake timers, `waitFor`'s real-timer polling path is never
      // used (RNTL detects fake timers and switches to advancing them
      // instead), so the only `setInterval` call in this test is the
      // lockout countdown's own — safe to spy on from the very start and
      // read off exactly which interval id it created.
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { getByTestId, getByText, unmount } = await render(
        <LockScreen biometricEnabled={false} onUnlock={jest.fn()} />,
      );
      await waitFor(() => expect(mocked.hasPinSet).toHaveBeenCalled());
      for (let i = 0; i < 5; i++) {
        await enterPin(getByTestId, '000000');
        await waitFor(() => expect(mocked.verifyPin).toHaveBeenCalledTimes(i + 1));
      }
      await waitFor(() => expect(getByText(/Thử lại sau/)).toBeTruthy());

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      const intervalId = setIntervalSpy.mock.results[0]?.value;

      // The base lockout window is 30s (see app-lock.ts BASE_LOCKOUT_MS).
      // Advance well past it so the interval callback's own
      // `remaining <= 0` branch fires and clears itself, rather than
      // relying on the effect's cleanup (which only clears on unmount or
      // when `lockout` changes again).
      await act(() => jest.advanceTimersByTimeAsync(31_000));

      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);

      // Prove it actually stopped ticking, not just that clearInterval was
      // called once: reset the spy, advance well past another would-be
      // tick, and confirm no repeat clear/re-tick happens.
      clearIntervalSpy.mockClear();
      setIntervalSpy.mockClear();
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(clearIntervalSpy).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();

      // Clean up while still under fake timers, so effect cleanup (which
      // also calls `clearInterval`) doesn't run later under real timers.
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
