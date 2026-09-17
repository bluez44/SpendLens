jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue({ success: true }) },
}));

jest.mock('react-native-view-shot', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        capture: jest.fn().mockResolvedValue('file:///tmp/card.png'),
      }));
      return props.children;
    }),
  };
});

jest.mock('expo-media-library', () => ({
  __esModule: true,
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ type: 'recap' }),
  Stack: { Screen: () => null },
}));

import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Share from 'react-native-share';
import ShareScreen from './share';
import { SettingsProvider } from '@/lib/settings-context';
import { TransactionsProvider } from '@/lib/transactions-context';

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <SettingsProvider><TransactionsProvider>{ui}</TransactionsProvider></SettingsProvider>
    </SafeAreaProvider>,
  );
}

describe('ShareScreen', () => {
  it('renders the recap card when type=recap', async () => {
    const { queryByText } = await renderWithProviders(<ShareScreen />);
    expect(queryByText(/WEEKLY RECAP|RECAP TUẦN/i)).toBeTruthy();
  });

  it('calls Share.open with a tmpfile URI on Share button tap', async () => {
    const { getByTestId } = await renderWithProviders(<ShareScreen />);
    await act(async () => { fireEvent.press(getByTestId('share-button')); });
    expect(Share.open).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'file:///tmp/card.png', type: 'image/png' }),
    );
  });

  it('exposes a labelled close button', async () => {
    const { getByRole } = await renderWithProviders(<ShareScreen />);
    expect(getByRole('button', { name: /Đóng|Close/ })).toBeTruthy();
  });
});
