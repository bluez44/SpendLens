import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { shiftDateKey, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';

interface Props {
  visible: boolean;
  initialFrom: string; // ISO YYYY-MM-DD
  initialTo: string;
  onCancel: () => void;
  onExport: (from: string, to: string) => void;
}

type Quick = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'all';

function firstOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, 1));
}

export function DateRangeModal({ visible, initialFrom, initialTo, onCancel, onExport }: Props) {
  const colors = useColors();
  const { t } = useT();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);

  const applyQuick = (q: Quick) => {
    const today = toDateKey(new Date());
    if (q === 'thisMonth') {
      setFrom(firstOfMonth(today));
      setTo(today);
    } else if (q === 'lastMonth') {
      const [y, m] = today.split('-').map(Number);
      const lastFirst = toDateKey(new Date(y, m - 2, 1));
      const lastLast = toDateKey(new Date(y, m - 1, 0));
      setFrom(lastFirst);
      setTo(lastLast);
    } else if (q === 'threeMonths') {
      setFrom(shiftDateKey(today, -90));
      setTo(today);
    } else {
      setFrom('2000-01-01');
      setTo(today);
    }
  };

  const quickKeys: Quick[] = ['thisMonth', 'lastMonth', 'threeMonths', 'all'];

  const quickLabel = (q: Quick): string => {
    switch (q) {
      case 'thisMonth': return t('history.range_this_month');
      case 'lastMonth': return t('history.range_last_month');
      case 'threeMonths': return t('history.range_three_months');
      case 'all': return t('history.range_all');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
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
            {quickKeys.map((q) => (
              <Pressable
                key={q}
                onPress={() => applyQuick(q)}
                style={[styles.chip, { borderColor: colors.hairline, backgroundColor: colors.chipBg }]}>
                <Text style={{ fontWeight: '500', color: colors.chipText }}>
                  {quickLabel(q)}
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
                if (current === 'from') setFrom(k);
                else setTo(k);
              }}
            />
          )}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancel}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{t('settings.cancel')}</Text>
            </Pressable>
            <GradientButton label={t('history.export_button')} onPress={() => onExport(from, to)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  sheet: { padding: 20, gap: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, padding: 12, borderWidth: 1, borderRadius: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  cancel: { padding: 12 },
});
