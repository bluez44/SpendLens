import { i18n } from './i18n';
import { CURRENCY_META, type CurrencyCode } from './currency';

function groupThousands(n: number): string {
  return Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function groupThousandsRaw(intAbs: number): string {
  return intAbs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const meta = CURRENCY_META[currency];
  const abs = Math.abs(amount);
  let body: string;
  if (meta.decimals === 0) {
    const rounded = Math.round(abs);
    body = currency === 'VND' ? groupThousandsRaw(rounded) : rounded.toString();
  } else {
    body = abs.toFixed(2);
  }
  return meta.position === 'prefix' ? meta.symbol + body : body + meta.symbol;
}

export function signedMoney(amount: number, currency: CurrencyCode, isIncome: boolean): string {
  return (isIncome ? '+' : '−') + formatMoney(amount, currency);
}

/**
 * Format an FX rate for the "1 X = Y" display. Adapts precision to magnitude
 * so tiny anchors like 1 VND = 0.00003825 USD stay readable instead of
 * rounding to 0. The caller renders the target currency code separately.
 */
export function formatFxRate(rate: number, currency: CurrencyCode): string {
  const abs = Math.abs(rate);
  if (abs >= 1000) {
    const rounded = Math.round(abs);
    return currency === 'VND' ? groupThousandsRaw(rounded) : rounded.toString();
  }
  if (abs >= 1) return abs.toFixed(CURRENCY_META[currency].decimals);
  if (abs > 0) return Number(abs.toPrecision(4)).toString();
  return '0';
}

export function formatCompact(amount: number, currency: CurrencyCode): string {
  if (currency !== 'VND') return formatMoney(amount, currency);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(2).replace('.', ',') + 'tr';
  return groupThousandsRaw(Math.round(abs / 1000)) + 'k';
}

export function formatAmountInput(digits: string, currency: CurrencyCode): string {
  const clean = digits.replace(/\D/g, '');
  if (!clean) return '';
  const meta = CURRENCY_META[currency];
  if (meta.decimals === 0) {
    const num = Number(clean);
    return currency === 'VND' ? groupThousandsRaw(num) : num.toString();
  }
  const padded = clean.padStart(3, '0');
  const intPart = padded.slice(0, -2).replace(/^0+/, '') || '0';
  const centsPart = padded.slice(-2);
  return `${intPart}.${centsPart}`;
}

/** Vietnamese đồng: 45000 -> "45.000₫". */
export function formatVND(amount: number): string {
  return formatMoney(amount, 'VND');
}

/** Signed money for feeds: expense -> "−45.000₫", income -> "+2.500.000₫". */
export function signedVND(amount: number, isIncome: boolean): string {
  return signedMoney(amount, 'VND', isIncome);
}

/** Compact thousands: 2500000 -> "2.500k", 730000 -> "730k". */
export function compactK(amount: number): string {
  return groupThousandsRaw(Math.round(Math.abs(amount) / 1000)) + 'k';
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
  return `${d} ${i18n.t('format.month_abbrev', { month: m })}`;
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/**
 * Shift a YYYY-MM key by N months (delta can be negative). Rolls the year
 * over when the month goes below 1 or above 12. Day-of-month never enters
 * the computation, so this cannot produce Feb 31 style bugs.
 */
export function shiftMonthKey(mk: string, delta: number): string {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}
