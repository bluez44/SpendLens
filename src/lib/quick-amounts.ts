import type { CurrencyCode } from './currency';

/** One-tap amount presets; only VND has sensible round numbers. */
export function quickAmountsFor(currency: CurrencyCode): number[] {
  return currency === 'VND' ? [20000, 50000, 100000, 200000] : [];
}
