let mockSubUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => `sub-${String(++mockSubUuidCounter).padStart(4, '0')}`),
}));

const mockFileDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  __esModule: true,
  File: jest.fn().mockImplementation((p: string) => ({
    uri: typeof p === 'string' ? p : p?.uri,
    delete: () => mockFileDelete(typeof p === 'string' ? p : p?.uri),
  })),
}));

import type { SQLiteDatabase } from 'expo-sqlite';
import { createDb, runMigrations } from './db';
import {
  countSubscriptions,
  deleteSubscription,
  getSubscriptionByUuid,
  insertSubscription,
  listSubscriptions,
  pauseSubscription,
  resumeSubscription,
  updateSubscription,
  type NewSubscription,
} from './subscriptions';

function freshDb(): SQLiteDatabase {
  const d = createDb(':memory:');
  runMigrations(d);
  return d;
}

const SAMPLE: NewSubscription = {
  name: 'Claude Pro',
  category: 'other',
  originalAmount: 20,
  originalCurrency: 'USD',
  anchorDay: 15,
  photoPath: null,
  notify7: true,
  notify3: true,
  notify1: true,
};

describe('insertSubscription', () => {
  beforeEach(() => { mockSubUuidCounter = 0; });

  it('assigns uuid, timestamps, and next_due_date from anchor', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    const row = db.getFirstSync<{ uuid: string; next_due_date: string; paused: number; }>(
      'SELECT uuid, next_due_date, paused FROM subscriptions WHERE id = ?', id,
    );
    expect(row?.uuid).toBe('sub-0001');
    expect(row?.next_due_date).toBe('2026-08-15');
    expect(row?.paused).toBe(0);
  });

  it('same-day anchor is a hit (next_due = today)', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-15T10:00:00Z'));
    const row = db.getFirstSync<{ next_due_date: string }>(
      'SELECT next_due_date FROM subscriptions WHERE id = ?', id,
    );
    expect(row?.next_due_date).toBe('2026-08-15');
  });
});

describe('listSubscriptions', () => {
  beforeEach(() => { mockSubUuidCounter = 0; });

  it('sorts paused=0 first, then by next_due_date ASC', () => {
    const db = freshDb();
    insertSubscription({ ...SAMPLE, name: 'Late', anchorDay: 28 }, db, new Date('2026-08-01T10:00:00Z'));
    const idEarly = insertSubscription({ ...SAMPLE, name: 'Early', anchorDay: 5 }, db, new Date('2026-08-01T10:00:00Z'));
    const idPaused = insertSubscription({ ...SAMPLE, name: 'Paused' }, db, new Date('2026-08-01T10:00:00Z'));
    pauseSubscription(idPaused, db);
    const list = listSubscriptions(db);
    expect(list.map((s) => s.name)).toEqual(['Early', 'Late', 'Paused']);
    expect(list[0].id).toBe(idEarly);
  });

  it('activeOnly filters out paused', () => {
    const db = freshDb();
    const idActive = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    const idPaused = insertSubscription({ ...SAMPLE, name: 'X' }, db, new Date('2026-08-01T10:00:00Z'));
    pauseSubscription(idPaused, db);
    expect(listSubscriptions(db, { activeOnly: true }).map((s) => s.id)).toEqual([idActive]);
  });
});

describe('updateSubscription', () => {
  beforeEach(() => { mockSubUuidCounter = 0; });

  it('bumps updated_at and recomputes next_due when anchor_day changes', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    updateSubscription(id, { ...SAMPLE, anchorDay: 20 }, db, new Date('2026-08-10T10:00:00Z'));
    const row = db.getFirstSync<{ next_due_date: string; anchor_day: number }>(
      'SELECT next_due_date, anchor_day FROM subscriptions WHERE id = ?', id,
    );
    expect(row?.anchor_day).toBe(20);
    expect(row?.next_due_date).toBe('2026-08-20');
  });

  it('keeps next_due unchanged when anchor_day unchanged', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    updateSubscription(id, { ...SAMPLE, name: 'Renamed' }, db, new Date('2026-08-10T10:00:00Z'));
    const row = db.getFirstSync<{ next_due_date: string; name: string }>(
      'SELECT next_due_date, name FROM subscriptions WHERE id = ?', id,
    );
    expect(row?.name).toBe('Renamed');
    expect(row?.next_due_date).toBe('2026-08-15');
  });
});

