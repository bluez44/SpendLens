import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { MonthPickerSheetHandle } from '@/components/sl/month-picker-sheet';
import type { PeriodPickerSheetHandle, PresetKey } from '@/components/sl/period-picker-sheet';
import type { WeekPickerSheetHandle } from '@/components/sl/week-picker-sheet';

import { availableMonthsDesc, availableWeeksDesc, weekStartOf } from './comparison';
import { monthKey, shiftDateKey, shiftMonthKey, toDateKey } from './format';
import type { Txn } from './transactions';

export type CompareType = 'month' | 'week';

export interface CompareSheetRefs {
  monthA: RefObject<MonthPickerSheetHandle | null>;
  monthB: RefObject<MonthPickerSheetHandle | null>;
  weekA: RefObject<WeekPickerSheetHandle | null>;
  weekB: RefObject<WeekPickerSheetHandle | null>;
  preset: RefObject<PeriodPickerSheetHandle | null>;
}

export interface CompareSelection {
  type: CompareType;
  typeIndex: number;
  setTypeIndex: (i: number) => void;

  monthA: string;
  monthB: string;
  weekA: string;
  weekB: string;
  setMonthA: (v: string) => void;
  setMonthB: (v: string) => void;
  setWeekA: (v: string) => void;
  setWeekB: (v: string) => void;

  preset: PresetKey;
  setPreset: (p: PresetKey) => void;

  sheetRefs: CompareSheetRefs;
  swap: () => void;
  openPickerA: () => void;
  openPickerB: () => void;
}

export function useCompareSelection(transactions: Txn[]): CompareSelection {
  const monthSheetA = useRef<MonthPickerSheetHandle | null>(null);
  const monthSheetB = useRef<MonthPickerSheetHandle | null>(null);
  const weekSheetA = useRef<WeekPickerSheetHandle | null>(null);
  const weekSheetB = useRef<WeekPickerSheetHandle | null>(null);
  const presetSheet = useRef<PeriodPickerSheetHandle | null>(null);

  const [typeIndex, setTypeIndex] = useState(0);
  const type: CompareType = typeIndex === 0 ? 'month' : 'week';

  const initialMonthA = useMemo(() => monthKey(toDateKey(new Date())), []);
  const initialMonthB = useMemo(
    () => availableMonthsDesc(transactions)[0] ?? initialMonthA,
    [transactions, initialMonthA],
  );
  const initialWeekA = useMemo(() => weekStartOf(toDateKey(new Date())), []);
  const initialWeekB = useMemo(
    () => availableWeeksDesc(transactions)[0] ?? initialWeekA,
    [transactions, initialWeekA],
  );

  const [monthA, setMonthA] = useState(initialMonthA);
  const [monthB, setMonthB] = useState(initialMonthB);
  const [weekA, setWeekA] = useState(initialWeekA);
  const [weekB, setWeekB] = useState(initialWeekB);
  const [preset, setPreset] = useState<PresetKey>('this_vs_last_month');

  useEffect(() => {
    if (type === 'month') {
      setPreset('this_vs_last_month');
      setMonthA(initialMonthA);
      setMonthB(initialMonthB);
    } else {
      setPreset('this_vs_last_week');
      setWeekA(initialWeekA);
      setWeekB(initialWeekB);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    if (preset === 'custom') return;
    const nowMk = monthKey(toDateKey(new Date()));
    if (preset === 'this_vs_last_month') {
      setMonthA(nowMk);
      setMonthB(shiftMonthKey(nowMk, -1));
    } else if (preset === 'last_vs_prev_month') {
      setMonthA(shiftMonthKey(nowMk, -1));
      setMonthB(shiftMonthKey(nowMk, -2));
    } else if (preset === 'year_over_year') {
      setMonthA(nowMk);
      setMonthB(shiftMonthKey(nowMk, -12));
    } else if (preset === 'this_vs_last_week') {
      const cur = weekStartOf(toDateKey(new Date()));
      setWeekA(cur);
      setWeekB(shiftDateKey(cur, -7));
    } else if (preset === 'last_vs_prev_week') {
      const cur = weekStartOf(toDateKey(new Date()));
      setWeekA(shiftDateKey(cur, -7));
      setWeekB(shiftDateKey(cur, -14));
    }
  }, [preset]);

  const swap = useCallback(() => {
    if (type === 'month') { setMonthA(monthB); setMonthB(monthA); }
    else { setWeekA(weekB); setWeekB(weekA); }
    setPreset('custom');
  }, [type, monthA, monthB, weekA, weekB]);

  const openPickerA = useCallback(() => {
    setPreset('custom');
    if (type === 'month') monthSheetA.current?.present();
    else weekSheetA.current?.present();
  }, [type]);

  const openPickerB = useCallback(() => {
    setPreset('custom');
    if (type === 'month') monthSheetB.current?.present();
    else weekSheetB.current?.present();
  }, [type]);

  return {
    type,
    typeIndex,
    setTypeIndex,
    monthA, monthB, weekA, weekB,
    setMonthA, setMonthB, setWeekA, setWeekB,
    preset, setPreset,
    sheetRefs: {
      monthA: monthSheetA,
      monthB: monthSheetB,
      weekA: weekSheetA,
      weekB: weekSheetB,
      preset: presetSheet,
    },
    swap,
    openPickerA,
    openPickerB,
  };
}
