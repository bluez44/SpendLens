import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { PinPad } from '@/components/sl/pin-pad';
import { Text } from '@/components/sl/text';
import { Money, useColors, W } from '@/constants/tokens';
import { authenticateBiometric, verifyPin } from '@/lib/app-lock';
import { useT } from '@/lib/i18n';

const PIN_LENGTH = 6;

export interface VerifyPinSheetHandle {
  present: () => void;
  dismiss: () => void;
}

interface Props {
  title: string;
  biometricEnabled: boolean;
  onVerified: () => void;
}

export const VerifyPinSheet = forwardRef<VerifyPinSheetHandle, Props>(function VerifyPinSheet(
  { title, biometricEnabled, onVerified },
  ref,
) {
  const { t } = useT();
  const colors = useColors();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);

  useImperativeHandle(ref, () => ({
    present: () => {
      setDraft('');
      setError(false);
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

  const onDigit = async (d: string) => {
    if (error) setError(false);
    const next = draft + d;
    setDraft(next);
    if (next.length !== PIN_LENGTH) return;
    const ok = await verifyPin(next);
    if (ok) {
      onVerified();
      sheetRef.current?.dismiss();
      return;
    }
    setError(true);
    setDraft('');
  };

  const onDelete = () => setDraft((prev) => prev.slice(0, -1));

  const onBiometricPress = async () => {
    const ok = await authenticateBiometric(title);
    if (!ok) return;
    onVerified();
    sheetRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.card }}>
      <BottomSheetView style={styles.body}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: W.bold }}>{title}</Text>
        <PinPad
          value={draft}
          length={PIN_LENGTH}
          onDigit={onDigit}
          onDelete={onDelete}
          onBiometricPress={biometricEnabled ? onBiometricPress : undefined}
          error={error}
        />
        {error ? (
          <Text style={{ color: Money.expense, fontWeight: W.semibold }}>{t('lock.verify_wrong_pin')}</Text>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 32, alignItems: 'center' },
});
