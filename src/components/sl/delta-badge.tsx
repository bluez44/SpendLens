import { View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Money, useColors, W } from '@/constants/tokens';
import { deltaPct } from '@/lib/comparison';

export type DeltaCompareType = 'expense' | 'income' | 'net';

interface Props {
  current: number;
  previous: number;
  compareType: DeltaCompareType;
  periodLabel: string;
  size?: 'sm' | 'md';
}

export function DeltaBadge({ current, previous, compareType, periodLabel, size = 'sm' }: Props) {
  const c = useColors();

  if (previous === 0 && current === 0) return null;

  const pct = deltaPct(current, previous);
  const rising = current > previous;
  const arrow = rising ? '▲' : current < previous ? '▼' : '·';

  const badWhenRising = compareType === 'expense';
  const rawColor = rising === badWhenRising ? Money.expense : Money.income;
  const color = current === previous ? c.textSecondary : rawColor;

  const pctText = pct === null ? '' : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;

  const fontSize = size === 'md' ? 13 : 12;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <Text style={{ fontSize, fontWeight: W.bold, color }}>{arrow}</Text>
      {pctText ? (
        <Text style={{ fontSize, fontWeight: W.bold, color }}>{pctText}</Text>
      ) : null}
      {periodLabel ? (
        <Text style={{ fontSize: fontSize - 1, fontWeight: W.semibold, color: c.textSecondary }}>
          {periodLabel}
        </Text>
      ) : null}
    </View>
  );
}
