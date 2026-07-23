jest.mock('expo-notifications', () => ({
  __esModule: true,
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

import * as Notifications from 'expo-notifications';

import {
  cancelDailyReminder,
  fireBudgetAlert,
  REMINDER_ID,
  requestPermission,
  scheduleDailyReminder,
} from './notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(() => {
  // Clear all mocks EXCEPT setNotificationHandler, which should only be called once at module load
  (mocked.requestPermissionsAsync as jest.Mock).mockClear();
  (mocked.getPermissionsAsync as jest.Mock).mockClear();
  (mocked.scheduleNotificationAsync as jest.Mock).mockClear();
  (mocked.cancelScheduledNotificationAsync as jest.Mock).mockClear();
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

describe('setNotificationHandler', () => {
  it('is invoked once at module load with shouldShowAlert true', () => {
    expect(mocked.setNotificationHandler).toHaveBeenCalledTimes(1);
    const arg = (mocked.setNotificationHandler as jest.Mock).mock.calls[0][0];
    return expect(arg.handleNotification()).resolves.toEqual({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});

describe('fireBudgetAlert', () => {
  it('at level 80 sends the pre-warning title and body immediately', async () => {
    await fireBudgetAlert(80);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'Sắp vượt ngân sách',
          body: 'Bạn đã chi hơn 80% ngân sách tháng này.',
        }),
        trigger: null,
      }),
    );
  });

  it('at level 100 sends the over-budget title and body immediately', async () => {
    await fireBudgetAlert(100);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'Vượt ngân sách!',
          body: 'Bạn đã chi vượt 100% ngân sách tháng này.',
        }),
        trigger: null,
      }),
    );
  });
});
