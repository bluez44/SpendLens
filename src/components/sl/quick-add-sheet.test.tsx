import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';

import { i18n } from '@/lib/i18n';
import type { Txn } from '@/lib/transactions';
import { QuickAddSheet, type QuickAddSheetHandle } from './quick-add-sheet';

let mockTransactions: Txn[] = [];
jest.mock('@/lib/transactions-context', () => ({
  useTransactions: () => ({ transactions: mockTransactions, userCategories: [] }),
}));

let mockPrimary = 'VND';
jest.mock('@/lib/settings-context', () => ({
  useSettings: () => ({ settings: { primaryCurrency: mockPrimary } }),
}));

const mockSaveNew = jest.fn();
jest.mock('@/lib/use-save-transaction', () => ({
  useSaveTransaction: () => ({ saveNew: mockSaveNew, saveEdit: jest.fn() }),
}));

function txn(p: Partial<Txn>): Txn {
  return {
    id: 1, uuid: 'u', updatedAt: 0, date: '2026-09-17', time: '09:00', createdAt: Date.now() - 1000,
    category: 'transport', name: 'Grab', note: null, amount: 29000, currency: 'VND',
    originalAmount: 29000, originalCurrency: 'VND', isIncome: false, photoPath: null, subscriptionUuid: null,
    ...p,
  };
}

async function setup(onOpenDetails = jest.fn(), onSaved = jest.fn()) {
  const ref = createRef<QuickAddSheetHandle>();
  const utils = await render(<QuickAddSheet ref={ref} onOpenDetails={onOpenDetails} onSaved={onSaved} />);
  return { ref, onOpenDetails, onSaved, ...utils };
}

const saveLabel = () => i18n.t('entry.save_expense');

beforeAll(async () => { await i18n.changeLanguage('vi'); });

beforeEach(() => {
  jest.clearAllMocks();
  mockTransactions = [];
  mockPrimary = 'VND';
  mockSaveNew.mockResolvedValue(10);
});

describe('QuickAddSheet', () => {
  it('does not save while the amount is empty', async () => {
    const { getByText } = await setup();
    await act(async () => { fireEvent.press(getByText(saveLabel())); });
    expect(mockSaveNew).not.toHaveBeenCalled();
  });

  it('saves amount + category with an empty note', async () => {
    const { getByTestId, getByText, onSaved } = await setup();
    await act(async () => { fireEvent.changeText(getByTestId('quick-add-amount'), '35000'); });
    await act(async () => { fireEvent.press(getByText(i18n.t('category.transport'))); });
    await act(async () => { fireEvent.press(getByText(saveLabel())); });

    expect(mockSaveNew).toHaveBeenCalledWith(expect.objectContaining({
      name: '', note: null, category: 'transport', originalAmount: 35000,
      originalCurrency: 'VND', isIncome: false, photoPath: null,
    }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('does not call onSaved when saving fails', async () => {
    mockSaveNew.mockResolvedValue(null);
    const { getByTestId, getByText, onSaved } = await setup();
    await act(async () => { fireEvent.changeText(getByTestId('quick-add-amount'), '1000'); });
    await act(async () => { fireEvent.press(getByText(saveLabel())); });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('fills the form from a suggestion chip', async () => {
    mockTransactions = [txn({ name: 'Grab', category: 'transport', originalAmount: 29000 })];
    const { getByText, getByTestId } = await setup();
    await act(async () => { fireEvent.press(getByText('Grab · 29k')); });
    expect(getByTestId('quick-add-amount').props.value).toBe('29.000');
    expect(getByTestId('quick-add-note').props.value).toBe('Grab');
    await act(async () => { fireEvent.press(getByText(saveLabel())); });
    expect(mockSaveNew).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Grab', category: 'transport', originalAmount: 29000,
    }));
  });

  it('defaults the category to the most recent expense', async () => {
    mockTransactions = [txn({ category: 'fun', name: '' }), txn({ id: 2, category: 'food' })];
    const { getByTestId, getByText } = await setup();
    await act(async () => { fireEvent.changeText(getByTestId('quick-add-amount'), '1000'); });
    await act(async () => { fireEvent.press(getByText(saveLabel())); });
    expect(mockSaveNew).toHaveBeenCalledWith(expect.objectContaining({ category: 'fun' }));
  });

  it('sets the amount from a VND quick-amount chip', async () => {
    const { getByText, getByTestId } = await setup();
    await act(async () => { fireEvent.press(getByText('50k')); });
    expect(getByTestId('quick-add-amount').props.value).toBe('50.000');
  });

  it('hides quick amounts for non-VND primary currency', async () => {
    mockPrimary = 'USD';
    const { queryByText } = await setup();
    expect(queryByText('50k')).toBeNull();
  });

  it('prefills the note passed to present()', async () => {
    const { ref, getByTestId } = await setup();
    await act(async () => { ref.current?.present('Trà sữa'); });
    expect(getByTestId('quick-add-note').props.value).toBe('Trà sữa');
  });

  it('opens details with the current values, omitting empty ones', async () => {
    const { getByTestId, getByText, onOpenDetails } = await setup();
    await act(async () => { fireEvent.changeText(getByTestId('quick-add-amount'), '12000'); });
    await act(async () => { fireEvent.press(getByText(i18n.t('quick_add.details'))); });
    expect(onOpenDetails).toHaveBeenCalledWith({ amount: '12000', category: 'food' });
  });
});
