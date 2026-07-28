import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TransactionRow } from '@/components/sl/transaction-row';
import { Text } from '@/components/sl/text';
import { GradientFill } from '@/components/sl/gradient';
import { Radius, useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { mergeSnapshots, computeSourceMap, type SourceMap } from '@/lib/sync/merge';
import type { MergeStrategy, Snapshot, SnapshotTxn } from '@/lib/sync/types';
import type { Txn } from '@/lib/transactions';
import type { CategoryId } from '@/lib/categories';

function toTxn(s: SnapshotTxn): Txn {
  return {
    id: 0,
    uuid: s.uuid,
    updatedAt: s.updatedAt,
    date: s.date,
    time: s.time,
    createdAt: s.createdAt,
    category: s.category as CategoryId,
    name: s.name,
    note: s.note,
    amount: s.amount,
    isIncome: s.isIncome === 1,
    photoPath: null,
  };
}

export interface PreviewChangesSheetHandle {
  present: (local: Snapshot, remote: Snapshot, strategy: MergeStrategy) => void;
  dismiss: () => void;
}

interface Props { onConfirm: () => void; onBack: () => void; }

export const PreviewChangesSheet = forwardRef<PreviewChangesSheetHandle, Props>(
  function PreviewChangesSheet({ onConfirm, onBack }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [state, setState] = useState<{
      merged: Snapshot; sources: SourceMap;
    } | null>(null);

    useImperativeHandle(ref, () => ({
      present: (local, remote, strategy) => {
        const merged = mergeSnapshots(local, remote, strategy);
        const sources = computeSourceMap(local, remote, merged, strategy);
        setState({ merged, sources });
        sheet.current?.present();
      },
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const rows = useMemo(() => state?.merged.transactions ?? [], [state]);

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['90%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <View style={styles.header}>
          <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
            {t('sync.preview.title')}
          </Text>
          <Text style={{ color: c.textSecondary, marginTop: 2 }}>
            {t('sync.preview.count', { n: rows.length })}
          </Text>
        </View>

        <BottomSheetScrollView style={{ flex: 1 }}>
          {rows.map((s) => (
            <View key={s.uuid} style={styles.rowWrap}>
              <View style={{ flex: 1 }}>
                <TransactionRow txn={toTxn(s)} />
              </View>
              <Text style={styles.badge}>{badgeFor(state?.sources[s.uuid])}</Text>
            </View>
          ))}
        </BottomSheetScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="preview-back"
            onPress={onBack}
            style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={{ color: c.text }}>{t('sync.preview.back')}</Text>
          </Pressable>
          <Pressable
            testID="preview-confirm"
            onPress={onConfirm}
            style={({ pressed }) => [styles.confirm, { opacity: pressed ? 0.85 : 1 }]}
          >
            <GradientFill />
            <Text style={styles.confirmLabel}>{t('sync.preview.confirm')}</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    );
  },
);

function badgeFor(source: 'local' | 'cloud' | 'merged' | undefined): string {
  if (source === 'local') return '📱';
  if (source === 'cloud') return '☁️';
  if (source === 'merged') return '🔀';
  return '';
}

const styles = StyleSheet.create({
  header: { padding: 20, paddingBottom: 12 },
  rowWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16,
  },
  badge: { marginLeft: 8, fontSize: 18 },
  footer: {
    flexDirection: 'row', gap: 12, padding: 16,
    alignItems: 'center',
  },
  back: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: Radius.button },
  confirm: {
    flex: 1, borderRadius: Radius.button, overflow: 'hidden',
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  confirmLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
