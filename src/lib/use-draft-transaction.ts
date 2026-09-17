import { useMemo, useState } from 'react';

import { CURRENCY_META, type CurrencyCode } from './currency';
import type { CategoryId } from './categories';
import { formatHHMM, toDateKey } from './format';
import type { FrequentEntry } from './frequent-entries';
import type { NewTxn, Txn } from './transactions';

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
  /** Fill currency, amount, category and note from a suggestion. */
  applySuggestion: (entry: FrequentEntry) => void;
  /** Set the amount from a major-unit value in the current currency. */
  setAmount: (value: number) => void;
}

const MAX_AMOUNT_DIGITS = 15;

function sanitizeDigits(v: string): string {
  return v.replace(/\D/g, '').slice(0, MAX_AMOUNT_DIGITS);
}

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
  initialAmountDigits?: string;
  initialCategory?: CategoryId;
}): DraftTransaction {
  const { existing, primaryCurrency, initialNote, initialAmountDigits, initialCategory } = opts;

  const [isIncome, setIsIncome] = useState(existing?.isIncome ?? false);
  const [currency, setCurrency] = useState<CurrencyCode>(
    existing ? existing.originalCurrency : primaryCurrency,
  );
  const [amountDigits, setAmountDigitsRaw] = useState<string>(
    existing
      ? digitsFromExistingAmount(existing.originalAmount, existing.originalCurrency)
      : sanitizeDigits(initialAmountDigits ?? ''),
  );
  const [category, setCategory] = useState<CategoryId>(
    existing ? existing.category : (initialCategory ?? 'food'),
  );
  const [note, setNote] = useState(mergeExistingText(existing) || initialNote || '');
  const [selectedDate, setSelectedDate] = useState<Date>(
    existing ? new Date(existing.createdAt) : new Date(),
  );

  const setAmountDigits = (v: string) => {
    setAmountDigitsRaw(sanitizeDigits(v));
  };

  const setAmount = (value: number) => {
    setAmountDigitsRaw(sanitizeDigits(digitsFromExistingAmount(value, currency)));
  };

  const applySuggestion = (entry: FrequentEntry) => {
    setCurrency(entry.originalCurrency);
    setAmountDigitsRaw(sanitizeDigits(digitsFromExistingAmount(entry.originalAmount, entry.originalCurrency)));
    setCategory(entry.category);
    setNote(entry.name);
  };

  const originalAmount = useMemo(() => {
    if (!amountDigits) return 0;
    const n = Number(amountDigits);
    return CURRENCY_META[currency].decimals === 2 ? n / 100 : n;
  }, [amountDigits, currency]);

  const canSave = originalAmount > 0;

  return {
    isIncome, setIsIncome,
    currency, setCurrency,
    amountDigits, setAmountDigits,
    category, setCategory,
    note, setNote,
    selectedDate, setSelectedDate,
    originalAmount, canSave,
    applySuggestion, setAmount,
  };
}

export interface BuildTxnPayloadInput {
  selectedDate: Date;
  category: CategoryId;
  note: string;
  originalAmount: number;
  currency: CurrencyCode;
  isIncome: boolean;
  photoPath: string | null;
}

/**
 * Build the repository payload for both create and edit. The picked
 * `selectedDate` is always authoritative for date/time/createdAt.
 * `name` holds the user's note; `note` is a legacy column and is written null.
 */
export function buildTxnPayload(input: BuildTxnPayloadInput): NewTxn {
  return {
    date: toDateKey(input.selectedDate),
    time: formatHHMM(input.selectedDate),
    createdAt: input.selectedDate.getTime(),
    category: input.category,
    name: input.note.trim(),
    note: null,
    originalAmount: input.originalAmount,
    originalCurrency: input.currency,
    isIncome: input.isIncome,
    photoPath: input.photoPath,
  };
}
