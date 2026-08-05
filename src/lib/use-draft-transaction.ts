import { useMemo, useState } from 'react';

import { CURRENCY_META, type CurrencyCode } from './currency';
import type { CategoryId } from './categories';
import type { Txn } from './transactions';

export interface DraftTransaction {
  isIncome: boolean;
  setIsIncome: (v: boolean) => void;
  currency: CurrencyCode;
  setCurrency: (v: CurrencyCode) => void;
  amountDigits: string;
  setAmountDigits: (v: string) => void;
  category: CategoryId;
  setCategory: (v: CategoryId) => void;
  note: string;
  setNote: (v: string) => void;
  selectedDate: Date;
  setSelectedDate: (v: Date) => void;
  originalAmount: number;
  canSave: boolean;
}

const MAX_AMOUNT_DIGITS = 15;

function digitsFromExistingAmount(originalAmount: number, currency: CurrencyCode): string {
  const decimals = CURRENCY_META[currency].decimals;
  return String(Math.round(originalAmount * (decimals === 2 ? 100 : 1)));
}

function mergeExistingText(existing: Txn | undefined): string {
  if (!existing) return '';
  const name = existing.name?.trim() ?? '';
  const note = existing.note?.trim() ?? '';
  if (name && note && name !== note) return `${name} · ${note}`;
  return name || note;
}

export function useDraftTransaction(opts: {
  existing?: Txn;
  primaryCurrency: CurrencyCode;
  initialNote?: string;
}): DraftTransaction {
  const { existing, primaryCurrency, initialNote } = opts;

  const [isIncome, setIsIncome] = useState(existing?.isIncome ?? false);
  const [currency, setCurrency] = useState<CurrencyCode>(
    existing ? existing.originalCurrency : primaryCurrency,
  );
  const [amountDigits, setAmountDigitsRaw] = useState<string>(
    existing ? digitsFromExistingAmount(existing.originalAmount, existing.originalCurrency) : '',
  );
  const [category, setCategory] = useState<CategoryId>(existing?.category ?? 'food');
  const [note, setNote] = useState(mergeExistingText(existing) || initialNote || '');
  const [selectedDate, setSelectedDate] = useState<Date>(
    existing ? new Date(existing.createdAt) : new Date(),
  );

  const setAmountDigits = (v: string) => {
    setAmountDigitsRaw(v.replace(/\D/g, '').slice(0, MAX_AMOUNT_DIGITS));
  };

  const originalAmount = useMemo(() => {
    if (!amountDigits) return 0;
    const n = Number(amountDigits);
    return CURRENCY_META[currency].decimals === 2 ? n / 100 : n;
  }, [amountDigits, currency]);

  const canSave = originalAmount > 0 && note.trim() !== '';

  return {
    isIncome, setIsIncome,
    currency, setCurrency,
    amountDigits, setAmountDigits,
    category, setCategory,
    note, setNote,
    selectedDate, setSelectedDate,
    originalAmount, canSave,
  };
}
