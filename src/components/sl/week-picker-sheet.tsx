import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Radius, useColors, W } from '@/constants/tokens';
import { availableWeeksDesc, filterByWeek, weekRangeLabel, weekStartOf } from '@/lib/comparison';
import { formatCompact, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useTransactions } from '@/lib/transactions-context';

export interface WeekPickerSheetHandle {
  present: () => void;
  dismiss: () => void;
}

export interface WeekPickerSheetProps {
  selectedWeek: string;
  onSelect: (weekStart: string) => void;
  includeCurrentWeek?: boolean;
}

export const WeekPickerSheet = forwardRef<WeekPickerSheetHandle, WeekPickerSheetProps>(
  function WeekPickerSheet({ selectedWeek, onSelect, includeCurrentWeek = false }, ref) {
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

    const weeks = useMemo(() => {
      const now = new Date();
      const list = availableWeeksDesc(transactions, now);
      if (includeCurrentWeek) {
        const curWeek = weekStartOf(toDateKey(now));
        const curHasData = transactions.some((tx) => weekStartOf(tx.date) === curWeek);
        if (curHasData && !list.includes(curWeek)) list.unshift(curWeek);
      }
      return list;
    }, [transactions, includeCurrentWeek]);

    const spendByWeek = useMemo(() => {
      const map = new Map<string, number>();
      for (const w of weeks) {
        const total = filterByWeek(transactions, w)
          .filter((tx) => !tx.isIncome)
          .reduce((s, tx) => s + tx.amount, 0);
        map.set(w, total);
      }
      return map;
    }, [weeks, transactions]);

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
          {weeks.map((w) => {
            const active = w === selectedWeek;
            const { from, to } = weekRangeLabel(w);
            const label = t('compare.week_label_range', { from, to });
            const spend = spendByWeek.get(w) ?? 0;
            return (
              <Pressable
                key={w}
                onPress={() => { onSelect(w); sheet.current?.dismiss(); }}
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
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  header: { padding: 20, paddingBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.card, borderWidth: 1,
    marginHorizontal: 12, marginBottom: 4,
  },
});
