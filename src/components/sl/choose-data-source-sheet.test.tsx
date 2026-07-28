import { createRef } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import {
  ChooseDataSourceSheet, type ChooseDataSourceSheetHandle,
} from './choose-data-source-sheet';
import type { Snapshot } from '@/lib/sync/types';

function snap(uuid: string): Snapshot {
  return {
    version: 1, generatedAt: 100, deviceId: 'x',
    transactions: [{
      uuid, date: '', time: '', createdAt: 0, updatedAt: 0,
      category: 'food', name: 'x', note: null, amount: 1, isIncome: 0, photoUuid: null,
    }],
    categories: [], settings: { updatedAt: 0, values: {} }, photoManifest: [],
  };
}

describe('ChooseDataSourceSheet', () => {
  it('exposes present() and calls onChoice with the chosen strategy', async () => {
    const onChoice = jest.fn();
    const ref = createRef<ChooseDataSourceSheetHandle>();
    const { getByTestId } = await render(<ChooseDataSourceSheet ref={ref} onChoice={onChoice} />);
    await act(() => ref.current?.present(snap('a'), snap('b')));
    fireEvent.press(getByTestId('choose-source-combine'));
    expect(onChoice).toHaveBeenCalledWith('combine');
  });
});
