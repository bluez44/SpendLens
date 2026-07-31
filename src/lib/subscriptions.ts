import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import type { CategoryId } from './categories';
import type { CurrencyCode } from './currency';
import { db as defaultDb } from './db';
import { nextDueFromAnchor } from './subscription-scheduler';
import { toDateKey } from './format';

export interface Subscription {
  id: number;
  uuid: string;
  name: string;
  category: CategoryId;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  anchorDay: number;
  nextDueDate: string;
  photoPath: string | null;
  notify7: boolean;
  notify3: boolean;
  notify1: boolean;
  paused: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NewSubscription {
  name: string;
  category: CategoryId;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  anchorDay: number;
  photoPath: string | null;
  notify7: boolean;
  notify3: boolean;
  notify1: boolean;
}

interface Row {
  id: number; uuid: string; name: string; category: string;
  original_amount: number; original_currency: string;
  anchor_day: number; next_due_date: string;
  photo_path: string | null;
  notify_7: number; notify_3: number; notify_1: number;
  paused: number; created_at: number; updated_at: number;
}

function toSubscription(r: Row): Subscription {
  return {
    id: r.id, uuid: r.uuid, name: r.name,
    category: r.category as CategoryId,
    originalAmount: r.original_amount,
    originalCurrency: r.original_currency as CurrencyCode,
    anchorDay: r.anchor_day, nextDueDate: r.next_due_date,
    photoPath: r.photo_path,
    notify7: r.notify_7 === 1, notify3: r.notify_3 === 1, notify1: r.notify_1 === 1,
    paused: r.paused === 1,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function listSubscriptions(
  db: SQLiteDatabase = defaultDb,
  opts?: { activeOnly?: boolean },
): Subscription[] {
  const where = opts?.activeOnly ? 'WHERE paused = 0' : '';
  return db
    .getAllSync<Row>(`SELECT * FROM subscriptions ${where} ORDER BY paused ASC, next_due_date ASC`)
    .map(toSubscription);
}

export function insertSubscription(
  input: NewSubscription,
  db: SQLiteDatabase = defaultDb,
  now: Date = new Date(),
): number {
  const nowMs = now.getTime();
  const nextDue = toDateKey(nextDueFromAnchor(input.anchorDay, now));
  const result = db.runSync(
    `INSERT INTO subscriptions
      (uuid, name, category, original_amount, original_currency, anchor_day,
       next_due_date, photo_path, notify_7, notify_3, notify_1, paused,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    Crypto.randomUUID(),
    input.name, input.category, input.originalAmount, input.originalCurrency,
    input.anchorDay, nextDue, input.photoPath,
    input.notify7 ? 1 : 0, input.notify3 ? 1 : 0, input.notify1 ? 1 : 0,
    nowMs, nowMs,
  );
  return result.lastInsertRowId;
}

export function updateSubscription(
  id: number, input: NewSubscription,
  db: SQLiteDatabase = defaultDb,
  now: Date = new Date(),
): void {
  const existing = db.getFirstSync<{ anchor_day: number; next_due_date: string; photo_path: string | null }>(
    'SELECT anchor_day, next_due_date, photo_path FROM subscriptions WHERE id = ?', id,
  );
  if (!existing) return;
  const nextDue = existing.anchor_day === input.anchorDay
    ? existing.next_due_date
    : toDateKey(nextDueFromAnchor(input.anchorDay, now));
  db.runSync(
    `UPDATE subscriptions
     SET name = ?, category = ?, original_amount = ?, original_currency = ?,
         anchor_day = ?, next_due_date = ?, photo_path = ?,
         notify_7 = ?, notify_3 = ?, notify_1 = ?, updated_at = ?
     WHERE id = ?`,
    input.name, input.category, input.originalAmount, input.originalCurrency,
    input.anchorDay, nextDue, input.photoPath,
    input.notify7 ? 1 : 0, input.notify3 ? 1 : 0, input.notify1 ? 1 : 0,
    now.getTime(), id,
  );
  const oldPath = existing.photo_path;
  if (!oldPath || !oldPath.startsWith('file://')) return;
  if (oldPath === input.photoPath) return;
  try {
    new File(oldPath).delete();
  } catch {
    // best-effort; ignore missing/renamed files
  }
}

export function deleteSubscription(id: number, db: SQLiteDatabase = defaultDb): void {
  const row = db.getFirstSync<{ photo_path: string | null }>(
    'SELECT photo_path FROM subscriptions WHERE id = ?', id,
  );
  db.runSync('DELETE FROM subscriptions WHERE id = ?', id);
  const p = row?.photo_path;
  if (!p || !p.startsWith('file://')) return;
  try {
    new File(p).delete();
  } catch {
    // best-effort; ignore missing/renamed files
  }
}

export function pauseSubscription(id: number, db: SQLiteDatabase = defaultDb, now: Date = new Date()): void {
  db.runSync('UPDATE subscriptions SET paused = 1, updated_at = ? WHERE id = ?', now.getTime(), id);
}

export function resumeSubscription(id: number, db: SQLiteDatabase = defaultDb, now: Date = new Date()): void {
  db.runSync('UPDATE subscriptions SET paused = 0, updated_at = ? WHERE id = ?', now.getTime(), id);
}

export function getSubscriptionByUuid(uuid: string, db: SQLiteDatabase = defaultDb): Subscription | null {
  const row = db.getFirstSync<Row>('SELECT * FROM subscriptions WHERE uuid = ?', uuid);
  return row ? toSubscription(row) : null;
}

export function countSubscriptions(
  db: SQLiteDatabase = defaultDb,
  opts?: { activeOnly?: boolean },
): number {
  const where = opts?.activeOnly ? 'WHERE paused = 0' : '';
  const row = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM subscriptions ${where}`);
  return row?.n ?? 0;
}
