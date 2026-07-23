import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';

import { categoryOf, categoryLabel, INCOME_LABEL_KEY } from '@/lib/categories';
import { i18n } from '@/lib/i18n';
import type { Txn } from '@/lib/transactions';
import { signedVND } from '@/lib/format';
import { Money, Radius, useColors, W } from '@/constants/tokens';

import { PhotoTile } from './photo-tile';

export function TransactionRow({
  txn,
  tileSize = 56,
  onPress,
}: {
  txn: Txn;
  tileSize?: number;
  onPress?: () => void;
}) {
  const c = useColors();
  const label = txn.isIncome ? i18n.t(INCOME_LABEL_KEY) : categoryLabel(categoryOf(txn.category));
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <PhotoTile uri={txn.photoPath} size={tileSize} radius={Radius.tile} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: W.bold, color: c.text }}>
          {txn.name}
        </Text>
        <Text style={{ fontSize: 12.5, fontWeight: W.medium, color: c.textSecondary, marginTop: 2 }}>
          {label} · {txn.time}
        </Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: W.extrabold, color: txn.isIncome ? Money.income : Money.expense }}>
        {signedVND(txn.amount, txn.isIncome)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
});
