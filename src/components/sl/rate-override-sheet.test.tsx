import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { RateOverrideSheet, type RateOverrideSheetHandle } from './rate-override-sheet';

describe('RateOverrideSheet', () => {
  it('save invokes onSave with parsed rate', async () => {
    const onSave = jest.fn();
    const ref = createRef<RateOverrideSheetHandle>();
    const { getByTestId } = await render(<RateOverrideSheet ref={ref} onSave={onSave} />);
    await act(() => ref.current?.present('EUR', 1.10));
    await act(() => fireEvent.changeText(getByTestId('rate-input'), '1.15'));
    await act(() => fireEvent.press(getByTestId('rate-save')));
    expect(onSave).toHaveBeenCalledWith('EUR', 1.15);
  });

  it('rejects zero/negative rate', async () => {
    const onSave = jest.fn();
    const ref = createRef<RateOverrideSheetHandle>();
    const { getByTestId, queryByText } = await render(<RateOverrideSheet ref={ref} onSave={onSave} />);
    await act(() => ref.current?.present('EUR', 1.10));
    await act(() => fireEvent.changeText(getByTestId('rate-input'), '0'));
    await act(() => fireEvent.press(getByTestId('rate-save')));
    expect(onSave).not.toHaveBeenCalled();
    expect(queryByText(/greater than 0|lớn hơn 0/)).toBeTruthy();
  });
});
