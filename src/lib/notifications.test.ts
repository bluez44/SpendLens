jest.mock('expo-notifications', () => ({
  __esModule: true,
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));

import * as Notifications from 'expo-notifications';

import {
  cancelDailyReminder,
  REMINDER_ID,
  requestPermission,
  scheduleDailyReminder,
} from './notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requestPermission', () => {
  it('returns true when granted', async () => {
    (mocked.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await requestPermission()).toBe(true);
  });

  it('returns false when denied', async () => {
    (mocked.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await requestPermission()).toBe(false);
  });
});

describe('scheduleDailyReminder', () => {
  it('cancels the previous schedule then schedules a DAILY trigger with the fixed id', async () => {
    await scheduleDailyReminder(21, 30);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(REMINDER_ID);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: REMINDER_ID,
        trigger: expect.objectContaining({ type: 'daily', hour: 21, minute: 30 }),
      }),
    );
  });
});

describe('cancelDailyReminder', () => {
  it('cancels by the fixed identifier', async () => {
    await cancelDailyReminder();
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(REMINDER_ID);
  });
});
