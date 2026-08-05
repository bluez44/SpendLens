const mockCopySync = jest.fn();

jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'content://media/external/images/media/42' }],
  })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn().mockImplementation((first: any, second?: string) => {
    const base = typeof first === 'string' ? first : first?.uri ?? '';
    const uri = second ? `${base}${second}` : base;
    return {
      uri,
      copySync: (dest: { uri: string }) => mockCopySync(uri, dest.uri),
      delete: jest.fn(),
    };
  }),
}));

import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SubscriptionSheet, type SubscriptionSheetHandle } from './subscription-sheet';
import { SettingsProvider } from '@/lib/settings-context';
import { TransactionsProvider } from '@/lib/transactions-context';

function renderWithProviders(ui: any) {
  return render(<SettingsProvider><TransactionsProvider>{ui}</TransactionsProvider></SettingsProvider>);
}

describe('SubscriptionSheet photo pick', () => {
  it('copies a picked photo into Paths.document and forwards the file:// uri on save', async () => {
    const onSave = jest.fn();
    const ref = createRef<SubscriptionSheetHandle>();
    const r = await renderWithProviders(
      <SubscriptionSheet ref={ref} onSave={onSave} onDelete={() => {}} onPauseResume={() => {}} />
    );
    await act(() => ref.current?.presentAdd());
    await act(async () => {
      fireEvent.press(r.getByTestId('sub-photo-pressable'));
    });
    await act(async () => {
      fireEvent.changeText(r.getByTestId('sub-name-input'), 'Netflix');
      fireEvent.changeText(r.getByTestId('sub-amount-input'), '20000');
    });
    await act(async () => { fireEvent.press(r.getByTestId('sub-save-button')); });

    expect(onSave).toHaveBeenCalled();
    const [payload] = onSave.mock.calls[0];
    expect(payload.photoPath).toMatch(/^file:\/\/\/doc\/sub-[0-9a-f-]+\.jpg$/);
    expect(mockCopySync).toHaveBeenCalledTimes(1);
    const [srcArg, destArg] = mockCopySync.mock.calls[0];
    expect(srcArg).toBe('content://media/external/images/media/42');
    expect(destArg).toMatch(/^file:\/\/\/doc\/sub-[0-9a-f-]+\.jpg$/);
    expect(payload.photoPath).toBe(destArg);
  });
});
