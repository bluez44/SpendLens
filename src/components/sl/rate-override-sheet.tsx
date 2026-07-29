import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors, Money } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import type { CurrencyCode } from '@/lib/currency';

export interface RateOverrideSheetHandle {
  present: (currency: Exclude<CurrencyCode, 'USD'>, currentRate: number) => void;
  dismiss: () => void;
}

interface Props { onSave: (currency: Exclude<CurrencyCode, 'USD'>, rate: number) => void; }

export const RateOverrideSheet = forwardRef<RateOverrideSheetHandle, Props>(
  function RateOverrideSheet({ onSave }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [currency, setCurrency] = useState<Exclude<CurrencyCode, 'USD'>>('VND');
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');

    useImperativeHandle(ref, () => ({
      present: (cur, rate) => {
        setCurrency(cur);
        setDraft(String(rate));
        setError('');
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

    const save = () => {
      const parsed = Number(draft);
      if (!(parsed > 0) || Number.isNaN(parsed)) {
        setError(t('currency.override_invalid'));
        return;
      }
      onSave(currency, parsed);
      sheet.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['35%']}
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <BottomSheetView style={styles.body}>
          <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
            {t('currency.override_title')} — {currency}
          </Text>
          <BottomSheetTextInput
            testID="rate-input"
            value={draft}
            onChangeText={(v) => { setDraft(v); setError(''); }}
            keyboardType="numeric"
            placeholder={t('currency.override_placeholder')}
            placeholderTextColor={c.textSecondary}
            style={[styles.input, { color: c.text, borderColor: c.cardBorder }]}
          />
          {error ? <Text style={{ color: Money.expense, fontSize: 12 }}>{error}</Text> : null}
          <Pressable
            testID="rate-save"
            onPress={save}
            style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  input: {
    borderWidth: 1, borderRadius: Radius.button,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  saveBtn: {
    backgroundColor: '#111', borderRadius: Radius.button,
    paddingVertical: 12, alignItems: 'center',
  },
});
