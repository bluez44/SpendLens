import { router } from 'expo-router';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/sl/icons';
import { PhotoTile } from '@/components/sl/photo-tile';
import { useColors, W } from '@/constants/tokens';
import { signedVND } from '@/lib/format';
import { useTransactions } from '@/lib/transactions-context';

const PADDING = 16;
const GAP = 6;

export default function GalleryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { transactions } = useTransactions();

  const tile = (Dimensions.get('window').width - PADDING * 2 - GAP * 2) / 3;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable style={[styles.iconBtn, { backgroundColor: c.segment }]} onPress={goBack}>
          <Icon name="back" size={20} color={c.text} />
        </Pressable>
        <View>
          <Text style={{ fontSize: 19, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>Thư viện</Text>
          <Text style={{ fontSize: 12.5, fontWeight: W.medium, color: c.textSecondary }}>
            {transactions.length} khoảnh khắc chi tiêu
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: PADDING, paddingBottom: insets.bottom + 24 }}>
        <View style={styles.grid}>
          {transactions.map((txn) => (
            <Pressable key={txn.id} onPress={() => router.push(`/transaction/${txn.id}`)}>
              <View style={{ width: tile, height: tile, borderRadius: 14, overflow: 'hidden' }}>
                <PhotoTile uri={txn.photoPath} width={tile} height={tile} radius={14} />
                <View style={styles.amount}>
                  <Text style={{ fontSize: 11, fontWeight: W.extrabold, color: '#fff' }}>
                    {signedVND(txn.amount, txn.isIncome)}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: PADDING,
    paddingBottom: 14,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  amount: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
