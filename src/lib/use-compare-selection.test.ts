import { act, renderHook } from '@testing-library/react-native';

import type { Txn } from './transactions';
import { useCompareSelection } from './use-compare-selection';

function mkTxn(date: string, id: number): Txn {
  return {
    id, uuid: `u${id}`, updatedAt: 0,
    date, time: '10:00', createdAt: 0,
    category: 'food', name: 't', note: null,
    amount: 100, currency: 'VND',
    originalAmount: 100, originalCurrency: 'VND',
    isIncome: false, photoPath: null, subscriptionUuid: null,
  };
}

describe('useCompareSelection', () => {
  it('starts in month mode with this_vs_last_month preset', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    expect(result.current.type).toBe('month');
    expect(result.current.typeIndex).toBe(0);
    expect(result.current.preset).toBe('this_vs_last_month');
  });

  it('exposes 5 sheet refs on sheetRefs', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    const { sheetRefs } = result.current;
    expect(sheetRefs.monthA).toBeDefined();
    expect(sheetRefs.monthB).toBeDefined();
    expect(sheetRefs.weekA).toBeDefined();
    expect(sheetRefs.weekB).toBeDefined();
    expect(sheetRefs.preset).toBeDefined();
    expect(sheetRefs.monthA.current).toBeNull();
  });

  it('switching to week mode resets preset to this_vs_last_week', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    await act(async () => result.current.setTypeIndex(1));
    expect(result.current.type).toBe('week');
    expect(result.current.preset).toBe('this_vs_last_week');
  });

  it('this_vs_last_month preset sets monthA=current and monthB=current-1', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    // Effect runs on mount, defaults to this_vs_last_month
    const { monthA, monthB } = result.current;
    const [yA, mA] = monthA.split('-').map(Number);
    const [yB, mB] = monthB.split('-').map(Number);
    const diff = (yA * 12 + mA) - (yB * 12 + mB);
    expect(diff).toBe(1);
  });

  it('year_over_year preset sets monthB=monthA minus 12 months', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    await act(async () => result.current.setPreset('year_over_year'));
    const { monthA, monthB } = result.current;
    const [yA, mA] = monthA.split('-').map(Number);
    const [yB, mB] = monthB.split('-').map(Number);
    expect(yA - yB).toBe(1);
    expect(mA).toBe(mB);
  });

  it('this_vs_last_week preset sets weekA=current and weekB=weekA-7d', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    await act(async () => result.current.setTypeIndex(1));
    // Preset auto-flips to this_vs_last_week
    const { weekA, weekB } = result.current;
    const a = new Date(weekA + 'T00:00:00Z');
    const b = new Date(weekB + 'T00:00:00Z');
    const diffDays = Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(7);
  });

  it('setting preset to custom does not touch period values', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    const initialA = result.current.monthA;
    const initialB = result.current.monthB;
    await act(async () => result.current.setPreset('custom'));
    expect(result.current.monthA).toBe(initialA);
    expect(result.current.monthB).toBe(initialB);
  });

  it('swap flips monthA <-> monthB and drops preset to custom', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    const beforeA = result.current.monthA;
    const beforeB = result.current.monthB;
    await act(async () => result.current.swap());
    expect(result.current.monthA).toBe(beforeB);
    expect(result.current.monthB).toBe(beforeA);
    expect(result.current.preset).toBe('custom');
  });

  it('swap in week mode flips weekA <-> weekB', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    await act(async () => result.current.setTypeIndex(1));
    const beforeA = result.current.weekA;
    const beforeB = result.current.weekB;
    await act(async () => result.current.swap());
    expect(result.current.weekA).toBe(beforeB);
    expect(result.current.weekB).toBe(beforeA);
    expect(result.current.preset).toBe('custom');
  });

  it('openPickerA sets preset to custom', async () => {
    const { result } = await renderHook(() => useCompareSelection([]));
    await act(async () => result.current.openPickerA());
    expect(result.current.preset).toBe('custom');
  });

  it('initialMonthB falls back to initialMonthA when no prior-month txns exist', async () => {
    const { result } = await renderHook(() => useCompareSelection([mkTxn('2026-08-15', 1)]));
    // In empty history, initialMonthB defaults to initialMonthA (current month)
    // but the this_vs_last_month effect immediately overrides monthB to shift(-1).
    const [yA, mA] = result.current.monthA.split('-').map(Number);
    const [yB, mB] = result.current.monthB.split('-').map(Number);
    expect((yA * 12 + mA) - (yB * 12 + mB)).toBe(1);
  });
});
