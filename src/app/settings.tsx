import Constants from 'expo-constants';
import { Stack, router } from 'expo-router';
import { useRef } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppLockSection } from '@/components/settings/applock-section';
import { CurrencySection } from '@/components/settings/currency-section';
import { DataSection } from '@/components/settings/data-section';
import { ReminderSection } from '@/components/settings/reminder-section';
import { settingsStyles } from '@/components/settings/styles';
import { BudgetSheet, type BudgetSheetHandle } from '@/components/sl/budget-sheet';
import { Segmented } from '@/components/sl/segmented';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useSubscriptions } from '@/lib/subscriptions-context';

const THEME_MODES = ['auto', 'light', 'dark'] as const;
const LANGUAGE_MODES = ['auto', 'vi', 'en'] as const;

export default function SettingsScreen() {
  const colors = useColors();
  const { t } = useT();
  const { settings, update } = useSettings();
  const subscriptionsContext = useSubscriptions();
  const budgetSheetRef = useRef<BudgetSheetHandle>(null);

  const themeLabels = [t('settings.theme_auto'), t('settings.theme_light'), t('settings.theme_dark')];
  const themeIndex = THEME_MODES.indexOf(settings.themeMode);
  const languageIndex = LANGUAGE_MODES.indexOf(settings.language ?? 'auto');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('settings.title'), headerShown: true }} />
      <ScrollView contentContainerStyle={styles.body}>

        {/* NGÂN SÁCH */}
        <Text style={[settingsStyles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('settings.section_budget')}
        </Text>
        <Pressable style={[settingsStyles.row, { borderColor: colors.hairline }]} onPress={() => budgetSheetRef.current?.present(settings.monthlyBudget)}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.budget_row')}</Text>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {settings.monthlyBudget > 0 ? formatMoney(settings.monthlyBudget, settings.primaryCurrency) : t('settings.budget_not_set')}
          </Text>
        </Pressable>

        {/* NHẮC NHỞ */}
        <ReminderSection />

        {/* NGÔN NGỮ */}
        <Text style={[settingsStyles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('settings.section_language')}
        </Text>
        <Segmented
          options={[t('settings.language_auto'), t('settings.language_vi'), t('settings.language_en')]}
          value={languageIndex >= 0 ? languageIndex : 0}
          onChange={(i) => update('language', LANGUAGE_MODES[i])}
        />

        {/* BẢO MẬT */}
        <AppLockSection />

        {/* GIAO DIỆN */}
        <Text style={[settingsStyles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>{t('settings.section_theme')}</Text>
        <Segmented
          options={themeLabels}
          value={themeIndex >= 0 ? themeIndex : 0}
          onChange={(i) => update('themeMode', THEME_MODES[i])}
        />

        {/* ĐĂNG KÝ HÀNG THÁNG */}
        <Text style={[settingsStyles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('sub.section_title')}
        </Text>
        <Pressable
          style={[settingsStyles.row, { borderColor: colors.hairline }]}
          onPress={() => router.push('/subscriptions')}
        >
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('sub.section_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
            {t('sub.count_active', { n: subscriptionsContext.count({ activeOnly: true }) })} ›
          </Text>
        </Pressable>

        {/* TIỀN TỆ */}
        <CurrencySection />

        {/* DỮ LIỆU */}
        <DataSection />

        {/* THÔNG TIN */}
        <Text style={[settingsStyles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>{t('settings.section_info')}</Text>
        <View style={[settingsStyles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.version_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
            {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
        <Pressable
          style={[settingsStyles.row, { borderColor: colors.hairline }]}
          onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens')}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.github_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <Pressable
          style={[settingsStyles.row, { borderColor: colors.hairline }]}
          onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens/issues')}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.bug_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <View style={[settingsStyles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.license_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>MIT</Text>
        </View>
      </ScrollView>

      <BudgetSheet
        ref={budgetSheetRef}
        onSave={(n) => update('monthlyBudget', n)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 8 },
});
