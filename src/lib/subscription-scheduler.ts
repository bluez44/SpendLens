import type { SQLiteDatabase } from 'expo-sqlite';
import type { CurrencyCode } from './currency';
import type { RateMap } from './fx';
import { insertTransaction } from './transactions';
import { toDateKey } from './format';

const MAX_CATCH_UP_CYCLES = 12;

function lastDayOfMonth(year: number, monthZero: number): number {
  return new Date(year, monthZero + 1, 0).getDate();
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateFor(year: number, monthZero: number, anchor: number): Date {
  const day = Math.min(anchor, lastDayOfMonth(year, monthZero));
  return new Date(year, monthZero, day);
}

export function nextDueFromAnchor(anchor: number, from: Date): Date {
  if (!Number.isInteger(anchor) || anchor < 1 || anchor > 31) {
    throw new Error(`Invalid anchor day: ${anchor}`);
  }
  const stripped = stripTime(from);
  const thisMonth = dateFor(stripped.getFullYear(), stripped.getMonth(), anchor);
  if (thisMonth.getTime() >= stripped.getTime()) return thisMonth;
  return dateFor(stripped.getFullYear(), stripped.getMonth() + 1, anchor);
}

interface SubRow {
  id: number;
  uuid: string;
  name: string;
  category: string;
  original_amount: number;
  original_currency: string;
  anchor_day: number;
  next_due_date: string;
  photo_path: string | null;
}

export function catchUpSubscriptions(
  db: SQLiteDatabase,
  primary: CurrencyCode,
  rates: RateMap,
  now: Date = new Date(),
): number {
  const todayKey = toDateKey(now);
  const rows = db.getAllSync<SubRow>(
    `SELECT id, uuid, name, category, original_amount, original_currency,
            anchor_day, next_due_date, photo_path
     FROM subscriptions
     WHERE paused = 0 AND next_due_date <= ?`,
    todayKey,
  );

  let totalCreated = 0;

  for (const sub of rows) {
    try {
      // Validate anchor_day eagerly so a corrupted value skips the entire sub.
      if (!Number.isInteger(sub.anchor_day) || sub.anchor_day < 1 || sub.anchor_day > 31) {
        throw new Error(`Invalid anchor day: ${sub.anchor_day}`);
      }
      let dueKey = sub.next_due_date;
      let cycles = 0;
      while (dueKey <= todayKey && cycles < MAX_CATCH_UP_CYCLES) {
        const createdAt = new Date(`${dueKey}T12:00:00`).getTime();
        insertTransaction(
          {
            date: dueKey,
            time: '12:00',
            createdAt,
            category: sub.category as any,
            name: sub.name,
            note: null,
            originalAmount: sub.original_amount,
            originalCurrency: sub.original_currency as CurrencyCode,
            isIncome: false,
            photoPath: sub.photo_path,
            subscriptionUuid: sub.uuid,
          },
          db,
          primary,
          rates,
        );
        totalCreated++;
        cycles++;
        const next = nextDueFromAnchor(
          sub.anchor_day,
          new Date(new Date(`${dueKey}T12:00:00`).getTime() + 24 * 60 * 60 * 1000),
        );
        dueKey = toDateKey(next);
      }
      db.runSync(
        'UPDATE subscriptions SET next_due_date = ?, updated_at = ? WHERE id = ?',
        dueKey,
        now.getTime(),
        sub.id,
      );
      if (cycles === MAX_CATCH_UP_CYCLES) {
        console.warn(`catchUpSubscriptions: hit ${MAX_CATCH_UP_CYCLES}-cycle cap for ${sub.uuid}`);
      }
    } catch (err) {
      console.warn(`catchUpSubscriptions: skipped subscription ${sub.uuid} due to error`, err);
    }
  }

  return totalCreated;
}
