import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, W } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import type { CardType } from '@/lib/share-cards';

export interface CardPickerSheetHandle {
  present(): void;
  dismiss(): void;
}

interface Props {
  onSelect: (type: CardType) => void;
}

export const CardPickerSheet = forwardRef<CardPickerSheetHandle, Props>(function CardPickerSheet(
  { onSelect },
  ref,
) {
  const { t } = useT();
  const c = useColors();
  const sheet = useRef<BottomSheetModal>(null);

  useImperativeHandle(ref, () => ({
    present: () => sheet.current?.present(),
    dismiss: () => sheet.current?.dismiss(),
  }));

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
    [],
  );

  const handleSelect = (type: CardType) => {
    onSelect(type);
    sheet.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={['30%']}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.body}>
        <Text style={[styles.title, { color: c.text }]}>{t('share.picker_title')}</Text>
        <Pressable
          testID="card-picker-recap"
          onPress={() => handleSelect('recap')}
          style={({ pressed }) => [styles.row, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.rowLabel, { color: c.text }]}>{t('share.picker_recap')}</Text>
          <Text style={{ color: c.textSecondary }}>›</Text>
        </Pressable>
        <Pressable
          testID="card-picker-streak"
          onPress={() => handleSelect('streak')}
          style={({ pressed }) => [styles.row, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.rowLabel, { color: c.text }]}>{t('share.picker_streak')}</Text>
          <Text style={{ color: c.textSecondary }}>›</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  title: { fontSize: 16, fontWeight: W.bold, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: Radius.button,
  },
  rowLabel: { fontSize: 16, fontWeight: W.semibold },
});
