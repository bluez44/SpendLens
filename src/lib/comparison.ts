import { STATIC_CATEGORIES, categoryLabel } from './categories';
import { monthKey, toDateKey } from './format';
import { i18n } from './i18n';
import type { Range, Summary, Txn } from './transactions';
import { summarize } from './transactions';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CategoryLike {
  id: string;
  label: string;
  color: string;
}

export interface CategoryDelta {
  id: string;
  label: string;
  color: string;
  valueA: number;
  valueB: number;
  deltaPct: number | null;
  status: 'both' | 'onlyA' | 'onlyB';
}

export interface Comparison {
  sumA: Summary;
  sumB: Summary;
  deltaExpensePct: number | null;
  deltaIncomePct: number | null;
  deltaNetPct: number | null;
  categories: CategoryDelta[];
  seriesA: number[];
  seriesB: number[];
  seriesLabels: string[];
}

/* ------------------------------------------------------------------ */
/* Month utilities                                                     */
/* ------------------------------------------------------------------ */

/** Distinct month keys ("YYYY-MM") that have ≥1 txn, newest first, EXCLUDING the current month. */
export function availableMonthsDesc(txns: Txn[], now: Date = new Date()): string[] {
  const currentKey = monthKey(toDateKey(now));
  const set = new Set<string>();
  for (const t of txns) {
    const k = monthKey(t.date);
    if (k !== currentKey) set.add(k);
  }
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

export function filterByMonth(txns: Txn[], key: string): Txn[] {
  return txns.filter((t) => monthKey(t.date) === key);
}

export function groupMonthsByYear(months: string[]): Array<{ year: number; months: string[] }> {
  const map = new Map<number, string[]>();
  for (const m of months) {
    const y = Number(m.slice(0, 4));
    const list = map.get(y) ?? [];
    list.push(m);
    map.set(y, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, ms]) => ({ year, months: ms }));
}

/* ------------------------------------------------------------------ */
/* Week utilities (weeks start Monday)                                 */
/* ------------------------------------------------------------------ */

/** Return the Monday of the week containing `dateKey`, as "YYYY-MM-DD". */
export function weekStartOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - dow);
  return toDateKey(dt);
}

/** Distinct week-start keys, newest first, EXCLUDING the current week. */
export function availableWeeksDesc(txns: Txn[], now: Date = new Date()): string[] {
  const currentWeekStart = weekStartOf(toDateKey(now));
  const set = new Set<string>();
  for (const t of txns) {
    const ws = weekStartOf(t.date);
    if (ws !== currentWeekStart) set.add(ws);
  }
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

export function filterByWeek(txns: Txn[], weekStart: string): Txn[] {
  const [y, m, d] = weekStart.split('-').map(Number);
  const endDate = new Date(y, m - 1, d + 6);
  const endKey = toDateKey(endDate);
  return txns.filter((t) => t.date >= weekStart && t.date <= endKey);
}

/** Format a "23/6 - 29/6" style label for a week starting `weekStart`. */
export function weekRangeLabel(weekStart: string): { from: string; to: string } {
  const [y, m, d] = weekStart.split('-').map(Number);
  const startD = new Date(y, m - 1, d);
  const endD = new Date(y, m - 1, d + 6);
  const from = `${startD.getDate()}/${startD.getMonth() + 1}`;
  const to = `${endD.getDate()}/${endD.getMonth() + 1}`;
  return { from, to };
}

/* ------------------------------------------------------------------ */
/* Delta primitives                                                    */
/* ------------------------------------------------------------------ */

/** Percentage change. Returns null when previous is 0 (avoid /0). */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function deltaAbs(current: number, previous: number): number {
  return current - previous;
}

/* ------------------------------------------------------------------ */
/* Overview delta badge — previous-period txns and its label           */
/* ------------------------------------------------------------------ */

/** Yesterday / last week / last month txns based on `range`. */
export function previousPeriodTxns(
  txns: Txn[],
  range: Range,
  now: Date = new Date(),
): Txn[] {
  if (range === 'day') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const key = toDateKey(y);
    return txns.filter((t) => t.date === key);
  }
  if (range === 'week') {
    const thisWeekStart = weekStartOf(toDateKey(now));
    const [y, m, d] = thisWeekStart.split('-').map(Number);
    const lastWeekStart = toDateKey(new Date(y, m - 1, d - 7));
    return filterByWeek(txns, lastWeekStart);
  }
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = monthKey(toDateKey(first));
  return filterByMonth(txns, key);
}

