import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CardPickerSheet, type CardPickerSheetHandle } from './card-picker-sheet';

describe('CardPickerSheet', () => {
  it('fires onSelect("recap") when the recap row is tapped', async () => {
    const onSelect = jest.fn();
    const ref = createRef<CardPickerSheetHandle>();
    const { getByTestId } = await render(<CardPickerSheet ref={ref} onSelect={onSelect} />);
    await act(() => ref.current?.present());
    fireEvent.press(getByTestId('card-picker-recap'));
    expect(onSelect).toHaveBeenCalledWith('recap');
  });

  it('fires onSelect("streak") when the streak row is tapped', async () => {
    const onSelect = jest.fn();
    const ref = createRef<CardPickerSheetHandle>();
    const { getByTestId } = await render(<CardPickerSheet ref={ref} onSelect={onSelect} />);
    await act(() => ref.current?.present());
    fireEvent.press(getByTestId('card-picker-streak'));
    expect(onSelect).toHaveBeenCalledWith('streak');
  });
});
