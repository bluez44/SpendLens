import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/sl/gradient';
import { CategoryChip } from '@/components/sl/category-chip';
import { Icon } from '@/components/sl/icons';
import { PhotoTile } from '@/components/sl/photo-tile';
import { Segmented } from '@/components/sl/segmented';
import { Money, Radius, useColors, W } from '@/constants/tokens';
import { CATEGORIES, categoryOf } from '@/lib/categories';
import type { CategoryId } from '@/lib/categories';
import { dayLabel, formatVND, toDateKey } from '@/lib/format';
import type { NewTxn } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';

export default function EntryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { photo, id } = useLocalSearchParams<{ photo?: string; id?: string }>();
  const { add, update, getById } = useTransactions();

  const editing = id != null;
  const existing = editing ? getById(Number(id)) : undefined;
  const photoUri = photo ?? existing?.photoPath ?? undefined;

  const [isIncome, setIsIncome] = useState(existing?.isIncome ?? false);
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [category, setCategory] = useState<CategoryId>(existing?.category ?? 'food');
  const [name, setName] = useState(existing?.name ?? '');

  const accent = isIncome ? Money.income : Money.expense;

  const save = () => {
    if (amount <= 0) return;
    const payload: NewTxn = {
      date: editing && existing ? existing.date : toDateKey(new Date()),
      time: editing && existing ? existing.time : nowTime(),
      category: isIncome ? 'other' : category,
      name: name.trim() || (isIncome ? 'Thu nhập' : categoryOf(category).label),
      note: existing?.note ?? null,
      amount,
      isIncome,
      photoPath: photoUri ?? null,
    };
    if (editing) {
      update(Number(id), payload);
      router.back();
    } else {
      add(payload);
      router.replace('/history');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Photo */}
        <View style={styles.photoWrap}>
          <PhotoTile uri={photoUri} width="100%" height={150} radius={Radius.cardLg} />
          <Pressable style={styles.close} onPress={() => router.back()}>
            <Icon name="close" size={16} color="#fff" />
          </Pressable>
        </View>

        {/* Chi / Thu */}
        <View style={{ marginTop: 16 }}>
          <Segmented options={['Chi', 'Thu']} value={isIncome ? 1 : 0} onChange={(i) => setIsIncome(i === 1)} />
        </View>

        {/* Amount */}
        <View style={styles.amountBlock}>
          <Text style={{ fontSize: 12, fontWeight: W.semibold, color: c.textSecondary, letterSpacing: 0.3 }}>SỐ TIỀN</Text>
          <View style={styles.amountRow}>
            <TextInput
              value={amount ? formatVND(amount).slice(0, -1) : ''}
              onChangeText={(t) => setAmount(Number(t.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={c.textSecondary}
              style={[styles.amountInput, { color: c.text }]}
            />
            <Text style={[styles.dong, { color: accent }]}>₫</Text>
          </View>
        </View>

        {/* Categories (expense only) */}
        {!isIncome ? (
          <View style={styles.chips}>
            {CATEGORIES.map((cat) => (
              <CategoryChip key={cat.id} category={cat} selected={category === cat.id} onPress={() => setCategory(cat.id)} />
            ))}
          </View>
        ) : null}

        {/* Note */}
        <View style={[styles.field, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={{ fontSize: 11, fontWeight: W.bold, color: c.textSecondary, marginBottom: 3 }}>GHI CHÚ</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={isIncome ? 'Lương, thưởng…' : 'Bún bò Huế · gần công ty'}
            placeholderTextColor={c.textSecondary}
            style={{ fontSize: 14.5, fontWeight: W.semibold, color: c.text, padding: 0 }}
          />
        </View>

        {/* Date */}
        <View style={[styles.dateRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={{ fontSize: 13, fontWeight: W.semibold, color: c.textSecondary }}>Ngày giờ</Text>
          <Text style={{ fontSize: 14, fontWeight: W.bold, color: c.text }}>
            {editing && existing ? `${dayLabel(existing.date, toDateKey(new Date()))} · ${existing.time}` : nowLabel()}
          </Text>
        </View>

        <GradientButton
          label={editing ? 'Cập nhật' : isIncome ? 'Lưu khoản thu' : 'Lưu khoản chi'}
          onPress={save}
          disabled={amount <= 0}
          colors={isIncome ? (['#34C79A', '#1FA07A'] as const) : undefined}
          style={{ marginTop: 20, marginBottom: insets.bottom + 12 }}
        />
      </ScrollView>
    </View>
  );
}

function nowTime(): string {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function nowLabel(): string {
  return `Hôm nay · ${nowTime()}`;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 6 },
  photoWrap: { position: 'relative' },
  close: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBlock: { alignItems: 'center', marginTop: 20 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginTop: 2 },
  amountInput: {
    fontSize: 44,
    fontWeight: W.extrabold,
    letterSpacing: -1,
    minWidth: 80,
    textAlign: 'center',
    padding: 0,
  },
  dong: { fontSize: 44, fontWeight: W.extrabold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  field: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
});
