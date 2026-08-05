import { StyleSheet, View } from 'react-native';

import { GradientFill } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { Money, W } from '@/constants/tokens';
import { formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { RecapData } from '@/lib/share-cards';

const CARD_W = 360;
const CARD_H = 640;

export interface RecapCardProps {
  data: RecapData;
  hideAmounts: boolean;
}

export function RecapCard({ data, hideAmounts }: RecapCardProps) {
  const { t } = useT();
  const {
    weekStart, weekEnd, totalExpense, topCategories,
    deltaExpensePct, narrative, budgetPctUsed, primary,
  } = data;

  const showHeroAmount = !hideAmounts;
  const showHeroPct = hideAmounts && budgetPctUsed !== null;
  const showHero = showHeroAmount || showHeroPct;

  const deltaText = deltaExpensePct === null
    ? null
    : `${deltaExpensePct >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(deltaExpensePct))}%`;
  const deltaColor = deltaExpensePct !== null && deltaExpensePct >= 0
    ? Money.expense
    : Money.income;

  const humanRange = `${weekStart.slice(5)} – ${weekEnd.slice(5)}`;

  return (
    <View style={styles.card}>
      <GradientFill />

      <Text style={styles.watermark}>{t('share.watermark')}</Text>

      <View style={styles.body}>
        <Text style={styles.header}>{t('share.recap_header')}</Text>
        <Text style={styles.dateRange}>{humanRange}</Text>

        {showHero ? (
          <>
            {showHeroAmount ? (
              <Text style={styles.hero}>{formatMoney(totalExpense, primary)}</Text>
            ) : null}
            {showHeroPct ? (
              <Text style={styles.hero}>
                {t('share.recap_pct_of_budget', { pct: Math.round(budgetPctUsed!) })}
              </Text>
            ) : null}
          </>
        ) : null}

        {deltaText ? (
          <Text style={[styles.delta, { color: deltaColor }]}>
            {deltaText} {t('share.recap_vs_last_week')}
          </Text>
        ) : null}

        <Text style={styles.narrative}>
          {t(`narrative.${narrative}`, { cat: topCategories[0]?.label ?? '' })}
        </Text>

        <View style={styles.categoriesBlock}>
          {topCategories.map((cat) => (
            <View key={cat.id} style={styles.categoryRow}>
              <View
                style={[
                  styles.categoryBar,
                  { width: `${Math.max(2, Math.min(55, cat.pctOfWeek))}%`, backgroundColor: cat.color },
                ]}
              />
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              <Text style={styles.categoryPct}>{Math.round(cat.pctOfWeek)}%</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    overflow: 'hidden',
    position: 'relative',
  },
  watermark: {
    position: 'absolute',
    top: 16,
    left: 20,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: W.semibold,
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    padding: 32,
    paddingTop: 56,
    justifyContent: 'center',
  },
  header: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: W.bold,
    letterSpacing: 2,
  },
  dateRange: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: W.medium,
    marginTop: 4,
    marginBottom: 32,
  },
  hero: {
    fontSize: 56,
    color: '#fff',
    fontWeight: W.extrabold,
    letterSpacing: -1,
  },
  delta: {
    fontSize: 15,
    fontWeight: W.bold,
    marginTop: 6,
    marginBottom: 24,
  },
  narrative: {
    fontSize: 20,
    color: '#fff',
    fontWeight: W.bold,
    marginBottom: 32,
  },
  categoriesBlock: {
    gap: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 24,
  },
  categoryBar: {
    height: 6,
    borderRadius: 3,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    fontWeight: W.semibold,
  },
  categoryPct: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: W.bold,
  },
});
