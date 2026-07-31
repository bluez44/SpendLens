import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { db } from './db';
import { useSettings } from './settings-context';
import { useTransactions } from './transactions-context';
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
  type Subscription,
} from './subscriptions';
import { catchUpSubscriptions } from './subscription-scheduler';
import {
  cancelNotifications, rescheduleNotifications,
} from './subscription-notifications';

interface SubscriptionsContextValue {
  subscriptions: Subscription[];
  ready: boolean;
  add: (input: NewSubscription) => Promise<number>;
  update: (id: number, input: NewSubscription) => Promise<void>;
  remove: (id: number) => Promise<void>;
  pause: (id: number) => Promise<void>;
  resume: (id: number) => Promise<void>;
  refresh: () => void;
  count: (opts?: { activeOnly?: boolean }) => number;
  findByUuid: (uuid: string) => Subscription | null;
}

const SubscriptionsContext = createContext<SubscriptionsContextValue | null>(null);

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
  const { settings, rates } = useSettings();
  const { refresh: refreshTxns } = useTransactions();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setSubscriptions(listSubscriptions(db));
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
  }, [refresh]);

  const runCatchUp = useCallback(async () => {
    const created = catchUpSubscriptions(db, settings.primaryCurrency, rates, new Date());
    if (created > 0) {
      refreshTxns();
      refresh();
      for (const sub of listSubscriptions(db, { activeOnly: true })) {
        try {
          await rescheduleNotifications(sub);
        } catch {
          // silent — best effort
        }
      }
    }
  }, [settings.primaryCurrency, rates, refreshTxns, refresh]);

  useEffect(() => {
    runCatchUp();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') runCatchUp();
    });
    return () => sub.remove();
  }, [runCatchUp]);

  useEffect(() => {
    (async () => {
      for (const sub of listSubscriptions(db, { activeOnly: true })) {
        try {
          await rescheduleNotifications(sub);
        } catch {
          // silent
        }
      }
    })();
  }, []);

  const add = useCallback(async (input: NewSubscription) => {
    const id = insertSubscription(input, db);
    refresh();
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) await rescheduleNotifications(sub);
    return id;
  }, [refresh]);

  const update = useCallback(async (id: number, input: NewSubscription) => {
    updateSubscription(id, input, db);
    refresh();
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) {
      await cancelNotifications(sub.uuid);
      if (!sub.paused) await rescheduleNotifications(sub);
    }
  }, [refresh]);

  const remove = useCallback(async (id: number) => {
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) await cancelNotifications(sub.uuid);
    deleteSubscription(id, db);
    refresh();
  }, [refresh]);

  const pause = useCallback(async (id: number) => {
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) await cancelNotifications(sub.uuid);
    pauseSubscription(id, db);
    refresh();
  }, [refresh]);

  const resume = useCallback(async (id: number) => {
    resumeSubscription(id, db);
    refresh();
    const sub = listSubscriptions(db).find((s) => s.id === id);
    if (sub) await rescheduleNotifications(sub);
  }, [refresh]);

  const count = useCallback((opts?: { activeOnly?: boolean }) => {
    return countSubscriptions(db, opts);
  }, [subscriptions]);

  const findByUuid = useCallback((uuid: string) => {
    return getSubscriptionByUuid(uuid, db);
  }, []);

  const value = useMemo<SubscriptionsContextValue>(
    () => ({ subscriptions, ready, add, update, remove, pause, resume, refresh, count, findByUuid }),
    [subscriptions, ready, add, update, remove, pause, resume, refresh, count, findByUuid],
  );

  return <SubscriptionsContext.Provider value={value}>{children}</SubscriptionsContext.Provider>;
}

export function useSubscriptions(): SubscriptionsContextValue {
  const ctx = useContext(SubscriptionsContext);
  if (!ctx) throw new Error('useSubscriptions must be used inside <SubscriptionsProvider>');
  return ctx;
}
