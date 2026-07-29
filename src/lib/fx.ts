import type { SQLiteDatabase } from 'expo-sqlite';
import { CURRENCIES, type CurrencyCode } from './currency';

export type NonUsdCurrency = Exclude<CurrencyCode, 'USD'>;
export type RateMap = Record<NonUsdCurrency, number>;

const NON_USD: readonly NonUsdCurrency[] =
  CURRENCIES.filter((c): c is NonUsdCurrency => c !== 'USD');

const API_URL = 'https://api.exchangerate.host/latest?base=USD&symbols=VND,EUR,JPY,GBP,KRW';

function rateToUsd(currency: CurrencyCode, rates: RateMap): number {
  return currency === 'USD' ? 1 : rates[currency];
}

export function convert(
  amount: number, from: CurrencyCode, to: CurrencyCode, rates: RateMap,
): number {
  if (from === to) return amount;
  const usd = amount * rateToUsd(from, rates);
  return usd / rateToUsd(to, rates);
}

export class FxService {
  constructor(private db: SQLiteDatabase) {}

  loadRates(): RateMap {
    const rows = this.db.getAllSync<{ currency: string; rate_to_usd: number }>(
      'SELECT currency, rate_to_usd FROM fx_rates'
    );
    const map = Object.fromEntries(rows.map(r => [r.currency, r.rate_to_usd]));
    return NON_USD.reduce((acc, cur) => {
      acc[cur] = (map[cur] ?? 0);
      return acc;
    }, {} as RateMap);
  }

  getSource(currency: NonUsdCurrency): 'auto' | 'manual' | 'fallback' | null {
    const row = this.db.getFirstSync<{ source: string }>(
      'SELECT source FROM fx_rates WHERE currency = ?', currency
    );
    return (row?.source as 'auto' | 'manual' | 'fallback' | undefined) ?? null;
  }

  setManualRate(currency: NonUsdCurrency, rate: number): void {
    if (!(rate > 0)) throw new Error('rate must be greater than 0');
    this.db.runSync(
      `INSERT INTO fx_rates (currency, rate_to_usd, source, updated_at)
       VALUES (?, ?, 'manual', ?)
       ON CONFLICT(currency) DO UPDATE SET rate_to_usd = excluded.rate_to_usd, source = 'manual', updated_at = excluded.updated_at`,
      currency, rate, Date.now(),
    );
  }

  clearManualRate(currency: NonUsdCurrency): void {
    this.db.runSync('DELETE FROM fx_rates WHERE currency = ? AND source = ?', currency, 'manual');
  }

  getLastFetchedAt(): number | null {
    const row = this.db.getFirstSync<{ ts: number | null }>(
      "SELECT MAX(updated_at) AS ts FROM fx_rates WHERE source = 'auto'"
    );
    return row?.ts ?? null;
  }

  async fetchFromApi(): Promise<void> {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`FX API failed: ${res.status}`);
    const body = await res.json() as { rates?: Record<string, number> };
    const rates = body.rates ?? {};
    const now = Date.now();
    for (const currency of NON_USD) {
      const apiRate = rates[currency];
      if (typeof apiRate !== 'number' || apiRate <= 0) continue;
      const existing = this.getSource(currency);
      if (existing === 'manual') continue;
      const inverse = 1 / apiRate;
      this.db.runSync(
        `INSERT INTO fx_rates (currency, rate_to_usd, source, updated_at)
         VALUES (?, ?, 'auto', ?)
         ON CONFLICT(currency) DO UPDATE SET rate_to_usd = excluded.rate_to_usd, source = 'auto', updated_at = excluded.updated_at`,
        currency, inverse, now,
      );
    }
  }
}
