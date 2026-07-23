import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { DateRangeModal } from '@/components/sl/date-range-modal';
import { GradientButton } from '@/components/sl/gradient';
import { Segmented } from '@/components/sl/segmented';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { exportAndShareCsv } from '@/lib/export';
import { formatVND, toDateKey } from '@/lib/format';
import { cancelDailyReminder, requestPermission, scheduleDailyReminder } from '@/lib/notifications';
import { useSettings } from '@/lib/settings-context';
import { resetTransactions } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';

const THEME_MODES = ['auto', 'light', 'dark'] as const;
const THEME_LABELS = ['Auto', 'Sáng', 'Tối'];

export default function SettingsScreen() {
  const colors = useColors();
  const { settings, update, reset } = useSettings();
  const { transactions, refresh } = useTransactions();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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

  const themeIndex = THEME_MODES.indexOf(settings.themeMode);

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

        {/* GIAO DIỆN */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>GIAO DIỆN</Text>
        <Segmented
          options={THEME_LABELS}
          value={themeIndex >= 0 ? themeIndex : 0}
          onChange={(i) => update('themeMode', THEME_MODES[i])}
        />

        {/* DỮ LIỆU */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>DỮ LIỆU</Text>
        <Pressable style={[styles.row, { borderColor: colors.hairline }]} onPress={() => setExportOpen(true)}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>Xuất CSV</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() =>
            Alert.alert('Xoá giao dịch', 'Tất cả giao dịch và ảnh sẽ bị xoá vĩnh viễn.', [
              { text: 'Huỷ', style: 'cancel' },
              {
                text: 'Xoá',
                style: 'destructive',
                onPress: () => {
                  resetTransactions();
                  refresh();
                },
              },
            ])
          }>
          <Text style={{ color: '#FB5B4D', fontWeight: '500' }}>Xoá giao dịch</Text>
        </Pressable>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() =>
            Alert.alert('Reset về mặc định', 'Tất cả giao dịch, ảnh và cài đặt sẽ được đưa về mặc định.', [
              { text: 'Huỷ', style: 'cancel' },
              {
                text: 'Reset',
                style: 'destructive',
                onPress: async () => {
                  resetTransactions();
                  reset();
                  await cancelDailyReminder();
                  refresh();
                },
              },
            ])
          }>
          <Text style={{ color: '#FB5B4D', fontWeight: '500' }}>Reset về mặc định</Text>
        </Pressable>

        {/* THÔNG TIN */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>THÔNG TIN</Text>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>Phiên bản</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
            {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens')}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>GitHub</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens/issues')}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>Báo lỗi</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>Giấy phép</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>MIT</Text>
        </View>
      </ScrollView>

      {timePicker != null && (
        <DateTimePicker value={initialTime} mode="time" is24Hour onChange={onTimePicked} />
      )}

      <DateRangeModal
        visible={exportOpen}
        initialFrom={toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
        initialTo={toDateKey(new Date())}
        onCancel={() => setExportOpen(false)}
        onExport={async (from, to) => {
          setExportOpen(false);
          const filtered = transactions.filter((t) => t.date >= from && t.date <= to);
          await exportAndShareCsv(filtered);
        }}
      />

      {/* Budget keypad modal */}
      <Modal visible={budgetOpen} transparent animationType="slide" onRequestClose={() => setBudgetOpen(false)}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%' }}>
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
          </KeyboardAvoidingView>
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
