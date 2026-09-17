import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Money, useColors } from '@/constants/tokens';
import type { CurrencyCode } from '@/lib/currency';
import { formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';

interface Props {
  spent: number;
  budget: number;
  currency: CurrencyCode;
  onSetBudget: () => void;
}

function pickColor(pct: number): string {
  if (pct > 100) return Money.expense;   // over budget
  if (pct >= 80) return Money.warning;   // warning
  return AccentGradient[1];              // normal (coral)
}

export function BudgetBar({ spent, budget, currency, onSetBudget }: Props) {
  const colors = useColors();
  const { t } = useT();

  if (budget <= 0) {
    return (
      <Pressable
        onPress={onSetBudget}
        style={[styles.cta, { borderColor: colors.hairline }]}>
        <Text style={{ color: colors.text, fontWeight: '500' }}>
          {t('budget.set_cta')}
        </Text>
      </Pressable>
    );
  }

  const pct = Math.round((spent / budget) * 100);
  const fillPct = Math.min(pct, 100);
  const barColor = pickColor(pct);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
          {t('budget.spent_this_month')}
        </Text>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{pct}%</Text>
      </View>
      <View style={styles.row}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>
          {formatMoney(spent, currency)} / {formatMoney(budget, currency)}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.barTrack }]}>
        <View style={[styles.fill, { width: `${fillPct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, gap: 6, marginTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  cta: {
    marginTop: 12,
    marginHorizontal: 20,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
});
