jest.mock('@/lib/app-lock', () => ({
  setPin: jest.fn(),
}));

import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import * as AppLock from '@/lib/app-lock';

import { PinSetupSheet, type PinSetupSheetHandle } from './pin-setup-sheet';

const mocked = AppLock as jest.Mocked<typeof AppLock>;

async function enterPin(getByTestId: (id: string) => { props: { onPress?: () => void } }, pin: string) {
  for (const digit of pin) {
    await fireEvent.press(getByTestId(`pin-digit-${digit}`));
  }
}

beforeEach(() => jest.clearAllMocks());

describe('PinSetupSheet', () => {
  it('calls setPin and onComplete when both entries match', async () => {
    const onComplete = jest.fn();
    const ref = createRef<PinSetupSheetHandle>();
    const { getByTestId, getByText } = await render(<PinSetupSheet ref={ref} onComplete={onComplete} />);
    await act(() => ref.current?.present());
    expect(getByText('Đặt mã PIN')).toBeTruthy();
    await enterPin(getByTestId, '123456');
    expect(getByText('Nhập lại mã PIN')).toBeTruthy();
    await enterPin(getByTestId, '123456');
    expect(mocked.setPin).toHaveBeenCalledWith('123456');
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows a mismatch error and restarts at the "enter" step on confirm mismatch', async () => {
    const onComplete = jest.fn();
    const ref = createRef<PinSetupSheetHandle>();
    const { getByTestId, getByText } = await render(<PinSetupSheet ref={ref} onComplete={onComplete} />);
    await act(() => ref.current?.present());
    await enterPin(getByTestId, '123456');
    await enterPin(getByTestId, '654321');
    expect(getByText('Mã PIN không khớp, thử lại')).toBeTruthy();
    expect(getByText('Đặt mã PIN')).toBeTruthy();
    expect(mocked.setPin).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
