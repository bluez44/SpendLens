import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { AccentGradient, Radius, useColors, W } from '@/constants/tokens';
import { useT } from '@/lib/i18n';

export type CompareType = 'month' | 'week';
export type PresetKey =
  | 'this_vs_last_month' | 'last_vs_prev_month' | 'year_over_year'
  | 'this_vs_last_week'  | 'last_vs_prev_week'
  | 'custom';

export interface PeriodPickerSheetHandle {
  present: () => void;
  dismiss: () => void;
}

export interface PeriodPickerSheetProps {
  type: CompareType;
  yearOverYearAvailable: boolean;
  selected: PresetKey;
  onSelect: (key: PresetKey) => void;
}

const MONTH_KEYS: PresetKey[] = ['this_vs_last_month', 'last_vs_prev_month', 'year_over_year', 'custom'];
const WEEK_KEYS:  PresetKey[] = ['this_vs_last_week',  'last_vs_prev_week',  'custom'];

const LABEL_KEY: Record<PresetKey, string> = {
  this_vs_last_month: 'compare.preset_this_vs_last_month',
  last_vs_prev_month: 'compare.preset_last_vs_prev_month',
  year_over_year:     'compare.preset_year_over_year',
  this_vs_last_week:  'compare.preset_this_vs_last_week',
  last_vs_prev_week:  'compare.preset_last_vs_prev_week',
  custom:             'compare.preset_custom',
};

export const PeriodPickerSheet = forwardRef<PeriodPickerSheetHandle, PeriodPickerSheetProps>(
  function PeriodPickerSheet({ type, yearOverYearAvailable, selected, onSelect }, ref) {
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

    const list = (type === 'month' ? MONTH_KEYS : WEEK_KEYS)
      .filter((k) => k !== 'year_over_year' || yearOverYearAvailable);

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['45%']}
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <View style={styles.header}>
          <Text style={{ fontWeight: W.extrabold, color: c.text, fontSize: 18 }}>
            {t('compare.preset_label')}
          </Text>
        </View>
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {list.map((key) => {
            const active = key === selected;
            return (
              <Pressable
                key={key}
                onPress={() => { onSelect(key); sheet.current?.dismiss(); }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: active ? c.chipBg : 'transparent',
                    borderColor: active ? AccentGradient[1] : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{ color: c.text, fontWeight: active ? W.extrabold : W.medium, fontSize: 15 }}>
                  {t(LABEL_KEY[key])}
                </Text>
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  header: { padding: 20, paddingBottom: 8 },
  row: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.card, borderWidth: 1,
    marginHorizontal: 12, marginBottom: 4,
  },
});
