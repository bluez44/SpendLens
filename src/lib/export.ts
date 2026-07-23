import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { categoryOf, categoryLabel } from './categories';
import type { Category } from './categories';
import { i18n } from './i18n';
import type { Txn } from './transactions';

const BOM = '﻿';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildTransactionsCsv(txns: Txn[], extras: Category[] = []): string {
  const header = ['Date', 'Time', 'Category', 'Name', 'Amount', 'Type'];
  const rows = txns.map((t) => [
    t.date,
    t.time,
    categoryLabel(categoryOf(t.category, extras)),
    t.name,
    t.amount.toFixed(2),
    t.isIncome ? 'Income' : 'Expense',
  ]);
  const body = [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(','))
    .join('\n');
  return BOM + body;
}

export async function exportAndShareCsv(txns: Txn[], extras: Category[] = []): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const csv = buildTransactionsCsv(txns, extras);
  const file = new File(Paths.cache, `spendlens-export-${Date.now()}.csv`);
  try {
    file.create();
    file.write(csv);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: i18n.t('export.share_dialog_title'),
    });
  } finally {
    try { file.delete(); } catch { /* best-effort */ }
  }
  return true;
}
