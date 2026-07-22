import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import Svg, { Circle, G } from 'react-native-svg';

import { useColors, W } from '@/constants/tokens';

export interface DonutSlice {
  color: string;
  pct: number; // 0-100
}

export function Donut({
  slices,
  size = 96,
  stroke = 14,
  centerTop,
  centerMain,
}: {
  slices: DonutSlice[];
  size?: number;
  stroke?: number;
  centerTop?: string;
  centerMain?: string;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {slices.map((s, i) => {
            const len = (s.pct / 100) * circ;
            const el = (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={s.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {centerTop ? <Text style={{ fontSize: 9, fontWeight: W.semibold, color: c.textSecondary }}>{centerTop}</Text> : null}
        {centerMain ? <Text style={{ fontSize: 12, fontWeight: W.extrabold, color: c.text }}>{centerMain}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
