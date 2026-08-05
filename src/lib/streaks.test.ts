import type { Txn } from './transactions';
import { computeLogDaysStreak } from './streaks';

function mkTxn(date: string, id: number): Txn {
  return {
    id, uuid: `u${id}`, updatedAt: 0,
    date, time: '10:00', createdAt: 0,
    category: 'food', name: 't', note: null,
    amount: 100, currency: 'VND',
    originalAmount: 100, originalCurrency: 'VND',
    isIncome: false, photoPath: null, subscriptionUuid: null,
  };
}

// Local-time date to avoid TZ flakiness. Month index 7 = August.
const TODAY = new Date(2026, 7, 5, 12, 0, 0);

function dateShift(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

describe('computeLogDaysStreak', () => {
  it('returns 0 for empty txns', () => {
    expect(computeLogDaysStreak([], TODAY)).toBe(0);
  });

  it('returns 1 when only today has a txn', () => {
    const txns = [mkTxn(dateShift(TODAY, 0), 1)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(1);
  });

  it('returns 2 when today and yesterday both have txns', () => {
    const txns = [mkTxn(dateShift(TODAY, 0), 1), mkTxn(dateShift(TODAY, -1), 2)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(2);
  });

  it('grace: returns 1 when only yesterday has a txn (today not logged yet)', () => {
    const txns = [mkTxn(dateShift(TODAY, -1), 1)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(1);
  });

  it('returns 1 when today has txn but 2 days ago has txn (gap breaks streak)', () => {
    const txns = [mkTxn(dateShift(TODAY, 0), 1), mkTxn(dateShift(TODAY, -2), 2)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(1);
  });

  it('returns 0 when today missing and day-before-yesterday only (2-day gap)', () => {
    const txns = [mkTxn(dateShift(TODAY, -2), 1)];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(0);
  });

  it('counts 30-day continuous streak', () => {
    const txns = Array.from({ length: 30 }, (_, i) => mkTxn(dateShift(TODAY, -i), i));
    expect(computeLogDaysStreak(txns, TODAY)).toBe(30);
  });

  it('dedupes multiple txns on same day', () => {
    const txns = [
      mkTxn(dateShift(TODAY, 0), 1),
      mkTxn(dateShift(TODAY, 0), 2),
      mkTxn(dateShift(TODAY, 0), 3),
    ];
    expect(computeLogDaysStreak(txns, TODAY)).toBe(1);
  });
});
