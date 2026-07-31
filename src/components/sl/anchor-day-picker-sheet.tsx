import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Radius, useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';

export interface AnchorDayPickerSheetHandle {
  present: (current: number) => void;
  dismiss: () => void;
}

interface Props { onChoose: (day: number) => void; }

export const AnchorDayPickerSheet = forwardRef<AnchorDayPickerSheetHandle, Props>(
  function AnchorDayPickerSheet({ onChoose }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [current, setCurrent] = useState(1);

    useImperativeHandle(ref, () => ({
      present: (cur) => { setCurrent(cur); sheet.current?.present(); },
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['65%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <BottomSheetView style={styles.header}>
          <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
            {t('sub.anchor_picker_title')}
          </Text>
        </BottomSheetView>
        <ScrollView style={styles.scrollView}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
            const active = day === current;
            return (
              <Pressable
                key={day}
                testID={`anchor-day-${day}`}
                onPress={() => { onChoose(day); sheet.current?.dismiss(); }}
                style={({ pressed }) => [
                  styles.dayRow,
                  {
                    backgroundColor: active ? c.chipBg : 'transparent',
                    borderColor: active ? AccentGradient[1] : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{ color: c.text, fontWeight: active ? '700' : '500' }}>
                  {t('sub.anchor_day_row', { day })}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  header: { padding: 20, paddingBottom: 8 },
  scrollView: { flex: 1 },
  dayRow: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.card, borderWidth: 1,
    marginHorizontal: 12, marginBottom: 4,
  },
});
