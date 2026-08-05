import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChartOverlay } from '@/components/sl/bar-chart-overlay';
import { GradientFill } from '@/components/sl/gradient';
import { Icon } from '@/components/sl/icons';
import { MonthPickerSheet, type MonthPickerSheetHandle } from '@/components/sl/month-picker-sheet';
import {
  PeriodPickerSheet, type PeriodPickerSheetHandle, type PresetKey,
} from '@/components/sl/period-picker-sheet';
import { Segmented } from '@/components/sl/segmented';
import { Text } from '@/components/sl/text';
import { WeekPickerSheet, type WeekPickerSheetHandle } from '@/components/sl/week-picker-sheet';
import { AccentGradient, Money, Radius, useColors, W } from '@/constants/tokens';
import type { CurrencyCode } from '@/lib/currency';
import {
  availableMonthsDesc, availableWeeksDesc, buildComparison,
  filterByMonth, filterByWeek, weekRangeLabel, weekStartOf,
} from '@/lib/comparison';
import { formatCompact, formatMoney, monthKey, shiftDateKey, shiftMonthKey, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useTransactions } from '@/lib/transactions-context';
import { toCategoryObj } from '@/lib/user-categories';

type CompareType = 'month' | 'week';

export default function CompareScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { transactions, userCategories } = useTransactions();
  const { settings } = useSettings();
  const primary = settings.primaryCurrency;
  const registry = useMemo(
    () => userCategories.map(toCategoryObj).map((cat) => ({ id: cat.id, label: cat.label, color: cat.fg })),
    [userCategories],
  );

  const monthSheetA = useRef<MonthPickerSheetHandle>(null);
  const monthSheetB = useRef<MonthPickerSheetHandle>(null);
  const weekSheetA = useRef<WeekPickerSheetHandle>(null);
  const weekSheetB = useRef<WeekPickerSheetHandle>(null);
  const presetSheet = useRef<PeriodPickerSheetHandle>(null);

  const [typeIndex, setTypeIndex] = useState(0);
  const type: CompareType = typeIndex === 0 ? 'month' : 'week';

  const initialMonthA = useMemo(() => monthKey(toDateKey(new Date())), []);
  const initialMonthB = useMemo(
    () => availableMonthsDesc(transactions)[0] ?? initialMonthA,
    [transactions, initialMonthA],
  );
  const initialWeekA = useMemo(() => weekStartOf(toDateKey(new Date())), []);
  const initialWeekB = useMemo(
    () => availableWeeksDesc(transactions)[0] ?? initialWeekA,
    [transactions, initialWeekA],
  );

  const [monthA, setMonthA] = useState(initialMonthA);
  const [monthB, setMonthB] = useState(initialMonthB);
  const [weekA, setWeekA] = useState(initialWeekA);
  const [weekB, setWeekB] = useState(initialWeekB);
  const [preset, setPreset] = useState<PresetKey>('this_vs_last_month');

  useEffect(() => {
    if (type === 'month') {
      setPreset('this_vs_last_month');
      setMonthA(initialMonthA);
      setMonthB(initialMonthB);
    } else {
      setPreset('this_vs_last_week');
      setWeekA(initialWeekA);
      setWeekB(initialWeekB);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const yearOverYearAvailable = useMemo(() => {
    const months = availableMonthsDesc(transactions);
    if (!months.length) return false;
    const yoy = shiftMonthKey(monthKey(toDateKey(new Date())), -12);
    return months.includes(yoy);
  }, [transactions]);

  useEffect(() => {
    if (preset === 'custom') return;
    const nowMk = monthKey(toDateKey(new Date()));
    if (preset === 'this_vs_last_month') {
      setMonthA(nowMk);
      setMonthB(shiftMonthKey(nowMk, -1));
    } else if (preset === 'last_vs_prev_month') {
      setMonthA(shiftMonthKey(nowMk, -1));
      setMonthB(shiftMonthKey(nowMk, -2));
    } else if (preset === 'year_over_year') {
      setMonthA(nowMk);
      setMonthB(shiftMonthKey(nowMk, -12));
    } else if (preset === 'this_vs_last_week') {
      const cur = weekStartOf(toDateKey(new Date()));
      setWeekA(cur);
      setWeekB(shiftDateKey(cur, -7));
    } else if (preset === 'last_vs_prev_week') {
      const cur = weekStartOf(toDateKey(new Date()));
      setWeekA(shiftDateKey(cur, -7));
      setWeekB(shiftDateKey(cur, -14));
    }
  }, [preset]);

  const txnsA = useMemo(
    () => (type === 'month' ? filterByMonth(transactions, monthA) : filterByWeek(transactions, weekA)),
    [transactions, type, monthA, weekA],
  );
  const txnsB = useMemo(
    () => (type === 'month' ? filterByMonth(transactions, monthB) : filterByWeek(transactions, weekB)),
    [transactions, type, monthB, weekB],
  );
  const comparison = useMemo(
    () => buildComparison(txnsA, txnsB, type, registry, weekA, weekB),
    [txnsA, txnsB, type, registry, weekA, weekB],
  );

  const labelFor = (key: string): string => {
    if (type === 'month') {
      return t('format.month_abbrev', { month: Number(key.slice(5, 7)) }) + '/' + key.slice(0, 4);
    }
    const { from, to } = weekRangeLabel(key);
    return `${from} - ${to}`;
  };

  const swap = () => {
    if (type === 'month') { setMonthA(monthB); setMonthB(monthA); }
    else { setWeekA(weekB); setWeekB(weekA); }
    setPreset('custom');
  };

  const openPickerA = () => {
    setPreset('custom');
    if (type === 'month') monthSheetA.current?.present();
    else weekSheetA.current?.present();
  };
  const openPickerB = () => {
    setPreset('custom');
    if (type === 'month') monthSheetB.current?.present();
    else weekSheetB.current?.present();
  };

  const bothEmpty = txnsA.length === 0 && txnsB.length === 0;
  const chartTitle = type === 'month' ? t('compare.chart_title_month') : t('compare.chart_title_week');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 20 }}>
        <View style={styles.header}>
          <Text style={{ fontSize: 22, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>
            {t('compare.header')}
          </Text>
          <Pressable onPress={goBack} hitSlop={8} accessibilityLabel={t('home.close_a11y')}
            style={[styles.iconBtn, { backgroundColor: c.segment }]}>
            <Icon name="close" size={18} color={c.text} />
          </Pressable>
        </View>

        <View style={{ marginTop: 12 }}>
          <Segmented
            options={[t('compare.type_month'), t('compare.type_week')]}
            value={typeIndex}
            onChange={setTypeIndex}
          />
        </View>

        <View style={styles.periodRow}>
          <Pressable onPress={openPickerA} style={[styles.pill, { backgroundColor: c.segment }]}>
            <Text style={{ flex: 1, color: c.text, fontWeight: W.extrabold, fontSize: 14 }}>
              {labelFor(type === 'month' ? monthA : weekA)}
            </Text>
            <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 11 }}>▼</Text>
          </Pressable>
          <Pressable onPress={swap} hitSlop={8} accessibilityLabel={t('compare.swap_a11y')} style={styles.swapBtn}>
            <Text style={{ color: c.text, fontWeight: W.extrabold, fontSize: 18 }}>⇅</Text>
          </Pressable>
          <Pressable onPress={openPickerB} style={[styles.pill, { backgroundColor: c.segment }]}>
            <Text style={{ flex: 1, color: c.text, fontWeight: W.extrabold, fontSize: 14 }}>
              {labelFor(type === 'month' ? monthB : weekB)}
            </Text>
            <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 11 }}>▼</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => presetSheet.current?.present()}
          style={[styles.presetChip, { backgroundColor: c.segment }]}
        >
          <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 13 }}>
            {t(presetLabelKey(preset))}
          </Text>
          <Text style={{ color: c.text, fontWeight: W.bold, fontSize: 11 }}>▼</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        {bothEmpty ? (
          <Text style={{ marginTop: 40, textAlign: 'center', color: c.textSecondary, fontWeight: W.medium }}>
            {t('compare.empty_both')}
          </Text>
        ) : (
          <>
            <View style={styles.deltaCard}>
              <GradientFill colors={c.summaryCard} />
              <Text style={{ fontSize: 12.5, fontWeight: W.semibold, color: 'rgba(255,255,255,0.7)' }}>
                {t('history.expense_label')}
              </Text>
              <Text style={{ fontSize: 30, fontWeight: W.extrabold, color: '#fff', letterSpacing: -0.5, marginTop: 2 }}>
                {formatMoney(comparison.sumA.expense, primary)}
              </Text>
              <DeltaLine
                pct={comparison.deltaExpensePct}
                abs={comparison.sumA.expense - comparison.sumB.expense}
                primary={primary}
                periodLabel={labelFor(type === 'month' ? monthB : weekB)}
                risingIsBad
              />
              <View style={styles.deltaStats}>
                <View>
                  <Text style={styles.deltaStatLabel}>{t('history.income_label')}</Text>
                  <Text style={styles.deltaStatValue}>{formatCompact(comparison.sumA.income, primary)}</Text>
                  <DeltaLine
                    pct={comparison.deltaIncomePct}
                    abs={comparison.sumA.income - comparison.sumB.income}
                    primary={primary}
                    periodLabel=""
                    risingIsBad={false}
                    compact
                  />
                </View>
                <View>
                  <Text style={styles.deltaStatLabel}>{t('history.net_label')}</Text>
                  <Text style={styles.deltaStatValue}>{formatCompact(comparison.sumA.net, primary)}</Text>
                  <DeltaLine
                    pct={comparison.deltaNetPct}
                    abs={comparison.sumA.net - comparison.sumB.net}
                    primary={primary}
                    periodLabel=""
                    risingIsBad={false}
                    compact
                  />
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13.5, fontWeight: W.extrabold, color: c.text }}>{chartTitle}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <LegendChip color={AccentGradient[1]} label={labelFor(type === 'month' ? monthA : weekA)} />
                  <LegendChip color={c.textSecondary} label={labelFor(type === 'month' ? monthB : weekB)} muted />
                </View>
              </View>
              <BarChartOverlay
                seriesA={comparison.seriesA}
                seriesB={comparison.seriesB}
                labels={comparison.seriesLabels}
                colorA={AccentGradient[1]}
                colorB={c.textSecondary}
              />
              {txnsA.length === 0 ? (
                <Text style={{ marginTop: 8, color: c.textSecondary, fontSize: 12, fontWeight: W.semibold }}>
                  {t('compare.empty_period_a')}
                </Text>
              ) : null}
              {txnsB.length === 0 ? (
                <Text style={{ marginTop: 8, color: c.textSecondary, fontSize: 12, fontWeight: W.semibold }}>
                  {t('compare.empty_period_b')}
                </Text>
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={{ fontSize: 13.5, fontWeight: W.extrabold, color: c.text }}>
                {t('compare.categories_title')}
              </Text>
              <View style={{ marginTop: 10, gap: 10 }}>
                {comparison.categories.map((cat) => (
                  <CategoryRow key={cat.id} cat={cat} primary={primary} />
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <MonthPickerSheet ref={monthSheetA} selectedMonth={monthA} onSelect={setMonthA} includeCurrentMonth />
      <MonthPickerSheet ref={monthSheetB} selectedMonth={monthB} onSelect={setMonthB} includeCurrentMonth />
      <WeekPickerSheet  ref={weekSheetA}  selectedWeek={weekA}  onSelect={setWeekA}  includeCurrentWeek />
      <WeekPickerSheet  ref={weekSheetB}  selectedWeek={weekB}  onSelect={setWeekB}  includeCurrentWeek />
      <PeriodPickerSheet
        ref={presetSheet}
        type={type}
        yearOverYearAvailable={yearOverYearAvailable}
        selected={preset}
        onSelect={setPreset}
      />
    </View>
  );
}

function presetLabelKey(k: PresetKey): string {
  const map: Record<PresetKey, string> = {
    this_vs_last_month: 'compare.preset_this_vs_last_month',
    last_vs_prev_month: 'compare.preset_last_vs_prev_month',
    year_over_year:     'compare.preset_year_over_year',
    this_vs_last_week:  'compare.preset_this_vs_last_week',
    last_vs_prev_week:  'compare.preset_last_vs_prev_week',
    custom:             'compare.preset_custom',
  };
  return map[k];
}

function DeltaLine({
  pct, abs, primary, periodLabel, risingIsBad, compact,
}: {
  pct: number | null; abs: number; primary: CurrencyCode;
  periodLabel: string; risingIsBad: boolean; compact?: boolean;
}) {
  const c = useColors();
  const { t } = useT();
  if (pct === null && abs === 0) return null;
  const rising = abs > 0;
  const arrow = rising ? '▲' : abs < 0 ? '▼' : '·';
  const color = abs === 0
    ? c.textSecondary
    : (rising === risingIsBad ? Money.expense : Money.income);
  const pctText = pct === null ? t('delta.category_new') : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;
  const absText = abs !== 0 ? ` (${abs > 0 ? '+' : '−'}${Math.round(Math.abs(abs)).toLocaleString()})` : '';
  return (
    <Text
      style={{
        color: compact ? color : '#fff',
        fontSize: compact ? 11 : 13,
        fontWeight: W.bold,
        marginTop: compact ? 2 : 4,
      }}
    >
      {arrow} {pctText}{compact ? '' : absText} {periodLabel ? ` ${periodLabel}` : ''}
    </Text>
  );
}

function LegendChip({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, opacity: muted ? 0.6 : 1 }} />
      <Text style={{ fontSize: 11, fontWeight: W.semibold, color: c.textSecondary }}>{label}</Text>
    </View>
  );
}

function CategoryRow({
  cat, primary,
}: {
  cat: {
    id: string; label: string; color: string;
    valueA: number; valueB: number; deltaPct: number | null;
    status: 'both' | 'onlyA' | 'onlyB';
  };
  primary: CurrencyCode;
}) {
  const c = useColors();
  const { t } = useT();
  const max = Math.max(cat.valueA, cat.valueB, 1);
  const wA = Math.round((cat.valueA / max) * 100);
  const wB = Math.round((cat.valueB / max) * 100);
  const deltaText =
    cat.status === 'onlyA' ? t('delta.category_new') :
    cat.status === 'onlyB' ? t('delta.category_gone') :
    cat.deltaPct === null ? '' :
    `${cat.deltaPct > 0 ? '+' : ''}${Math.round(cat.deltaPct)}%`;
  const rising = cat.valueA > cat.valueB;
  const deltaColor = cat.status === 'onlyA' ? c.textSecondary
    : cat.status === 'onlyB' ? c.textSecondary
    : rising ? Money.expense : Money.income;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: cat.color }} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: W.semibold, color: c.text }}>{cat.label}</Text>
        <Text style={{ fontSize: 12, fontWeight: W.bold, color: deltaColor }}>{deltaText}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: cat.color, width: `${wA}%`, marginTop: 4 }} />
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.textSecondary, opacity: 0.5, width: `${wB}%`, marginTop: 3 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
        <Text style={{ fontSize: 10.5, color: c.textSecondary, fontWeight: W.semibold }}>
          A {formatCompact(cat.valueA, primary)}
        </Text>
        <Text style={{ fontSize: 10.5, color: c.textSecondary, fontWeight: W.semibold }}>
          B {formatCompact(cat.valueB, primary)}
        </Text>
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
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.chip,
  },
  swapBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  presetChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.chip,
    marginTop: 10,
  },
  deltaCard: {
    marginTop: 14, borderRadius: Radius.cardLg, padding: 20, overflow: 'hidden',
  },
  deltaStats: { flexDirection: 'row', gap: 22, marginTop: 14 },
  deltaStatLabel: { fontSize: 11, fontWeight: W.semibold, color: 'rgba(255,255,255,0.6)' },
  deltaStatValue: { fontSize: 15, fontWeight: W.extrabold, color: '#fff', marginTop: 2 },
  card: {
    marginTop: 14, borderRadius: Radius.card, borderWidth: 1, padding: 16,
  },
});
