export const CURRENCIES = ['VND', 'USD', 'EUR', 'JPY', 'GBP', 'KRW'] as const;
export type CurrencyCode = typeof CURRENCIES[number];

export const CURRENCY_META: Record<CurrencyCode, {
  symbol: string;
  decimals: 0 | 2;
  position: 'prefix' | 'suffix';
}> = {
  VND: { symbol: '₫', decimals: 0, position: 'suffix' },
  USD: { symbol: '$', decimals: 2, position: 'prefix' },
  EUR: { symbol: '€', decimals: 2, position: 'prefix' },
  JPY: { symbol: '¥', decimals: 0, position: 'prefix' },
  GBP: { symbol: '£', decimals: 2, position: 'prefix' },
  KRW: { symbol: '₩', decimals: 0, position: 'prefix' },
};

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}
