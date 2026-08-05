import type { CurrencyCode } from './currency';

export type CardType = 'recap' | 'streak';

export type NarrativeKey =
  | 'blew_budget'
  | 'splurged'
  | 'locked_in'
  | 'under_budget_hero'
  | 'single_cat_focus'
  | 'new_obsession'
  | 'another_log';

export type HypeKey =
  | 'unstoppable'
  | 'on_a_roll'
  | 'locked_in_streak'
  | 'warming_up'
  | 'just_started';

export interface RecapTopCategory {
  id: string;
  label: string;
  color: string;
  value: number;      // in primary currency
  pctOfWeek: number;  // 0..100
}

export interface RecapData {
  weekStart: string;
  weekEnd: string;
  totalExpense: number;
  totalIncome: number;
  topCategories: RecapTopCategory[];  // sorted desc, length <= 3
  deltaExpensePct: number | null;
  narrative: NarrativeKey;
  budgetPctUsed: number | null;
  primary: CurrencyCode;
}

export interface StreakData {
  logDays: number;
  txnCountThisWeek: number;
  hype: HypeKey;
}

export type ShareData =
  | { type: 'recap'; data: RecapData }
  | { type: 'streak'; data: StreakData };

export function pickNarrative(
  recap: RecapData,
  previousWeekTopCatId: string | null,
): NarrativeKey {
  const { budgetPctUsed, deltaExpensePct, topCategories } = recap;

  if (budgetPctUsed !== null && budgetPctUsed > 100) return 'blew_budget';
  if (deltaExpensePct !== null && deltaExpensePct > 30) return 'splurged';
  if (deltaExpensePct !== null && deltaExpensePct < -20) return 'locked_in';
  if (budgetPctUsed !== null && budgetPctUsed < 70) return 'under_budget_hero';

  const top = topCategories[0];
  if (top && top.pctOfWeek > 50) return 'single_cat_focus';
  if (top && previousWeekTopCatId !== null && previousWeekTopCatId !== top.id) return 'new_obsession';

  return 'another_log';
}

export function pickHype(logDays: number): HypeKey {
  if (logDays >= 30) return 'unstoppable';
  if (logDays >= 14) return 'on_a_roll';
  if (logDays >= 7) return 'locked_in_streak';
  if (logDays >= 3) return 'warming_up';
  return 'just_started';
}
