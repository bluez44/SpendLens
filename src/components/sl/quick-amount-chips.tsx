import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, W } from '@/constants/tokens';
import type { CurrencyCode } from '@/lib/currency';
import { formatCompact, formatMoney } from '@/lib/format';
import { quickAmountsFor } from '@/lib/quick-amounts';

export function QuickAmountChips({
  currency,
  onPick,
}: {
  currency: CurrencyCode;
  onPick: (amount: number) => void;
}) {
  const c = useColors();
  const amounts = quickAmountsFor(currency);
  if (amounts.length === 0) return null;
  return (
    <View style={styles.row}>
      {amounts.map((amount) => (
        <Pressable
          key={amount}
          onPress={() => onPick(amount)}
          accessibilityRole="button"
          accessibilityLabel={formatMoney(amount, currency)}
          style={({ pressed }) => [styles.chip, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.label, { color: c.chipText }]}>{formatCompact(amount, currency)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.chip },
  label: { fontSize: 13, fontWeight: W.bold },
});
