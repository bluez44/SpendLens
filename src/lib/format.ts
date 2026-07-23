import { i18n } from './i18n';

function groupThousands(n: number): string {
  return Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Vietnamese đồng: 45000 -> "45.000₫". */
export function formatVND(amount: number): string {
  return groupThousands(amount) + '₫';
}

/** Signed money for feeds: expense -> "−45.000₫", income -> "+2.500.000₫". */
export function signedVND(amount: number, isIncome: boolean): string {
  return (isIncome ? '+' : '−') + formatVND(amount); // U+2212 minus for expense
}

/** Compact thousands: 2500000 -> "2.500k", 730000 -> "730k". */
export function compactK(amount: number): string {
  return groupThousands(Math.round(Math.abs(amount) / 1000)) + 'k';
}

/** Compact millions with comma decimal: 4230000 -> "4,23tr". */
export function compactTr(amount: number): string {
  return (Math.abs(amount) / 1_000_000).toFixed(2).replace('.', ',') + 'tr';
}

/** Legacy USD formatter (kept for compatibility / settings). */
export function formatCurrency(amount: number): string {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
}

export function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return i18n.t('day.today');
  if (dateKey === shiftDateKey(todayKey, -1)) return i18n.t('day.yesterday');
  const [, m, d] = dateKey.split('-').map(Number);
  return `${d} Th${m}`;
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}
