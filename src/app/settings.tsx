import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { GradientButton } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { formatVND } from '@/lib/format';
import { cancelDailyReminder, requestPermission, scheduleDailyReminder } from '@/lib/notifications';
import { useSettings } from '@/lib/settings-context';

export default function SettingsScreen() {
  const colors = useColors();
  const { settings, update } = useSettings();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(String(settings.monthlyBudget || ''));
  const [timePicker, setTimePicker] = useState<null | 'first' | 'change'>(null);

  const saveBudget = () => {
    const n = Number(budgetDraft.replace(/\D/g, '')) || 0;
    update('monthlyBudget', n);
    setBudgetOpen(false);
  };

  const openBudget = () => {
    setBudgetDraft(String(settings.monthlyBudget || ''));
    setBudgetOpen(true);
  };

  const onToggleReminder = async (v: boolean) => {
    if (!v) {
      update('reminderEnabled', false);
      await cancelDailyReminder();
      return;
    }
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert('Cần quyền thông báo', 'Hãy bật quyền thông báo trong Cài đặt hệ thống.');
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Cài đặt', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.body}>

        {/* NGÂN SÁCH */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          NGÂN SÁCH
        </Text>
        <Pressable style={[styles.row, { borderColor: colors.hairline }]} onPress={openBudget}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>Ngân sách tháng</Text>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {settings.monthlyBudget > 0 ? formatVND(settings.monthlyBudget) : 'Chưa đặt'}
          </Text>
        </Pressable>

        {/* NHẮC NHỞ */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          NHẮC NHỞ
        </Text>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>Nhắc chụp bill cuối ngày</Text>
          <Switch value={settings.reminderEnabled} onValueChange={onToggleReminder} />
        </View>
        {settings.reminderEnabled && (
          <Pressable
            style={[styles.row, { borderColor: colors.hairline }]}
            onPress={() => setTimePicker('change')}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>Giờ nhắc</Text>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {settings.reminderHHMM ?? 'Chưa đặt'}
            </Text>
          </Pressable>
        )}

        {/* TODO Task 12: theme, data, info sections */}
      </ScrollView>

      {timePicker != null && (
        <DateTimePicker value={initialTime} mode="time" is24Hour onChange={onTimePicked} />
      )}

      {/* Budget keypad modal */}
      <Modal visible={budgetOpen} transparent animationType="slide" onRequestClose={() => setBudgetOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Ngân sách tháng</Text>
            <TextInput
              value={budgetDraft}
              onChangeText={(t) => setBudgetDraft(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, borderColor: colors.hairline }]}
            />
            <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
              {formatVND(Number(budgetDraft) || 0)}
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={() => setBudgetOpen(false)} style={{ padding: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Huỷ</Text>
              </Pressable>
              <GradientButton label="Lưu" onPress={saveBudget} />
            </View>
          </View>
        </View>
      </Modal>
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  sheet: { padding: 20, gap: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
});
