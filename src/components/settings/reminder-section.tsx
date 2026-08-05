import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { cancelDailyReminder, requestPermission, scheduleDailyReminder } from '@/lib/notifications';
import { useSettings } from '@/lib/settings-context';

import { settingsStyles as styles } from './styles';

export function ReminderSection() {
  const colors = useColors();
  const { t } = useT();
  const { settings, update } = useSettings();
  const [timePicker, setTimePicker] = useState<null | 'first' | 'change'>(null);

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

  const [hh, mm] = (settings.reminderHHMM ?? '21:00').split(':').map(Number);
  const initialTime = new Date();
  initialTime.setHours(hh, mm, 0, 0);

  return (
    <>
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
      {timePicker != null && (
        <DateTimePicker value={initialTime} mode="time" is24Hour onChange={onTimePicked} />
      )}
    </>
  );
}
