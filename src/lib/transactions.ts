import type { SQLiteDatabase } from 'expo-sqlite';

import { db as defaultDb } from './db';
import type { CategoryId } from './categories';
import { CATEGORIES } from './categories';
import { monthKey, toDateKey } from './format';

export interface Txn {
  id: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  createdAt: number; // epoch ms
  category: CategoryId;
  name: string;
  note: string | null;
  amount: number; // positive VND
  isIncome: boolean;
  photoPath: string | null;
}

export interface NewTxn {
  date: string;
  time: string;
  category: CategoryId;
  name: string;
  note?: string | null;
  amount: number;
  isIncome: boolean;
  photoPath?: string | null;
  /** Defaults to now; seed data passes the real transaction time. */
  createdAt?: number;
}

interface Row {
  id: number;
  date: string;
  time: string;
  created_at: number;
  category: string;
  name: string;
  note: string | null;
  amount: number;
  is_income: number;
  photo_path: string | null;
}

function toTxn(r: Row): Txn {
  return {
    id: r.id,
    date: r.date,
    time: r.time,
    createdAt: r.created_at,
    category: r.category as CategoryId,
    name: r.name,
    note: r.note,
    amount: r.amount,
    isIncome: r.is_income === 1,
    photoPath: r.photo_path,
  };
}

export function listTransactions(database: SQLiteDatabase = defaultDb): Txn[] {
  return database
    .getAllSync<Row>('SELECT * FROM transactions ORDER BY created_at DESC')
    .map(toTxn);
}

export function getTransaction(id: number, database: SQLiteDatabase = defaultDb): Txn | null {
  const row = database.getFirstSync<Row>('SELECT * FROM transactions WHERE id = ?', id);
  return row ? toTxn(row) : null;
}

export function insertTransaction(input: NewTxn, database: SQLiteDatabase = defaultDb): number {
  const result = database.runSync(
    `INSERT INTO transactions (date, time, created_at, category, name, note, amount, is_income, photo_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.date,
    input.time,
    input.createdAt ?? Date.now(),
    input.category,
    input.name,
    input.note ?? null,
    input.amount,
    input.isIncome ? 1 : 0,
    input.photoPath ?? null
  );
  return result.lastInsertRowId;
}

export function updateTransaction(id: number, input: NewTxn, database: SQLiteDatabase = defaultDb): void {
  database.runSync(
    `UPDATE transactions
     SET date = ?, time = ?, category = ?, name = ?, note = ?, amount = ?, is_income = ?, photo_path = ?
     WHERE id = ?`,
    input.date,
    input.time,
    input.category,
    input.name,
    input.note ?? null,
    input.amount,
    input.isIncome ? 1 : 0,
    input.photoPath ?? null,
    id
  );
}

export function deleteTransaction(id: number, database: SQLiteDatabase = defaultDb): void {
  database.runSync('DELETE FROM transactions WHERE id = ?', id);
}

export function countTransactions(database: SQLiteDatabase = defaultDb): number {
  const row = database.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
  return row?.n ?? 0;
}

/* ------------------------------------------------------------------ */
/* Aggregations (pure functions over a Txn[])                          */
/* ------------------------------------------------------------------ */

export type Range = 'day' | 'week' | 'month';

export interface Summary {
  income: number;
  expense: number;
  net: number;
}

export function summarize(txns: Txn[]): Summary {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.isIncome) income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

/** Filter transactions to the current day / week (Mon-start) / month. */
export function filterRange(txns: Txn[], range: Range, now: number = Date.now()): Txn[] {
  const ref = new Date(now);
  const startOfDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  let start: number;
  if (range === 'day') {
    start = startOfDay;
  } else if (range === 'week') {
    const dow = (ref.getDay() + 6) % 7; // days since Monday
    start = startOfDay - dow * 86_400_000;
  } else {
    start = new Date(ref.getFullYear(), ref.getMonth(), 1).getTime();
  }
  return txns.filter((t) => t.createdAt >= start);
}

export interface DayGroup {
  key: string;
  items: Txn[];
  net: number; // income - expense
}

/** Group by calendar day, newest day first, items already newest-first. */
export function groupByDay(txns: Txn[]): DayGroup[] {
  const map = new Map<string, Txn[]>();
  for (const t of txns) {
    const list = map.get(t.date) ?? [];
    list.push(t);
    map.set(t.date, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({ key, items, net: summarize(items).net }));
}

export interface MonthBar {
  label: string; // "T7"
  monthKey: string; // "2026-07"
  total: number; // expense total
  isCurrent: boolean;
}

/** Expense totals for the trailing `months` months, oldest first. */
export function monthlyExpenseSeries(
  txns: Txn[],
  now: number = Date.now(),
  months = 6
): MonthBar[] {
  const ref = new Date(now);
  const currentKey = monthKey(toDateKey(ref));
  const bars: MonthBar[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const key = monthKey(toDateKey(d));
    const total = txns
      .filter((t) => !t.isIncome && monthKey(t.date) === key)
      .reduce((s, t) => s + t.amount, 0);
    bars.push({ label: `T${d.getMonth() + 1}`, monthKey: key, total, isCurrent: key === currentKey });
  }
  return bars;
}

export interface CategorySlice {
  id: CategoryId;
  label: string;
  color: string;
  amount: number;
  pct: number; // 0-100
}

/** Expense breakdown by category, largest first. */
export function categoryBreakdown(txns: Txn[]): CategorySlice[] {
  const totals = new Map<CategoryId, number>();
  let grand = 0;
  for (const t of txns) {
    if (t.isIncome) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    grand += t.amount;
  }
  return CATEGORIES.filter((c) => totals.has(c.id))
    .map((c) => {
      const amount = totals.get(c.id) ?? 0;
      return { id: c.id, label: c.label, color: c.fg, amount, pct: grand ? (amount / grand) * 100 : 0 };
    })
    .sort((a, b) => b.amount - a.amount);
}
