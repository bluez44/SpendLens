import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { categoryOf } from '@/lib/categories';
import { formatVND } from '@/lib/format';
import type { Txn } from '@/lib/transactions';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function TxnCard({ txn }: { txn: Txn }) {
  const colors = useColors();
  const cat = categoryOf(txn.category);
  const sign = txn.isIncome ? '+' : '−';

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/transaction/${txn.id}`)}>
      {txn.photoPath ? (
        <Image source={{ uri: txn.photoPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: cat.fg }]} />
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.bottomFade}
      />

      <View style={styles.todayBadge}>
        <Text style={styles.todayBadgeText}>Hôm nay</Text>
      </View>

      <View style={styles.info}>
        <View style={[styles.categoryChip, { backgroundColor: cat.chip }]}>
          <Text style={[styles.categoryText, { color: cat.fg }]}>{cat.label}</Text>
        </View>
        <Text style={styles.amount}>{sign + formatVND(txn.amount)}</Text>
        {txn.note ? (
          <Text style={styles.note} numberOfLines={2}>{txn.note}</Text>
        ) : null}
        <Text style={styles.tapHint}>Chạm để xem chi tiết →</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { height: SCREEN_HEIGHT, backgroundColor: '#111' },
  bottomFade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%',
  },
  todayBadge: {
    position: 'absolute', top: 60, left: 20,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  todayBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  info: {
    position: 'absolute', left: 20, right: 20, bottom: 60, gap: 8,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  categoryText: { fontSize: 12, fontWeight: '700' },
  amount: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  note: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '500' },
  tapHint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500', marginTop: 6 },
});
