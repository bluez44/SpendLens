import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Radius, useColors, W } from '@/constants/tokens';
import { availableMonthsDesc, filterByMonth, groupMonthsByYear } from '@/lib/comparison';
import { formatCompact, monthKey, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useTransactions } from '@/lib/transactions-context';

export interface MonthPickerSheetHandle {
  present: () => void;
  dismiss: () => void;
}

export interface MonthPickerSheetProps {
  selectedMonth: string;
  onSelect: (monthKey: string) => void;
  includeCurrentMonth?: boolean;
}

export const MonthPickerSheet = forwardRef<MonthPickerSheetHandle, MonthPickerSheetProps>(
  function MonthPickerSheet({ selectedMonth, onSelect, includeCurrentMonth = false }, ref) {
    const { t } = useT();
    const c = useColors();
    const { transactions } = useTransactions();
    const { settings } = useSettings();
    const sheet = useRef<BottomSheetModal>(null);

    useImperativeHandle(ref, () => ({
      present: () => sheet.current?.present(),
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const groups = useMemo(() => {
      const now = new Date();
      const months = availableMonthsDesc(transactions, now);
      if (includeCurrentMonth) {
        const curKey = monthKey(toDateKey(now));
        const curHasData = transactions.some((tx) => monthKey(tx.date) === curKey);
        if (curHasData && !months.includes(curKey)) months.unshift(curKey);
      }
      return groupMonthsByYear(months);
    }, [transactions, includeCurrentMonth]);

    const spendByMonth = useMemo(() => {
      const map = new Map<string, number>();
      for (const g of groups) {
        for (const m of g.months) {
          const total = filterByMonth(transactions, m)
            .filter((tx) => !tx.isIncome)
            .reduce((s, tx) => s + tx.amount, 0);
          map.set(m, total);
        }
      }
      return map;
    }, [groups, transactions]);

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['70%']}
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <View style={styles.header}>
          <Text style={{ fontWeight: W.extrabold, color: c.text, fontSize: 18 }}>
            {t('history_months.picker_title')}
          </Text>
        </View>
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {groups.map((g) => (
            <View key={g.year}>
              <Text style={[styles.yearHeader, { color: c.textSecondary }]}>{g.year}</Text>
              {g.months.map((m) => {
                const active = m === selectedMonth;
                const monthNum = Number(m.slice(5, 7));
                const label = t('format.month_abbrev', { month: monthNum }) + ` ${g.year}`;
                const spend = spendByMonth.get(m) ?? 0;
                return (
                  <Pressable
                    key={m}
                    onPress={() => { onSelect(m); sheet.current?.dismiss(); }}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: active ? c.chipBg : 'transparent',
                        borderColor: active ? AccentGradient[1] : 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={{ flex: 1, color: c.text, fontWeight: active ? W.extrabold : W.medium, fontSize: 15 }}>
                      {label}
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: W.semibold }}>
                      {t('history_months.picker_row_spend', { amount: formatCompact(spend, settings.primaryCurrency) })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  header: { padding: 20, paddingBottom: 8 },
  yearHeader: {
    paddingHorizontal: 20, paddingVertical: 8, fontSize: 12, fontWeight: '700',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.card, borderWidth: 1,
    marginHorizontal: 12, marginBottom: 4,
  },
});
