import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

import { toDateKey } from './format';
import { i18n } from './i18n';
import { fireBudgetAlert } from './notifications';
import type { NewTxn, Txn } from './transactions';
import { useSaveTransaction } from './use-save-transaction';

const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
let mockTransactions: Txn[] = [];
jest.mock('./transactions-context', () => ({
  useTransactions: () => ({ add: mockAdd, update: mockUpdate, remove: mockRemove, transactions: mockTransactions }),
}));

let mockSettings = { primaryCurrency: 'VND', monthlyBudget: 0, budgetAlertsEnabled: true, budgetNotifiedMonth: '' };
const mockUpdateSettings = jest.fn();
jest.mock('./settings-context', () => ({
  useSettings: () => ({ settings: mockSettings, rates: {}, update: mockUpdateSettings }),
}));

const mockShow = jest.fn();
jest.mock('./toast-context', () => ({
  useToast: () => ({ show: mockShow, hide: jest.fn() }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('./notifications', () => ({
  fireBudgetAlert: jest.fn().mockResolvedValue(undefined),
}));

const payload: NewTxn = {
  date: '2026-09-17', time: '10:00', createdAt: 1,
  category: 'food', name: 'Cà phê', note: null,
  originalAmount: 45000, originalCurrency: 'VND', isIncome: false, photoPath: null,
};

beforeAll(async () => { await i18n.changeLanguage('vi'); });

beforeEach(() => {
  jest.clearAllMocks();
  mockTransactions = [];
  mockSettings = { primaryCurrency: 'VND', monthlyBudget: 0, budgetAlertsEnabled: true, budgetNotifiedMonth: '' };
  mockAdd.mockReturnValue(7);
});

describe('useSaveTransaction', () => {
  it('saveNew adds, vibrates and shows an Undo toast', async () => {
    const { result } = await renderHook(() => useSaveTransaction());
    let id: number | null = null;
    await act(async () => { id = await result.current.saveNew(payload); });

    expect(id).toBe(7);
    expect(mockAdd).toHaveBeenCalledWith(payload);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({
      message: i18n.t('toast.saved', { amount: '−45.000₫' }),
      actionLabel: i18n.t('toast.undo'),
    }));
  });

  it('Undo removes the transaction and confirms', async () => {
    const { result } = await renderHook(() => useSaveTransaction());
    await act(async () => { await result.current.saveNew(payload); });
    const { onAction } = mockShow.mock.calls[0][0];
    await act(async () => { onAction(); });

    expect(mockRemove).toHaveBeenCalledWith(7);
    expect(mockShow).toHaveBeenLastCalledWith({ message: i18n.t('toast.undone'), durationMs: 2000 });
  });

  it('Undo still confirms when the row is already gone', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRemove.mockImplementation(() => { throw new Error('gone'); });
    const { result } = await renderHook(() => useSaveTransaction());
    await act(async () => { await result.current.saveNew(payload); });
    await act(async () => { mockShow.mock.calls[0][0].onAction(); });
    expect(mockShow).toHaveBeenLastCalledWith({ message: i18n.t('toast.undone'), durationMs: 2000 });
    mockRemove.mockReset();
    warn.mockRestore();
  });

  it('saveNew alerts and returns null when the insert fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAdd.mockImplementation(() => { throw new Error('db'); });
    const { result } = await renderHook(() => useSaveTransaction());
    let id: number | null = 1;
    await act(async () => { id = await result.current.saveNew(payload); });

    expect(id).toBeNull();
    expect(alert).toHaveBeenCalledWith(i18n.t('common.save_failed_title'), i18n.t('common.save_failed_body'));
    expect(mockShow).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    warn.mockRestore();
    alert.mockRestore();
  });

  it('saveEdit updates and vibrates without a toast', async () => {
    const { result } = await renderHook(() => useSaveTransaction());
    let ok = false;
    await act(async () => { ok = await result.current.saveEdit(3, payload); });
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(3, payload);
    expect(Haptics.notificationAsync).toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('saveEdit alerts and returns false when the update fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUpdate.mockImplementation(() => { throw new Error('db'); });
    const { result } = await renderHook(() => useSaveTransaction());
    let ok = true;
    await act(async () => { ok = await result.current.saveEdit(3, payload); });
    expect(ok).toBe(false);
    expect(alert).toHaveBeenCalled();
    mockUpdate.mockReset();
    warn.mockRestore();
    alert.mockRestore();
  });

  it('fires the 80% budget alert for an expense crossing the threshold', async () => {
    const month = toDateKey(new Date()).slice(0, 7);
    mockSettings = { ...mockSettings, monthlyBudget: 100000 };
    mockTransactions = [{
      id: 1, uuid: 'u', updatedAt: 0, date: `${month}-01`, time: '09:00', createdAt: 0,
      category: 'food', name: 'x', note: null, amount: 50000, currency: 'VND',
      originalAmount: 50000, originalCurrency: 'VND', isIncome: false, photoPath: null, subscriptionUuid: null,
    }];
    const { result } = await renderHook(() => useSaveTransaction());
    await act(async () => { await result.current.saveNew({ ...payload, originalAmount: 40000 }); });

    expect(mockUpdateSettings).toHaveBeenCalledWith('budgetNotifiedMonth', `${month}:80`);
    expect(fireBudgetAlert).toHaveBeenCalledWith(80);
  });

  it('does not check the budget for income', async () => {
    mockSettings = { ...mockSettings, monthlyBudget: 1000 };
    const { result } = await renderHook(() => useSaveTransaction());
    await act(async () => { await result.current.saveNew({ ...payload, isIncome: true }); });
    expect(fireBudgetAlert).not.toHaveBeenCalled();
  });
});
