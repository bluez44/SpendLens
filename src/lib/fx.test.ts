jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => 'stub-uuid'),
}));

import * as SQLite from 'expo-sqlite';
import { runMigrations, createDb } from '../lib/db';
import { convert, FxService } from './fx';

function db() {
  const d = createDb(':memory:');
  runMigrations(d);
  return d;
}

const RATES = {
  VND: 1 / 25000,  // 1 VND = 0.00004 USD → 25000 VND per USD
  EUR: 1.10,
  JPY: 0.0067,
  GBP: 1.25,
  KRW: 0.00075,
};

describe('convert', () => {
  it('same currency is identity', () => {
    expect(convert(100, 'USD', 'USD', RATES)).toBe(100);
    expect(convert(50000, 'VND', 'VND', RATES)).toBe(50000);
  });
  it('X → USD uses rate_to_usd', () => {
    expect(convert(25000, 'VND', 'USD', RATES)).toBeCloseTo(1.0, 5);
    expect(convert(1, 'EUR', 'USD', RATES)).toBeCloseTo(1.10, 5);
  });
  it('USD → X uses inverse rate', () => {
    expect(convert(1, 'USD', 'VND', RATES)).toBeCloseTo(25000, 0);
    expect(convert(1, 'USD', 'EUR', RATES)).toBeCloseTo(1 / 1.10, 5);
  });
  it('X → Y goes through USD', () => {
    const eurToVnd = convert(1, 'EUR', 'VND', RATES);
    expect(eurToVnd).toBeCloseTo(1.10 * 25000, -1);
  });
  it('roundtrip A → B → A ≈ identity', () => {
    const round = convert(convert(100, 'USD', 'VND', RATES), 'VND', 'USD', RATES);
    expect(round).toBeCloseTo(100, 5);
  });
});

describe('FxService.loadRates', () => {
  it('reads all 5 fallback rows after migration', () => {
    const svc = new FxService(db());
    const rates = svc.loadRates();
    expect(Object.keys(rates).sort()).toEqual(['EUR', 'GBP', 'JPY', 'KRW', 'VND']);
    expect(rates.VND).toBeCloseTo(1 / 24500, 8);
  });
});

describe('FxService.setManualRate / clearManualRate', () => {
  it('setManualRate updates row with source=manual', () => {
    const d = db();
    const svc = new FxService(d);
    svc.setManualRate('EUR', 1.15);
    const row = d.getFirstSync<{ rate_to_usd: number; source: string }>(
      "SELECT rate_to_usd, source FROM fx_rates WHERE currency = 'EUR'"
    );
    expect(row?.rate_to_usd).toBe(1.15);
    expect(row?.source).toBe('manual');
  });
  it('clearManualRate deletes the row', () => {
    const d = db();
    const svc = new FxService(d);
    svc.setManualRate('EUR', 1.15);
    svc.clearManualRate('EUR');
    const row = d.getFirstSync("SELECT 1 FROM fx_rates WHERE currency = 'EUR'");
    expect(row).toBeNull();
  });
  it('rejects rate <= 0', () => {
    const svc = new FxService(db());
    expect(() => svc.setManualRate('EUR', 0)).toThrow(/greater than 0/);
    expect(() => svc.setManualRate('EUR', -1)).toThrow(/greater than 0/);
  });
});

describe('FxService.fetchFromApi', () => {
  it('updates auto+fallback rows, skips manual', async () => {
    const d = db();
    const svc = new FxService(d);
    svc.setManualRate('JPY', 999);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        rates: { VND: 24000, EUR: 0.90, JPY: 150, GBP: 0.78, KRW: 1300 },
      }),
    })) as unknown as typeof fetch;
    await svc.fetchFromApi();
    const rows = d.getAllSync<{ currency: string; rate_to_usd: number; source: string }>(
      "SELECT currency, rate_to_usd, source FROM fx_rates ORDER BY currency"
    );
    const byCur = Object.fromEntries(rows.map(r => [r.currency, r]));
    expect(byCur.VND.source).toBe('auto');
    expect(byCur.VND.rate_to_usd).toBeCloseTo(1 / 24000, 8);
    expect(byCur.JPY.source).toBe('manual');
    expect(byCur.JPY.rate_to_usd).toBe(999);
  });

  it('leaves state intact when fetch fails', async () => {
    const d = db();
    const svc = new FxService(d);
    global.fetch = jest.fn(async () => ({
      ok: false, status: 500, json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(svc.fetchFromApi()).rejects.toThrow();
    const rows = d.getAllSync("SELECT source FROM fx_rates");
    expect(rows.every((r: any) => r.source === 'fallback')).toBe(true);
  });
});

describe('FxService.getLastFetchedAt', () => {
  it('returns null when no auto rows', () => {
    expect(new FxService(db()).getLastFetchedAt()).toBeNull();
  });
  it('returns max updated_at across auto rows', async () => {
    const d = db();
    const svc = new FxService(d);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ rates: { VND: 24000, EUR: 0.90, JPY: 150, GBP: 0.78, KRW: 1300 } }),
    })) as unknown as typeof fetch;
    const before = Date.now();
    await svc.fetchFromApi();
    expect(svc.getLastFetchedAt()).toBeGreaterThanOrEqual(before);
  });
});
