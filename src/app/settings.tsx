import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { BudgetSheet, type BudgetSheetHandle } from '@/components/sl/budget-sheet';
import { DateRangeSheet, type DateRangeSheetHandle } from '@/components/sl/date-range-sheet';
import { Segmented } from '@/components/sl/segmented';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { exportAndShareCsv } from '@/lib/export';
import { formatVND, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { cancelDailyReminder, requestPermission, scheduleDailyReminder } from '@/lib/notifications';
import { useSettings } from '@/lib/settings-context';
import { resetTransactions } from '@/lib/transactions';
import { resetUserCategories } from '@/lib/user-categories';
import { toCategoryObj } from '@/lib/user-categories';
import { useTransactions } from '@/lib/transactions-context';

const THEME_MODES = ['auto', 'light', 'dark'] as const;
const LANGUAGE_MODES = ['auto', 'vi', 'en'] as const;

export default function SettingsScreen() {
  const colors = useColors();
  const { t } = useT();
  const { settings, update, reset } = useSettings();
  const { transactions, refresh, userCategories, refreshUserCategories } = useTransactions();
  const categoryExtras = userCategories.map(toCategoryObj);
  const exportSheetRef = useRef<DateRangeSheetHandle>(null);
  const budgetSheetRef = useRef<BudgetSheetHandle>(null);
  const [timePicker, setTimePicker] = useState<null | 'first' | 'change'>(null);

  const themeLabels = [t('settings.theme_auto'), t('settings.theme_light'), t('settings.theme_dark')];

  const onToggleReminder = async (v: boolean) => {
    if (!v) {
      update('reminderEnabled', false);
      await cancelDailyReminder();
      return;
    }
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert(t('settings.permission_needed_title'), t('settings.permission_needed_body'));
      return;
    }
    setTimePicker('first');
  };

  const onTimePicked = async (_: unknown, d?: Date) => {
    const mode = timePicker;
    setTimePicker(null);
    if (!d || !mode) return;
    const hh = d.getHours();
    const mm = d.getMinutes();
    const hhmm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    update('reminderHHMM', hhmm);
    if (mode === 'first') update('reminderEnabled', true);
    await scheduleDailyReminder(hh, mm);
  };

  const themeIndex = THEME_MODES.indexOf(settings.themeMode);
  const languageIndex = LANGUAGE_MODES.indexOf(settings.language ?? 'auto');

  const [hh, mm] = (settings.reminderHHMM ?? '21:00').split(':').map(Number);
  const initialTime = new Date();
  initialTime.setHours(hh, mm, 0, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('settings.title'), headerShown: true }} />
      <ScrollView contentContainerStyle={styles.body}>

        {/* NGÂN SÁCH */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('settings.section_budget')}
        </Text>
        <Pressable style={[styles.row, { borderColor: colors.hairline }]} onPress={() => budgetSheetRef.current?.present(settings.monthlyBudget)}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.budget_row')}</Text>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {settings.monthlyBudget > 0 ? formatVND(settings.monthlyBudget) : t('settings.budget_not_set')}
          </Text>
        </Pressable>

        {/* NHẮC NHỞ */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('settings.section_reminder')}
        </Text>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.reminder_row')}</Text>
          <Switch value={settings.reminderEnabled} onValueChange={onToggleReminder} />
        </View>
        {settings.reminderEnabled && (
          <Pressable
            style={[styles.row, { borderColor: colors.hairline }]}
            onPress={() => setTimePicker('change')}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.reminder_time')}</Text>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {settings.reminderHHMM ?? t('settings.reminder_not_set')}
            </Text>
          </Pressable>
        )}
        <View style={[styles.row, { borderColor: colors.hairline, opacity: settings.monthlyBudget > 0 ? 1 : 0.5 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.budget_alerts_row')}</Text>
            {settings.monthlyBudget === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t('settings.budget_alerts_hint')}</Text>
            ) : null}
          </View>
          <Switch
            value={settings.budgetAlertsEnabled}
            disabled={settings.monthlyBudget === 0}
            onValueChange={(v) => update('budgetAlertsEnabled', v)}
          />
        </View>

        {/* NGÔN NGỮ */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('settings.section_language')}
        </Text>
        <Segmented
          options={[t('settings.language_auto'), t('settings.language_vi'), t('settings.language_en')]}
          value={languageIndex >= 0 ? languageIndex : 0}
          onChange={(i) => update('language', LANGUAGE_MODES[i])}
        />

        {/* GIAO DIỆN */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>{t('settings.section_theme')}</Text>
        <Segmented
          options={themeLabels}
          value={themeIndex >= 0 ? themeIndex : 0}
          onChange={(i) => update('themeMode', THEME_MODES[i])}
        />

        {/* DỮ LIỆU */}
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
                  resetTransactions();
                  refresh();
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
                  resetTransactions();
                  resetUserCategories();
                  reset();
                  await cancelDailyReminder();
                  refresh();
                  refreshUserCategories();
                },
              },
            ])
          }>
          <Text style={{ color: '#FB5B4D', fontWeight: '500' }}>{t('settings.reset_all_row')}</Text>
        </Pressable>

        {/* THÔNG TIN */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>{t('settings.section_info')}</Text>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.version_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
            {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens')}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.github_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens/issues')}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.bug_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.license_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>MIT</Text>
        </View>
      </ScrollView>

      {timePicker != null && (
        <DateTimePicker value={initialTime} mode="time" is24Hour onChange={onTimePicked} />
      )}

      <DateRangeSheet
        ref={exportSheetRef}
        initialFrom={toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
        initialTo={toDateKey(new Date())}
        onExport={async (from, to) => {
          const filtered = transactions.filter((tx) => tx.date >= from && tx.date <= to);
          await exportAndShareCsv(filtered, categoryExtras);
        }}
      />

      <BudgetSheet
        ref={budgetSheetRef}
        onSave={(n) => update('monthlyBudget', n)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 8 },
  sectionHeader: { marginTop: 16, fontSize: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
});
