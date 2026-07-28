import { createRef } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PreviewChangesSheet, type PreviewChangesSheetHandle } from './preview-changes-sheet';
import type { Snapshot } from '@/lib/sync/types';

function snap(uuids: string[]): Snapshot {
  return {
    version: 1, generatedAt: 100, deviceId: 'x',
    transactions: uuids.map((u) => ({
      uuid: u, date: '2026-07-01', time: '10:00',
      createdAt: 0, updatedAt: 0, category: 'food',
      name: u, note: null, amount: 1, isIncome: 0, photoUuid: null,
    })),
    categories: [], settings: { updatedAt: 0, values: {} }, photoManifest: [],
  };
}

describe('PreviewChangesSheet', () => {
  it('shows the count and invokes onConfirm', async () => {
    const onConfirm = jest.fn();
    const onBack = jest.fn();
    const ref = createRef<PreviewChangesSheetHandle>();
    const { queryByText, getByTestId } = await render(
      <PreviewChangesSheet ref={ref} onConfirm={onConfirm} onBack={onBack} />
    );
    await act(() => ref.current?.present(snap(['a']), snap(['b']), 'combine'));
    expect(queryByText(/2 giao dịch|2 transactions/)).toBeTruthy();
    fireEvent.press(getByTestId('preview-confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('invokes onBack when the back button is pressed', async () => {
    const onConfirm = jest.fn();
    const onBack = jest.fn();
    const ref = createRef<PreviewChangesSheetHandle>();
    const { getByTestId } = await render(
      <PreviewChangesSheet ref={ref} onConfirm={onConfirm} onBack={onBack} />
    );
    await act(() => ref.current?.present(snap(['a']), snap(['b']), 'combine'));
    fireEvent.press(getByTestId('preview-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
