import { View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';

export function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: W.semibold, color: c.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: W.extrabold, color, marginTop: 3 }}>{value}</Text>
    </View>
  );
}
