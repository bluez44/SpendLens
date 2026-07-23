import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { TodayBadge } from '@/components/sl/today-badge';
import { categoryOf } from '@/lib/categories';
import { formatVND } from '@/lib/format';
import type { Txn } from '@/lib/transactions';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function TxnCard({ txn }: { txn: Txn }) {
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

      <TodayBadge />

      <View style={styles.info}>
        <View style={[styles.categoryChip, { backgroundColor: cat.chip }]}>
          <Text style={[styles.categoryText, { color: cat.fg }]}>{cat.label}</Text>
        </View>
        <Text style={styles.amount}>{sign + formatVND(txn.amount)}</Text>
        <Text style={styles.note} numberOfLines={2}>{txn.note ?? txn.name}</Text>
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
