import type { Txn } from './transactions';
import { toDateKey } from './format';

/**
 * Counts consecutive days ending at `today` (or `today - 1` as grace) that have
 * at least one transaction. Multiple txns on the same day count once.
 * Returns 0 if neither today nor yesterday have any txn.
 */
export function computeLogDaysStreak(txns: Txn[], today: Date = new Date()): number {
  if (txns.length === 0) return 0;

  const dateSet = new Set<string>();
  for (const t of txns) dateSet.add(t.date);

  const todayKey = toDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);

  let cursor: Date;
  if (dateSet.has(todayKey)) {
    cursor = new Date(today);
  } else if (dateSet.has(yesterdayKey)) {
    cursor = new Date(yesterday);
  } else {
    return 0;
  }

  let streak = 0;
  while (dateSet.has(toDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
