import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, AccentGradient } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { CURRENCIES, CURRENCY_META, type CurrencyCode } from '@/lib/currency';

export interface CurrencyPickerSheetHandle {
  present: (current: CurrencyCode) => void;
  dismiss: () => void;
}

interface Props { onChoose: (currency: CurrencyCode) => void; }

export const CurrencyPickerSheet = forwardRef<CurrencyPickerSheetHandle, Props>(
  function CurrencyPickerSheet({ onChoose }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [current, setCurrent] = useState<CurrencyCode>('VND');

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

    const choose = (cc: CurrencyCode) => {
      onChoose(cc);
      sheet.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['40%']}
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <BottomSheetView style={styles.body}>
          <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
            {t('currency.picker_title')}
          </Text>
          <View style={styles.grid}>
            {CURRENCIES.map((cc) => {
              const active = cc === current;
              return (
                <Pressable
                  key={cc}
                  testID={`currency-picker-${cc}`}
                  onPress={() => choose(cc)}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor: c.chipBg,
                      borderColor: active ? AccentGradient[1] : c.cardBorder,
                      borderWidth: active ? 2 : 1,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={{ fontWeight: '700', color: c.text, fontSize: 16 }}>{cc}</Text>
                  <Text style={{ color: c.textSecondary, marginTop: 2 }}>
                    {CURRENCY_META[cc].symbol}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  tile: {
    width: '30%',
    aspectRatio: 1.3,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
