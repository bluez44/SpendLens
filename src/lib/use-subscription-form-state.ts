import { useCallback, useState, type MutableRefObject } from 'react';

import type { CategoryId } from './categories';
import { CURRENCY_META, type CurrencyCode } from './currency';
import type { Subscription } from './subscriptions';
import { useSyncedState } from './use-synced-state';

export interface SubscriptionFormRefs {
  editingId: MutableRefObject<number | undefined>;
  name: MutableRefObject<string>;
  currency: MutableRefObject<CurrencyCode>;
  amountDigits: MutableRefObject<string>;
  category: MutableRefObject<CategoryId>;
  anchorDay: MutableRefObject<number>;
  photoPath: MutableRefObject<string | null>;
  notify7: MutableRefObject<boolean>;
  notify3: MutableRefObject<boolean>;
  notify1: MutableRefObject<boolean>;
}

export interface SubscriptionFormState {
  editingId: number | undefined;
  isPaused: boolean;
  name: string;
  currency: CurrencyCode;
  amountDigits: string;
  category: CategoryId;
  anchorDay: number;
  photoPath: string | null;
  notify7: boolean;
  notify3: boolean;
  notify1: boolean;
  customInput: string;

  setEditingId: (v: number | undefined) => void;
  setIsPaused: (v: boolean) => void;
  setName: (v: string) => void;
  setCurrency: (v: CurrencyCode) => void;
  setAmountDigits: (v: string) => void;
  setCategory: (v: CategoryId) => void;
  setAnchorDay: (v: number) => void;
  setPhotoPath: (v: string | null) => void;
  setNotify7: (v: boolean) => void;
  setNotify3: (v: boolean) => void;
  setNotify1: (v: boolean) => void;
  setCustomInput: (v: string) => void;

  refs: SubscriptionFormRefs;

  resetToDefaults: () => void;
  loadFromSubscription: (sub: Subscription) => void;
}

function digitsFromAmount(originalAmount: number, currency: CurrencyCode): string {
  const decimals = CURRENCY_META[currency].decimals;
  return decimals === 2
    ? String(Math.round(originalAmount * 100))
    : String(Math.round(originalAmount));
}

export function useSubscriptionFormState(primaryCurrency: CurrencyCode): SubscriptionFormState {
  const [editingId, editingIdRef, setEditingId] = useSyncedState<number | undefined>(undefined);
  const [isPaused, setIsPaused] = useState(false);
  const [name, nameRef, setName] = useSyncedState('');
  const [currency, currencyRef, setCurrency] = useSyncedState<CurrencyCode>(primaryCurrency);
  const [amountDigits, amountDigitsRef, setAmountDigits] = useSyncedState('');
  const [category, categoryRef, setCategory] = useSyncedState<CategoryId>('other');
  const [anchorDay, anchorDayRef, setAnchorDay] = useSyncedState(1);
  const [photoPath, photoPathRef, setPhotoPath] = useSyncedState<string | null>(null);
  const [notify7, notify7Ref, setNotify7] = useSyncedState(false);
  const [notify3, notify3Ref, setNotify3] = useSyncedState(false);
  const [notify1, notify1Ref, setNotify1] = useSyncedState(false);
  const [customInput, setCustomInput] = useState('');

  const resetToDefaults = useCallback(() => {
    setEditingId(undefined);
    setIsPaused(false);
    setName('');
    setCurrency(primaryCurrency);
    setAmountDigits('');
    setCategory('other');
    setAnchorDay(1);
    setPhotoPath(null);
    setNotify7(false);
    setNotify3(false);
    setNotify1(false);
    setCustomInput('');
  }, [
    primaryCurrency,
    setEditingId, setName, setCurrency, setAmountDigits, setCategory,
    setAnchorDay, setPhotoPath, setNotify7, setNotify3, setNotify1,
  ]);

  const loadFromSubscription = useCallback((sub: Subscription) => {
    setEditingId(sub.id);
    setIsPaused(sub.paused);
    setName(sub.name);
    setCurrency(sub.originalCurrency);
    setAmountDigits(digitsFromAmount(sub.originalAmount, sub.originalCurrency));
    setCategory(sub.category);
    setAnchorDay(sub.anchorDay);
    setPhotoPath(sub.photoPath);
    setNotify7(sub.notify7);
    setNotify3(sub.notify3);
    setNotify1(sub.notify1);
    setCustomInput('');
  }, [
    setEditingId, setName, setCurrency, setAmountDigits, setCategory,
    setAnchorDay, setPhotoPath, setNotify7, setNotify3, setNotify1,
  ]);

  return {
    editingId, isPaused, name, currency, amountDigits, category, anchorDay,
    photoPath, notify7, notify3, notify1, customInput,
    setEditingId, setIsPaused, setName, setCurrency, setAmountDigits,
    setCategory, setAnchorDay, setPhotoPath, setNotify7, setNotify3, setNotify1,
    setCustomInput,
    refs: {
      editingId: editingIdRef,
      name: nameRef,
      currency: currencyRef,
      amountDigits: amountDigitsRef,
      category: categoryRef,
      anchorDay: anchorDayRef,
      photoPath: photoPathRef,
      notify7: notify7Ref,
      notify3: notify3Ref,
      notify1: notify1Ref,
    },
    resetToDefaults,
    loadFromSubscription,
  };
}
