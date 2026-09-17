import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, W } from '@/constants/tokens';
import { categoryOf, type Category } from '@/lib/categories';
import { formatCompact } from '@/lib/format';
import type { FrequentEntry } from '@/lib/frequent-entries';
import { useT } from '@/lib/i18n';

export function SuggestionChips({
  entries,
  onPick,
  extras = [],
}: {
  entries: FrequentEntry[];
  onPick: (entry: FrequentEntry) => void;
  extras?: Category[];
}) {
  const c = useColors();
  const { t } = useT();
  if (entries.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}>
      {entries.map((entry) => {
        const amount = formatCompact(entry.originalAmount, entry.originalCurrency);
        return (
          <Pressable
            key={`${entry.name}|${entry.category}|${entry.originalAmount}|${entry.originalCurrency}`}
            onPress={() => onPick(entry)}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.suggestion', { note: entry.name, amount })}
            style={({ pressed }) => [styles.chip, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.dot, { backgroundColor: categoryOf(entry.category, extras).fg }]} />
            <Text numberOfLines={1} style={[styles.label, { color: c.chipText }]}>
              {`${entry.name} · ${amount}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.chip,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: W.semibold, maxWidth: 180 },
});
