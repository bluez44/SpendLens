import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { useColors } from '@/constants/tokens';

import { Icon } from '@/components/sl/icons';
import { Text } from '@/components/sl/text';
import { TodayBadge } from '@/components/sl/today-badge';
import { categoryOf, categoryLabel } from '@/lib/categories';
import type { Category } from '@/lib/categories';
import { signedMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { Txn } from '@/lib/transactions';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function TxnCard({
  txn,
  extras = [],
  onShare,
}: {
  txn: Txn;
  extras?: Category[];
  onShare?: (txn: Txn) => void;
}) {
  const { t } = useT();
  const c = useColors();
  const cat = categoryOf(txn.category, extras);

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

      {txn.photoPath ? (
        <Pressable
          style={styles.shareBtn}
          hitSlop={8}
          accessibilityLabel={t('share.a11y_share')}
          onPress={() => onShare?.(txn)}>
          <Icon name="share" size={18} color="#fff" />
        </Pressable>
      ) : null}

      <View style={styles.info}>
        <View style={[styles.categoryChip, { backgroundColor: cat.chip }]}>
          <Text style={[styles.categoryText, { color: cat.fg }]}>{categoryLabel(cat)}</Text>
        </View>
        <Text style={styles.amount}>{signedMoney(txn.amount, txn.currency, txn.isIncome)}</Text>
        {txn.originalCurrency !== txn.currency ? (
          <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2, alignSelf: 'flex-end' }}>
            ≈ {signedMoney(txn.originalAmount, txn.originalCurrency, txn.isIncome)}
          </Text>
        ) : null}
        <Text style={styles.note} numberOfLines={2}>{txn.note ?? txn.name}</Text>
        <Text style={styles.tapHint}>{t('txn.tap_hint')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { height: SCREEN_HEIGHT, backgroundColor: '#111' },
  bottomFade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%',
  },
  shareBtn: {
    position: 'absolute', top: 60, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
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
