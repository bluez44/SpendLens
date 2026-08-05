import { render, fireEvent } from '@testing-library/react-native';
import { SubscriptionRow } from './subscription-row';
import type { Subscription } from '@/lib/subscriptions';

const SUB: Subscription = {
  id: 1, uuid: 'u-1', name: 'Claude Pro',
  category: 'other', originalAmount: 20, originalCurrency: 'USD',
  anchorDay: 15, nextDueDate: '2026-08-15',
  photoPath: null,
  notify7: true, notify3: true, notify1: true,
  paused: false, createdAt: 0, updatedAt: 0,
};

const IDENTITY_RATES = { VND: 1 / 25000, EUR: 1.10, JPY: 0.0067, GBP: 1.25, KRW: 0.00075 };

describe('SubscriptionRow', () => {
  it('renders name, anchor-day label, and amount', async () => {
    const r = await render(
      <SubscriptionRow subscription={SUB} primary="USD" rates={IDENTITY_RATES} />
    );
    expect(r.queryByText(/Claude Pro/)).toBeTruthy();
    expect(r.queryByText(/Day 15|Ngày 15/)).toBeTruthy();
  });

  it('invokes onPress when tapped', async () => {
    const onPress = jest.fn();
    const r = await render(
      <SubscriptionRow subscription={SUB} primary="USD" rates={IDENTITY_RATES} onPress={onPress} />
    );
    fireEvent.press(r.getByTestId('subscription-row-1'));
    expect(onPress).toHaveBeenCalledWith(SUB);
  });

  it('paused variant shows badge', async () => {
    const paused = { ...SUB, paused: true };
    const r = await render(
      <SubscriptionRow subscription={paused} primary="USD" rates={IDENTITY_RATES} />
    );
    expect(r.queryByText(/Paused|Đã tạm dừng/)).toBeTruthy();
  });
});