/** Human label for the previous period. Uses i18n. */
export function previousPeriodLabel(range: Range, now: Date = new Date()): string {
  if (range === 'day') return i18n.t('delta.vs_yesterday');
  if (range === 'week') return i18n.t('delta.vs_last_week');
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthAbbrev = i18n.t('format.month_abbrev', { month: prev.getMonth() + 1 });
  return i18n.t('delta.vs_month', { label: monthAbbrev });
}

/* ------------------------------------------------------------------ */
/* Comparison — bar-chart buckets                                      */
/* ------------------------------------------------------------------ */

/** Fixed 5 buckets by day-of-month: 1-7, 8-14, 15-21, 22-28, 29-31. */
function monthExpenseBuckets(txns: Txn[]): number[] {
  const buckets = [0, 0, 0, 0, 0];
  for (const t of txns) {
    if (t.isIncome) continue;
    const day = Number(t.date.slice(8, 10));
    const idx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4;
    buckets[idx] += t.amount;
  }
  return buckets;
}

/** 7 buckets Mon-Sun. `weekStart` is the Monday date key of the week. */
function weekExpenseBuckets(txns: Txn[], weekStart: string): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const [y, m, d] = weekStart.split('-').map(Number);
  for (const t of txns) {
    if (t.isIncome) continue;
    const [ty, tm, td] = t.date.split('-').map(Number);
    const start = new Date(y, m - 1, d).getTime();
    const cur = new Date(ty, tm - 1, td).getTime();
    const idx = Math.floor((cur - start) / 86_400_000);
    if (idx >= 0 && idx < 7) buckets[idx] += t.amount;
  }
  return buckets;
}

function monthBucketLabels(): string[] {
  return [1, 2, 3, 4, 5].map((n) => i18n.t('compare.week_bucket_short', { n }));
}

function weekBucketLabels(): string[] {
  const raw = i18n.t('compare.week_day_short', { returnObjects: true }) as unknown;
  return Array.isArray(raw) ? (raw as string[]) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
}

/* ------------------------------------------------------------------ */
/* Comparison builder                                                  */
/* ------------------------------------------------------------------ */

/** Build all Compare-screen data from two txn sets and a compare type. */
export function buildComparison(
  txnsA: Txn[],
  txnsB: Txn[],
  type: 'month' | 'week',
  customCategories: CategoryLike[],
  weekStartA?: string,
  weekStartB?: string,
): Comparison {
  const sumA = summarize(txnsA);
  const sumB = summarize(txnsB);

  const registry: CategoryLike[] = [
    ...STATIC_CATEGORIES.map((c) => ({ id: c.id, label: categoryLabel(c), color: c.fg })),
    ...customCategories,
  ];

  const totalByCategory = (txns: Txn[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const t of txns) {
      if (t.isIncome) continue;
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    return map;
  };

  const totalsA = totalByCategory(txnsA);
  const totalsB = totalByCategory(txnsB);
  const ids = new Set<string>([...totalsA.keys(), ...totalsB.keys()]);
  const categories: CategoryDelta[] = [];
  for (const id of ids) {
    const meta = registry.find((c) => c.id === id) ?? { id, label: id, color: '#888' };
    const valueA = totalsA.get(id) ?? 0;
    const valueB = totalsB.get(id) ?? 0;
    const status: CategoryDelta['status'] =
      valueA > 0 && valueB > 0 ? 'both' : valueA > 0 ? 'onlyA' : 'onlyB';
    categories.push({
      id,
      label: meta.label,
      color: meta.color,
      valueA,
      valueB,
      deltaPct: deltaPct(valueA, valueB),
      status,
    });
  }
  categories.sort((a, b) => Math.max(b.valueA, b.valueB) - Math.max(a.valueA, a.valueB));

  const seriesA =
    type === 'month' ? monthExpenseBuckets(txnsA) : weekExpenseBuckets(txnsA, weekStartA ?? '1970-01-05');
  const seriesB =
    type === 'month' ? monthExpenseBuckets(txnsB) : weekExpenseBuckets(txnsB, weekStartB ?? '1970-01-05');
  const seriesLabels = type === 'month' ? monthBucketLabels() : weekBucketLabels();

  return {
    sumA,
    sumB,
    deltaExpensePct: deltaPct(sumA.expense, sumB.expense),
    deltaIncomePct: deltaPct(sumA.income, sumB.income),
    deltaNetPct: deltaPct(sumA.net, sumB.net),
    categories,
    seriesA,
    seriesB,
    seriesLabels,
  };
}
