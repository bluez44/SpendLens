import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CurrencyPickerSheet, type CurrencyPickerSheetHandle } from './currency-picker-sheet';

describe('CurrencyPickerSheet', () => {
  it('invokes onChoose with the tapped currency', async () => {
    const onChoose = jest.fn();
    const ref = createRef<CurrencyPickerSheetHandle>();
    const { getByTestId } = await render(<CurrencyPickerSheet ref={ref} onChoose={onChoose} />);
    await act(() => ref.current?.present('VND'));
    fireEvent.press(getByTestId('currency-picker-USD'));
    expect(onChoose).toHaveBeenCalledWith('USD');
  });
});
