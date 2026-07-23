import * as Notifications from 'expo-notifications';
import { i18n } from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
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
      title: i18n.t('notif.reminder_title'),
      body: i18n.t('notif.reminder_body'),
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
      title: level === 100 ? i18n.t('notif.budget_100_title') : i18n.t('notif.budget_80_title'),
      body: level === 100 ? i18n.t('notif.budget_100_body') : i18n.t('notif.budget_80_body'),
    },
    trigger: null,
  });
}
