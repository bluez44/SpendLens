import DateTimePicker from '@react-native-community/datetimepicker';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { shiftDateKey, toDateKey } from '@/lib/format';

export interface DateRangeSheetHandle {
  present: () => void;
  dismiss: () => void;
}

interface Props {
  initialFrom: string;
  initialTo: string;
  onExport: (from: string, to: string) => void;
}

type Quick = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all';

function firstOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, 1));
}

export const DateRangeSheet = forwardRef<DateRangeSheetHandle, Props>(
  function DateRangeSheet({ initialFrom, initialTo, onExport }, ref) {
    const { t } = useT();
    const colors = useColors();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(initialTo);
    const [picker, setPicker] = useState<'from' | 'to' | null>(null);

    useImperativeHandle(ref, () => ({
      present: () => {
        setFrom(initialFrom);
        setTo(initialTo);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const snapPoints = useMemo(() => ['60%'], []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    const applyQuick = (q: Quick) => {
      const today = toDateKey(new Date());
      if (q === 'thisMonth') { setFrom(firstOfMonth(today)); setTo(today); }
      else if (q === 'lastMonth') {
        const [y, m] = today.split('-').map(Number);
        setFrom(toDateKey(new Date(y, m - 2, 1)));
        setTo(toDateKey(new Date(y, m - 1, 0)));
      }
      else if (q === 'threeMonths') { setFrom(shiftDateKey(today, -90)); setTo(today); }
      else { setFrom('2000-01-01'); setTo(today); }
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.bg }}
      >
        <BottomSheetView style={[styles.body, { backgroundColor: colors.bg }]}>
          <Text style={{ fontWeight: '700', color: colors.text, fontSize: 18 }}>
            {t('history.export_range_title')}
          </Text>

          <View style={styles.row}>
            <Pressable style={[styles.field, { borderColor: colors.hairline }]} onPress={() => setPicker('from')}>
              <Text style={{ fontWeight: '500', color: colors.textSecondary }}>{t('history.from')}</Text>
              <Text style={{ fontWeight: '600', color: colors.text }}>{from}</Text>
            </Pressable>
            <Pressable style={[styles.field, { borderColor: colors.hairline }]} onPress={() => setPicker('to')}>
              <Text style={{ fontWeight: '500', color: colors.textSecondary }}>{t('history.to')}</Text>
              <Text style={{ fontWeight: '600', color: colors.text }}>{to}</Text>
            </Pressable>
          </View>

          <View style={styles.chips}>
            {(['thisMonth', 'lastMonth', 'threeMonths', 'all'] as Quick[]).map((q) => (
              <Pressable
                key={q}
                onPress={() => applyQuick(q)}
                style={[styles.chip, { borderColor: colors.hairline, backgroundColor: colors.chipBg }]}>
                <Text style={{ fontWeight: '500', color: colors.chipText }}>
                  {q === 'thisMonth' ? t('history.range_this_month')
                   : q === 'lastMonth' ? t('history.range_last_month')
                   : q === 'threeMonths' ? t('history.range_three_months')
                   : t('history.range_all')}
                </Text>
              </Pressable>
            ))}
          </View>

          {picker !== null && (
            <DateTimePicker
              value={new Date(picker === 'from' ? from : to)}
              mode="date"
              onChange={(_, d) => {
                const current = picker;
                setPicker(null);
                if (!d) return;
                const k = toDateKey(d);
                if (current === 'from') setFrom(k); else setTo(k);
              }}
            />
          )}

          <View style={styles.actions}>
            <Pressable onPress={() => sheetRef.current?.dismiss()} style={styles.cancel}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{t('settings.cancel')}</Text>
            </Pressable>
            <GradientButton label={t('history.export_button')} onPress={() => { onExport(from, to); sheetRef.current?.dismiss(); }} />
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, padding: 12, borderWidth: 1, borderRadius: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  cancel: { padding: 12 },
});
