import { StyleSheet, View } from 'react-native';

import { Text } from './text';

import type { MonthBar } from '@/lib/transactions';
import { useColors, W } from '@/constants/tokens';

import { GradientFill } from './gradient';

export function BarChart({ data }: { data: MonthBar[] }) {
  const c = useColors();
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <View style={styles.row}>
      {data.map((d) => {
        const height = Math.round(20 + (d.total / max) * 66);
        return (
          <View key={d.monthKey} style={styles.col}>
            <View style={{ width: '100%', height, borderRadius: 7, overflow: 'hidden' }}>
              {d.isCurrent ? <GradientFill /> : <View style={{ flex: 1, backgroundColor: c.barTrack }} />}
            </View>
            <Text style={{ fontSize: 10, fontWeight: d.isCurrent ? W.extrabold : W.semibold, color: d.isCurrent ? c.text : c.textSecondary }}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 9,
    height: 92,
    marginTop: 14,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
});
