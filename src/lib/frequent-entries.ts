import type { CategoryId } from './categories';
import type { CurrencyCode } from './currency';
import type { Txn } from './transactions';

export const SUGGESTION_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export interface FrequentEntry {
  /** Display text taken from the most recent use in the group. */
  name: string;
  category: CategoryId;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  count: number;
  /** Largest `createdAt` in the group. */
  lastUsedAt: number;
}

/** Most frequent recent expenses, used as one-tap entry suggestions. */
export function frequentEntries(txns: Txn[], now: number = Date.now(), limit = 5): FrequentEntry[] {
  const since = now - SUGGESTION_WINDOW_MS;
  const groups = new Map<string, FrequentEntry>();
  for (const t of txns) {
    if (t.isIncome || t.createdAt < since) continue;
    const name = t.name.trim();
    if (!name) continue;
    const key = [name.toLowerCase(), t.category, t.originalAmount, t.originalCurrency].join('|');
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        name,
        category: t.category,
        originalAmount: t.originalAmount,
        originalCurrency: t.originalCurrency,
        count: 1,
        lastUsedAt: t.createdAt,
      });
      continue;
    }
    group.count += 1;
    if (t.createdAt > group.lastUsedAt) {
      group.lastUsedAt = t.createdAt;
      group.name = name;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit);
}
