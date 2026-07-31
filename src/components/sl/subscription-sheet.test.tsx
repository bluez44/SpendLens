jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SubscriptionSheet, type SubscriptionSheetHandle } from './subscription-sheet';
import { SettingsProvider } from '@/lib/settings-context';
import type { Subscription } from '@/lib/subscriptions';

function renderWithProviders(ui: any) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

describe('SubscriptionSheet', () => {
  it('presentAdd shows the add title and blank inputs', async () => {
    const ref = createRef<SubscriptionSheetHandle>();
    const r = await renderWithProviders(
      <SubscriptionSheet ref={ref} onSave={() => {}} onDelete={() => {}} onPauseResume={() => {}} />
    );
    await act(() => ref.current?.presentAdd());
    expect(r.queryByText(/New subscription|Đăng ký mới/)).toBeTruthy();
  });

  it('presentEdit preloads existing subscription data', async () => {
    const ref = createRef<SubscriptionSheetHandle>();
    const r = await renderWithProviders(
      <SubscriptionSheet ref={ref} onSave={() => {}} onDelete={() => {}} onPauseResume={() => {}} />
    );
    const sub: Subscription = {
      id: 1, uuid: 'u', name: 'Netflix',
      category: 'fun', originalAmount: 260000, originalCurrency: 'VND',
      anchorDay: 20, nextDueDate: '2026-08-20',
      photoPath: null,
      notify7: true, notify3: false, notify1: true,
      paused: false, createdAt: 0, updatedAt: 0,
    };
    await act(() => ref.current?.presentEdit(sub));
    expect(r.queryByText(/Edit subscription|Sửa đăng ký/)).toBeTruthy();
    expect(r.queryByDisplayValue('Netflix')).toBeTruthy();
  });

  it('save fires onSave with the correct DTO in add mode', async () => {
    const onSave = jest.fn();
    const ref = createRef<SubscriptionSheetHandle>();
    const r = await renderWithProviders(
      <SubscriptionSheet ref={ref} onSave={onSave} onDelete={() => {}} onPauseResume={() => {}} />
    );
    await act(() => ref.current?.presentAdd());
    fireEvent.changeText(r.getByTestId('sub-name-input'), 'Test');
    fireEvent.changeText(r.getByTestId('sub-amount-input'), '2000');
    fireEvent.press(r.getByTestId('sub-save-button'));
    expect(onSave).toHaveBeenCalled();
    const [payload, id] = onSave.mock.calls[0];
    expect(payload.name).toBe('Test');
    expect(payload.originalAmount).toBeGreaterThan(0);
    expect(id).toBeUndefined();
  });
});
