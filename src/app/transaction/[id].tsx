import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/expense/category-icon';
import { Icon } from '@/components/sl/icons';
import { PhotoTile } from '@/components/sl/photo-tile';
import { Money, useColors, W } from '@/constants/tokens';
import { categoryOf, INCOME_LABEL } from '@/lib/categories';
import { dayLabel, signedVND, toDateKey } from '@/lib/format';
import { useTransactions } from '@/lib/transactions-context';

export default function TransactionDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, remove } = useTransactions();
  const txn = getById(Number(id));

  if (!txn) {
    return (
      <View style={[styles.missing, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textSecondary, fontWeight: W.semibold }}>Không tìm thấy giao dịch.</Text>
      </View>
    );
  }

  const confirmDelete = () => {
    Alert.alert('Xoá giao dịch', 'Bạn có chắc muốn xoá khoản này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: () => {
          remove(txn.id);
          if (router.canGoBack()) router.back();
          else router.replace('/history');
        },
      },
    ]);
  };

  const cat = categoryOf(txn.category);
  const chipBg = txn.isIncome ? '#D1FAE5' : cat.chip;
  const chipFg = txn.isIncome ? Money.income : cat.fg;
  const accent = txn.isIncome ? Money.income : Money.expense;
  const todayKey = toDateKey(new Date());

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="light" />

      {/* Photo header */}
      <View style={styles.photoHeader}>
        <PhotoTile uri={txn.photoPath} width="100%" height={340} radius={0} />
        <View style={[StyleSheet.absoluteFill, styles.headerControls, { paddingTop: insets.top + 6 }]}>
          <Pressable style={styles.headerBtn} onPress={goBack}>
            <Icon name="back" size={20} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.headerBtn}
            onPress={() => router.push({ pathname: '/entry', params: { id: String(txn.id) } })}>
            <Icon name="edit" size={19} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Details */}
      <View style={styles.body}>
        <View style={[styles.chip, { backgroundColor: chipBg }]}>
          {!txn.isIncome ? <CategoryIcon category={txn.category} color={chipFg} size={14} /> : null}
          <Text style={{ fontSize: 12.5, fontWeight: W.bold, color: chipFg }}>
            {txn.isIncome ? INCOME_LABEL : cat.label}
          </Text>
        </View>

        <Text style={{ fontSize: 46, fontWeight: W.extrabold, letterSpacing: -1, marginTop: 16, color: accent }}>
          {signedVND(txn.amount, txn.isIncome)}
        </Text>
        <Text style={{ fontSize: 17, fontWeight: W.bold, marginTop: 6, color: c.text }}>{txn.name}</Text>

        <View style={{ alignSelf: 'stretch', marginTop: 24 }}>
          {txn.note ? <DetailRow label="Ghi chú" value={txn.note} border /> : null}
          <DetailRow label="Ngày" value={`${dayLabel(txn.date, todayKey)} · ${txn.time}`} border />
          <DetailRow label="Loại" value={txn.isIncome ? 'Khoản thu' : 'Khoản chi'} valueColor={accent} />
        </View>

        <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
          <Text style={{ fontSize: 14, fontWeight: W.bold, color: Money.expense }}>Xoá giao dịch</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
  border,
}: {
  label: string;
  value: string;
  valueColor?: string;
  border?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.row, border && { borderBottomWidth: 1, borderBottomColor: c.cardBorder }]}>
      <Text style={{ fontSize: 13.5, fontWeight: W.semibold, color: c.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: W.bold, color: valueColor ?? c.text }}>{value}</Text>
    </View>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoHeader: {
    height: 340,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  headerControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  deleteBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
});
