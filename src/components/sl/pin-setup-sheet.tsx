import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { PinPad } from '@/components/sl/pin-pad';
import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';
import { setPin } from '@/lib/app-lock';
import { useT } from '@/lib/i18n';

const PIN_LENGTH = 6;

export interface PinSetupSheetHandle {
  present: () => void;
  dismiss: () => void;
}

interface Props {
  onComplete: () => void;
}

type Step = 'enter' | 'confirm';

export const PinSetupSheet = forwardRef<PinSetupSheetHandle, Props>(function PinSetupSheet(
  { onComplete },
  ref,
) {
  const { t } = useT();
  const colors = useColors();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [step, setStep] = useState<Step>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [draft, setDraft] = useState('');
  const [mismatch, setMismatch] = useState(false);

  useImperativeHandle(ref, () => ({
    present: () => {
      setStep('enter');
      setFirstPin('');
      setDraft('');
      setMismatch(false);
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
    const next = draft + d;
    setDraft(next);
    if (next.length !== PIN_LENGTH) return;

    if (step === 'enter') {
      setFirstPin(next);
      setDraft('');
      setMismatch(false);
      setStep('confirm');
      return;
    }

    if (next === firstPin) {
      await setPin(next);
      onComplete();
      sheetRef.current?.dismiss();
      return;
    }

    setMismatch(true);
    setDraft('');
    setFirstPin('');
    setStep('enter');
  };

  const onDelete = () => setDraft((prev) => prev.slice(0, -1));

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.card }}>
      <BottomSheetView style={styles.body}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: W.bold }}>
          {step === 'enter' ? t('lock.setup_title') : t('lock.setup_confirm_title')}
        </Text>
        <PinPad value={draft} length={PIN_LENGTH} onDigit={onDigit} onDelete={onDelete} />
        {mismatch ? (
          <Text style={{ color: '#FB5B4D', fontWeight: W.semibold }}>{t('lock.setup_mismatch')}</Text>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 32, alignItems: 'center' },
});
