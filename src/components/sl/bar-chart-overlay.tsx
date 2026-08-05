import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useColors, W } from '@/constants/tokens';

export interface BarChartOverlayProps {
  seriesA: number[];
  seriesB: number[];
  labels: string[];
  colorA: string;
  colorB: string;
}

export function BarChartOverlay({ seriesA, seriesB, labels, colorA, colorB }: BarChartOverlayProps) {
  const c = useColors();
  const max = Math.max(1, ...seriesA, ...seriesB);
  return (
    <View style={styles.row}>
      {labels.map((label, i) => {
        const a = seriesA[i] ?? 0;
        const b = seriesB[i] ?? 0;
        const hA = Math.round(6 + (a / max) * 78);
        const hB = Math.round(6 + (b / max) * 78);
        return (
          <View key={label} style={styles.bucket}>
            <View style={styles.barsRow}>
              <View style={{ width: 10, height: hA, borderRadius: 4, backgroundColor: colorA }} />
              <View style={{ width: 10, height: hB, borderRadius: 4, backgroundColor: colorB, opacity: 0.6 }} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: W.semibold, color: c.textSecondary, marginTop: 4 }}>
              {label}
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
    gap: 6,
    height: 100,
    marginTop: 14,
  },
  bucket: { flex: 1, alignItems: 'center' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 88 },
});
