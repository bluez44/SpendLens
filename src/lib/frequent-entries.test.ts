import { frequentEntries, SUGGESTION_WINDOW_MS } from './frequent-entries';
import type { Txn } from './transactions';

const NOW = new Date(2026, 8, 17, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
let seq = 0;

function tx(p: Partial<Txn>): Txn {
  seq += 1;
  return {
    id: seq, uuid: `u${seq}`, updatedAt: 0, date: '2026-09-17', time: '12:00',
    createdAt: NOW - DAY, category: 'food', name: 'Cà phê', note: null,
    amount: 29000, currency: 'VND', originalAmount: 29000, originalCurrency: 'VND',
    isIncome: false, photoPath: null, subscriptionUuid: null,
    ...p,
  };
}

describe('frequentEntries', () => {
  it('uses a 60-day window', () => {
    expect(SUGGESTION_WINDOW_MS).toBe(60 * DAY);
  });

  it('groups case-insensitively on trimmed name with category, amount and currency', () => {
    const result = frequentEntries([
      tx({ name: 'Cà phê' }), tx({ name: ' cà phê ' }), tx({ name: 'CÀ PHÊ' }),
    ], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });

  it('separates groups by amount, category or currency', () => {
    const result = frequentEntries([
      tx({}), tx({ originalAmount: 35000 }), tx({ category: 'fun' }), tx({ originalCurrency: 'USD', originalAmount: 29000 }),
    ], NOW);
    expect(result).toHaveLength(4);
  });

  it('excludes income, empty names and rows older than 60 days', () => {
    const result = frequentEntries([
      tx({ isIncome: true, name: 'Lương' }),
      tx({ name: '   ' }),
      tx({ name: 'Old', createdAt: NOW - 61 * DAY }),
      tx({ name: 'Edge', createdAt: NOW - 60 * DAY }),
    ], NOW);
    expect(result.map((e) => e.name)).toEqual(['Edge']);
  });

  it('sorts by count, then by most recent use', () => {
    const result = frequentEntries([
      tx({ name: 'A', createdAt: NOW - 5 * DAY }),
      tx({ name: 'B', createdAt: NOW - 1 * DAY }),
      tx({ name: 'B', createdAt: NOW - 2 * DAY }),
      tx({ name: 'C', createdAt: NOW - 1000 }),
    ], NOW);
    expect(result.map((e) => e.name)).toEqual(['B', 'C', 'A']);
  });

  it('keeps the display name and lastUsedAt of the most recent use', () => {
    const result = frequentEntries([
      tx({ name: 'cà phê', createdAt: NOW - 3 * DAY }),
      tx({ name: 'Cà Phê', createdAt: NOW - 1 * DAY }),
    ], NOW);
    expect(result[0].name).toBe('Cà Phê');
    expect(result[0].lastUsedAt).toBe(NOW - 1 * DAY);
  });

  it('limits the result', () => {
    const txns = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => tx({ name: n }));
    expect(frequentEntries(txns, NOW)).toHaveLength(5);
    expect(frequentEntries(txns, NOW, 2)).toHaveLength(2);
  });

  it('returns the group fields', () => {
    expect(frequentEntries([tx({ category: 'transport', originalAmount: 12000 })], NOW)[0]).toEqual({
      name: 'Cà phê', category: 'transport', originalAmount: 12000, originalCurrency: 'VND',
      count: 1, lastUsedAt: NOW - DAY,
    });
  });
});
