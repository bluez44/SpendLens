let mockSchedulerUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => `gen-${String(++mockSchedulerUuidCounter).padStart(4, '0')}`),
}));

import { createDb, runMigrations } from './db';
import {
  catchUpSubscriptions,
  nextDueFromAnchor,
} from './subscription-scheduler';
import type { SQLiteDatabase } from 'expo-sqlite';

const IDENTITY_RATES = { VND: 1 / 25000, EUR: 1.10, JPY: 0.0067, GBP: 1.25, KRW: 0.00075 };

function freshDb() {
  const db = createDb(':memory:');
  runMigrations(db);
  return db;
}

function insertSubRaw(
  db: SQLiteDatabase,
  name: string,
  category: string,
  originalAmount: number,
  originalCurrency: string,
  anchorDay: number,
  nextDueDate: string,
  now: Date,
  uuid = 'sub-fixed',
) {
  db.runSync(
    `INSERT INTO subscriptions (uuid, name, category, original_amount, original_currency, anchor_day, next_due_date, notify_7, notify_3, notify_1, paused, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    uuid,
    name,
    category,
    originalAmount,
    originalCurrency,
    anchorDay,
    nextDueDate,
    now.getTime(),
    now.getTime(),
  );
}

describe('nextDueFromAnchor', () => {
  beforeEach(() => {
    mockSchedulerUuidCounter = 0;
  });

  it('anchor 15, from Aug 1 → Aug 15', () => {
    expect(nextDueFromAnchor(15, new Date('2026-08-01T10:00:00'))).toEqual(new Date('2026-08-15T00:00:00'));
  });
  it('anchor 15, from Aug 15 → Aug 15 (same-day hit)', () => {
    expect(nextDueFromAnchor(15, new Date('2026-08-15T10:00:00'))).toEqual(new Date('2026-08-15T00:00:00'));
  });
  it('anchor 15, from Aug 16 → Sep 15', () => {
    expect(nextDueFromAnchor(15, new Date('2026-08-16T10:00:00'))).toEqual(new Date('2026-09-15T00:00:00'));
  });
  it('anchor 31, from Feb 5 (non-leap 2026) → Feb 28', () => {
    expect(nextDueFromAnchor(31, new Date('2026-02-05T10:00:00'))).toEqual(new Date('2026-02-28T00:00:00'));
  });
  it('anchor 31, from Feb 5 (leap 2028) → Feb 29', () => {
    expect(nextDueFromAnchor(31, new Date('2028-02-05T10:00:00'))).toEqual(new Date('2028-02-29T00:00:00'));
  });
  it('anchor 31, from Apr 5 → Apr 30', () => {
    expect(nextDueFromAnchor(31, new Date('2026-04-05T10:00:00'))).toEqual(new Date('2026-04-30T00:00:00'));
  });
  it('anchor 1, from Aug 15 → Sep 1', () => {
    expect(nextDueFromAnchor(1, new Date('2026-08-15T10:00:00'))).toEqual(new Date('2026-09-01T00:00:00'));
  });
  it('throws on anchor 0, 32, 1.5, NaN, -1', () => {
    for (const bad of [0, 32, 1.5, NaN, -1]) {
      expect(() => nextDueFromAnchor(bad, new Date('2026-08-01T10:00:00'))).toThrow();
    }
  });
});

describe('catchUpSubscriptions', () => {
  beforeEach(() => {
    mockSchedulerUuidCounter = 0;
  });

  it('due today: creates 1 txn, bumps next_due to next month', () => {
    const db = freshDb();
    const now = new Date('2026-08-15T10:00:00');
    insertSubRaw(db, 'Claude Pro', 'other', 20, 'USD', 15, '2026-08-15', now);
    const created = catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    expect(created).toBe(1);
    const txns = db.getAllSync<any>('SELECT * FROM transactions');
    expect(txns).toHaveLength(1);
    expect(txns[0].date).toBe('2026-08-15');
    const sub = db.getFirstSync<{ next_due_date: string }>('SELECT next_due_date FROM subscriptions LIMIT 1');
    expect(sub?.next_due_date).toBe('2026-09-15');
  });

  it('3 cycles behind: creates 3 back-dated txns', () => {
    const db = freshDb();
    const past = new Date('2026-05-01T10:00:00');
    insertSubRaw(db, 'Claude Pro', 'other', 20, 'USD', 15, '2026-05-15', past);
    const now = new Date('2026-08-05T10:00:00');
    const created = catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    expect(created).toBe(3);
    const dates = db.getAllSync<{ date: string }>('SELECT date FROM transactions ORDER BY date').map(r => r.date);
    expect(dates).toEqual(['2026-05-15', '2026-06-15', '2026-07-15']);
    const sub = db.getFirstSync<{ next_due_date: string }>('SELECT next_due_date FROM subscriptions LIMIT 1');
    expect(sub?.next_due_date).toBe('2026-08-15');
  });

  it('paused subscription is skipped', () => {
    const db = freshDb();
    const now = new Date('2026-08-15T10:00:00');
    insertSubRaw(db, 'Claude Pro', 'other', 20, 'USD', 15, '2026-08-15', now);
    db.runSync('UPDATE subscriptions SET paused = 1 WHERE id = 1');
    const created = catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    expect(created).toBe(0);
  });

  it('USD sub + primary=VND: txn stores VND amount, USD original', () => {
    const db = freshDb();
    const now = new Date('2026-08-15T10:00:00');
    insertSubRaw(db, 'Claude Pro', 'other', 20, 'USD', 15, '2026-08-15', now);
    catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    const row = db.getFirstSync<{
      amount: number; currency: string; original_amount: number; original_currency: string;
    }>('SELECT amount, currency, original_amount, original_currency FROM transactions');
    expect(row?.currency).toBe('VND');
    expect(row?.amount).toBeCloseTo(20 * 25000, 0);
    expect(row?.original_amount).toBe(20);
    expect(row?.original_currency).toBe('USD');
  });

  it('auto-created txn carries subscription_uuid', () => {
    const db = freshDb();
    const now = new Date('2026-08-15T10:00:00');
    insertSubRaw(db, 'Claude Pro', 'other', 20, 'USD', 15, '2026-08-15', now, 'sub-fixed');
    catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    const row = db.getFirstSync<{ subscription_uuid: string }>(
      'SELECT subscription_uuid FROM transactions'
    );
    expect(row?.subscription_uuid).toBe('sub-fixed');
  });

  it('caps at 12 cycles per subscription (safety valve)', () => {
    const db = freshDb();
    const veryOld = new Date('2020-01-15T10:00:00');
    insertSubRaw(db, 'Claude Pro', 'other', 20, 'USD', 15, '2020-01-15', veryOld);
    const now = new Date('2026-08-15T10:00:00');
    const created = catchUpSubscriptions(db, 'VND', IDENTITY_RATES, now);
    expect(created).toBe(12);
  });
});
