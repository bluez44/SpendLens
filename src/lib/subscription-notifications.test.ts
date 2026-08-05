const scheduled: any[] = [];
const canceled: string[] = [];

jest.mock('expo-notifications', () => ({
  __esModule: true,
  scheduleNotificationAsync: jest.fn(async (input: any) => {
    scheduled.push(input);
    return input.identifier ?? 'auto-id';
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    canceled.push(id);
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () =>
    scheduled.map((s) => ({ identifier: s.identifier ?? 'unknown', content: s.content, trigger: s.trigger })),
  ),
  SchedulableTriggerInputTypes: { DATE: 'DATE', DAILY: 'DAILY' },
  setNotificationHandler: jest.fn(),
}));

import {
  computeFireDates,
  cancelNotifications,
  notificationId,
  rescheduleNotifications,
} from './subscription-notifications';
import type { Subscription } from './subscriptions';

const BASE_SUB: Subscription = {
  id: 1, uuid: 'abc', name: 'Claude Pro',
  category: 'other', originalAmount: 20, originalCurrency: 'USD',
  anchorDay: 15, nextDueDate: '2026-08-15',
  photoPath: null,
  notify7: true, notify3: true, notify1: true,
  paused: false, createdAt: 0, updatedAt: 0,
};

beforeEach(() => { scheduled.length = 0; canceled.length = 0; });

describe('notificationId', () => {
  it('formats as sub-${uuid}-${offset}', () => {
    expect(notificationId('abc', 7)).toBe('sub-abc-7');
    expect(notificationId('abc', 3)).toBe('sub-abc-3');
    expect(notificationId('abc', 1)).toBe('sub-abc-1');
  });
});

describe('computeFireDates', () => {
  it('all flags on, plenty of lead time: 3 fire dates at 09:00', () => {
    const now = new Date('2026-08-01T10:00:00');
    const fires = computeFireDates(BASE_SUB, now);
    expect(fires).toHaveLength(3);
    expect(fires.map((f) => f.offset).sort()).toEqual([1, 3, 7]);
    for (const f of fires) {
      expect(f.fireAt.getHours()).toBe(9);
      expect(f.fireAt.getMinutes()).toBe(0);
    }
    expect(fires.find((f) => f.offset === 7)?.fireAt.getDate()).toBe(8);
    expect(fires.find((f) => f.offset === 3)?.fireAt.getDate()).toBe(12);
    expect(fires.find((f) => f.offset === 1)?.fireAt.getDate()).toBe(14);
  });

  it('past fire dates are filtered', () => {
    const now = new Date('2026-08-13T10:00:00');
    const fires = computeFireDates(BASE_SUB, now);
    expect(fires.map((f) => f.offset).sort()).toEqual([1]);
  });

  it('flags off are omitted', () => {
    const sub = { ...BASE_SUB, notify7: false, notify3: true, notify1: false };
    const now = new Date('2026-08-01T10:00:00');
    const fires = computeFireDates(sub, now);
    expect(fires.map((f) => f.offset)).toEqual([3]);
  });
});

describe('rescheduleNotifications', () => {
  it('cancels all sub-${uuid}-* then schedules per-flag', async () => {
    scheduled.push({ identifier: 'sub-abc-7', content: {}, trigger: {} });
    scheduled.push({ identifier: 'sub-abc-3', content: {}, trigger: {} });
    scheduled.push({ identifier: 'other-xyz-7', content: {}, trigger: {} });
    scheduled.length = 0;
    (require('expo-notifications').getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'sub-abc-7' }, { identifier: 'sub-abc-3' }, { identifier: 'other-xyz-7' },
    ]);
    await rescheduleNotifications(BASE_SUB, new Date('2026-08-01T10:00:00'));
    expect(canceled).toEqual(expect.arrayContaining(['sub-abc-7', 'sub-abc-3']));
    expect(canceled).not.toContain('other-xyz-7');
    expect(scheduled.map((s) => s.identifier).sort()).toEqual(['sub-abc-1', 'sub-abc-3', 'sub-abc-7']);
  });
});

describe('cancelNotifications', () => {
  it('cancels only the sub-${uuid}-* identifiers', async () => {
    (require('expo-notifications').getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'sub-abc-7' }, { identifier: 'sub-abc-3' }, { identifier: 'sub-abc-1' },
      { identifier: 'other-xyz-7' },
    ]);
    await cancelNotifications('abc');
    expect(canceled.sort()).toEqual(['sub-abc-1', 'sub-abc-3', 'sub-abc-7']);
    expect(canceled).not.toContain('other-xyz-7');
  });
});
