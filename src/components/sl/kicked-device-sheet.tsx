import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/sl/text';
import { Money, Radius, useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';

interface Props {
  visible: boolean;
  onChoice: (choice: 'keep' | 'wipe') => void;
}

export function KickedDeviceSheet({ visible, onChoice }: Props) {
  const { t } = useT();
  const c = useColors();
  const sheet = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (visible) sheet.current?.present();
    else sheet.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="none" />
    ),
    [],
  );

  if (!visible) return null;

  const confirmWipe = () => {
    Alert.alert(
      t('sync.kicked.wipe'),
      t('sync.kicked.wipe_confirm'),
      [
        { text: t('sync.kicked.keep'), style: 'cancel' },
        { text: t('sync.kicked.wipe'), style: 'destructive', onPress: () => onChoice('wipe') },
      ],
    );
  };

  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={['50%']}
      backdropComponent={renderBackdrop}
      enablePanDownToClose={false}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.body}>
        <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
          {t('sync.kicked.title')}
        </Text>
        <Text style={{ color: c.textSecondary, marginTop: 8 }}>
          {t('sync.kicked.body')}
        </Text>

        <Pressable
          testID="kicked-keep"
          onPress={() => onChoice('keep')}
          style={({ pressed }) => [
            styles.option,
            { backgroundColor: c.chipBg, borderColor: c.cardBorder, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={{ fontWeight: '700', color: c.text }}>{t('sync.kicked.keep')}</Text>
        </Pressable>

        <Pressable
          testID="kicked-wipe"
          onPress={confirmWipe}
          style={({ pressed }) => [
            styles.option,
            { backgroundColor: c.chipBg, borderColor: Money.expense, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={{ fontWeight: '700', color: Money.expense }}>{t('sync.kicked.wipe')}</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  option: { padding: 16, borderRadius: Radius.card, borderWidth: 1 },
});
