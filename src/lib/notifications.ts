import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const REMINDER_ID = 'spendlens-daily-reminder';

export async function requestPermission(): Promise<boolean> {
  const result = await Notifications.requestPermissionsAsync();
  return result.status === 'granted';
}

export async function scheduleDailyReminder(hh: number, mm: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'SpendLens',
      body: 'Ghi lại chi tiêu hôm nay?',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hh,
      minute: mm,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
}

export async function fireBudgetAlert(level: 80 | 100): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: level === 100 ? 'Vượt ngân sách!' : 'Sắp vượt ngân sách',
      body: level === 100
        ? 'Bạn đã chi vượt 100% ngân sách tháng này.'
        : 'Bạn đã chi hơn 80% ngân sách tháng này.',
    },
    trigger: null,
  });
}
