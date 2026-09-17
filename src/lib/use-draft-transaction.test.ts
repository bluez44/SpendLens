import { act, renderHook } from '@testing-library/react-native';

import { buildTxnPayload, useDraftTransaction } from './use-draft-transaction';
import type { Txn } from './transactions';

const editingTxn: Txn = {
  id: 1,
  uuid: 'u',
  updatedAt: 0,
  date: '2026-08-01',
  time: '10:30',
  createdAt: new Date('2026-08-01T10:30:00Z').getTime(),
  category: 'food',
  name: 'Bún bò',
  note: null,
  amount: 45000,
  currency: 'VND',
  originalAmount: 45000,
  originalCurrency: 'VND',
  isIncome: false,
  photoPath: null,
  subscriptionUuid: null,
};

describe('useDraftTransaction', () => {
  it('initialises to defaults when no existing txn', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ primaryCurrency: 'VND' })
    );
    expect(result.current.isIncome).toBe(false);
    expect(result.current.currency).toBe('VND');
    expect(result.current.amountDigits).toBe('');
    expect(result.current.category).toBe('food');
    expect(result.current.note).toBe('');
    expect(result.current.originalAmount).toBe(0);
    expect(result.current.canSave).toBe(false);
  });

  it('uses initialNote when no existing txn', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ primaryCurrency: 'USD', initialNote: 'coffee' })
    );
    expect(result.current.note).toBe('coffee');
  });

  it('hydrates from existing txn (VND, decimals=0)', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ existing: editingTxn, primaryCurrency: 'USD' })
    );
    expect(result.current.currency).toBe('VND');
    expect(result.current.amountDigits).toBe('45000');
    expect(result.current.originalAmount).toBe(45000);
    expect(result.current.note).toBe('Bún bò');
    expect(result.current.category).toBe('food');
    expect(result.current.selectedDate.getTime()).toBe(editingTxn.createdAt);
  });

  it('hydrates cents-per-unit for decimals=2 currencies', async () => {
    const usdTxn: Txn = {
      ...editingTxn,
      originalAmount: 1.50,
      originalCurrency: 'USD',
      currency: 'USD',
      amount: 1.50,
    };
    const { result } = await renderHook(() =>
      useDraftTransaction({ existing: usdTxn, primaryCurrency: 'USD' })
    );
    expect(result.current.amountDigits).toBe('150');
    expect(result.current.originalAmount).toBe(1.5);
  });

  it('clamps amountDigits to 15 characters and strips non-digits', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ primaryCurrency: 'VND' })
    );
    await act(async () => result.current.setAmountDigits('abc1234def5678'));
    expect(result.current.amountDigits).toBe('12345678');

    await act(async () => result.current.setAmountDigits('9'.repeat(30)));
    expect(result.current.amountDigits).toBe('9'.repeat(15));
  });

  it('canSave depends only on a positive amount', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ primaryCurrency: 'VND' })
    );
    expect(result.current.canSave).toBe(false);

    await act(async () => result.current.setAmountDigits('50000'));
    expect(result.current.canSave).toBe(true); // note is optional

    await act(async () => result.current.setAmountDigits(''));
    expect(result.current.canSave).toBe(false);
  });

  it('recomputes originalAmount when currency changes', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ primaryCurrency: 'VND' })
    );
    await act(async () => result.current.setAmountDigits('150'));
    expect(result.current.originalAmount).toBe(150); // VND: raw

    await act(async () => result.current.setCurrency('USD'));
    expect(result.current.originalAmount).toBe(1.5); // USD: cents / 100
  });

  it('round-trips through buildTxnPayload for an edit, in local time', async () => {
    const createdAt = new Date(2026, 7, 1, 10, 30).getTime();
    const existing: Txn = {
      ...editingTxn,
      date: '2026-08-01',
      time: '10:30',
      createdAt,
    };
    const { result } = await renderHook(() =>
      useDraftTransaction({ existing, primaryCurrency: 'VND' })
    );

    const unchangedPayload = buildTxnPayload({
      selectedDate: result.current.selectedDate,
      category: result.current.category,
      note: result.current.note,
      originalAmount: result.current.originalAmount,
      currency: result.current.currency,
      isIncome: result.current.isIncome,
      photoPath: null,
    });
    expect(unchangedPayload.date).toBe(existing.date);
    expect(unchangedPayload.time).toBe(existing.time);
    expect(unchangedPayload.createdAt).toBe(existing.createdAt);

    await act(async () => result.current.setSelectedDate(new Date(2026, 6, 31, 21, 0)));

    const movedPayload = buildTxnPayload({
      selectedDate: result.current.selectedDate,
      category: result.current.category,
      note: result.current.note,
      originalAmount: result.current.originalAmount,
      currency: result.current.currency,
      isIncome: result.current.isIncome,
      photoPath: null,
    });
    expect(movedPayload.date).toBe('2026-07-31');
    expect(movedPayload.time).toBe('21:00');
  });

  it('applies initial amount digits and category for a new draft', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ primaryCurrency: 'VND', initialAmountDigits: '35.000', initialCategory: 'transport' })
    );
    expect(result.current.amountDigits).toBe('35000');
    expect(result.current.category).toBe('transport');
    expect(result.current.originalAmount).toBe(35000);
  });

  it('ignores initial amount and category when editing', async () => {
    const { result } = await renderHook(() =>
      useDraftTransaction({ existing: editingTxn, primaryCurrency: 'VND', initialAmountDigits: '1', initialCategory: 'fun' })
    );
    expect(result.current.amountDigits).toBe('45000');
    expect(result.current.category).toBe('food');
  });

  it('applySuggestion fills currency, amount, category and note', async () => {
    const { result } = await renderHook(() => useDraftTransaction({ primaryCurrency: 'VND' }));
    await act(async () => result.current.applySuggestion({
      name: 'Latte', category: 'fun', originalAmount: 4.5, originalCurrency: 'USD', count: 2, lastUsedAt: 1,
    }));
    expect(result.current.currency).toBe('USD');
    expect(result.current.amountDigits).toBe('450');
    expect(result.current.originalAmount).toBe(4.5);
    expect(result.current.category).toBe('fun');
    expect(result.current.note).toBe('Latte');
  });

  it('setAmount converts a major-unit value to digits in the current currency', async () => {
    const { result } = await renderHook(() => useDraftTransaction({ primaryCurrency: 'VND' }));
    await act(async () => result.current.setAmount(50000));
    expect(result.current.amountDigits).toBe('50000');

    const usd = await renderHook(() => useDraftTransaction({ primaryCurrency: 'USD' }));
    await act(async () => usd.result.current.setAmount(12.5));
    expect(usd.result.current.amountDigits).toBe('1250');
  });
});

