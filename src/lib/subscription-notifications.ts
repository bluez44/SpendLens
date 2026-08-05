import * as Notifications from 'expo-notifications';
import { formatMoney } from './format';
import { i18n } from './i18n';
import type { Subscription } from './subscriptions';

type Offset = 7 | 3 | 1;

export function notificationId(uuid: string, offset: Offset): string {
  return `sub-${uuid}-${offset}`;
}

function fireAtNoon9(dueDateStr: string, daysBefore: number): Date {
  const due = new Date(`${dueDateStr}T00:00:00`);
  const fire = new Date(due.getFullYear(), due.getMonth(), due.getDate() - daysBefore, 9, 0, 0);
  return fire;
}

export function computeFireDates(
  sub: Subscription, now: Date = new Date(),
): { offset: Offset; fireAt: Date }[] {
  const out: { offset: Offset; fireAt: Date }[] = [];
  const flags: Array<[Offset, boolean]> = [
    [7, sub.notify7], [3, sub.notify3], [1, sub.notify1],
  ];
  for (const [offset, on] of flags) {
    if (!on) continue;
    const fireAt = fireAtNoon9(sub.nextDueDate, offset);
    if (fireAt.getTime() > now.getTime()) {
      out.push({ offset, fireAt });
    }
  }
  return out;
}

export async function cancelNotifications(uuid: string): Promise<void> {
  const prefix = `sub-${uuid}-`;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of all) {
    if (notif.identifier?.startsWith(prefix)) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

export async function rescheduleNotifications(
  sub: Subscription, now: Date = new Date(),
): Promise<void> {
  await cancelNotifications(sub.uuid);
  const fires = computeFireDates(sub, now);
  for (const { offset, fireAt } of fires) {
    const isOneDay = offset === 1;
    const key = isOneDay ? 'sub.notif_body_one_day' : 'sub.notif_body';
    const body = i18n.t(key, {
      name: sub.name,
      amount: formatMoney(sub.originalAmount, sub.originalCurrency),
      days: offset,
    });
    await Notifications.scheduleNotificationAsync({
      identifier: notificationId(sub.uuid, offset),
      content: {
        title: sub.name,
        body,
        data: { route: '/subscriptions' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  }
}
