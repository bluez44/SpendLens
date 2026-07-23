import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateRangeModal } from '@/components/sl/date-range-modal';
import { Icon } from '@/components/sl/icons';
import { Segmented } from '@/components/sl/segmented';
import { TransactionRow } from '@/components/sl/transaction-row';
import { Money, useColors, W } from '@/constants/tokens';
import { compactK, dayLabel, formatVND, toDateKey } from '@/lib/format';
import { exportAndShareCsv } from '@/lib/export';
import { filterRange, groupByDay, summarize, type Range } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';

const RANGES: Range[] = ['day', 'week', 'month'];

export default function HistoryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { transactions } = useTransactions();
  const [rangeIndex, setRangeIndex] = useState(1);
  const range = RANGES[rangeIndex];
  const [exportOpen, setExportOpen] = useState(false);

  const todayKey = toDateKey(new Date());
  const ranged = useMemo(() => filterRange(transactions, range), [transactions, range]);
  const groups = useMemo(() => groupByDay(ranged), [ranged]);
  const sum = useMemo(() => summarize(ranged), [ranged]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 20 }}>
        <View style={styles.header}>
          <Text style={{ fontSize: 22, fontWeight: W.extrabold, color: c.text, letterSpacing: -0.3 }}>Thu chi</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setExportOpen(true)}
              hitSlop={8}
              accessibilityLabel="Xuất CSV"
              style={[styles.iconBtn, { backgroundColor: c.segment }]}>
              <Icon name="share" size={18} color={c.text} />
            </Pressable>
            <Pressable
              onPress={goBack}
              hitSlop={8}
              accessibilityLabel="Đóng"
              style={[styles.iconBtn, { backgroundColor: c.segment }]}>
              <Icon name="close" size={18} color={c.text} />
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <Segmented options={['Ngày', 'Tuần', 'Tháng']} value={rangeIndex} onChange={setRangeIndex} />
        </View>

        <View style={[styles.summary, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <SummaryCell label="Thu" value={'+' + compactK(sum.income)} color={Money.income} />
          <View style={[styles.vline, { backgroundColor: c.cardBorder }]} />
          <SummaryCell label="Chi" value={'−' + compactK(sum.expense)} color={Money.expense} />
          <View style={[styles.vline, { backgroundColor: c.cardBorder }]} />
          <SummaryCell
            label="Chênh lệch"
            value={(sum.net >= 0 ? '+' : '−') + compactK(sum.net)}
            color={c.text}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        {groups.length === 0 ? (
          <Text style={{ marginTop: 40, textAlign: 'center', color: c.textSecondary, fontWeight: W.medium }}>
            Chưa có giao dịch trong kỳ này.
          </Text>
        ) : null}
        {groups.map((g) => (
          <View key={g.key} style={{ marginBottom: 18 }}>
            <View style={styles.groupHeader}>
              <Text style={{ fontSize: 13, fontWeight: W.extrabold, color: c.text }}>{dayLabel(g.key, todayKey)}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: W.bold, color: c.textSecondary }}>
                {(g.net >= 0 ? '+' : '−') + formatVND(g.net)}
              </Text>
            </View>
            <View style={{ gap: 11 }}>
              {g.items.map((txn) => (
                <TransactionRow key={txn.id} txn={txn} tileSize={48} onPress={() => router.push(`/transaction/${txn.id}`)} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable
        style={[styles.galleryFab, { bottom: insets.bottom + 18, backgroundColor: c.scheme === 'dark' ? '#fff' : '#1A1A1A' }]}
        onPress={() => router.push('/gallery')}>
        <Icon name="grid" size={17} color={c.scheme === 'dark' ? '#111' : '#fff'} />
        <Text style={{ fontSize: 13, fontWeight: W.bold, color: c.scheme === 'dark' ? '#111' : '#fff' }}>Thư viện</Text>
      </Pressable>

      <DateRangeModal
        visible={exportOpen}
        initialFrom={toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
        initialTo={toDateKey(new Date())}
        onCancel={() => setExportOpen(false)}
        onExport={async (from, to) => {
          setExportOpen(false);
          const filtered = transactions.filter((t) => t.date >= from && t.date <= to);
          await exportAndShareCsv(filtered);
        }}
      />
    </View>
  );
}

function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: W.semibold, color: c.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: W.extrabold, color, marginTop: 3 }}>{value}</Text>
    </View>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summary: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  vline: { width: 1 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  galleryFab: {
    position: 'absolute',
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
