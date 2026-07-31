import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import {
  AnchorDayPickerSheet,
  type AnchorDayPickerSheetHandle,
} from './anchor-day-picker-sheet';

describe('AnchorDayPickerSheet', () => {
  it('invokes onChoose with the tapped day', async () => {
    const onChoose = jest.fn();
    const ref = createRef<AnchorDayPickerSheetHandle>();
    const { getByTestId } = await render(
      <AnchorDayPickerSheet ref={ref} onChoose={onChoose} />
    );
    await act(() => ref.current?.present(15));
    fireEvent.press(getByTestId('anchor-day-20'));
    expect(onChoose).toHaveBeenCalledWith(20);
  });
});