describe('pause / resume', () => {
  beforeEach(() => { mockSubUuidCounter = 0; });

  it('pauseSubscription flips paused to 1', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db);
    pauseSubscription(id, db);
    const row = db.getFirstSync<{ paused: number }>('SELECT paused FROM subscriptions WHERE id = ?', id);
    expect(row?.paused).toBe(1);
  });

  it('resumeSubscription flips paused back to 0', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db);
    pauseSubscription(id, db);
    resumeSubscription(id, db);
    const row = db.getFirstSync<{ paused: number }>('SELECT paused FROM subscriptions WHERE id = ?', id);
    expect(row?.paused).toBe(0);
  });
});

describe('deleteSubscription', () => {
  beforeEach(() => { mockSubUuidCounter = 0; });

  it('removes the row', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db);
    deleteSubscription(id, db);
    expect(listSubscriptions(db)).toHaveLength(0);
  });
});

describe('getSubscriptionByUuid', () => {
  beforeEach(() => { mockSubUuidCounter = 0; });

  it('returns the row or null', () => {
    const db = freshDb();
    insertSubscription(SAMPLE, db);
    expect(getSubscriptionByUuid('sub-0001', db)?.name).toBe('Claude Pro');
    expect(getSubscriptionByUuid('nonexistent', db)).toBeNull();
  });
});

describe('countSubscriptions', () => {
  beforeEach(() => { mockSubUuidCounter = 0; });

  it('counts all and active-only', () => {
    const db = freshDb();
    insertSubscription(SAMPLE, db);
    const idPaused = insertSubscription({ ...SAMPLE, name: 'X' }, db);
    pauseSubscription(idPaused, db);
    expect(countSubscriptions(db)).toBe(2);
    expect(countSubscriptions(db, { activeOnly: true })).toBe(1);
  });
});

describe('updateSubscription photo cleanup', () => {
  beforeEach(() => {
    mockSubUuidCounter = 0;
    mockFileDelete.mockClear();
  });

  it('deletes the previous local file when photo_path changes', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-old.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    updateSubscription(
      id,
      { ...SAMPLE, photoPath: 'file:///doc/sub-new.jpg' },
      db,
      new Date('2026-08-02T10:00:00Z'),
    );
    expect(mockFileDelete).toHaveBeenCalledWith('file:///doc/sub-old.jpg');
    expect(mockFileDelete).not.toHaveBeenCalledWith('file:///doc/sub-new.jpg');
  });

  it('does not delete when photo_path is unchanged', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-same.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    updateSubscription(
      id,
      { ...SAMPLE, name: 'renamed', photoPath: 'file:///doc/sub-same.jpg' },
      db,
      new Date('2026-08-02T10:00:00Z'),
    );
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('deletes the previous local file when new photo_path is null (removed)', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-removed.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    updateSubscription(
      id,
      { ...SAMPLE, photoPath: null },
      db,
      new Date('2026-08-02T10:00:00Z'),
    );
    expect(mockFileDelete).toHaveBeenCalledWith('file:///doc/sub-removed.jpg');
  });

  it('does not delete when previous photo_path is http(s)', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'https://example.com/x.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    updateSubscription(
      id,
      { ...SAMPLE, photoPath: 'file:///doc/sub-new.jpg' },
      db,
      new Date('2026-08-02T10:00:00Z'),
    );
    expect(mockFileDelete).not.toHaveBeenCalled();
  });
});

describe('deleteSubscription photo cleanup', () => {
  beforeEach(() => {
    mockSubUuidCounter = 0;
    mockFileDelete.mockClear();
  });

  it('deletes the local file when photo_path is a file:// uri', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-abcd.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    deleteSubscription(id, db);
    expect(mockFileDelete).toHaveBeenCalledWith('file:///doc/sub-abcd.jpg');
  });

  it('does not touch the filesystem for null photo_path', () => {
    const db = freshDb();
    const id = insertSubscription(SAMPLE, db, new Date('2026-08-01T10:00:00Z'));
    deleteSubscription(id, db);
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('does not touch the filesystem for http(s) photo_path (seed data)', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'https://example.com/receipt.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    deleteSubscription(id, db);
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('swallows delete errors so the row is still removed', () => {
    const db = freshDb();
    const id = insertSubscription(
      { ...SAMPLE, photoPath: 'file:///doc/sub-missing.jpg' },
      db,
      new Date('2026-08-01T10:00:00Z'),
    );
    mockFileDelete.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    expect(() => deleteSubscription(id, db)).not.toThrow();
    expect(db.getFirstSync('SELECT id FROM subscriptions WHERE id = ?', id)).toBeNull();
  });
});
