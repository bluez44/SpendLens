import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { RateOverrideSheet, type RateOverrideSheetHandle } from './rate-override-sheet';

describe('RateOverrideSheet', () => {
  it('save invokes onSave with parsed rate and reference', async () => {
    const onSave = jest.fn();
    const ref = createRef<RateOverrideSheetHandle>();
    const { getByTestId } = await render(<RateOverrideSheet ref={ref} onSave={onSave} />);
    await act(() => ref.current?.present('EUR', 1.10, 'USD'));
    await act(() => fireEvent.changeText(getByTestId('rate-input'), '1.15'));
    await act(() => fireEvent.press(getByTestId('rate-save')));
    expect(onSave).toHaveBeenCalledWith('EUR', 1.15, 'USD');
  });

  it('propagates non-USD reference to onSave', async () => {
    const onSave = jest.fn();
    const ref = createRef<RateOverrideSheetHandle>();
    const { getByTestId } = await render(<RateOverrideSheet ref={ref} onSave={onSave} />);
    await act(() => ref.current?.present('EUR', 27000, 'VND'));
    await act(() => fireEvent.changeText(getByTestId('rate-input'), '27500'));
    await act(() => fireEvent.press(getByTestId('rate-save')));
    expect(onSave).toHaveBeenCalledWith('EUR', 27500, 'VND');
  });

  it('rejects zero/negative rate', async () => {
    const onSave = jest.fn();
    const ref = createRef<RateOverrideSheetHandle>();
    const { getByTestId, queryByText } = await render(<RateOverrideSheet ref={ref} onSave={onSave} />);
    await act(() => ref.current?.present('EUR', 1.10, 'USD'));
    await act(() => fireEvent.changeText(getByTestId('rate-input'), '0'));
    await act(() => fireEvent.press(getByTestId('rate-save')));
    expect(onSave).not.toHaveBeenCalled();
    expect(queryByText(/greater than 0|lớn hơn 0/)).toBeTruthy();
  });

  it('locks input and skips onSave when currency equals reference', async () => {
    const onSave = jest.fn();
    const ref = createRef<RateOverrideSheetHandle>();
    const { getByTestId } = await render(<RateOverrideSheet ref={ref} onSave={onSave} />);
    await act(() => ref.current?.present('VND', 1, 'VND'));
    await act(() => fireEvent.press(getByTestId('rate-save')));
    expect(onSave).not.toHaveBeenCalled();
  });
});
