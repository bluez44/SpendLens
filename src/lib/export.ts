import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { categoryOf } from './categories';
import type { Txn } from './transactions';

const BOM = '﻿';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildTransactionsCsv(txns: Txn[]): string {
  const header = ['Date', 'Time', 'Category', 'Name', 'Note', 'Amount', 'Type'];
  const rows = txns.map((t) => [
    t.date,
    t.time,
    categoryOf(t.category).label,
    t.name,
    t.note ?? '',
    t.amount.toFixed(2),
    t.isIncome ? 'Income' : 'Expense',
  ]);
  const body = [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(','))
    .join('\n');
  return BOM + body;
}

export async function exportAndShareCsv(txns: Txn[]): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const csv = buildTransactionsCsv(txns);
  const file = new File(Paths.cache, `spendlens-export-${Date.now()}.csv`);
  try {
    file.create();
    file.write(csv);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Xuất SpendLens',
    });
  } finally {
    try { file.delete(); } catch { /* best-effort */ }
  }
  return true;
}
