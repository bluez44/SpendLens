import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { decideBudgetAlert } from './budget-alert';
import { signedMoney, toDateKey } from './format';
import { convert } from './fx';
import { useT } from './i18n';
import { fireBudgetAlert } from './notifications';
import { useSettings } from './settings-context';
import { useToast } from './toast-context';
import type { NewTxn } from './transactions';
import { useTransactions } from './transactions-context';

const UNDONE_TOAST_MS = 2000;

function successHaptic(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // haptics unavailable — ignore
  }
}

/** Saves transactions with haptic feedback, an Undo toast and budget alerts. */
export function useSaveTransaction() {
  const { t } = useT();
  const { add, update, remove, transactions } = useTransactions();
  const { settings, rates, update: updateSettings } = useSettings();
  const toast = useToast();

  const saveNew = useCallback(async (payload: NewTxn): Promise<number | null> => {
    let id: number;
    try {
      id = add(payload);
    } catch (err) {
      console.warn('Failed to save transaction', err);
      Alert.alert(t('common.save_failed_title'), t('common.save_failed_body'));
      return null;
    }

    successHaptic();

    const primary = settings.primaryCurrency;
    const primaryAmount = convert(payload.originalAmount, payload.originalCurrency, primary, rates);
    toast.show({
      message: t('toast.saved', { amount: signedMoney(primaryAmount, primary, payload.isIncome) }),
      actionLabel: t('toast.undo'),
      onAction: () => {
        try {
          remove(id);
        } catch (err) {
          console.warn('Failed to undo transaction', err);
        }
        toast.show({ message: t('toast.undone'), durationMs: UNDONE_TOAST_MS });
      },
    });

    if (!payload.isIncome) {
      const budget = settings.monthlyBudget;
      if (budget > 0 && settings.budgetAlertsEnabled) {
        const currentMonth = toDateKey(new Date()).slice(0, 7);
        const spent = transactions
          .filter((tx) => !tx.isIncome && tx.date.slice(0, 7) === currentMonth)
          .reduce((s, tx) => s + tx.amount, 0) + primaryAmount;
        const fireLevel = decideBudgetAlert({
          spent,
          budget,
          notifiedMonth: settings.budgetNotifiedMonth,
          currentMonth,
        });
        if (fireLevel) {
          updateSettings('budgetNotifiedMonth', `${currentMonth}:${fireLevel}`);
          try {
            await fireBudgetAlert(fireLevel);
          } catch (err) {
            console.warn('Failed to fire budget alert', err);
          }
        }
      }
    }

    return id;
  }, [add, remove, transactions, settings, rates, updateSettings, toast, t]);

  const saveEdit = useCallback(async (id: number, payload: NewTxn): Promise<boolean> => {
    try {
      update(id, payload);
    } catch (err) {
      console.warn('Failed to save transaction', err);
      Alert.alert(t('common.save_failed_title'), t('common.save_failed_body'));
      return false;
    }
    successHaptic();
    return true;
  }, [update, t]);

  return { saveNew, saveEdit };
}