describe('buildTxnPayload', () => {
  const base = {
    category: 'food' as const,
    note: '  Bún bò  ',
    originalAmount: 45000,
    currency: 'VND' as const,
    isIncome: false,
    photoPath: null,
  };

  it('derives date, time and createdAt from selectedDate for a new txn', () => {
    const d = new Date(2026, 7, 1, 9, 5);
    expect(buildTxnPayload({ ...base, selectedDate: d })).toEqual({
      date: '2026-08-01',
      time: '09:05',
      createdAt: d.getTime(),
      category: 'food',
      name: 'Bún bò',
      note: null,
      originalAmount: 45000,
      originalCurrency: 'VND',
      isIncome: false,
      photoPath: null,
    });
  });

  it('round-trips an edited txn whose date was not changed', () => {
    const created = new Date(2026, 7, 1, 10, 30).getTime();
    const p = buildTxnPayload({ ...base, selectedDate: new Date(created) });
    expect([p.date, p.time, p.createdAt]).toEqual(['2026-08-01', '10:30', created]);
  });

  it('reflects a changed date when editing', () => {
    const moved = new Date(2026, 6, 31, 21, 0);
    const p = buildTxnPayload({ ...base, selectedDate: moved });
    expect([p.date, p.time, p.createdAt]).toEqual(['2026-07-31', '21:00', moved.getTime()]);
  });
});
