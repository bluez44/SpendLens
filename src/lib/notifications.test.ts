import { i18n } from './i18n';

jest.mock('expo-notifications', () => ({
  __esModule: true,
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly' },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

import * as Notifications from 'expo-notifications';

import {
  cancelDailyReminder,
  cancelWeeklyRecapReminder,
  fireBudgetAlert,
  REMINDER_ID,
  requestPermission,
  scheduleDailyReminder,
  scheduleWeeklyRecapReminder,
  WEEKLY_RECAP_ID,
} from './notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeAll(async () => { await i18n.changeLanguage('vi'); });

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
        content: expect.objectContaining({
          title: 'SpendLens',
          body: 'Ghi lại chi tiêu hôm nay?',
        }),
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
  it('is invoked once at module load with banner and list true', () => {
    expect(mocked.setNotificationHandler).toHaveBeenCalledTimes(1);
    const arg = (mocked.setNotificationHandler as jest.Mock).mock.calls[0][0];
    return expect(arg.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
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

describe('scheduleWeeklyRecapReminder', () => {
  it('cancels the existing weekly reminder before scheduling', async () => {
    (mocked.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    await scheduleWeeklyRecapReminder(20, 0);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(WEEKLY_RECAP_ID);
  });

  it('schedules with weekly Sunday 20:00 trigger and route data', async () => {
    (mocked.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    await scheduleWeeklyRecapReminder(20, 0);
    const call = (mocked.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.identifier).toBe(WEEKLY_RECAP_ID);
    expect(call.trigger.type).toBe('weekly');
    expect(call.trigger.hour).toBe(20);
    expect(call.trigger.minute).toBe(0);
    expect(call.trigger.weekday).toBe(1); // Sunday per Expo convention
    expect(call.content.data).toEqual({ route: '/share?type=recap' });
  });

  it('uses defaults 20:00 when args omitted', async () => {
    (mocked.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    await scheduleWeeklyRecapReminder();
    const call = (mocked.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.hour).toBe(20);
    expect(call.trigger.minute).toBe(0);
  });
});

describe('cancelWeeklyRecapReminder', () => {
  it('cancels by WEEKLY_RECAP_ID', async () => {
    await cancelWeeklyRecapReminder();
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(WEEKLY_RECAP_ID);
  });
});
