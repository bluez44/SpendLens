import { buildComparison, filterByWeek, weekStartOf, type CategoryLike } from './comparison';
import type { CurrencyCode } from './currency';
import { shiftDateKey, toDateKey } from './format';
import { computeLogDaysStreak } from './streaks';
import type { Txn } from './transactions';

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

function computePreviousWeekTopCategoryId(prevWeekTxns: Txn[]): string | null {
  if (prevWeekTxns.length === 0) return null;
  const totals = new Map<string, number>();
  for (const t of prevWeekTxns) {
    if (t.isIncome) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  let topId: string | null = null;
  let topValue = 0;
  for (const [id, value] of totals) {
    if (value > topValue) { topId = id; topValue = value; }
  }
  return topId;
}

export function assembleRecapData(
  txns: Txn[],
  categoryRegistry: CategoryLike[],
  monthlyBudget: number,
  primary: CurrencyCode,
  today: Date = new Date(),
): RecapData {
  const todayKey = toDateKey(today);
  const weekStart = weekStartOf(todayKey);
  const weekEnd = shiftDateKey(weekStart, 6);
  const prevWeekStart = shiftDateKey(weekStart, -7);

  const thisWeekTxns = filterByWeek(txns, weekStart);
  const prevWeekTxns = filterByWeek(txns, prevWeekStart);

  const comparison = buildComparison(
    thisWeekTxns, prevWeekTxns, 'week',
    categoryRegistry, weekStart, prevWeekStart,
  );

  const totalExpense = comparison.sumA.expense;
  const totalIncome = comparison.sumA.income;

  // comparison.categories is sorted by max(valueA, valueB) for chart legibility.
  // For the recap card we want THIS week's top spenders — sort by valueA desc.
  const topCategories: RecapTopCategory[] = comparison.categories
    .filter((c) => c.valueA > 0)
    .slice()
    .sort((a, b) => b.valueA - a.valueA)
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      label: c.label,
      color: c.color,
      value: c.valueA,
      pctOfWeek: totalExpense > 0 ? (c.valueA / totalExpense) * 100 : 0,
    }));

  const budgetPctUsed = monthlyBudget > 0
    ? (totalExpense / (monthlyBudget * 7 / 30)) * 100
    : null;

  const previousTopCatId = computePreviousWeekTopCategoryId(prevWeekTxns);

  const draft: RecapData = {
    weekStart, weekEnd,
    totalExpense, totalIncome,
    topCategories,
    deltaExpensePct: comparison.deltaExpensePct,
    narrative: 'another_log',
    budgetPctUsed,
    primary,
  };
  draft.narrative = pickNarrative(draft, previousTopCatId);
  return draft;
}

export function assembleStreakData(
  txns: Txn[],
  today: Date = new Date(),
): StreakData {
  const logDays = computeLogDaysStreak(txns, today);
  const todayKey = toDateKey(today);
  const weekStart = weekStartOf(todayKey);
  const txnCountThisWeek = filterByWeek(txns, weekStart).length;
  return {
    logDays,
    txnCountThisWeek,
    hype: pickHype(logDays),
  };
}
