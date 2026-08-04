import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Donut } from '@/components/sl/donut';
import { Icon } from '@/components/sl/icons';
import { MonthPickerSheet, type MonthPickerSheetHandle } from '@/components/sl/month-picker-sheet';
import { SummaryCell } from '@/components/sl/summary-cell';
import { Text } from '@/components/sl/text';
import { TransactionRow } from '@/components/sl/transaction-row';
import { Money, Radius, useColors, W } from '@/constants/tokens';
import { availableMonthsDesc, filterByMonth } from '@/lib/comparison';
import { dayLabel, formatCompact, formatMoney, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { categoryBreakdown, groupByDay, summarize } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';
import { toCategoryObj } from '@/lib/user-categories';

export default function HistoryMonthsScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { transactions, userCategories } = useTransactions();
  const { settings } = useSettings();
  const primary = settings.primaryCurrency;
  const categoryExtras = userCategories.map(toCategoryObj);
  const pickerRef = useRef<MonthPickerSheetHandle>(null);

  const months = useMemo(() => availableMonthsDesc(transactions), [transactions]);
  const [selectedMonth, setSelectedMonth] = useState<string>(months[0] ?? '');

  useEffect(() => {
    if (!months.length) { setSelectedMonth(''); return; }
    if (!months.includes(selectedMonth)) setSelectedMonth(months[0]);
  }, [months, selectedMonth]);

  const monthTxns = useMemo(
    () => (selectedMonth ? filterByMonth(transactions, selectedMonth) : []),
    [transactions, selectedMonth],
  );
  const groups = useMemo(() => groupByDay(monthTxns), [monthTxns]);
  const sum = useMemo(() => summarize(monthTxns), [monthTxns]);
  const breakdown = useMemo(() => categoryBreakdown(monthTxns).slice(0, 5), [monthTxns]);
  const todayKey = toDateKey(new Date());

  const monthLabel = selectedMonth
    ? t('format.month_abbrev', { month: Number(selectedMonth.slice(5, 7)) }) + ' ' + selectedMonth.slice(0, 4)
    : t('history_months.picker_trigger_placeholder');

  if (!months.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <Header title={t('history_months.header')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: c.textSecondary, fontWeight: W.semibold, textAlign: 'center' }}>
            {t('history_months.empty_no_history')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <Header title={t('history_months.header')} />

      <View style={{ paddingHorizontal: 20 }}>
        <Pressable
          onPress={() => pickerRef.current?.present()}
          style={[styles.pickerTrigger, { backgroundColor: c.segment }]}
        >
          <Text style={{ flex: 1, color: c.text, fontWeight: W.extrabold, fontSize: 15 }}>
            {monthLabel}
          </Text>
          <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 12 }}>▼</Text>
        </Pressable>

        <View style={[styles.summary, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <SummaryCell label={t('history.income_label')} value={'+' + formatCompact(sum.income, primary)} color={Money.income} />
          <View style={[styles.vline, { backgroundColor: c.cardBorder }]} />
          <SummaryCell label={t('history.expense_label')} value={'−' + formatCompact(sum.expense, primary)} color={Money.expense} />
          <View style={[styles.vline, { backgroundColor: c.cardBorder }]} />
          <SummaryCell
            label={t('history.net_label')}
            value={(sum.net >= 0 ? '+' : '−') + formatCompact(sum.net, primary)}
            color={c.text}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        {breakdown.length > 0 ? (
          <View style={[styles.donutCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <Donut
              slices={breakdown.map((b) => ({ color: b.color, pct: b.pct }))}
              centerTop={t('history.expense_label')}
              centerMain={formatCompact(sum.expense, primary)}
            />
            <View style={{ flex: 1, gap: 7 }}>
              {breakdown.map((b) => (
                <View key={b.id} style={styles.legendRow}>
                  <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: b.color }} />
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: W.semibold, color: c.text }}>{b.label}</Text>
                  <Text style={{ fontSize: 12, fontWeight: W.extrabold, color: c.text }}>{Math.round(b.pct)}%</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {groups.length === 0 ? (
          <Text style={{ marginTop: 40, textAlign: 'center', color: c.textSecondary, fontWeight: W.medium }}>
            {t('history_months.empty_this_month')}
          </Text>
        ) : null}
        {groups.map((g) => (
          <View key={g.key} style={{ marginBottom: 18 }}>
            <View style={styles.groupHeader}>
              <Text style={{ fontSize: 13, fontWeight: W.extrabold, color: c.text }}>{dayLabel(g.key, todayKey)}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: W.bold, color: c.textSecondary }}>
                {(g.net >= 0 ? '+' : '−') + formatMoney(g.net, primary)}
              </Text>
            </View>
            <View style={{ gap: 11 }}>
              {g.items.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  txn={txn}
                  tileSize={48}
                  extras={categoryExtras}
                  onPress={() => router.push(`/transaction/${txn.id}`)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <MonthPickerSheet
        ref={pickerRef}
        selectedMonth={selectedMonth}
        onSelect={setSelectedMonth}
      />
    </View>
  );
}

function Header({ title }: { title: string }) {
  const c = useColors();
  const { t } = useT();
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={styles.header}>
        <Text style={{ fontSize: 22, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>{title}</Text>
        <Pressable
          onPress={goBack}
          hitSlop={8}
          accessibilityLabel={t('home.close_a11y')}
          style={[styles.iconBtn, { backgroundColor: c.segment }]}>
          <Icon name="close" size={18} color={c.text} />
        </Pressable>
      </View>
    </View>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pickerTrigger: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: Radius.chip, marginTop: 12,
  },
  summary: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  vline: { width: 1 },
  donutCard: {
    marginTop: 14, borderRadius: Radius.card, borderWidth: 1,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 18,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: 10,
  },
});
