import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChart } from '@/components/sl/bar-chart';
import { BudgetBar } from '@/components/sl/budget-bar';
import { Donut } from '@/components/sl/donut';
import { GradientFill } from '@/components/sl/gradient';
import { Icon } from '@/components/sl/icons';
import { Segmented } from '@/components/sl/segmented';
import { Money, Radius, useColors, W } from '@/constants/tokens';
import { compactTr, formatVND, monthKey, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import {
  categoryBreakdown,
  filterRange,
  monthlyExpenseSeries,
  summarize,
  type Range,
} from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';
import { useSettings } from '@/lib/settings-context';

const RANGES: Range[] = ['day', 'week', 'month'];

export default function HomeScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { transactions } = useTransactions();
  const { settings } = useSettings();
  const [rangeIndex, setRangeIndex] = useState(2);
  const range = RANGES[rangeIndex];
  const isDark = c.scheme === 'dark';

  const currentMonthKey = monthKey(toDateKey(new Date()));
  const spentThisMonth = transactions
    .filter((tx) => !tx.isIncome && monthKey(tx.date) === currentMonthKey)
    .reduce((sum, tx) => sum + tx.amount, 0);

  const ranged = useMemo(() => filterRange(transactions, range), [transactions, range]);
  const sum = useMemo(() => summarize(ranged), [ranged]);
  const bars = useMemo(() => monthlyExpenseSeries(transactions), [transactions]);
  const breakdown = useMemo(() => categoryBreakdown(ranged).slice(0, 5), [ranged]);

  const incomeColor = isDark ? '#fff' : Money.income;
  const expenseColor = isDark ? '#fff' : Money.expenseOnDark;

  const rangeBalanceLabel = range === 'day'
    ? t('home.balance_label_today')
    : range === 'week'
      ? t('home.balance_label_week')
      : t('home.balance_label_month');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 28 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={{ fontSize: 22, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>{t('home.header')}</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={8}
              accessibilityLabel={t('home.settings_a11y')}
              style={[styles.iconBtn, { backgroundColor: c.segment }]}>
              <Icon name="settings" size={18} color={c.text} />
            </Pressable>
            <Pressable
              onPress={goBack}
              hitSlop={8}
              accessibilityLabel={t('home.close_a11y')}
              style={[styles.iconBtn, { backgroundColor: c.segment }]}>
              <Icon name="close" size={18} color={c.text} />
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <Segmented
            options={[t('home.range_day'), t('home.range_week'), t('home.range_month')]}
            value={rangeIndex}
            onChange={setRangeIndex}
          />
        </View>

        {/* Balance card */}
        <View style={styles.summaryCard}>
          <GradientFill colors={c.summaryCard} />
          <Text style={{ fontSize: 12.5, fontWeight: W.semibold, color: 'rgba(255,255,255,0.7)' }}>
            {rangeBalanceLabel}
          </Text>
          <Text style={{ fontSize: 34, fontWeight: W.extrabold, color: '#fff', letterSpacing: -0.5, marginTop: 2 }}>
            {(sum.net >= 0 ? '+' : '−') + formatVND(sum.net)}
          </Text>
          <View style={styles.summaryStats}>
            <View>
              <Text style={styles.summaryLabel}>{t('home.income_label')}</Text>
              <Text style={[styles.summaryValue, { color: incomeColor }]}>{formatVND(sum.income)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <Text style={styles.summaryLabel}>{t('home.expense_label')}</Text>
              <Text style={[styles.summaryValue, { color: expenseColor }]}>{formatVND(sum.expense)}</Text>
            </View>
          </View>
        </View>

        {/* Budget bar */}
        <BudgetBar
          spent={spentThisMonth}
          budget={settings.monthlyBudget}
          onSetBudget={() => router.push('/settings')}
        />

        {/* Monthly bars */}
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={{ fontSize: 13.5, fontWeight: W.extrabold, color: c.text }}>{t('home.monthly_chart_title')}</Text>
          <BarChart data={bars} />
        </View>

        {/* Category donut */}
        {breakdown.length > 0 ? (
          <View style={[styles.card, styles.donutCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <Donut
              slices={breakdown.map((b) => ({ color: b.color, pct: b.pct }))}
              centerTop={t('home.expense_label')}
              centerMain={compactTr(sum.expense)}
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
      </ScrollView>
    </View>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryCard: {
    marginTop: 16,
    borderRadius: Radius.cardLg,
    padding: 20,
    overflow: 'hidden',
  },
  summaryStats: { flexDirection: 'row', gap: 22, marginTop: 16 },
  summaryLabel: { fontSize: 11.5, fontWeight: W.semibold, color: 'rgba(255,255,255,0.6)' },
  summaryValue: { fontSize: 16, fontWeight: W.extrabold, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  card: {
    marginTop: 14,
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: 16,
  },
  donutCard: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
