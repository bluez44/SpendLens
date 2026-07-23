import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { formatVND } from '@/lib/format';
import { useT } from '@/lib/i18n';

export interface BudgetSheetHandle {
  present: (initial: number) => void;
  dismiss: () => void;
}

interface Props {
  onSave: (amount: number) => void;
}

export const BudgetSheet = forwardRef<BudgetSheetHandle, Props>(
  function BudgetSheet({ onSave }, ref) {
    const { t } = useT();
    const colors = useColors();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [draft, setDraft] = useState('');

    useImperativeHandle(ref, () => ({
      present: (initial) => {
        setDraft(initial > 0 ? String(initial) : '');
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const save = () => {
      const n = Number(draft.replace(/\D/g, '')) || 0;
      onSave(n);
      sheetRef.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
      >
        <BottomSheetView style={styles.body}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{t('settings.budget_row')}</Text>
          <BottomSheetTextInput
            value={draft}
            onChangeText={(text) => setDraft(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.hairline }]}
          />
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
            {formatVND(Number(draft) || 0)}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => sheetRef.current?.dismiss()} style={{ padding: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{t('settings.cancel')}</Text>
            </Pressable>
            <GradientButton label={t('settings.save')} onPress={save} />
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 32 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
});
