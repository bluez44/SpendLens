import { fireEvent, render } from '@testing-library/react-native';

import { TxnCard } from './txn-card';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: RN.View };
});
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: RN.View };
});

const baseTxn = {
  id: 42, date: '2026-07-23', time: '10:00', createdAt: 1,
  category: 'food' as const, name: 'Cà phê', note: null,
  amount: 45000, isIncome: false, photoPath: null,
};

beforeEach(() => mockRouterPush.mockClear());

describe('TxnCard', () => {
  it('renders "Hôm nay" badge and category label', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    expect(getByText('Hôm nay')).toBeTruthy();
    expect(getByText('Ăn uống')).toBeTruthy();
  });

  it('prefixes expense with U+2212 minus', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    expect(getByText('−45.000₫')).toBeTruthy();
  });

  it('prefixes income with plus', async () => {
    const { getByText } = await render(<TxnCard txn={{ ...baseTxn, isIncome: true }} />);
    expect(getByText('+45.000₫')).toBeTruthy();
  });

  it('renders the note when present', async () => {
    const { getByText } = await render(<TxnCard txn={{ ...baseTxn, note: 'Latte size L' }} />);
    expect(getByText('Latte size L')).toBeTruthy();
  });

  it('shows the tap hint', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    expect(getByText('Chạm để xem chi tiết →')).toBeTruthy();
  });

  it('navigates to detail on press', async () => {
    const { getByText } = await render(<TxnCard txn={baseTxn} />);
    fireEvent.press(getByText('Chạm để xem chi tiết →'));
    expect(mockRouterPush).toHaveBeenCalledWith('/transaction/42');
  });
});
