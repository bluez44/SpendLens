import { useRef } from 'react';
import { Alert, Pressable } from 'react-native';

import { DateRangeSheet, type DateRangeSheetHandle } from '@/components/sl/date-range-sheet';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { clearPin } from '@/lib/app-lock';
import { exportAndShareCsv } from '@/lib/export';
import { toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { cancelDailyReminder } from '@/lib/notifications';
import { useSettings } from '@/lib/settings-context';
import { resetTransactions } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';
import { resetUserCategories, toCategoryObj } from '@/lib/user-categories';

import { settingsStyles as styles } from './styles';

export function DataSection() {
  const colors = useColors();
  const { t } = useT();
  const { reset } = useSettings();
  const { transactions, refresh, userCategories, refreshUserCategories } = useTransactions();
  const exportSheetRef = useRef<DateRangeSheetHandle>(null);
  const categoryExtras = userCategories.map(toCategoryObj);

  return (
    <>
      <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>{t('settings.section_data')}</Text>
      <Pressable style={[styles.row, { borderColor: colors.hairline }]} onPress={() => exportSheetRef.current?.present()}>
        <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.export_row')}</Text>
        <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderColor: colors.hairline }]}
        onPress={() =>
          Alert.alert(t('settings.reset_txns_title'), t('settings.reset_txns_body'), [
            { text: t('settings.cancel'), style: 'cancel' },
            {
              text: t('settings.delete'),
              style: 'destructive',
              onPress: () => {
                try {
                  resetTransactions();
                  refresh();
                } catch (err) {
                  console.warn('Failed to reset transactions', err);
                  Alert.alert(t('common.delete_failed_title'), t('common.delete_failed_body'));
                }
              },
            },
          ])
        }>
        <Text style={{ color: '#FB5B4D', fontWeight: '500' }}>{t('settings.reset_txns_row')}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderColor: colors.hairline }]}
        onPress={() =>
          Alert.alert(t('settings.reset_all_title'), t('settings.reset_all_body'), [
            { text: t('settings.cancel'), style: 'cancel' },
            {
              text: t('settings.reset'),
              style: 'destructive',
              onPress: async () => {
                const failed: string[] = [];
                const steps: Array<[string, () => void | Promise<void>]> = [
                  ['transactions', () => resetTransactions()],
                  ['categories', () => resetUserCategories()],
                  ['settings', () => reset()],
                  ['reminder', () => cancelDailyReminder()],
                  ['pin', () => clearPin()],
                ];
                for (const [label, run] of steps) {
                  try {
                    await run();
                  } catch (err) {
                    console.warn(`Reset step failed: ${label}`, err);
                    failed.push(label);
                  }
                }
                refresh();
                refreshUserCategories();
                if (failed.length > 0) {
                  Alert.alert(
                    t('common.reset_failed_title'),
                    t('common.reset_partial_body', { steps: failed.join(', ') }),
                  );
                }
              },
            },
          ])
        }>
        <Text style={{ color: '#FB5B4D', fontWeight: '500' }}>{t('settings.reset_all_row')}</Text>
      </Pressable>

      <DateRangeSheet
        ref={exportSheetRef}
        initialFrom={toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
        initialTo={toDateKey(new Date())}
        onExport={async (from, to) => {
          const filtered = transactions.filter((tx) => tx.date >= from && tx.date <= to);
          await exportAndShareCsv(filtered, categoryExtras);
        }}
      />
    </>
  );
}
