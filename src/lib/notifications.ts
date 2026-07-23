import * as Notifications from 'expo-notifications';

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
