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
