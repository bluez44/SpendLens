import { useMemo } from 'react';

import { useSettings } from './settings-context';
import { assembleRecapData, assembleStreakData, type CardType, type ShareData } from './share-cards';
import { useTransactions } from './transactions-context';
import { toCategoryObj } from './user-categories';

export function useShareCard(type: CardType): { shareData: ShareData } {
  const { transactions, userCategories } = useTransactions();
  const { settings } = useSettings();

  const shareData = useMemo<ShareData>(() => {
    if (type === 'recap') {
      const registry = userCategories.map(toCategoryObj).map((cat) => ({
        id: cat.id, label: cat.label, color: cat.fg,
      }));
      return {
        type: 'recap',
        data: assembleRecapData(transactions, registry, settings.monthlyBudget, settings.primaryCurrency),
      };
    }
    return { type: 'streak', data: assembleStreakData(transactions) };
  }, [type, transactions, userCategories, settings.monthlyBudget, settings.primaryCurrency]);

  return { shareData };
}
